# Podcast LIVE show mode

Run a live show from the browser. There is no server-side encoder (Netlify has no
long-running process and no ffmpeg), so the host's browser does all the work:

```
host cam ─┐                                   ┌─ WHIP (RFC 9725) ─► provider ─► HLS / WHEP ─► /podcast/live
guest cam ┼─► canvas Program (1280×720 @30) ──┤   via /api/admin/podcast/live/whip (secret stays server-side)
slates  ──┘            + mixed audio          └─ MediaRecorder (local) ─► "Save as episode draft"
host mic ─┐
guest mic ┼─► WebAudio mix → limiter → MediaStreamDestination
SFX     ──┘
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
4. Pick a **Countdown** (e.g. 30 s) and press **Go live**. Viewers see the "Starting soon" slate
   with the countdown, then Program cuts to your last camera scene (PIP by default).
5. Switch **Host / Guest / PIP** (short dissolve). **Title lower third** toggles the name strap.
6. **SAFE SLATE** (see Safety) at any time. **Release** returns to the last camera scene.
7. **End show** → 3 s "Thanks for watching" slate → stream stops → session marked `ended`.
8. **Save as episode draft** uploads the Program audio (WebM/Opus) via `uploadPodcastMedia` and
   attaches it to the linked episode (or creates a new draft). Edit, add notes and publish through the
   normal pre-record pipeline. **Program video** is download-only — save it before closing the tab.

Stream health (bitrate, packet loss, RTT, fps, reconnects) updates every 2 s. If ingest drops,
the publisher retries with backoff (1, 2, 4, 8, 15, 30 s…) until you press End.

## Safety notes (survivor-centred)

- **Safe slate is the kill switch.** It is an instant cut (never a fade) to a branded
  "We'll be right back" slate and hard-mutes the guest in the Program mix inside the host's
  browser — it does not depend on the guest's connection or cooperation. Host mic stays live so
  you can speak to viewers; use **Host muted** if you also need silence.
- The **delay is not zero but it is not a safety buffer either**: HLS viewers are ~3–10 s behind,
  WHEP viewers < 1 s. Anything said before you press Safe slate has already gone out.
  Brief guests beforehand; agree a hand signal; keep the button in reach.
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
| Frame rate drops when switching tabs | Keep the control room tab visible; browsers throttle background tabs. |
| Guest camera shows "camera off" | Guest camera disabled or P2P failed — see the Guest panel (TURN env for strict networks). |
| `podcast_live_sessions is missing` | Apply the migration. |
| Save draft fails with storage error | Create the `media` storage bucket (same as episode audio uploads). |

## Files

- `lib/podcast/live/` — `types.ts`, `server.ts` (env + sealed resource tokens), `admin.ts` (auth guard),
  `whip-client.ts`, `whep-client.ts`, `compositor.ts`, `audio-mix.ts`, `recorder.ts`, `client.ts`
- `app/api/admin/podcast/live/route.ts` (list/create), `[id]/route.ts` (edit, start/end/heartbeat, delete),
  `whip/route.ts` (WHIP proxy)
- `app/api/podcast/live/route.ts` (public, `s-maxage=5`)
- `app/podcast/live/page.tsx`, `components/podcast/live-player.tsx`, `live-banner.tsx`, `live-control-room.tsx`
- Third-party: `hls.js` (Apache-2.0). WHIP/WHEP clients are written in-house following RFC 9725.
