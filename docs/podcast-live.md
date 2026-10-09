# Podcast LIVE show mode

Run a live show from the browser. There is no server-side encoder (Netlify has no
long-running process and no ffmpeg), so the host's browser does all the work:

```
host cam ─┐ [face blur]                                           ┌─ WHIP (RFC 9725) ─► provider ─► HLS / WHEP ─► /podcast/live
guest cam ┼─► canvas Program ─► BROADCAST DELAY (0–30 s) ─► Air ─┤   via /api/admin/podcast/live/whip (secret stays server-side)
slates  ──┘  "Live in the room"  video ring buffer  "What viewers └─ MediaRecorder → IndexedDB chunks ─► "Save as episode draft"
host mic ─┐                      audio DelayNode     see now"
guest mic ┼─► [voice disguise] ─► WebAudio mix → limiter ─┘
SFX     ──┘
               DUMP (D / Esc Esc) = throw the buffer away → safe slate + silence until RESUME → delay refills
```

- **Admin:** Podcast Console → **Live show** tab (`components/podcast/live-control-room.tsx`). The room is
  built on the studio-ui kit (`components/studio-ui`) so it reads like the rest of the GarageBand-style
  production room: the transport strip carries the same **RecordButton** (armed = ready to go live,
  recording = on air → press again to end), scenes are a **SegmentedControl**, levels are **Meters**,
  states are **Chips**, confirmations are **Toasts**. Think "Record, but broadcasting".
- **Public:** `/podcast/live` (`components/podcast/live-player.tsx`), plus a "Live now" /
  "Next live show" banner on `/podcast` (`components/podcast/live-banner.tsx`).
- **Guest:** the existing private guest link (same booth page as pre-recorded episodes).
  Their P2P camera + mic feed Program in the host tab. Guest never talks to the provider.

## 1. Apply the migration

Run `supabase/migrations/20260923000001_podcast_live.sql` in the Supabase SQL editor (or `supabase db push`),
then `20260925000003_podcast_live_chat_simulcast.sql` for chat and simulcast (see those sections).
The first creates `podcast_live_sessions`:

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
4. Choose the **Broadcast delay** (default 10 s; Off, 5, 10, 15, 20, 30 s — anything 0–30 s is valid). It is
   locked once on air.
   Check **Privacy**: guest face blur (on by default), host face blur, guest voice disguise.
5. Pick a **Countdown** (e.g. 30 s) and press **Go live…**. If the button is disabled, the reasons are
   listed right under it in plain language (no show selected / camera + mic not opened / mic or camera track
   dead / streaming service not set up) and the list is tied to the button with `aria-describedby`.
   "Guest not connected" is only a warning.
6. The **pre-flight checklist** runs: provider reachable (server-side OPTIONS to the WHIP host),
   outgoing bitrate (≈1.5 MB upload to `/api/admin/podcast/live/speedtest`), delay chosen, guest/host
   face blur state, safe slate ready, guest connected, voice disguise. Anything **Blocked** must be
   fixed; warnings are yours to judge. Press **Go live now**.
7. For the first *delay* seconds viewers see "Starting soon" while the buffer fills, then the delayed
   Program (countdown slate, then your last camera scene).
8. Switch **Host / Guest / PIP** (short dissolve). **Title lower third** toggles the name strap.
9. **DUMP (D or Esc Esc)** or **SAFE SLATE (S)** at any time (see below). After a DUMP press **Resume
   broadcast** to refill the delay; **Release safe slate** returns Program to the last camera scene — with a
   delay, viewers see the release *delay* seconds later.
10. **End show** → "Thanks for watching" slate → the stream keeps running for *delay* + 3 s so the
    tail airs → stream stops → session marked `ended`.
11. **Save as episode draft** uploads the Program audio (WebM/Opus) via `uploadPodcastMedia` and
   attaches it to the linked episode (or creates a new draft). Edit, add notes and publish through the
   normal pre-record pipeline. **Program video** is download-only.

