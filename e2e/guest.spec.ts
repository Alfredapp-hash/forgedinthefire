import type { Page } from '@playwright/test'
import { test, expect, json, gotoHarness, filterConsole } from './fixtures'
import { GUEST_URL, guest } from './selectors'

/** Count getUserMedia calls so we can prove nothing opens the mic before the guest acts. */
async function trackMediaCalls(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __gum: number }
    w.__gum = 0
    const md = navigator.mediaDevices
    if (!md) return
    const orig = md.getUserMedia.bind(md)
    md.getUserMedia = async (c) => {
      w.__gum += 1
      return orig(c)
    }
  })
  return () => page.evaluate(() => (window as unknown as { __gum: number }).__gum)
}

async function mockGuestBasics(page: Page) {
  await page.route(/\/api\/studio\/ice/, (route) => json(route, { iceServers: [], turnConfigured: false }))
  await page.route(/\/api\/studio\/guest\/[^/?]+(\?.*)?$/, (route) =>
    json(route, {
      id: 'invite-e2e',
      episodeTitle: 'E2E Harness Episode',
      label: 'e2e',
      guestName: null,
      expiresAt: '2099-01-01T00:00:00.000Z',
      state: 'pending',
      recording: false,
      takeReady: false,
      takeUrl: null,
      cameraReady: false,
      cameraUrl: null,
    }),
  )
}

test.describe('guest booth (/dev/guest)', () => {
  test('green room renders before the mic is opened; join needs a name and headphones', async ({ page, diag }) => {
    const gumCalls = await trackMediaCalls(page)
    await mockGuestBasics(page)
    await gotoHarness(page, GUEST_URL())

    await expect(guest.title(page)).toBeVisible()
    await expect(guest.greenRoom(page)).toBeVisible()
    await expect(guest.join(page)).toBeVisible()
    // Nothing touched the microphone on load — the guest chooses when.
    expect(await gumCalls(), 'getUserMedia calls before any interaction').toBe(0)

    // Validation: name first, then headphones.
    await guest.join(page).click()
    await expect(guest.error(page)).toContainText(/name/i)
    expect(await gumCalls(), 'a rejected join must not open the mic').toBe(0)
    await guest.name(page).fill('Robin')
    await guest.join(page).click()
    await expect(guest.error(page)).toContainText(/headphones/i)

    const errors = filterConsole(diag.consoleErrors)
    test.info().annotations.push({ type: 'console-errors', description: errors.join(' | ') || 'none' })
    expect(errors, 'console errors in the green room').toEqual([])
  })

  test('invalid invite (fetch mode) shows a blocked message and no Leave button', async ({ page }) => {
    await page.route(/\/api\/studio\/ice/, (route) => json(route, { iceServers: [], turnConfigured: false }))
    await page.route(/\/api\/studio\/guest\/[^/?]+(\?.*)?$/, (route) =>
      json(route, { error: 'This invite has expired' }, 410),
    )
    await gotoHarness(page, GUEST_URL('fetch'))
    await expect(guest.root(page).getByText('This invite has expired')).toBeVisible()
    await expect(guest.leave(page)).toHaveCount(0)
  })

  test.fixme('consent screen ("Before we start") renders before the green room (guests stream)', async ({ page }) => {
    // Sprint-2 adds a recording-consent step ahead of the lobby. The base goes straight to
    // the green room. Re-enable when components/podcast/guest-portal.tsx gains the consent phase.
    await mockGuestBasics(page)
    await gotoHarness(page, GUEST_URL())
    await expect(guest.consentHeading(page)).toBeVisible()
    await expect(guest.join(page)).toHaveCount(0)
    await guest.consentContinue(page).click()
    await expect(guest.greenRoom(page)).toBeVisible()
  })

  test.fixme('join → WebRTC connected → host record on/off → backup upload (guests stream)', async () => {
    // Needs the sprint-2 signaling + chunked backup routes (lib/podcast/upload/*) from the guests port;
    // the full mocked-peer flow lives in podcast-sprint-2:e2e/guest.spec.ts and ports as-is once they land.
  })
})
