# Studio UX audit — GarageBand-style production room

Branch audited: `studio-unified` (base) as mounted by the `/dev/studio`, `/dev/guest` and `/dev/live`
harnesses. Method: every screen walked with Playwright (desktop 1440×900 and phone 390×844, fake
mic/cam), axe-core 4.x run against each stage with the WCAG 2.1 A/AA + best-practice rule set,
plus a manual keyboard/screen-reader-name pass over the aria snapshots. Screenshots and aria
snapshots are in `e2e/.screens/` (git-ignored; regenerate with `npm run test:e2e`).

Goal being judged against: **"ease of use with full enterprise capability"** — a first-time host
should get from *Plan → Record → Edit → Publish* without reading a manual, while every pro control
stays reachable behind an *Advanced* affordance.

Nothing here has been changed in product code (other streams own those files); this is the punch
list. Each item has a severity, the WCAG criterion where one applies, and `file:line` pointers into
the base as of `558036e`.

Severity: **P0** blocks a first-time host or fails WCAG AA outright · **P1** real friction or
AA failure on a secondary path · **P2** polish / best practice.

---

## Ranked findings

### 1. P0 · The Record stage gives no visual confirmation that a take landed
After Stop, the only feedback is the status line "Take at 0:00" and the clock; the timeline, lanes
and waveform are gated behind `showEdit` so the host sees nothing move. GarageBand's core loop is
"press record, watch the region appear". First-time hosts will hit Record twice.
- `components/podcast/audio-editor.tsx:3758` (`{showEdit && (` — lane tools + People & takes + timeline)
- `components/podcast/audio-editor.tsx:4099`–`4102` (ruler) and `:4513` (per-person `SessionTimeline`)
- `components/podcast/audio-editor.tsx:5103` (`{ok && <p …>{ok}</p>}` — the only feedback, no live region)
- Fix direction: render a read-only ruler + the armed person's lane in Record (no mixer), or at
  minimum a compact "1 take · 0:03" strip with a "See it in Edit →" link.

### 2. P0 · Errors and success messages are plain `<p>` — no live region (WCAG 4.1.3 Status Messages)
"Take at 0:00", "Save failed", "Add a person and arm a take before recording", the guest's
"Enter the name the host should see" all render as `<p>` with a colour. Screen-reader users get
nothing; sighted users lose the message when it renders below the fold (the editor's `ok/error`
paragraph is at the very bottom of a 4 000-px stage).
- `app/admin/podcast/RecordingStudio.tsx:432`–`433`, `:512`–`513`
- `components/podcast/audio-editor.tsx:5102`–`5103`
- `components/podcast/guest-portal.tsx:1299`–`1304`
- The `Toaster` (`components/studio-ui/Toast.tsx:200`, `aria-live="polite"`) is the right primitive
  and is already mounted once at `RecordingStudio.tsx:404`; route `setOk/setError` through it (or
  add `role="status"` / `role="alert"` to the paragraphs and move them under the transport).

### 3. P0 · Track controls are unlabeled or title-only (WCAG 1.3.1 / 4.1.2) — axe `label` ×8, `label-title-only` ×2, `button-name` ×1
- Person and track name inputs have no accessible name (they read as "textbox: Host"):
  `components/podcast/audio-editor.tsx:4126` (`value={person.name}`), `:4325` (track name input).
- Mic picker is `title`-only: `components/podcast/audio-editor.tsx:4155` (`title="Microphone for this person"`).
- Mute / Solo / Arm / A / L / Comp are single letters with `title` only; SR users hear "M", "S", "R":
  `:4328`–`:4362`. Give them `aria-label="Mute Host"` etc. and keep the letter visible.
- The overview/minimap is an unnamed `<button>`: `:4744` (`className="relative w-full h-16 …"`).
- Chapter start time in Plan is named by its placeholder "1:30": `components/podcast/episode-plan.tsx:578`; same in the mixer `audio-editor.tsx:4473`.
- The "No planned topic" select in *Write a new episode* has no label: `components/podcast/episode-plan.tsx:315` (axe `select-name`, critical).

### 4. P0 · Jargon on the primary path — the host has to know DAW/broadcast vocabulary before the first take
Everything below is visible by default on Record or Edit. Suggested renames in parentheses.
- "Preroll" (→ *Lead-in*) `audio-editor.tsx:3240`; "Count-in" is fine but should sit next to Metronome.
- "Punch in" / "Replace" / "From the top" radios `:3226`–`:3235` (`ALL_REC_MODES`, `:5206`) — keep, but
  default-collapse to *New take* with "More ways to record" disclosure.
