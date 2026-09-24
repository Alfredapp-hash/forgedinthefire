import type { BrowserContext, Page, Route } from '@playwright/test'
import { test, expect, json, gotoHarness, filterConsole } from './fixtures'
import { takeExt } from '../lib/podcast/upload/guest-take-manifest'

const SESSION = {
  id: 'invite-e2e',
  episodeTitle: 'E2E Harness Episode',
  label: 'e2e',
  guestName: null as string | null,
  expiresAt: '2099-01-01T00:00:00.000Z',
  state: 'pending',
  recording: false,
  takeReady: false,
  takeUrl: null,
  cameraReady: false,
  cameraUrl: null,
}

type Signal = { id: number; kind: string; payload: Record<string, unknown> }

/**
 * Fake signaling server + a real answering RTCPeerConnection in a second tab ("host"),
 * so the guest's peer can actually reach `connected`.
 */
async function mockGuestBackend(page: Page, context: BrowserContext) {
  const host = await context.newPage()
  await host.goto('about:blank')
  await host.evaluate(() => {
    const w = window as unknown as { pc: RTCPeerConnection; tracks: number }
    w.pc = new RTCPeerConnection({ iceServers: [] })
    w.tracks = 0
    w.pc.ontrack = () => {
      w.tracks += 1
    }
  })
  const posted: { action?: string; kind?: string; body: Record<string, unknown> }[] = []
  const outbox: Signal[] = []
  let nextId = 1
  let state = 'pending'

  const session = () => ({ ...SESSION, state })

  await page.route(/\/api\/studio\/ice/, (route) => json(route, { iceServers: [], turnConfigured: false }))

  await page.route(/\/api\/studio\/guest\/[^/]+\/signal/, async (route: Route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      const after = Number(new URL(req.url()).searchParams.get('after') || 0)
      return json(route, { signals: outbox.filter((s) => s.id > after), session: session() })
    }
    const body = req.postDataJSON() as { kind: string; payload: Record<string, unknown> }
    posted.push({ kind: body.kind, body })
    if (body.kind === 'offer') {
      const sdp = await host.evaluate(async (offerSdp: string) => {
        const pc = (window as unknown as { pc: RTCPeerConnection }).pc
        await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp })
        await pc.setLocalDescription(await pc.createAnswer())
        await new Promise<void>((resolve) => {
          if (pc.iceGatheringState === 'complete') return resolve()
          const t = setTimeout(resolve, 3000)
          pc.addEventListener('icegatheringstatechange', () => {
            if (pc.iceGatheringState === 'complete') {
              clearTimeout(t)
              resolve()
            }
          })
        })
        return pc.localDescription!.sdp
      }, String(body.payload.sdp))
      outbox.push({ id: nextId++, kind: 'answer', payload: { type: 'answer', sdp, gen: body.payload.gen } })
    }
    if (body.kind === 'ice' && body.payload.candidate) {
      await host.evaluate(async (c) => {
        await (window as unknown as { pc: RTCPeerConnection }).pc.addIceCandidate(c as RTCIceCandidateInit).catch(() => {})
      }, body.payload.candidate)
    }
    return json(route, { ok: true })
  })

  // Guest backup upload (chunked, lib/podcast/upload/guest-backup.ts):
  //   POST take/chunks {action:'start'} → {takeId}; {action:'sign'} → signed PUT URLs; PUT each part;
  //   {action:'finish'} → {missing: []}. The start step mirrors the real route's allowlist (takeExt).
  const uploads: { kind: string; bytes: number; mime: string }[] = []
  const takes = new Map<string, { kind: string; mime: string }>()
  await page.route(/\/e2e-storage\//, async (route) => {
    const req = route.request()
    uploads.push({ kind: 'put', bytes: req.postDataBuffer()?.length || 0, mime: req.headers()['content-type'] || '' })
    await route.fulfill({ status: 200, body: '{}' })
  })
  await page.route(/\/api\/studio\/guest\/[^/]+\/take\/chunks/, async (route) => {
    const req = route.request()
    const body = req.postDataJSON() as { action?: string; kind?: string; mime?: string; takeId?: string; from?: number; count?: number; chunks?: number }
    posted.push({ kind: `chunks:${body.action}`, body })
    if (body.action === 'start') {
      const kind = body.kind === 'camera' ? 'camera' : 'audio'
      const ext = takeExt(kind, String(body.mime || ''))
      if (!ext) {
        return json(
          route,
          { error: kind === 'camera' ? 'Camera backup must be WebM or MP4 video' : 'Backup must be WebM, Ogg, MP4 or WAV audio' },
          400,
        )
      }
      const takeId = `00000000-0000-4000-8000-${String(takes.size + 1).padStart(12, '0')}`
      takes.set(takeId, { kind, mime: String(body.mime) })
      return json(route, { takeId, ext, mime: body.mime, chunkMaxBytes: 50 << 20, takeMaxBytes: 2 << 30, timesliceMs: 10_000 })
    }
    if (body.action === 'sign') {
      const from = Number(body.from || 0)
      const origin = new URL(req.url()).origin
      const urls = Array.from({ length: Math.max(1, Number(body.count || 1)) }, (_, i) => ({
        index: from + i,
        path: `guest-takes/e2e/${body.takeId}/${from + i}`,
        signedUrl: `${origin}/e2e-storage/${body.takeId}/${from + i}`,
      }))
      return json(route, { urls })
    }
    if (body.action === 'finish') {
      const kind = takes.get(String(body.takeId))?.kind
      return json(route, { takeReady: kind === 'audio', cameraReady: kind === 'camera', missing: [] })
    }
    return json(route, { error: 'unknown action' }, 400)
  })

  await page.route(/\/api\/studio\/guest\/[^/?]+(\?.*)?$/, async (route: Route) => {
    const req = route.request()
    if (req.method() === 'GET') return json(route, session())
    const body = req.postDataJSON() as { action: string; name?: string }
    posted.push({ action: body.action, body })
    if (body.action === 'join') {
      state = 'joined'
      return json(route, { ...session(), guestName: body.name, guestSession: 'sess-e2e', signalCursor: 0 })
    }
    if (body.action === 'connected') state = 'connected'
    if (body.action === 'leave') state = 'left'
    return json(route, session())
  })

  /** Queue a host → guest signal for the next poll. */
  const hostSends = (kind: string, payload: Record<string, unknown> = {}) => {
    outbox.push({ id: nextId++, kind, payload })
  }

  return { host, posted, outbox, uploads, hostSends }
}

