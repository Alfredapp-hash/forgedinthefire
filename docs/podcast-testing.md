# Podcast production room — testing

Two layers:

| Layer | Command | What it covers |
|---|---|---|
| Unit (vitest) | `npm run test:unit` | Pure libs under `lib/podcast/**` and `tests/**` (owned by the engine stream: `vitest.config.ts`, `tests/setup`). |
| End-to-end (Playwright) | `npm run test:e2e` | The dev harnesses under `/dev/*` driven in real Chromium with a fake mic/camera. |

## The dev harnesses (`app/dev/**`)

Real components, fake data, no Supabase. Every page calls `devOnly()` (`app/dev/dev-only.ts`) and is
a hard 404 in a production build (`e2e/prod-guard.spec.ts` checks both the guard and that every
`app/dev/**/page.tsx` uses it).

| Route | Mounts | Notes |
|---|---|---|
| `/dev/studio?episode=<id>` | `app/admin/podcast/RecordingStudio.tsx` — the staged Plan → Record → Edit → Publish studio with a fake episode list in React state | `episode` is the autosave key; use a fresh one per test. Saves go to `/api/admin/studio/episodes` and mixes to `/api/admin/media`; the specs mock both. |
| `/dev/studio?mode=editor` | `components/podcast/audio-editor.tsx` (`PodcastAudioEditor`) bare, no `stage` prop, so every section renders | Exports are handed to the browser as downloads and logged on `window.__e2e` (`app/dev/e2e-log.ts`). |
| `/dev/guest` | `components/podcast/guest-portal.tsx` with a fake invite | `?mode=fetch` skips `initialSession` so the portal loads the invite over `/api/studio/guest/:token` (mock it). |
| `/dev/live` | `components/podcast/live-control-room.tsx` **if it exists**, otherwise a placeholder (`data-state="missing"`) | The import is a runtime context import (`app/dev/live/LiveHarness.tsx`) so `tsc`/webpack pass while the live stream is still porting the file. |

The site layout still wraps the harnesses in the marketing navbar/footer (only `/studio/*` hides
chrome via `middleware.ts`); the specs scope to `data-testid="dev-*"`.

## Running Playwright here

- `playwright.config.ts` uses the preinstalled Chromium at `/opt/pw-browsers/chromium`
  (`E2E_CHROMIUM` overrides). **Never run `playwright install`** in this sandbox.
- It starts `next dev -p 3100 --webpack` itself (`reuseExistingServer: true`, so a server you already
  have on :3100 is reused). Turbopack panics when `node_modules` is a symlink, hence webpack;
  `E2E_TURBOPACK=1` switches in a normal checkout.
- Fake devices: `--use-fake-device-for-media-stream` gives a tone on the mic; a ~3 s wall-clock
  take yields ~2–3 s of audio depending on machine load, so specs compare against what the editor
  reports rather than fixed numbers.
- First compile of the editor is slow (4–5k-line component + wasm deps): test timeout is 180 s,
  navigation 150 s.
- `E2E_VERBOSE=1` prints each test's diagnostics (console errors, uncaught exceptions, unmocked
  `/api` calls) to stdout; they are always attached to the report. Any `/api` call a test did not
  mock answers 503 and is listed — mock it in the spec rather than in the harness.

## Writing specs

- **All locators live in `e2e/selectors.ts`.** Other streams are renaming labels as they port
  features; fix the selector there, not in the specs. Prefer `getByRole` with loose, case-insensitive
  regexes.
- `e2e/fixtures.ts` gives you `test`, `expect`, `json(route, body, status)`, `gotoHarness(page, path)`
  and a `diag` fixture that fails the test on uncaught page errors (`allowPageErrors` to whitelist a
  known bug you assert elsewhere with `test.fail`).
- The REC button pulses while recording (`.studio-rec-recording`), so Playwright never considers it
  stable — use `dispatchEvent('click')` to stop (see `recordTake` in `e2e/studio.spec.ts`).
- Keyboard shortcuts are ignored while an input/select has focus: `blur(page)` first.
- On this base the timeline is Edit-stage only, so after a take switch stage before counting
  `[data-clip]`.
- Anything that depends on another stream's port is `test.fixme` with the stream named in the
  title/comment. Current fixmes: stems zip under Advanced (clips), crash-take journal (engine),
  guest consent screen + full WebRTC/backup flow (guests), the three live-room specs (live).

## UX audit

`docs/studio-ux-audit.md` — ranked usability/accessibility findings with `file:line` pointers,
produced by walking every harness screen with Playwright + axe-core. Screenshots and aria snapshots
are written to `e2e/.screens/` (git-ignored).
