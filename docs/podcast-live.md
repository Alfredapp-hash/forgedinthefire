# Podcast LIVE show mode

Run a live show from the browser. There is no server-side encoder (Netlify has no
long-running process and no ffmpeg), so the host's browser does all the work:

```
host cam ─┐ [face blur]                                        ┌─ WHIP (RFC 9725) ─► provider ─► HLS / WHEP ─► /podcast/live
guest cam ┼─► canvas Program ─► BROADCAST DELAY (7–30 s) ─► Air ┤   via /api/admin/podcast/live/whip (secret stays server-side)
slates  ──┘  "Live (you)"       video ring buffer    "On air"   └─ MediaRecorder (local) ─► "Save as episode draft"
host mic ─┐                     audio DelayNode
guest mic ┼─► [voice disguise] ─► WebAudio mix → limiter ─┘
SFX     ──┘
               DUMP (D) = throw the buffer away + safe slate; the delay rebuilds behind it
```

- **Admin:** Podcast Console → **Live show** tab (`components/podcast/live-control-room.tsx`).
- **Public:** `/podcast/live` (`components/podcast/live-player.tsx`), plus a "Live now" /
  "Next live show" banner on `/podcast` (`components/podcast/live-banner.tsx`).
- **Guest:** the existing private guest link (same booth page as pre-recorded episodes).
  Their P2P camera + mic feed Program in the host tab. Guest never talks to the provider.

## 1. Apply the migration

Run `supabase/migrations/20260923000001_podcast_live.sql` in the Supabase SQL editor (or `supabase db push`).
It creates `podcast_live_sessions`:

| column | notes |
| --- | --- |
| `status` | `scheduled` → `live` → `ended` (API enforces transitions; only one row may be `live`) |
| `episode_id` | optional link to `podcast_episodes` (needed for guest invites and the on-demand draft) |
| `playback_hls_url`, `playback_whep_url` | per-show playback; fall back to `LIVE_PLAYBACK_*` env |
| `last_heartbeat_at` | bumped every 60 s while on air; viewers see "reconnecting" if it goes stale |

RLS: anon/authenticated may `SELECT` only rows with status `scheduled`/`live`, and only the public
columns (`id, title, description, status, scheduled_for, started_at, playback_*, last_heartbeat_at`).
All writes go through admin API routes with the service role.

## 2. Provider setup — Cloudflare Stream (default)

1. Cloudflare dashboard → **Stream** → subscribe (Stream is billed per minute; see Costs).
2. **Stream → Live inputs → Create live input.** Name it "Forged in the Fire Live". Leave
   "Automatically record" on if you also want Cloudflare to keep a copy.
3. Open the live input. Under **WebRTC** copy:
   - **WHIP publish URL** — `https://customer-<code>.cloudflarestream.com/<secret>/webRTC/publish`.
     This URL *is* the credential. Never put it in client code or a `NEXT_PUBLIC_*` var.
   - **WHEP playback URL** — `https://customer-<code>.cloudflarestream.com/<input-uid>/webRTC/play`.
4. Netlify → Site configuration → Environment variables:
   - `LIVE_WHIP_URL` = the WHIP publish URL
   - `LIVE_PLAYBACK_WHEP_URL` = the WHEP playback URL
   - `LIVE_PLAYBACK_HLS_URL` = `https://customer-<code>.cloudflarestream.com/<input-uid>/manifest/video.m3u8`
     (only if your input supports HLS for WebRTC ingest — see the note below)
   - leave `LIVE_WHIP_BEARER` empty for Cloudflare.
5. Redeploy. In the Live tab, **Live provider** should say `WHIP ready · cloudflare`.

> **Check before you rely on HLS/simulcast with Cloudflare.** Cloudflare's WebRTC (WHIP/WHEP)
> support has been documented as beta with limits: historically, WHIP-ingested streams played
> back over **WHEP only** — HLS/DASH, recording and simulcast "Outputs" (YouTube/Facebook)
> applied to RTMPS/SRT ingest. Read the "Ultra-low latency with WebRTC" page in the Stream docs
> for the current list. The player here handles both: if the session only has a WHEP URL, viewers
> use WHEP (sub-second latency, works in all modern browsers). If you need HLS or simulcast today,
> use MediaMTX (below) as the WHIP endpoint and have it push RTMP to Cloudflare/YouTube.

## 3. Alternative — self-hosted MediaMTX (MIT)

Good when you want WHIP in, HLS out, and RTMP pushes to YouTube/Facebook, on a $5–10/month VPS.

