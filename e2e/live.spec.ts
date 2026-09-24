import type { Page } from '@playwright/test'
import { test, expect, json, gotoHarness, filterConsole } from './fixtures'

const UNCONFIGURED = {
  configured: false,
  provider: null,
  host: null,
  bearer: false,
  defaultHlsUrl: null,
  defaultWhepUrl: null,
}

const SCHEDULED = {
  id: 'live-e2e-1',
  episode_id: null,
  title: 'E2E Live Show',
  description: null,
  status: 'scheduled',
  scheduled_for: '2099-01-01T18:00:00.000Z',
  started_at: null,
  ended_at: null,
  playback_hls_url: null,
  playback_whep_url: null,
  last_heartbeat_at: null,
  created_by: null,
  created_at: '2026-09-23T00:00:00.000Z',
  updated_at: '2026-09-23T00:00:00.000Z',
}

async function mockLive(page: Page, opts: { provider?: object | null; sessions?: object[] } = {}) {
  await page.route(/\/api\/studio\/ice/, (route) => json(route, { iceServers: [], turnConfigured: false }))
  await page.route(/\/api\/admin\/podcast\/live\/whip/, (route) =>
    opts.provider === null ? json(route, { error: 'Provider check failed' }, 500) : json(route, opts.provider ?? UNCONFIGURED),
  )
  await page.route(/\/api\/admin\/podcast\/live(\?.*)?$/, (route) => json(route, { sessions: opts.sessions ?? [] }))
  await page.route(/\/api\/admin\/podcast\/invites/, (route) => json(route, { invites: [] }))
}

const goLive = (page: Page) => page.getByRole('button', { name: 'Go live' })

test.describe('live control room (/dev/live)', () => {
  test('renders without provider config and explains why Go live is off', async ({ page, diag }) => {
    await mockLive(page)
    await gotoHarness(page, '/dev/live')
    await expect(page.getByText('Program', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('img', { name: /Live monitor: Program/ })).toBeVisible()
    await expect(page.getByText('Not configured — set LIVE_WHIP_URL on Netlify')).toBeVisible()
    await expect(page.getByText('No live shows yet. Schedule one →')).toBeVisible()
    await expect(goLive(page)).toBeDisabled()
    await page.waitForTimeout(1000)
    const errors = filterConsole(diag.consoleErrors)
    test.info().annotations.push({ type: 'console-errors', description: errors.join(' | ') || 'none' })
    expect(errors).toEqual([])
  })

  test('scheduled show + open devices: Go live still disabled; safe slate toggles', async ({ page }) => {
    await mockLive(page, { sessions: [SCHEDULED] })
    await gotoHarness(page, '/dev/live')
    await expect(page.getByText(/Active:\s*E2E Live Show/)).toBeVisible()
    // Shown in the go-live checklist and beside the playback settings.
    await expect(page.getByText(/No playback URL/).first()).toBeVisible()
    await page.getByRole('button', { name: 'Open camera + mic' }).click()
    await expect(page.getByRole('button', { name: 'Re-open devices' })).toBeVisible({ timeout: 20_000 })
    // Everything but the provider is ready → the provider panel is the only reason shown.
    await expect(goLive(page)).toBeDisabled()
    await expect(page.getByText('Not configured — set LIVE_WHIP_URL on Netlify')).toBeVisible()

    await page.getByRole('button', { name: /^SAFE SLATE/ }).click()
    // The on-air badge (the help text also says "Safe slate").
    await expect(page.locator('span', { hasText: /^Safe slate$/ })).toBeVisible()
    await page.getByRole('button', { name: /Release safe slate/ }).click()
    await expect(page.getByRole('button', { name: /^SAFE SLATE/ })).toBeVisible()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.waitForTimeout(1000)
  })

  test('provider check failing shows an error instead of crashing', async ({ page }) => {
    await mockLive(page, { provider: null })
    await gotoHarness(page, '/dev/live')
    await expect(page.getByText('Provider check failed', { exact: true })).toBeVisible()
    await expect(page.getByText(/Live provider check failed/)).toBeVisible()
    await expect(goLive(page)).toBeDisabled()
  })
})
