import type { Page } from '@playwright/test'

/**
 * Every UI hook the e2e specs rely on, in one place. Other streams (engine, guests,
 * AI/safety, live, clips) are renaming labels as they port features into this branch:
 * when a label changes, fix it HERE, not in the specs. Locators are role-based and loose
 * (regex, case-insensitive) on purpose.
 */

export const STUDIO_URL = (episode: string, mode?: 'editor') =>
  `/dev/studio?episode=${encodeURIComponent(episode)}${mode ? `&mode=${mode}` : ''}`
export const GUEST_URL = (mode?: 'fetch') => `/dev/guest${mode ? `?mode=${mode}` : ''}`
export const LIVE_URL = '/dev/live'

export const studio = {
  root: (page: Page) => page.getByTestId('dev-studio'),
  /** Stage bar: "1 Plan · 2 Record · 3 Edit · 4 Publish" (components/podcast/studio-stage-bar.tsx). */
  stageNav: (page: Page) => page.getByRole('navigation', { name: /studio stages|production steps/i }),
  stageButton: (page: Page, stage: 'Plan' | 'Record' | 'Edit' | 'Publish') =>
    studio.stageNav(page).getByRole('button', { name: new RegExp(`${stage}$`, 'i') }),
  dismissTip: (page: Page) => page.getByRole('button', { name: /dismiss tip|got it/i }),
  /** Editor header ("Podcast production room") — proves PodcastAudioEditor mounted. */
  editorHeading: (page: Page) => page.getByText(/podcast production room/i).first(),

  // --- Record ---
  /** The big RecordButton. aria-label flips: Start recording ↔ Stop recording. */
  recordButton: (page: Page) => page.getByRole('button', { name: /^(start recording|record new take|arm a take to record)$/i }),
  stopButton: (page: Page) => page.getByRole('button', { name: /^stop recording$/i }),
  preroll: (page: Page) => page.getByRole('combobox', { name: /preroll|lead-in/i }),
  recModeGroup: (page: Page) => page.getByRole('radiogroup', { name: /how to record/i }),
  takeToast: (page: Page) => page.getByText(/take at \d/i).first(),

  // --- Timeline / Edit ---
  clips: (page: Page) => page.locator('[data-clip]'),
  playMix: (page: Page) => page.getByRole('button', { name: /^play mix$/i }),
  pause: (page: Page) => page.getByRole('button', { name: /^pause$/i }),
  back5: (page: Page) => page.getByRole('button', { name: /back 5 seconds/i }),
  undo: (page: Page) => page.getByRole('button', { name: /^undo$/i }),
  /** "Playhead 0:04 · export 0:00 – 0:03" footer line under the timeline. */
  exportRangeLine: (page: Page) => page.getByText(/export \d+:\d\d\s*[–-]\s*\d+:\d\d/i).first(),
  /** "0:04 / 0:03" — playhead / session length in the editor header. */
  clock: (page: Page) => page.getByText(/^\d+:\d\d \/ \d+:\d\d$/).first(),

  // --- Publish / export ---
  exportEpisode: (page: Page) => page.getByRole('button', { name: /^export episode \(/i }),
  exportWav: (page: Page) => page.getByRole('button', { name: /audio only: wav|save as wav/i }),
  exportMp3: (page: Page) => page.getByRole('button', { name: /audio only: mp3/i }),
  stemsZip: (page: Page) => page.getByRole('button', { name: /download stems zip/i }),
  publishNow: (page: Page) => page.getByRole('button', { name: /^(publish now|live)$/i }),
  publishBlocked: (page: Page) => page.getByText(/publish blocked/i).first(),
  episodeStatus: (page: Page) => page.getByRole('combobox', { name: /episode status/i }),

  // --- Recovery ---
  recoverBanner: (page: Page) => page.getByText(/recover \d+ take/i),
  restore: (page: Page) => page.getByRole('button', { name: /^restore$/i }),
}

export const guest = {
  root: (page: Page) => page.getByTestId('dev-guest'),
  title: (page: Page) => page.getByRole('heading', { name: /e2e harness episode/i }),
  /** Sprint-2 consent screen (guest stream) — absent on the GarageBand base. */
  consentHeading: (page: Page) => page.getByRole('heading', { name: /before we start/i }),
  consentContinue: (page: Page) => page.getByRole('button', { name: /i understand/i }),
  greenRoom: (page: Page) => page.getByText(/green room/i).first(),
  name: (page: Page) => page.getByRole('textbox', { name: /display name|first name or nickname/i }),
  headphones: (page: Page) => page.getByRole('checkbox', { name: /headphones/i }),
  join: (page: Page) => page.getByRole('button', { name: /^join/i }),
  testMic: (page: Page) => page.getByRole('button', { name: /test microphone/i }),
  /** Inline error text. The base renders it as a plain <p>, not role=alert (see the UX audit). */
  error: (page: Page) => guest.root(page).getByText(/enter the name|enter a name|headphones so the host mix|invite has expired|invite is closed/i).first(),
  blocked: (page: Page) => guest.root(page).getByText(/expired|closed|revoked/i).first(),
  leave: (page: Page) => guest.root(page).getByRole('button', { name: /^leave$/i }),
}

export const live = {
  root: (page: Page) => page.getByTestId('dev-live'),
  placeholder: (page: Page) => live.root(page).getByRole('status'),
  goLive: (page: Page) => page.getByRole('button', { name: /^go live$/i }),
}
