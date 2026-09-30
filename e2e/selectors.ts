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
  /** Stage bar: "1 Plan · 2 Sound Booth · 3 Edit · 4 Publish" (components/podcast/studio-stage-bar.tsx). */
  stageNav: (page: Page) => page.getByRole('navigation', { name: /studio stages|production steps/i }),
  /** Stage buttons carry a stable aria-label ("Sound Booth — step 2") regardless of done/active state. */
  stageButton: (page: Page, stage: 'Plan' | 'Sound Booth' | 'Edit' | 'Publish') =>
    studio.stageNav(page).getByRole('button', { name: new RegExp(`^${stage}\\b`, 'i') }),
  /** Header status chip: Idle / Count-in / REC 00:00 / Saving. */
  statusChip: (page: Page) => page.getByTestId('studio-status-chip'),
  /** Persistent "Advanced" toggle in the editor header (aria-pressed reflects the state). */
  advancedToggle: (page: Page) => page.getByRole('button', { name: /^advanced/i }),
  dismissTip: (page: Page) => page.getByRole('button', { name: /dismiss tip|got it/i }),
  /** Production-room header eyebrow ("Podcast production room") — staged studio and bare editor alike. */
  editorHeading: (page: Page) => page.getByText(/podcast production room/i).first(),

  // --- Sound Booth (stage 2, components/podcast/booth-stage.tsx) ---
  /** The inline booth section (data-booth-variant="inline"); the overlay fallback is "modal". */
  booth: (page: Page) => page.locator('section[data-booth-variant="inline"]'),
  boothHeading: (page: Page) => page.getByRole('heading', { level: 2, name: /^sound booth$/i }),
  /** "No takes yet" / "3 takes · 12:40" under the timecode. */
  takesCounter: (page: Page) => page.getByTestId('booth-takes-counter'),
  /** Drawer with the guest invite panel + recent takes. */
  boothDrawer: (page: Page) => page.getByRole('complementary', { name: /guests and takes/i }),
  expandBooth: (page: Page) => page.getByRole('button', { name: /expand to full screen/i }),

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
  undo: (page: Page) => page.getByRole('button', { name: /^undo/i }),
  redo: (page: Page) => page.getByRole('button', { name: /^redo/i }),
  /** Per-person timeline scroller (role=region). Focus it so single-letter shortcuts fire. */
  timeline: (page: Page) => page.getByRole('region', { name: /^timeline/i }).first(),
  /** "Record your first take" empty state (Record + Edit stages before any audio). */
  firstTakeEmptyState: (page: Page) => page.getByText(/record your first take/i).first(),
  /** "Playhead 0:04 · export Whole episode · 0:03 (3 seconds)" heading over the session overview. */
  exportRangeLine: (page: Page) => page.getByText(/export (whole episode|selection only) · \d+:\d\d/i).first(),
  /** "0:04 / 0:03" — playhead / session length in the editor header. */
  clock: (page: Page) => page.getByText(/^\d+:\d\d \/ \d+:\d\d$/).first(),

  // --- Publish / export ---
  exportEpisode: (page: Page) => page.getByRole('button', { name: /^export episode \(/i }),
  exportWav: (page: Page) => page.getByRole('button', { name: /audio only: wav|save as wav/i }),
  exportMp3: (page: Page) => page.getByRole('button', { name: /audio only: mp3/i }),
  /** Under Advanced (see advancedToggle). */
  stemsZip: (page: Page) => page.getByRole('button', { name: /download stems zip/i }),
  publishNow: (page: Page) => page.getByRole('button', { name: /^(publish now|live)$/i }),
  publishBlocked: (page: Page) => page.getByText(/publish blocked/i).first(),
  episodeStatus: (page: Page) => page.getByRole('combobox', { name: /episode status/i }),

  // --- Recovery ---
  /** RecoveryBanner: "1 take (0:02) were saved … on this computer" / "We found 1 unfinished recording". */
  recoverBanner: (page: Page) => page.getByText(/\d+ takes? .*were saved|unfinished recording/i).first(),
  restore: (page: Page) => page.getByRole('button', { name: /^restore (session|recording)/i }),
}

export const guest = {
  root: (page: Page) => page.getByTestId('dev-guest'),
  title: (page: Page) => page.getByRole('heading', { name: /e2e harness episode/i }),
  /** Sprint-2 consent screen (guest stream) — absent on the GarageBand base. */
  consentHeading: (page: Page) => page.getByRole('heading', { name: /before we start/i }),
  consentContinue: (page: Page) => page.getByRole('button', { name: /i understand/i }),
  /** Lobby heading: "Get ready" on this branch (was "Green room"). */
  greenRoom: (page: Page) => page.getByText(/green room|get ready/i).first(),
  name: (page: Page) => page.getByRole('textbox', { name: /display name|first name or nickname|your name for the host/i }),
  headphones: (page: Page) => page.getByRole('checkbox', { name: /headphones/i }),
  join: (page: Page) => page.getByRole('button', { name: /^join/i }),
  testMic: (page: Page) => page.getByRole('button', { name: /test microphone/i }),
  /** Inline error text (rendered inside a role=alert Notice on this branch). */
  error: (page: Page) => guest.root(page).getByRole('alert').first(),
  blocked: (page: Page) => guest.root(page).getByText(/expired|closed|revoked/i).first(),
  leave: (page: Page) => guest.root(page).getByRole('button', { name: /^leave$/i }),
}

export const live = {
  root: (page: Page) => page.getByTestId('dev-live'),
  placeholder: (page: Page) => live.root(page).getByRole('status'),
  /** "Go live" / "Go live (unavailable — see why below)" when no provider is configured. */
  goLive: (page: Page) => page.getByRole('button', { name: /^go live/i }),
}