```yaml
# mediamtx.yml (excerpt)
webrtcAddress: :8889
webrtcLocalUDPAddress: :8189
webrtcAdditionalHosts: [live.example.org]
hlsAddress: :8888
hlsVariant: lowLatency
authInternalUsers:
  - user: host
    pass: <long-random>
    permissions: [{ action: publish, path: show }]
  - user: any
    permissions: [{ action: read, path: show }, { action: playback, path: show }]
paths:
  show:
    # optional simulcast
    # runOnReady: ffmpeg -i rtsp://localhost:8554/show -c copy -f flv rtmp://a.rtmp.youtube.com/live2/<key>
```

- Put Caddy/nginx in front for TLS on 443 (browsers require HTTPS). Open UDP 8189.
- `LIVE_WHIP_URL=https://live.example.org/show/whip`
- `LIVE_WHIP_BEARER=Basic <base64 of host:long-random>` (a value starting with `Basic ` is sent verbatim)
- `LIVE_PLAYBACK_HLS_URL=https://live.example.org/show/index.m3u8`
- `LIVE_PLAYBACK_WHEP_URL=https://live.example.org/show/whep` (optional)
- The control room prefers H.264, which MediaMTX can package into HLS without transcoding.

**LiveKit** (Cloud or self-hosted) also works: create a WHIP ingress, set `LIVE_WHIP_URL` to
its URL and `LIVE_WHIP_BEARER` to its stream key. Playback then needs a LiveKit egress to HLS.

## 4. Running a show

1. **Schedule** a show (title, time, public description). It appears on `/podcast/live` with a countdown
   and on `/podcast` as "Next live show" within 7 days.
2. Link it to an episode (pick one, or **New draft episode**). This enables the **Guest** panel —
   create the private guest link exactly like a pre-recorded session and send it to the guest.
3. **Open camera + mic.** Wear headphones — guest audio plays in this tab (Monitor toggle).
4. Choose the **Broadcast delay** (default 10 s; Off, 7, 10, 15, 20, 30 s). It is locked once on air.
   Check **Privacy**: guest face blur (on by default), host face blur, guest voice disguise.
5. Pick a **Countdown** (e.g. 30 s) and press **Go live…**. If the button is disabled, the reasons are
   listed right under it (no show selected / camera + mic not opened / provider not configured).
   "Guest not connected" is only a warning.
6. The **pre-flight checklist** runs: provider reachable (server-side OPTIONS to the WHIP host),
   outgoing bitrate (≈1.5 MB upload to `/api/admin/podcast/live/speedtest`), delay chosen, guest/host
   face blur state, safe slate ready, guest connected, voice disguise. Anything **Blocked** must be
   fixed; warnings are yours to judge. Press **Go live now**.
7. For the first *delay* seconds viewers see "Starting soon" while the buffer fills, then the delayed
   Program (countdown slate, then your last camera scene).
8. Switch **Host / Guest / PIP** (short dissolve). **Title lower third** toggles the name strap.
9. **DUMP (D)** or **SAFE SLATE (S)** at any time (see below). **Release** returns to the last camera
   scene — with a delay, viewers see the release *delay* seconds later.
10. **End show** → "Thanks for watching" slate → the stream keeps running for *delay* + 3 s so the
    tail airs → stream stops → session marked `ended`.
11. **Save as episode draft** uploads the Program audio (WebM/Opus) via `uploadPodcastMedia` and
   attaches it to the linked episode (or creates a new draft). Edit, add notes and publish through the
   normal pre-record pipeline. **Program video** is download-only — save it before closing the tab.

The draft and the local video are recorded from the **air** feed (after the delay), so anything you
dumped is not in the draft either. The page keeps warning before you close it until the recording
has been saved as a draft.

Stream health (bitrate, packet loss, RTT, fps, reconnects) updates every 2 s. If ingest drops,
the publisher retries with backoff (1, 2, 4, 8, 15, 30 s…) until you press End, and a large amber
"Stream reconnecting…" banner shows in the control room. Viewers get a "Reconnecting…" slate when
their picture stops advancing for 4 s, the player has to reconnect, or the heartbeat goes stale; it
clears on its own.

## Broadcast delay and DUMP

The key safety feature. What you switch (the **Live (you)** monitor) reaches viewers *delay* seconds
later (the **On air (+10 s)** monitor), so a slip can be removed before it airs.

- **DUMP** — the big red button or the **D** key, no confirmation. It (1) discards everything in the
  delay (video ring buffer and audio delay line), (2) cuts Program to the safe slate and mutes the
  guest, and (3) rebuilds the delay behind it: viewers see "We'll be right back" and silence for
  *delay* seconds ("DUMPED · Delay rebuilding… 6 s" on the On-air monitor), then the delayed Program
  — still the slate until you press Release. The dumped segment never airs and is not recorded.