The draft and the local video are recorded from the **air** feed (after the delay), so anything you
dumped is not in the draft either. The page keeps warning before you close it (`beforeunload`) while on
air and afterwards until "Save as episode draft" has completed.

**Local recording (`lib/podcast/live/recorder.ts`).** MediaRecorder hands over a chunk every second and
each chunk is written straight to IndexedDB (`ff-live-recorder`), not held in RAM — an hour of 2.5 Mbps
video (~1.1 GB) sits on disk. If IndexedDB is unavailable or full (private windows, quota) the chunks fall
back to memory and the After-the-show panel says so. A show that ends with a crashed or closed tab is
listed under **Recordings kept in this browser** the next time the Live tab opens (Audio / Video download,
Delete); the newest two recordings are kept, **Discard recording** removes the current one.

Stream health (bitrate, packet loss, RTT, fps, reconnects) updates every 2 s. If ingest drops,
the publisher retries with backoff (1, 2, 4, 8, 15, 30 s…) until you press End, and a large amber
"Stream reconnecting…" banner shows in the control room. Viewers get a "Reconnecting…" slate when
their picture stops advancing for 4 s, the player has to reconnect, or the heartbeat goes stale; it
clears on its own.

## Broadcast delay and DUMP

The key safety feature. What you switch (the **Live in the room** monitor, badge "No delay") reaches
viewers *delay* seconds later (the **What viewers see now** monitor, badge "10 s behind" / "Refilling" /
"DUMPED"), so a slip can be removed before it airs.

- **DUMP** — the big red button, the **D** key, or **Esc twice within 600 ms** (Esc never types, so it
  also works while the cursor is in a text field). No confirmation. It (1) discards everything in the
  delay (video ring buffer and audio delay line), (2) parks viewers on the "We'll be right back" slate
  with **silence** — the air gate stays closed however long you take — and (3) cuts Program to the safe
  slate and mutes the guest. The dumped segment never airs and is not recorded. The Dump button becomes
  **Resume broadcast**: on Resume the delay refills for *delay* seconds ("Resumed · delay refilling… 6 s"),
  audio and video restarting from the same instant, and then the delayed Program airs — still the safe
  slate until you press **Release**.
- **Safe slate (S)** — the same instant cut and guest mute, but *without* discarding the buffer: what
  is already in the delay still airs. Use DUMP when something has just been said; Safe slate when you
  see trouble coming.
- Letter hotkeys work while the Live show tab is showing and focus is not in a text field, select or
  contenteditable/ARIA textbox (`lib/podcast/live/hotkeys.ts`, unit-tested); modifier combinations are
  left to the browser. Screen readers hear "ON AIR", "OFF AIR", "DUMPED…", "Resumed…", saved/failed and
  reconnect announcements (assertive aria-live region).
- **Off** (no delay): DUMP still cuts viewers to the slate and silence until Resume — but whatever was
  said before the press has already aired.

How it works (`lib/podcast/live/broadcast-delay.ts`, `delay-ring.ts`, `audio-mix.ts`):

- Video: on each compositor tick the Program canvas becomes a `VideoFrame`, is encoded with WebCodecs
  (VP8 → VP9 → H.264, ~6 Mbps intermediate), and the compressed chunks wait in a ring buffer stamped
  with their capture time; after the delay they are decoded onto the Air canvas, whose
  `captureStream()` is what WHIP sends. Memory ≈ 0.75 MB per second of delay (≈ 25 MB at 30 s).
- Fallback without WebCodecs: `createImageBitmap` snapshots at reduced fps/size, chosen to stay under
  ~400 MB (5–7 s → 1280×720 @15 fps; 10 s → 960×540 @15 fps; 30 s → 640×360 @15 fps). An encoder
  error switches to the fallback *and* restarts the delay behind the hold slate, so nothing undelayed
  ever airs.
