import { readFile, stat } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { test, expect, json, gotoHarness, filterConsole, type Diagnostics } from './fixtures'
import { STUDIO_URL, studio } from './selectors'

/**
 * Plausible admin API for the production room (no Supabase in the harness).
 * Episode saves echo the patch back so RecordingStudio's optimistic state stays coherent.
 */
async function mockStudioApi(page: Page) {
  const saved: Record<string, unknown>[] = []
  await page.route(/\/api\/admin\/podcast\/invites(\?|$)/, (route) =>
    route.request().method() === 'GET' ? json(route, { invites: [] }) : json(route, { error: 'e2e' }, 400),
  )
  await page.route(/\/api\/studio\/ice/, (route) =>
    json(route, { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], turnConfigured: false }),
  )
  await page.route(/\/api\/admin\/studio\/episodes/, async (route) => {
    const req = route.request()
    const body = (req.postDataJSON() ?? {}) as Record<string, unknown>
    saved.push({ method: req.method(), ...body })
    // Return the merged episode. The harness episode is `fakeEpisode(id)` (app/dev/studio/StudioHarness.tsx).
    const base = {
      id: body.id ?? 'e2e-created',
      title: 'E2E Harness Episode',
      slug: 'e2e-harness-episode',
      summary: 'A fake episode the dev harness loads so the studio runs without Supabase.',
      status: 'recording',
      season: 1,
      episode_type: 'full',
      visibility: 'public',
      explicit: false,
      chapters: [],
      keywords: [],
      ad_markers: [],
      created_at: '2026-09-23T00:00:00.000Z',
      updated_at: '2026-09-23T00:00:00.000Z',
    }
    await json(route, { ...base, ...body })
  })
  // Small mixes go through the multipart /api/admin/media route.
  await page.route(/\/api\/admin\/media(\?|$)/, async (route) => {
    const size = route.request().postDataBuffer()?.length ?? 0
    await json(route, { url: 'https://cdn.e2e.test/mix.mp3', mime_type: 'audio/mpeg', size_bytes: size })
  })
  return { saved }
}

/** Keyboard shortcuts are ignored while an input/select has focus. */
async function blur(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}

async function openStudio(page: Page, episode: string, mode?: 'editor') {
  const api = await mockStudioApi(page)
  await gotoHarness(page, STUDIO_URL(episode, mode))
  await studio.dismissTip(page).click({ timeout: 5_000 }).catch(() => {})
  if (!mode) {
    await expect(studio.stageNav(page)).toBeVisible()
    await studio.stageButton(page, 'Record').click()
  }
  await expect(studio.editorHeading(page)).toBeVisible()
  await expect(studio.recordButton(page)).toBeEnabled()
  return api
}

/** Roll a take of ~`seconds` on the default-armed host lane with no preroll. */
async function recordTake(page: Page, seconds: number) {
  await studio.preroll(page).selectOption('0').catch(() => {
    /* other streams may move preroll under Advanced; the take is then a little longer */
  })
  await studio.recordButton(page).click()
  await expect(studio.stopButton(page)).toBeVisible()
  await page.waitForTimeout(seconds * 1000)
  // The REC button pulses (CSS animation) so Playwright never sees it "stable" and a forced
  // click can land off the moving target: dispatch the click straight to the element.
  await studio.stopButton(page).dispatchEvent('click')
  await expect(studio.recordButton(page)).toBeVisible()
  // "Take at 0:00" confirms the capture landed (inline role=status line + toast).
  await expect(studio.takeToast(page)).toBeVisible({ timeout: 30_000 })
}

function consoleReport(diag: Diagnostics) {
  return filterConsole(diag.consoleErrors)
}

