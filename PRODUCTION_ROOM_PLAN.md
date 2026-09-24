# Production Room — Audit & Delivery Plan

_Last updated: 2026-09-24 · Owner: Brian Salsbury_

The "production room" is the two-person podcast studio under `app/admin/podcast`,
`app/studio`, `lib/podcast`, and `components/podcast` (~15k LOC across ~50 files).
This document is the gap audit and the phased plan to get it to a shippable MVP.

## Chosen direction

- **Drive to Record MVP first**, then publish completeness, then live.
- **Live streaming (Phase 3) is self-hosted** ("build our own" RTMP/SFU → HLS).
- This doc is the source of truth for that roadmap; update it as phases land.

---

## Current-state verdict

What the room **is today**: a two-person **double-ender recorder + post-production
editor + RSS distribution** system. The happy path works end to end — guest calls
in over WebRTC → host records locally → mix/edit in the multitrack editor → export
→ publish to RSS.

Two hard truths:

1. **Record is ~1 phase from a real MVP.** The machinery exists but is fragile under
   network stress and has no crash/data-loss safety net or observability.
2. **A live broadcast to an audience is not possible today — at all.** No RTMP/HLS/
   WHIP egress, no audience player, no server-side recording, no "Go Live." The
   program monitor (`components/podcast/program-monitor.tsx`) is a local canvas
   preview that never leaves the browser tab. Live is a **greenfield build**.

Cross-cutting theme: **happy path works; resilience and observability are missing.**

---

## Gap inventory (worst-first)

Severity: 🔴 Blocker · 🟠 Major · 🟡 Minor. Scope: RECORD / LIVE / BOTH.

### Connectivity & guest-join
| Sev | Scope | Gap | Anchor |
|-----|-------|-----|--------|
| 🔴 | BOTH | No renegotiation on ICE-failure reconnect; new offer can collide with in-flight answer → silent audio | `guest-portal.tsx:255-334`, `webrtc.ts:193-211` |
| 🔴 | BOTH | Signaling race: answer/ICE candidates arrive out-of-order over 900 ms polling; missed answer never retried | `signal/route.ts:32-34`, `webrtc.ts:200-203` |
| 🔴 | BOTH | No presence check — crashed/closed guest tab still reads "connected"; host can record dead air | `guest-access.ts:38-43`, heartbeat `guest-portal.tsx:417-419` |
| 🔴 | BOTH | STUN-only by default (TURN env optional/unset) → ~30–50% of guests behind symmetric NAT fail | `ice.ts:31-55`, `webrtc.ts:18-24` |
| 🟠 | BOTH | No connection-state UI; raw ICE string only; "gathering" vs "failed" indistinguishable | `guest-portal.tsx:715` |
| 🟠 | BOTH | No network-drop recovery mid-record; remote stream nullified on `disconnected` | `guest-portal.tsx:360-362` |
| 🟠 | LIVE | Rejoin-after-hangup silently dead (invite left in `left` state) | `signal/route.ts:74-75` |

### Capture & recording
| Sev | Scope | Gap | Anchor |
|-----|-------|-----|--------|
| 🔴 | BOTH | No shared clock between host & guest → multitrack takes drift over long episodes | `record-session.ts:54-63`, `audio-editor.tsx:1257-1275` |
| 🔴 | BOTH | No in-progress recovery — tab crash/refresh loses the in-flight take (IndexedDB writes only on stop) | `capture.ts:71-80`, `session-store.ts:155-213` |
| 🔴 | RECORD | Guest take upload is single-shot PUT — no retry/resume/timeout; one hiccup on 80 MB = re-record | `guest-portal.tsx:476-484` |
| 🟠 | RECORD | Host records the lossy WebRTC stream, not the guest's local backup | `webrtc.ts:6`, `guest-portal.tsx:509-510` |
| 🟠 | BOTH | Unbounded RAM — whole take buffered in memory | `worklet-capture.ts:44-49`, `capture.ts:71` |
| 🟠 | BOTH | No recording watchdog — UI says "Recording" while no samples flow | `capture.ts:79` |
| 🟠 | BOTH | Tab background-throttling drops chunks silently (no wake lock / visibility handling) | capture chain |
| 🟡 | RECORD | No storage-quota preflight; sample-rate mismatch only resolved at export | `session-store.ts:197-211`, `multitrack.ts:500-518` |

### Editing & export
| Sev | Scope | Gap | Anchor |
|-----|-------|-----|--------|
| 🔴 | EXPORT | Camera **keyframe animation has full UI but is never painted** — PIP/title/stinger moves do nothing | `camera-lane.tsx:617-704`, `picture.ts:319-356` |
| 🟠 | EXPORT | A/V drift detected but not corrected (no auto-snap at export) | `av-sync.ts:31-56`, `camera-lane.tsx:178-184` |
| 🟠 | EXPORT | No LUFS/codec compliance validation on the produced file | `audio-editor.tsx:2076-2116` |
| 🟠 | EXPORT | Video not muxed into a deliverable — RSS is audio-only; camera downloads separately | `audio-editor.tsx:1993-2039` |
| 🟠 | EDIT | Autosave is browser-only (no cloud backup); peaks compute on main thread (stutter on 60-min takes) | `session-store.ts`, `peaks.ts:42-83` |
| 🟡 | EDIT | Undo/redo less robust for camera edits than audio | `audio-editor.tsx:833-849` |