- Audio: a `DelayNode` after the limiter, then an air **gate** (`GainNode`). DUMP closes the gate and swaps
  in a fresh `DelayNode`; Resume swaps again (its buffer starts silent for exactly *delay* seconds) and
  opens the gate — so the silence ends when the refilled video does.
- A/V stay aligned: both use the same delay and are started/dumped/resumed at the same instant; frames
  are released at capture time + delay, within one 33 ms tick (`__tests__/delay-ring.test.ts`).
- Frames captured before a DUMP are rejected even if the encoder hands them back late; while dumped the
  engine captures nothing at all, and Resume restarts the ring's anchor at the resume moment.

## Face blur

`lib/podcast/vision/face-blur.ts` — MediaPipe Tasks Vision **Face Detector** (BlazeFace short-range,
Apache-2.0). The JS is the `@mediapipe/tasks-vision` npm package (`package.json`, loaded lazily with a
dynamic `import()` so it is a separate client chunk); at runtime the WASM runtime comes from
`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm` (`MEDIAPIPE_WASM_BASE`) and the model from
`https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`
(`FACE_DETECTOR_MODEL_URL`).
**When you upgrade the npm package, update `MEDIAPIPE_VERSION` in that file** (JS and WASM must match).

*Netlify:* nothing to configure. The two runtime files are absolute `https://` URLs fetched by the host's
browser, so they resolve the same on `*.netlify.app`, a custom domain and deploy previews; Netlify serves
only the Next.js JS chunk. The site sets no Content-Security-Policy today (`next.config.ts` adds
X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy). If you add one, allow
`script-src https://cdn.jsdelivr.net 'wasm-unsafe-eval'` and
`connect-src https://cdn.jsdelivr.net https://storage.googleapis.com` — the WASM loader fetches a `.js`
glue file and a `.wasm` from jsdelivr and the `.tflite` model from Google Storage. No COOP/COEP
cross-origin isolation is needed (the SIMD build is used, not the multi-threaded one). If either host is
unreachable the detector never reaches `ok` and the person stays a silhouette card (fail closed; see
Troubleshooting).

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

## Live chat / Q&A (sprint 2)

Viewers on `/podcast/live` can chat and ask questions once the host turns chat on. It is **off by
default for every show** — the *Chat & Q&A* card in the control room has the switch.

Apply `supabase/migrations/20260925000003_podcast_live_chat_simulcast.sql` first (it adds chat
settings to `podcast_live_sessions`, creates `podcast_live_messages`, `podcast_live_bans` and
`podcast_live_destinations`, and adds the messages table to the `supabase_realtime` publication).

### How it flows

```
viewer types ─► POST /api/podcast/live/chat ─► session live? chat on? mode ok?
                                             ─► display-name + body filter (moderation.ts)
                                             ─► ban check ─► rate limit (Postgres fixed window)
                                             ─► INSERT podcast_live_messages (service role)
Supabase Realtime: INSERT → every viewer (RLS: visible rows of live shows only)
host hides / pins / changes settings ─► PATCH /api/admin/podcast/live/<id>/chat ─► broadcast `moderation`
viewers also re-fetch GET /api/podcast/live/chat every 15 s in case the socket dropped.
```

- **Identity.** Each browser makes a random id (`localStorage` `ff-live-viewer`) and sends it in the
  `x-live-viewer` header. The server stores only `sha256(LIVE_CHAT_SALT + id)` (32 hex chars). No IPs
  are stored; the per-network limit uses a hashed IP bucket in `api_rate_limits` that expires in a day.
  The host sees the first 8 chars as a *viewer tag* (`#3fa9c1d2`) to spot one person across messages.
- **Rate limits.** 1 message per 5 s per viewer (`chatRateRule`), raised to the slow-mode window
  (10/30/60/120 s) when slow mode is on; 20 messages per minute per network. The per-network limiter
  (`lib/podcast/live/rate-limit.ts`) calls the Postgres function `api_rate_limit_hit(bucket, window, max)`
  when it exists and **fails open** (logs once) when it does not — the per-viewer slow mode and bans in
  `chat-server.ts` still apply. Add that function (a fixed-window counter table + RPC) if you want the
  network cap enforced.