- "Raw input (no Chrome AGC)" `:3688`, "Auto-mute quieter mic" `:3692`, "Isolate (RNNoise)" `:3696`,
  "Fallback mic" `:3700`, "Follow talker" `:3715`, "Play mix while recording · Cue 0.85" `:3666`.
  (→ *Noise removal*, *Mic gain: automatic / manual*, *Hear the mix in headphones*.)
- "Lane tools — same track" `:3762`, "Smart controls" `:3776`, "Duck amount" `:3887`, "Sidechain lane" `:3899`
  (→ *Lower music under voices*).
- "Insert rack · bypass / wet-dry · not baked in" `:4829`; "Render to take (destructive)" `:4900`;
  "Bounce track → stem" `:4940`; "Bounce mix (keeps takes)" `:4948`; "Normalize + limit (keeps takes)";
  "Replace session" `:4964` (red, unexplained — see #7).
- Status chip text "AudioWorklet punch" `:2055` and "● REC Host at 0:00 · mix in headphones" — implementation
  detail in a host-facing status line.
- Episode status is the raw enum (`draft`, `recording`, … lowercase): `RecordingStudio.tsx:495`–`503`.
- Env-var names in the host UI: "set TURN_URL, TURN_USERNAME, and TURN_CREDENTIAL … on Netlify":
  `components/podcast/guest-invite-panel.tsx:780`, `:792`. (→ "Relay server not set up — ask your admin"; keep the var names in a tooltip/`<details>`.)

### 5. P0 · Power features are not behind *Advanced* — the Edit stage shows 156 focusable controls on first open
Measured on a session with one 3-second take (`e2e/.screens/studio-edit.aria.yml`): 4 lanes × 3 empty
take slots ("take 2 · empty", "ready — arm or record" ×8), pan/fade/start on every lane, a 14-button
insert rack, 8 destructive render buttons, a 10-pad SFX bank, keyframes/graphics per person.
Recommended default surface (GarageBand "Smart Controls" model), everything else under one
persistent **Advanced** toggle remembered in `localStorage` (the feature branch already has this
pattern as the "Advanced tools" checkbox):
- Keep by default: Play/Back/Forward/Undo/Zoom, Split, Delete, one volume fader per lane, Mute/Solo,
  Add person / Add music, Export episode.
- Move under Advanced: Pan `:4458`, per-lane Fade in/out `:4486`–`:4496`, Start offset `:4473`,
  A/L/Comp `:4362`+, Duplicate/Clear/Remove `:4415`–`:4432`, Graphics (Lower third/B-roll/Stinger) `:4205`+,
  "Apply range to every track" + Duck `:3762`–`:3930`, SFX pad `components/podcast/sfx-pad.tsx`,
  Insert rack `:4829`–`:4898`, Render to take `:4900`–`:4966`, Master fade in/out `:4802`–`:4814`,
  Match −16 LUFS `:5057`, stems / A-roll / PIP / MP4 `:5066`–`:5093`, Metronome `:3445`, Snap `:3395`,
  Preroll/Count-in `:3240`–`:3262`, Raw input / Auto-mute / Isolate / Fallback mic / Follow talker `:3688`–`:3715`.
- Empty take slots: show only *take 1* until it has audio; add slots on demand (`lib/podcast/multitrack.ts:195`–`:209`).

### 6. P1 · Keyboard: Undo has no shortcut; letter shortcuts fire from anywhere; no focus management on stage change (WCAG 2.1.1, 2.4.3)
- Ctrl/Cmd+Z is not bound (`lib/podcast/shortcuts.ts:20`–`:62` lists none; `audio-editor.tsx:1049`
  handles Shift+M but no `z`). Undo is only the toolbar icon `:3320`. Every host will press Ctrl+Z.
- Single-letter shortcuts (`R` = record, `S` = split, `Delete` = cut a hole) are global; a slip
  while a chip button is focused records or cuts. Scope them to the timeline/transport focus, or
  require the timeline to be the active region (axe flagged the timeline's scroller as not
  focusable: `components/podcast/session-timeline.tsx:305`, `camera-lane.tsx:315` — add `tabIndex={0}`
  + `aria-label="Timeline"`).
- Switching stage moves nothing: focus stays on the stage button and the new content is below.
  Move focus to the stage panel heading on change (`components/podcast/studio-stage-bar.tsx:100`–`:112`).
- Stage buttons rename themselves as steps complete ("1 Plan" → "Plan" with a check icon that is
  `aria-hidden`): `studio-stage-bar.tsx:120`–`:132`. Keep a stable accessible name
  (`aria-label="Step 1, Plan, complete"`) so SR users and tests can rely on it.
- Trim handles are 8-px-wide buttons (`session-timeline.tsx:590`–`:596`); reachable by Tab but
  invisible to sighted keyboard users and below any target-size guidance.

### 7. P1 · Dead ends and unexplained destructive actions
- **Publish** checklist rows that are "required" but not jumpable (Audio enclosure URL, Enclosure
  byte length, Duration) show nothing to click: `RecordingStudio.tsx:561`–`:623` (`jumpable` at `:591`, `Fix →` at `:606`). They should jump to
  Record/Edit like the Plan rows jump to Plan (`COMPLIANCE_FIELD`, `:36`–`:44`; `jumpToField` `:157`).
- **Publish** stage puts the compliance panel *above* the export buttons, so the thing that fixes
  "no audio" (Export episode) is off-screen below the list: `RecordingStudio.tsx:561`–`:623` (gate panel) renders before the editor panel at `:630`–`:645`, whose export
  buttons are `audio-editor.tsx:4973`–`:5093`. Export first, then the gate.
- "Replace session" is a red button with no confirm or copy: `audio-editor.tsx:4964` (compare
  "Delete saved takes…" in the feature branch, which always confirms).
- "Turn on camera" `audio-editor.tsx:3604` opens the camera silently; the copy above it
  (`:3594`) explains video appears "once a camera is on" but not that recording will also write a
  camera file to this browser (that is only in the wall of text at `:5106`).
- The "Episode page" link (`RecordingStudio.tsx:505`) leaves the studio with unsaved timeline state
  and no warning; the editor has autosave but the link should say so or open in a new tab.
- Guest: "Relay server isn't configured" is shown to every guest even when it is irrelevant on their
  network: `guest-portal.tsx:922`–`:933`. Say it only when ICE fails (`iceFailedHint` already exists).

### 8. P1 · Missing / noisy empty states
- Edit with no audio: 4 lanes × "ready — arm or record" (`session-timeline.tsx:430`) and three "take
  n · empty" chips per person (`audio-editor.tsx:4308`–`:4316`) instead of one CTA ("Record your
  first take" → Record stage).
- Publish with no mix: the export panel header says "Ready to export" (`:4973`) even when there is
  nothing to export; the button then errors "Nothing to export" (`:2839`).
- Camera panel empty state (`:3594`) is fine; the Remote guest panel (`guest-invite-panel.tsx`) shows
  "No invite" plus a 90-word paragraph (`:780`–`:800`) before the host has done anything — collapse it.
- Plan with no episodes has a good empty state (`episode-plan.tsx:206`–`:211`) — keep as the model.

### 9. P1 · Colour contrast below 4.5:1 (WCAG 1.4.3) — axe `color-contrast` ×6 on Edit
- Muted label `#5C6B77` on `#0A1016` = **3.48:1** — "Graphics" `audio-editor.tsx:4205`; the same hex is
  used for the "Individual files" heading (`:5034`, `#5E6B78` = 3.40:1 on the panel).
- Lane rail text `#9AABBA` on the guest tint `#29444E` = **4.38:1** — "Guest", "guest · video + audio",
  "Camera off — waiting for peer" (`:4126`+ rail, tint from `lib/podcast/lanes.ts`).
- Armed/danger button: white on `bg-red-500/90` = **4.38:1** — `audio-editor.tsx:5154` (`danger`).
- Everything using `text-silver-label` / `#7C8B97` on `#0C141C` passes (5.3:1) — use those tokens instead.
- Not flagged by axe but fragile: 10-px uppercase tracking labels (`text-[10px]`) everywhere in the mixer.

### 10. P1 · The 350-word help paragraph and the shortcut cheat-line
- `audio-editor.tsx:5106` is a single 2 400-character paragraph at the bottom of every stage. Split it
  into the Shortcuts modal (`components/podcast/shortcuts-help-modal.tsx`, already good) and per-panel
  `<details>` "How this works" blocks.
- `audio-editor.tsx:3751` ("Space / L plays. J / K / L is the playhead. R records. S splits audio…")
  duplicates the Shortcuts modal in 10-px text under the Host lane.

### 11. P2 · Plan stage overflows horizontally at phone width
Queue cards force the page to 724 px wide at 390 px: the grid item under
`components/podcast/episode-plan.tsx:202`–`:203` needs `min-w-0` so the `truncate` spans at `:241`/`:252`
can shrink. Record and Edit stages are fine at 390 px (measured).

### 12. P2 · Record button animation is continuous while recording
`.studio-rec-recording` pulses at 0.8 s forever (`app/globals.css:1003`–`:1005`). It respects
`prefers-reduced-motion` (`:1013`–`:1018`), so WCAG 2.2.2 is met, but the moving target defeats
automation (Playwright's "element is not stable") and can be missed on a flick. A static red ring +
`REC 0:19` chip (already present at `:3186`) is enough; pulse the dot, not the button.

### 13. P2 · Target size and density (WCAG 2.5.5 AAA — advisory)
28-px `chip` buttons (`audio-editor.tsx:5150`), 20-px-wide transport icons on phone
(`:3294`–`:3380` inside a `sm:flex-wrap` row at `:3271` — they shrink below their intrinsic width),
13-px checkboxes in the mixer insert list (`:4855`+). Use `size="touch"` from `studio-ui/Button` on
the Record stage at least.

### 14. P2 · Landmarks and headings
The editor has no `<h1>`/`<h2>` — every section title is a `<p>` (e.g.
`:3085`–`:3087`, `:3762`, `:4069`, `:4829`, `:4973`). Screen-reader users cannot jump between Transport /
People & takes / Mixer / Export. Make them headings (`<h2>`) and wrap each in `<section aria-labelledby>`.
(The duplicate `<main>` axe reports come from the dev harness inside the site layout, not the product.)

### 15. P2 · Guest booth
- The green room opens the mic only on "Test microphone"/select focus, which is right (verified: zero
  `getUserMedia` calls on load), but there is no consent step before the mic; the feature branch's
  "Before we start" screen should port (`e2e/guest.spec.ts` has the fixme).
- The headphones checkbox label is 20 words (`guest-portal.tsx:1004`); put the warning in help text
  and keep the label "I'm wearing headphones".
- Expiry is rendered in the guest's locale but the string "Host still punches Record" (`:1013`) is
  studio jargon for a guest (`:1018`).

---

## Jargon → plain language (quick reference)

| Today | Suggested | Where |
|---|---|---|
| Preroll | Lead-in | `audio-editor.tsx:3240` |
| Punch in / Replace / From the top | Keep, under "More ways to record" | `:3226`, `ALL_REC_MODES :5206` |
| Raw input (no Chrome AGC) | Mic gain: manual | `:3688` |
| Isolate (RNNoise) | Remove background noise | `:3696`, `:4829` |
| Auto-mute quieter mic | Mute the quieter mic automatically | `:3692` |
| Follow talker | Auto-switch to who's talking | `:3715` |
| Cue 0.85 / Play mix while recording | Hear the mix in headphones | `:3666` |
| Lane tools — same track / Smart controls | Selection tools | `:3762`, `:3776` |
| Duck / Sidechain lane | Lower music under voices | `:3887`, `:3899` |
| Insert rack · bypass / wet-dry · not baked in | Effects (non-destructive) | `:4829` |
| Render to take (destructive) | Apply permanently | `:4900` |
| Bounce track → stem / Bounce mix | Export this lane / Flatten mix | `:4940`, `:4948` |
| Replace session | Start over (with confirm) | `:4964` |
| Comp / A / L | Use this take here / Main take / Layer | `:4362`+ |
| Audio enclosure URL / Enclosure byte length | Episode audio file / File size | `lib/podcast/compliance.ts` |
| AudioWorklet punch | (remove from status line) | `:2055` |
| TURN_URL … on Netlify | Relay server not set up — ask your admin | `guest-invite-panel.tsx:780`, `:792` |

## What already works well (keep)
- Stage bar with "Next · …" line (`studio-stage-bar.tsx:139`–`:143`) and the first-run tip.
- Plan-stage "Fix →" jump from checklist rows to the field (`RecordingStudio.tsx:157`–`:177`).
- Shortcuts modal and Recording Booth both trap and restore focus (`shortcuts-help-modal.tsx:50`–`:56`,
  `recording-booth.tsx:256`–`:261`); booth passed axe clean.
- Global `:focus-visible` ring (`app/globals.css:283`) and reduced-motion handling.
- Plain-language record-mode radios with a one-line blurb (`:3226`–`:3238`).
- "Publish blocked · …" copy tells the host which stage fixes each blocker (`RecordingStudio.tsx:580`–`:585`).

## Method notes / how to re-run
- `npm run test:e2e` starts the dev server on :3100 and drives the harnesses; screenshots and aria
  snapshots land in `e2e/.screens/` when the ad-hoc walk scripts are run (see `docs/podcast-testing.md`).
- axe: `node_modules/axe-core/axe.min.js` injected per stage; report at `e2e/.screens/axe-report.json`.
- Contrast ratios computed from the literal hex values in the components (WCAG relative luminance).