test.describe('production room (/dev/studio)', () => {
  test('editor loads through the staged studio with no console errors', async ({ page, diag }) => {
    await mockStudioApi(page)
    await gotoHarness(page, STUDIO_URL(`load-${Date.now()}`))
    // Plan is the landing stage: the queue + metadata, editor hidden but mounted.
    await expect(studio.stageNav(page)).toBeVisible()
    for (const stage of ['Plan', 'Record', 'Edit', 'Publish'] as const) {
      await expect(studio.stageButton(page, stage)).toBeVisible()
    }
    await studio.stageButton(page, 'Record').click()
    await expect(studio.editorHeading(page)).toBeVisible()
    await expect(studio.recordButton(page)).toBeEnabled()
    await page.waitForTimeout(2000)
    expect(consoleReport(diag), 'console errors on first load').toEqual([])
  })

  test('records 3 s with the fake mic and the take lands on the timeline', async ({ page }) => {
    await openStudio(page, `rec-${Date.now()}`)
    // Before any audio: one empty state, no lanes.
    await expect(studio.firstTakeEmptyState(page)).toBeVisible()
    await expect(studio.clips(page)).toHaveCount(0)
    await recordTake(page, 3)
    // The take is visible on the Record stage itself — no stage switch needed to see it land.
    await expect(studio.clips(page).first()).toBeVisible({ timeout: 30_000 })
    await expect(studio.firstTakeEmptyState(page)).toHaveCount(0)
    await studio.stageButton(page, 'Edit').click()
    await expect(studio.clips(page).first()).toBeVisible({ timeout: 30_000 })
    expect(await studio.clips(page).count()).toBeGreaterThanOrEqual(1)
    // Session length shows up in the editor clock ("0:04 / 0:03").
    await expect(studio.clock(page)).toBeVisible()
    const clock = (await studio.clock(page).textContent()) ?? ''
    const total = clock.split('/')[1]?.trim() ?? '0:00'
    expect(total, 'session length after a 3 s take').not.toBe('0:00')
  })

  test('export defaults to the full session (bare editor, WAV download)', async ({ page }) => {
    await openStudio(page, `export-${Date.now()}`, 'editor')
    await recordTake(page, 4)
    await expect(studio.clips(page).first()).toBeVisible({ timeout: 30_000 })

    // Heading over the session overview: "Playhead … · export Whole episode · 0:0N" — whole session by default.
    await expect(studio.exportRangeLine(page)).toBeVisible()
    await expect(studio.exportRangeLine(page)).toContainText(/whole episode/i)

    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
    await studio.exportWav(page).click()
    const download = await downloadPromise
    const file = await download.path()
    expect((await stat(file)).size, 'WAV bigger than a bare header').toBeGreaterThan(44)
    const head = (await readFile(file)).subarray(0, 12).toString('latin1')
    expect(head.startsWith('RIFF') && head.endsWith('WAVE'), `WAV header, got ${JSON.stringify(head)}`).toBe(true)

    const exported = await page.evaluate(() => window.__e2e?.exports ?? [])
    expect(exported.length).toBe(1)
    // Full session, not a selection: the exported duration matches the "Whole episode · m:ss"
    // length shown over the overview (rounded to whole seconds there). Capture length varies
    // with machine load, so compare against what the editor itself reports.
    const line = (await studio.exportRangeLine(page).textContent()) ?? ''
    const end = line.match(/whole episode · (\d+):(\d\d)/i)
    const sessionSeconds = end ? Number(end[1]) * 60 + Number(end[2]) : 0
    expect(sessionSeconds, `session length parsed from "${line}"`).toBeGreaterThan(0)
    expect(exported[0].durationSeconds).toBeGreaterThanOrEqual(sessionSeconds - 1)
    expect(exported[0].durationSeconds).toBeLessThanOrEqual(sessionSeconds + 1.5)
  })

  test('export from the staged studio saves the mix to the episode (mocked upload)', async ({ page }) => {
    const api = await openStudio(page, `save-${Date.now()}`)
    await recordTake(page, 4)
    await studio.stageButton(page, 'Publish').click()
    await expect(studio.exportEpisode(page)).toBeEnabled()
    await studio.exportEpisode(page).click()
    await expect
      .poll(() => api.saved.find((s) => s.method === 'PATCH' && typeof s.audio_url === 'string'), { timeout: 60_000 })
      .toBeTruthy()
    const patch = api.saved.find((s) => s.method === 'PATCH' && typeof s.audio_url === 'string')!
    expect(patch.audio_url).toBe('https://cdn.e2e.test/mix.mp3')
    expect(patch.status, 'a recording episode moves to editing once a mix is saved').toBe('editing')
    // Capture length varies with machine load; any real duration proves the mix was measured.
    expect(Number(patch.duration_seconds)).toBeGreaterThanOrEqual(1)
  })

  test('play, split, undo (Ctrl+Z) and redo on the Edit stage', async ({ page }) => {
    await openStudio(page, `edit-${Date.now()}`)
    await recordTake(page, 3)
    await studio.stageButton(page, 'Edit').click()
    await expect(studio.clips(page).first()).toBeVisible({ timeout: 30_000 })
    const before = await studio.clips(page).count()
    await studio.back5(page).click()
    await studio.playMix(page).click()
    await expect(studio.pause(page)).toBeVisible()
    await page.waitForTimeout(800)
    await studio.pause(page).click()
    await expect(studio.playMix(page)).toBeVisible()

    // Clicking a clip selects it and parks the playhead inside the take. Single-letter
    // shortcuts fire with the timeline focused or nothing focused — never from a button.
    await studio.clips(page).first().click()
    await blur(page)
    await page.keyboard.press('s')
    await expect.poll(() => studio.clips(page).count(), { message: 'split should add a clip' }).toBe(before + 1)
    // A focused button swallows single-letter keys (a slip must not cut or record).
    await studio.playMix(page).focus()
    await page.keyboard.press('s')
    await page.waitForTimeout(300)
    expect(await studio.clips(page).count(), 'S with a button focused must not split').toBe(before + 1)
    await blur(page)
    await page.keyboard.press('Control+z')
    await expect.poll(() => studio.clips(page).count(), { message: 'Ctrl+Z should undo the split' }).toBe(before)
    await page.keyboard.press('Control+Shift+z')
    await expect.poll(() => studio.clips(page).count(), { message: 'Shift+Ctrl+Z should redo the split' }).toBe(before + 1)
    await studio.undo(page).click()
    await expect.poll(() => studio.clips(page).count(), { message: 'toolbar undo should restore clip count' }).toBe(before)
  })

  test('stage change moves focus to the stage heading', async ({ page }) => {
    await mockStudioApi(page)
    await gotoHarness(page, STUDIO_URL(`focus-${Date.now()}`))
    await studio.dismissTip(page).click({ timeout: 5_000 }).catch(() => {})
    await studio.stageButton(page, 'Record').click()
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.tagName + ':' + (document.activeElement?.textContent || '')))
      .toMatch(/^H2:Record/i)
  })

  test('Advanced toggle reveals the full rack and is remembered', async ({ page }) => {
    await openStudio(page, `adv-${Date.now()}`)
    await studio.stageButton(page, 'Edit').click()
    await expect(studio.advancedToggle(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('button', { name: /^metronome$/i })).toHaveCount(0)
    await studio.advancedToggle(page).click()
    await expect(studio.advancedToggle(page)).toHaveAttribute('aria-pressed', 'true')
    await studio.stageButton(page, 'Record').click()
    await expect(page.getByRole('button', { name: /^metronome$/i })).toBeVisible()
    await page.reload({ waitUntil: 'load' })
    await studio.dismissTip(page).click({ timeout: 5_000 }).catch(() => {})
    await studio.stageButton(page, 'Record').click()
    await expect(studio.advancedToggle(page)).toHaveAttribute('aria-pressed', 'true')
    await studio.advancedToggle(page).click()
    await expect(studio.advancedToggle(page)).toHaveAttribute('aria-pressed', 'false')
  })

  test('autosave → reload → recovery banner restores the take', async ({ page }) => {
    const episode = `recover-${Date.now()}`
    await openStudio(page, episode)
    await recordTake(page, 3)
    await studio.stageButton(page, 'Edit').click()
    await expect(studio.clips(page).first()).toBeVisible({ timeout: 30_000 })
    const before = await studio.clips(page).count()
    await page.waitForTimeout(3500) // autosave debounce
    await page.reload({ waitUntil: 'load' })
    await studio.dismissTip(page).click({ timeout: 5_000 }).catch(() => {})
    await studio.stageButton(page, 'Record').click()
    await expect(studio.recoverBanner(page)).toBeVisible({ timeout: 30_000 })
    await studio.restore(page).click()
    await studio.stageButton(page, 'Edit').click()
    await expect(studio.clips(page).first()).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => studio.clips(page).count()).toBe(before)
  })

  test('Publish is blocked until a mix exists, and says why', async ({ page }) => {
    await mockStudioApi(page)
    await gotoHarness(page, STUDIO_URL(`gate-${Date.now()}`))
    await studio.stageButton(page, 'Publish').click()
    await expect(studio.publishNow(page)).toBeDisabled()
    await expect(studio.publishBlocked(page)).toBeVisible()
  })

  test('stems zip downloads (under Advanced)', async ({ page }) => {
    await openStudio(page, `stems-${Date.now()}`)
    await recordTake(page, 3)
    await studio.stageButton(page, 'Publish').click()
    await expect(studio.stemsZip(page)).toHaveCount(0)
    await studio.advancedToggle(page).click()
    const downloadPromise = page.waitForEvent('download', { timeout: 90_000 })
    await studio.stemsZip(page).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/-stems\.zip$/)
  })

  test.fixme('crash mid-take: the take journal offers the audio back after reload (engine stream)', async ({ page }) => {
    // Needs the sprint-2 take journal ("We found 1 unfinished recording") from the engine port.
    await openStudio(page, `crash-${Date.now()}`)
    await studio.recordButton(page).click()
    await page.waitForTimeout(4500)
    await page.reload({ waitUntil: 'load' })
    await expect(page.getByText(/unfinished recording/i)).toBeVisible({ timeout: 30_000 })
  })
})
