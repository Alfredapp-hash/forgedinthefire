import { test as base, expect, type Page, type Route } from '@playwright/test'

/** Console noise that is environmental, not a product bug (no Supabase, dev-only tooling). */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[HMR\]|\[Fast Refresh\]/i,
  /Missing Supabase/i,
  /favicon/i,
]

export type Diagnostics = {
  consoleErrors: string[]
  pageErrors: string[]
  unmockedApi: string[]
}

type Fixtures = {
  /**
   * Known product bugs whose uncaught errors should not mask the
   * rest of a flow. A dedicated test.fail() test still asserts each one.
   */
  allowPageErrors: RegExp[]
  diag: Diagnostics
  /** Register an /api mock. Later registrations win (Playwright route LIFO order). */
  mockApi: (pattern: string | RegExp, handler: (route: Route) => Promise<void> | void) => Promise<void>
}

export function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

export const test = base.extend<Fixtures>({
  allowPageErrors: [[], { option: true }],
  diag: [
    async ({ page, allowPageErrors }, use, testInfo) => {
    const diag: Diagnostics = { consoleErrors: [], pageErrors: [], unmockedApi: [] }
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      if (IGNORED_CONSOLE.some((re) => re.test(text))) return
      diag.consoleErrors.push(text)
    })
    page.on('pageerror', (err) => {
      diag.pageErrors.push(`${err.name}: ${err.message}\n${(err.stack || '').split('\n').slice(0, 6).join('\n')}`)
    })
    // Catch-all: any /api call the test did not mock answers 503 and is logged.
    await page.route(/\/api\//, async (route) => {
      diag.unmockedApi.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
      await json(route, { error: 'e2e: unmocked api' }, 503)
    })
    await use(diag)
    const summary = [
      diag.pageErrors.length ? `pageerror:\n  ${diag.pageErrors.join('\n  ')}` : '',
      diag.consoleErrors.length ? `console.error:\n  ${diag.consoleErrors.join('\n  ')}` : '',
      diag.unmockedApi.length ? `unmocked api:\n  ${[...new Set(diag.unmockedApi)].join('\n  ')}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    if (summary) {
      await testInfo.attach('diagnostics', { body: summary, contentType: 'text/plain' })
      if (process.env.E2E_VERBOSE) console.log(`\n[diagnostics] ${testInfo.title}\n${summary}\n`)
    }
    // Uncaught exceptions fail the test (except explicitly allowed known bugs).
    const unexpected = diag.pageErrors.filter((e) => !allowPageErrors.some((re) => re.test(e)))
    expect(unexpected, 'uncaught exceptions (pageerror)').toEqual([])
    },
    { auto: true },
  ],
  mockApi: async ({ page, diag }, use) => {
    void diag
    await use(async (pattern, handler) => {
      await page.route(pattern, handler)
    })
  },
})

export { expect }

/** Wait for the Next dev server to finish hydrating the client component tree. */
export async function gotoHarness(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('load')
}

export function filterConsole(errors: string[], allow: RegExp[] = []) {
  return errors.filter((e) => !allow.some((re) => re.test(e)))
}