- **Safe slate (S)** — the same instant cut and guest mute, but *without* discarding the buffer: what
  is already in the delay still airs. Use DUMP when something has just been said; Safe slate when you
  see trouble coming.
- Hotkeys work while the Live show tab is showing and focus is not in a text field. Screen readers
  hear "ON AIR", "OFF AIR", "DUMPED…" and reconnect announcements (aria-live).
- **Off** (no delay): DUMP only cuts to the slate — whatever was said has already aired.

How it works (`lib/podcast/live/broadcast-delay.ts`, `delay-ring.ts`, `audio-mix.ts`):

- Video: on each compositor tick the Program canvas becomes a `VideoFrame`, is encoded with WebCodecs
  (VP8 → VP9 → H.264, ~6 Mbps intermediate), and the compressed chunks wait in a ring buffer stamped
  with their capture time; after the delay they are decoded onto the Air canvas, whose
  `captureStream()` is what WHIP sends. Memory ≈ 0.75 MB per second of delay (≈ 25 MB at 30 s).
- Fallback without WebCodecs: `createImageBitmap` snapshots at reduced fps/size, chosen to stay under
  ~400 MB (7 s → 1280×720 @15 fps; 10 s → 960×540 @15 fps; 30 s → 640×360 @15 fps). An encoder
  error switches to the fallback *and* dumps, so nothing undelayed ever airs.
- Audio: a `DelayNode` after the limiter. DUMP swaps in a fresh `DelayNode`, whose buffer starts silent.
- A/V stay aligned: both use the same delay and are started/dumped at the same instant; frames are
  released at capture time + delay, within one 33 ms tick (`__tests__/delay-ring.test.ts`).
- Frames captured before a DUMP are rejected even if the encoder hands them back late.

## Face blur

`lib/podcast/vision/face-blur.ts` — MediaPipe Tasks Vision **Face Detector** (BlazeFace short-range,
Apache-2.0). The JS is the `@mediapipe/tasks-vision` npm package (loaded lazily); at runtime the WASM
comes from `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm` and the model from
`https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`.
**When you upgrade the npm package, update `MEDIAPIPE_VERSION` in that file** (JS and WASM must match).
If you add a Content-Security-Policy, allow those two hosts and `'wasm-unsafe-eval'`.

- Toggle per person under **Privacy**. **Guest blur is ON by default**; turn it off only if the guest
  agreed to show their face. (The guest consent step does not record a face-blur choice yet; when it
  does, use it as the default here.)
- Applied inside the compositor, before the delay — Live, On air and the local recording are all blurred.
- Faces are pixelated (≈8 blocks across) with 30% padding. If a face drops out, the last box is kept
  for 500 ms; after that, with no face found, the **whole picture** is pixelated (a missed detection
  must not reveal a face).
- **Fail-safe:** while the detector loads, if it stalls for more than 300 ms, or if it fails, that
  person is replaced by a silhouette card — never an unblurred face. The Privacy panel and the
  pre-flight show the detector state.
- Cost: detection runs ~15×/s on a 320 px copy per blurred person — a few ms each; budget roughly
  5–15% of one core per person on CPU, less with the GPU delegate. On weak machines blur only the guest.
- The same API (`createFaceBlurrer()` → `process(src, ctx, x, y, w, h)`) is meant for the recorded
  picture export later.

## Voice disguise (live)

Optional pitch shift on the guest's Program feed (`lib/podcast/live/voice-disguise.ts`, an
AudioWorklet delay-line shifter: −4, −7 or +4 semitones). Your headphones keep the natural voice. If
the worklet cannot start, the guest is held **out** of Program until you turn disguise off.

> Pitch shifting is not anonymity. A recording of a shifted voice can often be shifted back, and
> speech patterns, accent and word choice still identify people. If the guest must not be recognised,
> keep them off mic and have the host summarise, or use a re-voiced segment in the edited episode.

## Safety notes (survivor-centred)

- **DUMP is the kill switch** when a delay is set (default 10 s): the slip is thrown away before it
  airs. **Safe slate** is an instant cut (never a fade) to a branded "We'll be right back" slate and
  hard-mutes the guest in the Program mix inside the host's browser — it does not depend on the
  guest's connection or cooperation. Host mic stays live so you can speak to viewers; use
  **Host muted** if you also need silence. You still hear the guest in your headphones.
