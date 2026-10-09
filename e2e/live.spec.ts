import type { Page } from '@playwright/test'
import { test, expect, json, gotoHarness, filterConsole } from './fixtures'
import { LIVE_URL, live } from './selectors'

async function mockLive(page: Page) {
  await page.route(/\/api\/studio\/ice/, (route) => json(route, { iceServers: [], turnConfigured: false }))
  await page.route(/\/api\/admin\/podcast\/live\/whip/, (route) =>
    json(route, { configured: false, provider: null, host: null, bearer: false, defaultHlsUrl: null, defaultWhepUrl: null }),
  )
  await page.route(/\/api\/admin\/podcast\/live(\?.*)?$/, (route) => json(route, { sessions: [] }))
  await page.route(/\/api\/admin\/podcast\/live\/destinations/, (route) => json(route, { destinations: [] }))
  await page.route(/\/api\/podcast\/live\/chat/, (route) => json(route, { messages: [], pinned: null }))
  await page.route(/\/api\/podcast\/live(\?.*)?$/, (route) => json(route, { live: null }))
  await page.route(/\/api\/admin\/studio\/episodes/, (route) => json(route, { episodes: [] }))
  await page.route(/\/api\/admin\/podcast\/invites/, (route) => json(route, { invites: [] }))
}

test.describe('live control room (/dev/live)', () => {
  test('harness renders: placeholder until live-control-room.tsx lands, the room once it does', async ({ page, diag }) => {
    await mockLive(page)
    await gotoHarness(page, LIVE_URL)
    await expect(live.root(page)).toHaveAttribute('data-state', /missing|ready/, { timeout: 30_000 })
    const state = await live.root(page).getAttribute('data-state')
    if (state === 'missing') {
      await expect(live.placeholder(page)).toContainText(/not on this branch yet/i)
    } else {
      await expect(live.goLive(page)).toBeVisible()
    }
    await page.waitForTimeout(1000)
    expect(filterConsole(diag.consoleErrors)).toEqual([])
  })

  test.fixme('renders without provider config and explains why Go live is off (live stream)', async () => {
    // Needs components/podcast/live-control-room.tsx; spec body in podcast-sprint-2:e2e/live.spec.ts.
  })
  test.fixme('scheduled show + open devices: Go live still disabled; safe slate toggles (live stream)', async () => {})
  test.fixme('provider check failing shows an error instead of crashing (live stream)', async () => {})
})