async function recordOnOff(page: Page, backend: Awaited<ReturnType<typeof mockGuestBackend>>) {
  backend.hostSends('record', { on: true, phase: 'rec' })
  await expect(page.getByText('● Recording')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Recording\. A backup of your audio/)).toBeVisible()
  await page.waitForTimeout(2500)
  backend.hostSends('record', { on: false })
  await expect(page.getByText('Not recording')).toBeVisible({ timeout: 15_000 })
}

async function joinBooth(page: Page) {
  await expect(page.getByRole('heading', { name: 'Before we start' })).toBeVisible()
  await page.getByRole('button', { name: 'I understand — continue' }).click()
  await page.getByPlaceholder('First name or nickname').fill('Robin')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Join — turn on my microphone' }).click()
  await expect(page.getByText('You are connected. The host can hear you.')).toBeVisible({ timeout: 30_000 })
}

test.describe('guest booth (/dev/guest)', () => {
  test.use({ allowPageErrors: [] })

  test('consent → lobby → join (mocked signaling) → connected → Leave', async ({ page, context, diag }) => {
    const backend = await mockGuestBackend(page, context)
    await gotoHarness(page, '/dev/guest')

    // Consent screen first, nothing turned on.
    await expect(page.getByRole('heading', { name: 'Before we start' })).toBeVisible()
    await expect(page.getByText('E2E Harness Episode')).toBeVisible()
    await page.getByRole('button', { name: 'I understand — continue' }).click()

    // Lobby: name + headphones are required.
    await page.getByRole('button', { name: 'Join — turn on my microphone' }).click()
    await expect(page.getByTestId('dev-guest').getByRole('alert')).toContainText('Enter a name')
    await page.getByPlaceholder('First name or nickname').fill('Robin')
    await page.getByRole('button', { name: 'Join — turn on my microphone' }).click()
    await expect(page.getByTestId('dev-guest').getByRole('alert')).toContainText('headphones')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Join — turn on my microphone' }).click()

    // Booth.
    await expect(page.getByText('Not recording')).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => backend.posted.some((p) => p.kind === 'offer'), { message: 'guest sent an offer' }).toBe(true)
    const join = backend.posted.find((p) => p.action === 'join')
    expect(join?.body).toMatchObject({ action: 'join', name: 'Robin', consent: true, audioOnly: true })

    await expect(page.getByText('You are connected. The host can hear you.')).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => backend.posted.some((p) => p.action === 'connected')).toBe(true)
    await expect.poll(() => backend.host.evaluate(() => (window as unknown as { tracks: number }).tracks)).toBeGreaterThan(0)

    // Leave works and tells the host.
    await page.getByTestId('dev-guest').getByRole('button', { name: 'Leave', exact: true }).first().click()
    await expect(page.getByText('You have left. Your microphone and camera are off.')).toBeVisible()
    await expect.poll(() => backend.posted.some((p) => p.kind === 'hangup')).toBe(true)
    await expect.poll(() => backend.posted.some((p) => p.action === 'leave')).toBe(true)

    const errors = filterConsole(diag.consoleErrors)
    test.info().annotations.push({ type: 'console-errors', description: errors.join(' | ') || 'none' })
    expect(errors, 'console errors in guest flow').toEqual([])
  })

  test('host record on/off → guest requests a backup upload → host hangup', async ({ page, context }) => {
    const backend = await mockGuestBackend(page, context)
    await gotoHarness(page, '/dev/guest')
    await joinBooth(page)

    await recordOnOff(page, backend)
    await expect
      .poll(() => backend.posted.some((p) => p.kind === 'chunks:start'), { message: 'guest started a backup upload' })
      .toBe(true)
    await expect
      .poll(() => backend.uploads.reduce((n, u) => n + u.bytes, 0), { message: 'guest uploaded backup bytes' })
      .toBeGreaterThan(1000)

    backend.hostSends('hangup')
    await expect(page.getByTestId('dev-guest').getByRole('alert')).toContainText('The host ended the session', {
      timeout: 15_000,
    })
    await page.waitForTimeout(1500) // let teardown promises settle so late pageerrors are caught
  })

  test('guest audio backup is uploaded in parts and finished', async ({ page, context }) => {
    const backend = await mockGuestBackend(page, context)
    await gotoHarness(page, '/dev/guest')
    await joinBooth(page)
    await recordOnOff(page, backend)
    await expect(page.getByText('Audio backup: sent privately to the host ✓')).toBeVisible({ timeout: 20_000 })
    expect(backend.uploads.length).toBeGreaterThanOrEqual(1)
    expect(backend.posted.some((p) => p.kind === 'chunks:finish')).toBe(true)
  })

  // Was BUG-guest-upload: with no MediaRecorder the booth records WAV (AudioWorklet); the take route
  // used to reject audio/wav. The allowlist (takeExt) now accepts it.
  test('WAV fallback backup (no MediaRecorder) is accepted and uploaded', async ({ page, context }) => {
    await page.addInitScript(() => {
      delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder
    })
    const backend = await mockGuestBackend(page, context)
    await gotoHarness(page, '/dev/guest')
    await joinBooth(page)
    await recordOnOff(page, backend)
    await expect(page.getByText('Audio backup: sent privately to the host ✓')).toBeVisible({ timeout: 20_000 })
    const start = backend.posted.find((p) => p.kind === 'chunks:start')
    expect(String(start?.body.mime)).toBe('audio/wav')
    expect(backend.uploads.some((u) => u.mime === 'audio/wav' && u.bytes > 1000)).toBe(true)
  })

  test.describe('strict page errors', () => {
    test.use({ allowPageErrors: [] })

    // Was BUG-guest-close: guest-cue stop() is idempotent and never closes a closed AudioContext.
    test('Leave raises no uncaught AudioContext error', async ({ page, context }) => {
      await mockGuestBackend(page, context)
      await gotoHarness(page, '/dev/guest')
      await joinBooth(page)
      await page.getByTestId('dev-guest').getByRole('button', { name: 'Leave', exact: true }).first().click()
      await expect(page.getByText('You have left. Your microphone and camera are off.')).toBeVisible()
      await page.waitForTimeout(1500)
    })
  })

  test('invalid invite (fetch mode) shows a blocked message', async ({ page }) => {
    await page.route(/\/api\/studio\/ice/, (route) => json(route, { iceServers: [], turnConfigured: false }))
    await page.route(/\/api\/studio\/guest\/[^/?]+(\?.*)?$/, (route) =>
      json(route, { error: 'This invite has expired' }, 410),
    )
    await gotoHarness(page, '/dev/guest?mode=fetch')
    await expect(page.getByTestId('dev-guest').getByRole('alert')).toContainText('This invite has expired')
    await expect(page.getByTestId('dev-guest').getByRole('button', { name: 'Leave', exact: true })).toHaveCount(0)
  })
})