### Live & distribution
| Sev | Scope | Gap | Anchor |
|-----|-------|-----|--------|
| 🔴 | LIVE | **No live egress at all** — no RTMP/HLS/WHIP/WHEP, no audience player, no server-side recording, no "Go Live" | (absent) |
| 🟠 | DIST | Distribution is a manual checklist, not automation (no directory API sync) | `distribution/route.ts:18-45` |
| 🟠 | DIST | No scheduled auto-publish despite `scheduled_for` column | no cron for publish |
| 🟠 | DIST | No feed-compliance validation before publish (enclosure size, cover ≥1400², chapters) | `PodcastDesk.tsx:196-212` |
| 🟡 | DIST | Dead: `transcript` in RSS references a column not in schema; unused analytics event types | `app/podcast/rss.xml/route.ts:55` |

---

## The plan

### Phase 1 — Record MVP: make the double-ender bulletproof
**Goal:** two people can record a full episode and never lose it, even on bad networks.

1. **TURN mandatory** — provision TURN (self-hosted coturn or managed); fail loudly in
   the UI if ICE comes back STUN-only. Highest fix-to-impact ratio.
2. **Signaling robustness** — dedupe + ordered signal application, retry a missed
   answer, reconnect-with-renegotiation (reset invite state on rejoin). Evaluate
   Supabase Realtime/SSE to cut the 900 ms ICE lag.
3. **Crash-safe recording** — checkpoint capture chunks to IndexedDB on a tick (not
   only on stop); recover an in-progress take on reload.
4. **Resilient guest upload** — chunked/resumable upload with retry + signed-URL
   refresh; keep the local blob until the server confirms.
5. **Shared punch clock** — stamp host & guest takes against one session reference and
   reconcile drift at record time, not just flag it in post.
6. **Presence + recording watchdog** — heartbeat that actually marks a guest offline;
   a "samples are flowing" indicator so a silent-failed recorder is visible instantly.

**Exit criteria:** record a 60-min 2-person episode across a simulated network drop
and a tab refresh with zero data loss and aligned tracks; publish it to RSS.

### Phase 2 — Publish completeness & editor polish
**Goal:** what you export is correct, compliant, and includes video for social.

1. **Export correctness** — validate LUFS target and codec/bitrate on the produced
   file; write duration/file_size back reliably; block publish on a feed-compliance
   check (enclosure size, cover ≥1400², chapters well-formed).
2. **Camera keyframes: paint or pull** — implement keyframe interpolation in the
   compositor or remove the UI. Add A/V drift **auto-snap** at export.
3. **Video deliverable** — "Download MP4 (picture + master mix)" that muxes camera +
   mixed audio for YouTube/social; decide whether a video RSS is in scope.
4. **Durability & perf** — optional cloud session backup; move peaks to a worker.
5. **Distribution automation** — scheduled auto-publish cron for `scheduled_for`;
   feed-validation + submission-status polish.

**Exit criteria:** one click produces a platform-valid audio episode + a synced social
MP4; a scheduled episode publishes itself.

### Phase 3 — Live show (self-hosted, greenfield)
**Goal:** broadcast a live show to an audience with a safety net. Chosen approach:
**build our own** stack (not a hosted provider).

1. **Ingress** — WHIP endpoint (browser program-out via `canvas.captureStream` +
   master audio) or RTMP ingest for OBS. Land on a self-hosted media server
   (e.g., MediaMTX / Janus / mediasoup SFU).
2. **Transcode + egress** — real-time encode to LL-HLS/DASH; serve segments via our
   own CDN/edge. Budget for the ops surface this adds.
3. **Audience player** — public `/podcast/live` route with an HLS player; optional
   early-access gating for private subscribers.
4. **Server-side recording** — the media server archives the live show → lands as
   `episode.audio_url` / video VOD automatically (the safety net the current design
   entirely lacks).
5. **Go-live flow + schema** — add `broadcast_status`, stream keys, a "Go Live"
   control, scheduling/announce; live chat/Q&A as a stretch.

**Exit criteria:** schedule a show, go live, an external viewer watches with <10 s
latency, and the session is auto-archived as a publishable episode.

> **Ops note (build-our-own):** self-hosting ingest + SFU + HLS + CDN is a multi-month
> effort with ongoing operational cost (scaling, failover, bandwidth). Revisit the
> build-vs-buy call at the start of Phase 3 before committing infra.

---

## Appendix — audit method

Four parallel read-only explorer passes over connectivity, capture/recording,
editing/export, and live/distribution. File:line anchors above point at the specific
evidence. Verification at time of writing: `tsc --noEmit` clean, `next build` succeeds
(55/55 pages). `eslint .` was newly wired up (Next 16 removed `next lint`) and surfaces
a large pre-existing backlog (~21.5k problems, ~2.2k errors) because lint had never
actually run in this repo — triaging that backlog is its own tracked task, separate
from the studio work.