- **Retention.** `podcast_live_chat_purge()` deletes messages and bans older than 30 days (pg_cron
  daily at 03:23 when the extension is enabled; otherwise run it by hand). Deleting a show deletes
  its messages.
- **RLS.** anon/authenticated may `SELECT` only `id, session_id, display_name, body, kind, hidden,
  created_at` of rows where `hidden = false` **and** the session is `live`. There is no INSERT/UPDATE
  policy — writes are service-role only through the routes. Bans and destinations have no public
  access at all.

### What is blocked before it is stored (`lib/podcast/live/moderation.ts`)

The audience may include someone looking for a survivor, and a guest may be one. So the filter
is deliberately strict on anything that could identify or locate a person:

| Check | Examples caught | Deliberately allowed |
| --- | --- | --- |
| Phone numbers | `(614) 555-0100`, `614.555.0100`, `+1 614…`, `six one four five five five…` | dates (`2026-09-23`, `9/23/2026`), years, the NHTH number `1-888-373-7888` / text `233733` |
| Emails | `jane@example.com`, `jane (at) example (dot) com` | `thanks @ everyone` |
| Links | `https://…`, `www.…`, `bit.ly/x`, bare domains (`example.com`) | `e.g.`, `wait... com on` |
| Street addresses | `123 Main Street`, `4521 N High St`, `PO Box 991`, `apt 4B`, `OH 43215`, `Broad St and High St` | `300 miles`, `top 10`, a bare 5-digit number |
| Identity leaks | `her real name is…`, `the guest's name is Jane Smith`, `I know where she lives`, `she works at…`, `this is actually Jane Smith`, `license plate`, `SSN`, `dox` | `my name is Jane` (first name only), `she lives her truth` |
| Social handles | `@jane_doe`, `my insta is…` | a lone `@` |
| Profanity / slurs | word-boundary list incl. leet (`sh1t`) and spaced (`f u c k`) variants; extend with `CHAT_EXTRA_BLOCKLIST=word,word` | Scunthorpe, assessment, shiitake |

Display names get the same filters plus: 2–24 characters, letters/digits/space/`'-._` only, and not
`Host`, `Moderator`, `Admin`, `Forged in the Fire`, etc. Blocked messages return **422** with a
plain-language reason and are **not** stored anywhere.

Two things are **flagged, not blocked**, so the host can respond with care: self-harm language
(`suicidal`, `want to die`…, reason "mentions self-harm — consider replying with the hotline") and
shouting (12+ letters all caps). Flagged messages show an amber border and a *flagged* filter in the
panel.

The filter is regex-based and English-only: it will miss creative spellings and it will sometimes
block harmless text (a message with a long number in it, a sentence like "he works at the mall").
That trade-off is intentional. When in doubt it is better that a viewer rewrites a line than that a
survivor's street shows up on a public page. Unit tests: `tests/unit/live-chat/moderation.test.ts`.

### Moderating during a show (Chat & Q&A card)

- **Chat on** — opens the widget for viewers (only while the show is `live`). Turn it off at any
  time; viewers' widgets disappear on the next event.
- **Questions only** — viewers can only send *questions*; the widget switches its prompt.
- **Slow mode** — 1 message per 10/30/60/120 s per viewer (the send button counts down).
- **Pin on screen** — the message becomes a lower third on Program ("QUESTION · Jane / …") on camera
  scenes only (never on slates; the compositor skips overlays there) and is shown at the top of the
  viewer widget. It goes through the broadcast delay like everything else. *Unpin* removes it. Hiding
  or banning the pinned message unpins it.
- **Hide / Unhide** — hidden messages leave every viewer's screen immediately (broadcast) and stay
  visible to you under the *hidden* filter.
