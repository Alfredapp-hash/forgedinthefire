import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test, expect } from '@playwright/test'

/**
 * The /dev/* harnesses must hard-404 in production. Every page under app/dev calls
 * `devOnly()` (app/dev/dev-only.ts) before rendering. Two checks, no browser:
 *   1. devOnly() throws Next's not-found error when NODE_ENV === 'production' and is a no-op otherwise.
 *   2. Every app/dev/**\/page.tsx calls devOnly() in its default export.
 */
const DEV_DIR = path.resolve(__dirname, '../app/dev')

function isNotFound(err: unknown) {
  const digest = String((err as { digest?: string })?.digest ?? '')
  return digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;404') || digest === 'NEXT_NOT_FOUND'
}

async function withNodeEnv<T>(value: string, fn: () => Promise<T> | T) {
  const env = process.env as { NODE_ENV?: string }
  const prev = env.NODE_ENV
  env.NODE_ENV = value
  try {
    return await fn()
  } finally {
    env.NODE_ENV = prev
  }
}

test('devOnly() throws Next not-found in production and passes in development', async () => {
  const { devOnly } = await import('../app/dev/dev-only')
  await withNodeEnv('development', () => expect(() => devOnly()).not.toThrow())
  await withNodeEnv('production', () => {
    let thrown: unknown = null
    try {
      devOnly()
    } catch (err) {
      thrown = err
    }
    expect(thrown, 'should throw').not.toBeNull()
    expect(isNotFound(thrown), `digest: ${String((thrown as { digest?: string })?.digest)}`).toBe(true)
  })
})

test('every app/dev page calls devOnly() before rendering', async () => {
  const pages: string[] = []
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (/^page\.tsx?$/.test(entry.name)) pages.push(full)
    }
  }
  await walk(DEV_DIR)
  expect(pages.length, 'harness pages found').toBeGreaterThanOrEqual(3)
  for (const file of pages) {
    const src = await readFile(file, 'utf8')
    expect(src, `${path.relative(DEV_DIR, file)} imports devOnly`).toMatch(/from '\.\.\/(?:\.\.\/)*dev-only'/)
    const body = src.slice(src.indexOf('export default'))
    expect(body, `${path.relative(DEV_DIR, file)} calls devOnly() in its page component`).toMatch(/\bdevOnly\(\)/)
  }
})
