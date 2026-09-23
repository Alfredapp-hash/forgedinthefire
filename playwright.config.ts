import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// The sandbox ships a Chromium build older than this @playwright/test expects. Use it directly
// (E2E_CHROMIUM overrides) instead of `playwright install`.
const PREINSTALLED = ['/opt/pw-browsers/chromium']
const executablePath = process.env.E2E_CHROMIUM || PREINSTALLED.find((p) => existsSync(p))

const PORT = Number(process.env.E2E_PORT || 3100)
const baseURL = `http://localhost:${PORT}`
// Webpack by default: Turbopack panics when node_modules is a symlink out of the project root
// (how agent worktrees share deps). Set E2E_TURBOPACK=1 in a normal checkout to use Turbopack.
const devCmd = `npx next dev -p ${PORT}${process.env.E2E_TURBOPACK ? '' : ' --webpack'}`

export default defineConfig({
  testDir: './e2e',
  // First compile of the production room is slow (4k-line editor + wasm deps).
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    acceptDownloads: true,
    navigationTimeout: 150_000,
    actionTimeout: 20_000,
    permissions: ['microphone', 'camera'],
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: devCmd,
    url: `${baseURL}/dev/live`,
    reuseExistingServer: true,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