- **Ban** — bans that browser for this show **and hides everything it posted** (a doxxing attempt is
  rarely one line). Their next send gets a 403. Bans are per show; *Unban* is in the collapsible list.
- Filters: all / questions / flagged / hidden. The panel polls every 3 s; it does not need Realtime.

Suggested routine: keep chat **off** until the guest has settled in; switch to **Questions only** when
a survivor is speaking; if anything identifying slips through, **Ban** (it hides all of theirs) then
**DUMP** if it was read on air. Keep the National Human Trafficking Hotline reply handy for flagged
messages.

### Privacy notes

- Chat is anonymous by design: no accounts, no emails, no IPs at rest. Display names are free text and
  should not be treated as identities.
- Messages are public while the show is live and readable by anyone who has the session id until purged
  (30 days). Do not read viewer tags or hashes out on air.
- Realtime uses the public anon key from the viewer's browser, as the rest of the site does. RLS is the
  boundary; the anon key can never insert.
- `LIVE_CHAT_SALT` (optional) salts the viewer hash. Changing it "forgets" every ban.
- Broadcasts use Supabase's HTTP broadcast endpoint from the server (`channel.httpSend`), so they work
  from Netlify Functions without a websocket.

## Simulcast (YouTube Live, Facebook Live, custom RTMP(S)/WHIP)

The host's browser publishes **one** WebRTC stream (WHIP) to the provider; fan-out to other platforms
happens **provider-side**, so it costs the host nothing extra in upload. Destinations live in the
*Simulcast* card: name, type, ingest URL, stream key. The key is sent once to the server, stored
encrypted (AES-256-GCM, key derived from `LIVE_DESTINATION_SECRET`, falling back to the service-role
key) and only ever shown **masked** (`rtmps://a.rtmps.youtube.com:443/live2 · key ••••5678`).

### Cloudflare Stream (automatic)

Cloudflare's *Live Outputs* restream a live input to RTMP(S)/SRT targets. When you press **Go live now**
the server creates one output per enabled destination
(`POST /accounts/{account}/stream/live_inputs/{input}/outputs`), polls their state every 10 s while on
air, and deletes them on **End show** so the next show starts clean.

Environment (Netlify → Environment variables):

| variable | value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Stream → the account id in the URL / right rail |
| `CLOUDFLARE_STREAM_API_TOKEN` | My Profile → API Tokens → Create → *Stream: Edit* on this account (nothing else) |
| `LIVE_CF_INPUT_ID` | the live input uid (32 hex). Optional: it is read from `LIVE_PLAYBACK_WHEP_URL` / `LIVE_PLAYBACK_HLS_URL` (`…cloudflarestream.com/<uid>/…`) when those are set |
| `LIVE_DESTINATION_SECRET` | any long random string; rotate = re-enter every destination |

> Cloudflare has documented WebRTC (WHIP) ingest as beta and, historically, Live Outputs, HLS and
> recording applied to RTMPS/SRT ingest. Test a restream before the first real show: add a YouTube
> destination, go live, and check the card says **live** within ~30 s. If it stays *connecting* and then
> **FAILED — never connected**, either the key is wrong or the input does not support outputs for
> WebRTC ingest yet; in that case use MediaMTX (below) as the WHIP endpoint.

States shown on the card (`mapCloudflareOutputState`): **connecting** (created, platform has not
accepted yet — up to 45 s grace), **live** (frames flowing), **FAILED** (platform refused / dropped;
the reason is shown), **off** (disabled), **manual** (provider cannot be controlled from here).

**YouTube Live.** YouTube Studio → *Go live* → *Stream* → copy the **Stream key**. Leave the URL as
`rtmps://a.rtmps.youtube.com:443/live2`. Set the stream to *Public* / *Unlisted* and, for a survivor
guest, turn **off** YouTube's DVR/"make it available on demand" if you do not want a replay to exist
beyond your control. YouTube adds its own 10–30 s latency on top of the broadcast delay.