- Provider latency (HLS ~3–10 s, WHEP < 1 s) is **not** a safety buffer — only the broadcast delay
  is. With the delay Off, anything said before you press Safe slate has already gone out.
  Brief guests beforehand; agree a hand signal; keep a finger near **D**.
- Keep **guest face blur** on unless the guest explicitly agreed to show their face. It fails safe to
  a silhouette, but it is automated: still avoid identifying backgrounds.
- Guests never receive the provider URL or any viewer data. The guest link is the same hashed,
  expiring, revocable invite used for pre-records. Revoke it after the show.
- Do not show identifying details on camera (street signs, mail, school logos). Consider a
  virtual background on the guest side or audio-only (Guest camera off → Program shows a calm
  placeholder).
- The public page carries the National Human Trafficking Hotline. Keep the description free of
  details that could locate a survivor.
- A crash in the host tab leaves the session `live`; viewers see "reconnecting" after 3 minutes
  without a heartbeat. Use **Mark ended** in the Shows list to clear it.

## Costs (rough, check current pricing)

- **Cloudflare Stream:** billed per 1,000 minutes delivered (≈ $1) and stored (≈ $5/month). Ingest is
  free. A 60-minute show watched by 100 people ≈ 6,000 delivered minutes ≈ $6.
- **MediaMTX on a VPS:** $5–20/month flat, plus bandwidth. ~2.5 Mbps per viewer at 720p — 100
  viewers ≈ 250 Mbps; put a CDN in front of HLS for bigger audiences.
- **Netlify:** only the tiny WHIP signaling requests and the cached `/api/podcast/live` poll.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Not configured — set LIVE_WHIP_URL" | Set the env var on Netlify and redeploy. |
| Go live → `Live provider answered 401/403` | Wrong WHIP URL or bearer; Cloudflare URL must be the *publish* URL. |
| `Live provider answered 409` (or similar conflict) | Another publisher may be on the same input (another tab, OBS). Stop it. |
| Ingest `connected` but viewers see "Connecting…" | HLS takes 5–15 s to appear; Cloudflare WHIP may need the WHEP URL instead of HLS. |
| Ingest keeps `reconnecting` | Corporate/hotel Wi-Fi blocking UDP. Try a phone hotspot or wired. Ingest uses the same ICE list as the guest booth (`TURN_*` env), so setting TURN helps here too. |
| Frame rate drops when switching tabs | Switching *console* tabs is fine (the Live tab stays mounted). Keep the *browser* tab in the foreground; browsers throttle background tabs. |
| On-air monitor says "frame buffer" | WebCodecs unavailable or the encoder failed; the fallback uses more memory and lower fps. Use current Chrome/Edge. |
| Guest shows as a silhouette | Face blur is loading, stalled or failed (see Privacy). Check jsdelivr.net and storage.googleapis.com are reachable, or turn blur off if the guest agreed. |
| Guest missing from Program with disguise on | Voice disguise failed to start (AudioWorklet); the guest is held out on purpose. Turn disguise off. |
| Pre-flight "Live provider reachable" blocked | The server could not reach the WHIP host at all (DNS, firewall, typo in LIVE_WHIP_URL). |
| Guest camera shows "camera off" | Guest camera disabled or P2P failed — see the Guest panel (TURN env for strict networks). |
| `podcast_live_sessions is missing` | Apply the migration. |
| Save draft fails with storage error | Create the `media` storage bucket (same as episode audio uploads). |

## Files

- `lib/podcast/live/` — `types.ts`, `server.ts` (env + sealed resource tokens), `admin.ts` (auth guard),
  `whip-client.ts`, `whep-client.ts`, `compositor.ts`, `audio-mix.ts`, `recorder.ts`, `client.ts`,
  `broadcast-delay.ts` + `delay-ring.ts` (delay/DUMP), `preflight.ts`, `voice-disguise.ts`,
  `__tests__/` (`npx vitest run`)
- `lib/podcast/vision/face-blur.ts`
- `app/api/admin/podcast/live/route.ts` (list/create), `[id]/route.ts` (edit, start/end/heartbeat, delete),
  `whip/route.ts` (WHIP proxy; `GET ?probe=1` reachability), `speedtest/route.ts` (pre-flight upload test)
- `app/api/podcast/live/route.ts` (public, `s-maxage=5`)
- `app/podcast/live/page.tsx`, `components/podcast/live-player.tsx`, `live-banner.tsx`, `live-control-room.tsx`
- Third-party: `hls.js` (Apache-2.0), `@mediapipe/tasks-vision` + the BlazeFace model (Apache-2.0).
  The WHIP/WHEP clients (RFC 9725), the delay and the pitch shifter are written in-house.
