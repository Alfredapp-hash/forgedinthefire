import { readFile, stat } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { test, expect, json, gotoHarness, filterConsole, type Diagnostics } from './fixtures'

/** Plausible admin API for the production room (no Supabase in the harness). */
async function mockStudioApi(page: Page) {
  await page.route(/\/api\/admin\/podcast\/invites(\?|$)/, (route) =>
    route.request().method() === 'GET' ? json(route, { invites: [] }) : json(route, { error: 'e2e' }, 400),
  )
  await page.route(/\/api\/studio\/ice/, (route) =>
    json(route, { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], turnConfigured: false }),
  )
}

const clips = (page: Page) => page.locator('[data-clip]')

/** Keyboard shortcuts are ignored while an input/select has focus. */
async function blur(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}

async function openStudio(page: Page, episode: string) {
  await mockStudioApi(page)
  await gotoHarness(page, `/dev/studio?episode=${episode}`)
  await expect(page.getByText('Podcast production room')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Record new take' })).toBeEnabled()
}

async function recordTake(page: Page, seconds: number) {
  // Preroll 0 so the take is exactly what we roll.
  await page.locator('label', { hasText: 'Preroll' }).locator('select').selectOption('0')
  await page.getByRole('button', { name: 'Arm', exact: true }).first().click()
  await page.getByRole('button', { name: 'Record new take' }).click()
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible()
  await page.waitForTimeout(seconds * 1000)
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Record new take' })).toBeVisible()
  await expect(clips(page).first()).toBeVisible({ timeout: 30_000 })
}

function consoleReport(diag: Diagnostics) {
  return filterConsole(diag.consoleErrors)
}

test.describe('production room (/dev/studio)', () => {
  test('loads with no console errors', async ({ page, diag }) => {
    await openStudio(page, `load-${Date.now()}`)
    await page.waitForTimeout(2500)
    expect(consoleReport(diag), 'console errors on first load').toEqual([])
  })

  test('record, play, split, undo, export WAV, recover after reload', async ({ page, diag }) => {
    const episode = `flow-${Date.now()}`
    await openStudio(page, episode)

    // --- arm host + record ~3 s ---
    await recordTake(page, 4)
    await expect(page.getByText(/Take at \d/)).toBeVisible({ timeout: 30_000 })
    const before = await clips(page).count()
    expect(before).toBeGreaterThanOrEqual(1)

    // --- rewind, play ~1 s, pause (playhead lands inside the take) ---
    await page.getByRole('button', { name: '5s', exact: true }).first().click() // ◀ 5 s → 0:00
    await page.getByRole('button', { name: 'Play mix' }).click()
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Play mix' })).toBeVisible()

    // --- split at playhead (S) then undo (Ctrl+Z) ---
    // Clicking a clip without dragging selects it and parks the playhead where you clicked.
    await clips(page).first().click()
    await expect(page.getByText(/^Playhead 0:0[1-9]/)).toBeVisible()
    await blur(page)
    await page.keyboard.press('s')
    await expect.poll(() => clips(page).count(), { message: 'split should add a clip' }).toBe(before + 1)
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(() => clips(page).count(), { message: 'undo should restore clip count' }).toBe(before)

    // --- export WAV → download ---
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
    await page.getByRole('button', { name: 'Save mix WAV' }).click()
    const download = await downloadPromise
    const file = await download.path()
    const size = (await stat(file)).size
    expect(size, 'WAV bigger than a bare header').toBeGreaterThan(44)
    const head = (await readFile(file)).subarray(0, 12).toString('latin1')
    expect(head.startsWith('RIFF') && head.endsWith('WAVE'), `WAV header, got ${JSON.stringify(head)}`).toBe(true)
    const exported = await page.evaluate(() => window.__e2e?.exports ?? [])
    expect(exported.length).toBe(1)
    expect(exported[0].durationSeconds).toBeGreaterThan(1.5)
    await expect(page.getByText('Saved WAV mix to episode')).toBeVisible()

    // --- autosave → reload → recovery banner ---
    await page.waitForTimeout(3500) // autosave debounce is 1.6 s
    await page.reload({ waitUntil: 'load' })
    await expect(page.getByText(/Recover \d+ take/)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Restore' }).click()
    await expect(page.getByText(/Restored \d+ takes/)).toBeVisible({ timeout: 30_000 })
    await expect(clips(page).first()).toBeVisible()
    await expect.poll(() => clips(page).count(), { message: 'restored clip count' }).toBe(before)
    await expect(page.getByText(/Recover \d+ take/)).toHaveCount(0)

    test.info().annotations.push({ type: 'console-errors', description: consoleReport(diag).join(' | ') || 'none' })
  })

  test('stems zip downloads; Discard saved clears the recovery offer', async ({ page }) => {
    const episode = `stems-${Date.now()}`
    await openStudio(page, episode)
    await recordTake(page, 3)
    await expect(page.getByText(/Take at \d/)).toBeVisible({ timeout: 30_000 })

    const downloadPromise = page.waitForEvent('download', { timeout: 90_000 })
    await page.getByRole('button', { name: 'Download stems zip' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/-stems\.zip$/)
    const zip = await readFile(await download.path())
    expect(zip.subarray(0, 4).toString('latin1'), 'zip local-file magic').toBe('PK\u0003\u0004')
    expect(zip.includes(Buffer.from('stems/'))).toBe(true)
    await expect(page.getByText(/Downloaded \d+ stems \+ mix/)).toBeVisible()

    await page.waitForTimeout(3500)
    await page.reload({ waitUntil: 'load' })
    await expect(page.getByText(/Recover \d+ take/)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Discard saved' }).click()
    await expect(page.getByText(/Recover \d+ take/)).toHaveCount(0)
    await page.waitForTimeout(1000)
    await page.reload({ waitUntil: 'load' })
    await expect(page.getByRole('button', { name: 'Record new take' })).toBeEnabled()
    await page.waitForTimeout(2500)
    await expect(page.getByText(/Recover \d+ take/), 'discarded session must not come back').toHaveCount(0)
  })

  // BUG-delete-whole-take: lib/podcast/edit.ts deleteRange → withClips(track, []) → clipsOf() treats an
  // empty clip list on a track with a buffer as one full-length clip, so the take comes back.
  test('KNOWN BUG: Delete over the whole take removes it', async ({ page }) => {
    test.fail(!process.env.E2E_SHOW_KNOWN_BUGS, 'deleteRange over the only clip resurrects the full take')
    await openStudio(page, `del-${Date.now()}`)
    await recordTake(page, 3)
    await expect(page.getByText(/Take at \d/)).toBeVisible({ timeout: 30_000 })
    // Right after a take the selection is the whole session (sel 0:00–end) on the new take.
    await expect(page.getByText(/sel 0:00–0:0\d/)).toBeVisible()
    await blur(page)
    await page.keyboard.press('Delete')
    await expect(page.getByText('Cut hole in lane')).toBeVisible()
    await expect.poll(() => clips(page).count(), { timeout: 5_000 }).toBe(0)
  })
})