**Facebook Live.** Live Producer → *Streaming software* → copy the **Stream key** (persistent key
under *Advanced settings* if you want to reuse it). URL `rtmps://live-api-s.facebook.com:443/rtmp/`.
Facebook keys expire; check the card says **live** every time.

**Custom.** Any RTMP(S) URL (Twitch `rtmps://…twitch.tv/app`, Kick, a relay) plus its key, or a WHIP
URL (`https://…/whip`, the key in the URL or as the "stream key" bearer).

### MediaMTX / LiveKit (manual)

The card marks destinations **manual** for these providers; configure the push on the server:

```yaml
# mediamtx.yml — push the "show" path to YouTube and Facebook
paths:
  show:
    runOnReady: >
      ffmpeg -i rtsp://localhost:8554/show -c copy -f flv
        rtmps://a.rtmps.youtube.com:443/live2/<yt-key>
    runOnReadyRestart: yes
```

(one `ffmpeg … -c copy -f tee "[f=flv]rtmps://yt…|[f=flv]rtmps://fb…"` for several targets).
LiveKit Cloud: create an **Egress → Stream** (RTMP output) on the room/ingress when the show starts.

### Fail-closed rules

- A destination that fails to create, decrypt or connect is marked **FAILED** with the reason; the
  main WHIP stream and the other destinations are untouched. The host sees an amber, dismissible
  banner ("Simulcast: YouTube failed (…). The main stream continues.") — never a modal, never a stop.
- Simulcast start runs *after* the session is marked live and does not block **Go live**.
- Stream keys never reach the browser after they are saved (masked only), are never logged, and are
  deleted with the destination. Removing a destination is disabled while on air.
- DUMP / safe slate apply to every platform, because they happen before the single upstream.

### Env summary

| variable | purpose |
| --- | --- |
| `LIVE_CHAT_SALT` | optional salt for viewer hashes (bans are keyed on it) |
| `CHAT_EXTRA_BLOCKLIST` | optional comma-separated extra words to block |
| `LIVE_DESTINATION_SECRET` | encryption key material for stored stream keys (recommended) |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`, `LIVE_CF_INPUT_ID` | Cloudflare Live Outputs (automatic simulcast) |

## Browser support (host side)

The control room needs a current desktop **Chrome or Edge**: WebCodecs for the compact delay ring
(Firefox and Safari fall back to the ImageBitmap ring — same delay, more memory, ≤15 fps), `canvas.captureStream`,
AudioWorklet (voice disguise), MediaRecorder (WebM/Opus; Safari records MP4), IndexedDB (recording chunks;
memory fallback in private windows) and WebAssembly SIMD for the face detector (Safari ≥ 16.4). Viewers only
need HLS (hls.js or native Safari) or WHEP (any modern browser).

## Costs (rough, check current pricing)

- **Cloudflare Stream:** billed per 1,000 minutes delivered (≈ $1) and stored (≈ $5/month). Ingest is
  free. A 60-minute show watched by 100 people ≈ 6,000 delivered minutes ≈ $6.
- **MediaMTX on a VPS:** $5–20/month flat, plus bandwidth. ~2.5 Mbps per viewer at 720p — 100
  viewers ≈ 250 Mbps; put a CDN in front of HLS for bigger audiences.
- **Netlify:** only the tiny WHIP signaling requests and the cached `/api/podcast/live` poll.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Not set up yet — an admin needs to add the streaming settings" | Set `LIVE_WHIP_URL` (+ playback vars) on Netlify and redeploy. The exact variable names are under **Advanced** in the Live provider card. |
| Viewers stuck on the slate with no sound | You are DUMPED (red badge). Press **Resume broadcast**; then **Release safe slate** for cameras. |
| "This browser could not store it on disk" after the show | IndexedDB unavailable/full (private window, quota). Download the video before closing the tab. |
| Show ended by a crash — where is the recording? | Reopen the Live tab: **Recordings kept in this browser** lists it (same browser profile only). |
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
| `Live chat tables are missing` / chat card errors | Apply `20260925000003_podcast_live_chat_simulcast.sql`. |
| Viewers do not see new messages until the 15 s re-sync | Realtime not enabled for the table: the migration adds it to `supabase_realtime`; check Database → Publications. |
| Host hides a message but it stays on viewers' screens | Broadcast failed (check function logs `[live-chat] broadcast failed`); viewers re-sync within 15 s anyway. |
| Simulcast card: "Cloudflare restreaming is not set up" | Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`, and `LIVE_CF_INPUT_ID` if the playback URL does not contain the input uid. |
| Destination stuck on *connecting* then FAILED | Wrong/expired key, the platform event is not set to "streaming software", or the Cloudflare input does not support outputs for WebRTC ingest (use MediaMTX). |
| Destination shows "cannot decrypt" | `LIVE_DESTINATION_SECRET` changed. Remove and re-add the destination. |
| Save draft fails with storage error | Create the `media` storage bucket (same as episode audio uploads). |

## Files

- `lib/podcast/live/` — `types.ts`, `server.ts` (env + sealed resource tokens), `admin.ts` (auth guard),
  `whip-client.ts`, `whep-client.ts`, `compositor.ts`, `audio-mix.ts` (mix, air delay + air gate),
  `recorder.ts` (IndexedDB-chunked local recording + recovery), `client.ts`, `broadcast-delay.ts` +
  `delay-ring.ts` (delay / DUMP / Resume), `preflight.ts` (go-live reasons, checklist, unload guard),
  `hotkeys.ts` (D / S / Esc Esc), `voice-disguise.ts`, `__tests__/` (`npx vitest run`)
- `lib/podcast/vision/face-blur.ts`
- `app/api/admin/podcast/live/route.ts` (list/create), `[id]/route.ts` (edit, start/end/heartbeat, delete),
  `whip/route.ts` (WHIP proxy; `GET ?probe=1` reachability), `speedtest/route.ts` (pre-flight upload test)
- `app/api/podcast/live/route.ts` (public, `s-maxage=5`), `chat/route.ts` (public chat GET/POST)
- Chat: `lib/podcast/live/chat.ts` (types, viewer id, fetch helpers, event reducer), `chat-server.ts` (hashing,
  broadcast), `moderation.ts` (filter, rate rule), `chat-overlay.ts` (pinned lower third),
  `app/api/admin/podcast/live/[id]/chat/route.ts`, `components/podcast/live-chat.tsx` (viewer widget + host panel)
- Simulcast: `lib/podcast/live/simulcast.ts` (presets, masking, state mapping), `simulcast-server.ts` (encryption,
  Cloudflare Live Outputs), `simulcast-client.ts`, `app/api/admin/podcast/live/destinations/**`,
  `[id]/simulcast/route.ts`, `components/podcast/live-simulcast-card.tsx`
- Server helpers the live routes use: `lib/supabase/service.ts` (cookie-less service-role client for the
  chat/destination tables, which RLS hides from `authenticated`), `lib/security/rate-limit.ts` (see Chat),
  `lib/podcast/live/transport.ts` (pure transport-strip state → label helpers).
- Tests: `tests/unit/live/` (transport strip), `tests/unit/live-chat/` (moderation, rate-limit math, masking,
  output state mapping, event reducer), `lib/podcast/live/__tests__/` (delay ring, hotkeys, safety logic)
- `app/podcast/live/page.tsx`, `components/podcast/live-player.tsx`, `live-banner.tsx`, `live-control-room.tsx`
- Third-party: `hls.js` (Apache-2.0), `@mediapipe/tasks-vision` + the BlazeFace model (Apache-2.0).
  The WHIP/WHEP clients (RFC 9725), the delay and the pitch shifter are written in-house.
