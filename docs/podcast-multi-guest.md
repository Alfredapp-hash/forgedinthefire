# Podcast panel shows: 3+ remote guests

One remote guest costs nothing: the host tab and the guest booth talk directly
(peer-to-peer WebRTC, `lib/podcast/webrtc.ts`). That path is unchanged.

From the **second** live invite on an episode the studio switches — automatically —
to a **room** on an SFU (Selective Forwarding Unit). Every guest sends one copy of
their mic/camera to the room; the host tab subscribes to all of them; guests hear
each other. Today the provider is **LiveKit** (Cloud or self-hosted).

```
                       ┌──────── LiveKit room  fitf-ep-<episode> ────────┐
guest 1 booth ── mic/cam ─►│                                                 │◄── host tab: subscribes to every guest
guest 2 booth ── mic/cam ─►│   each participant publishes once,               │    one MediaStream per guest →
guest 3 booth ── mic/cam ─►│   the SFU forwards to everyone else               │    • editor: one recording lane each
                           │                                                 │    • live: Host / Guest / PIP / Grid
host talkback + cue  ─────►│  named audio tracks "talkback" and "cue"          │    • control (tally/mute/cue/pause)
                           └─────────────────────────────────────────────────┘      over the room data channel
```

The guest booth keeps everything it already had: consent v2, "I need a pause",
Leave, withdrawal, and the **local chunked backup** that uploads every 10 s to the
private bucket (same `/api/studio/guest/[token]/take/chunks` path; nothing about
uploads changed).

## Setup

### 1. Apply the migration

`supabase/migrations/20260925000001_podcast_rooms.sql` adds `podcast_rooms`
(`episode_id`, `provider`, `room_name`, `created_at`, `ended_at`) and a nullable
`podcast_guest_invites.room_id`. Service role writes; admins may read (RLS via
`is_admin()`); anon has nothing.

### 2. Get a LiveKit project

**LiveKit Cloud (easiest):** create a project at cloud.livekit.io. Copy the
project's WebSocket URL (`wss://<project>.livekit.cloud`) and generate an API key +
secret under *Settings → Keys*.

**Self-hosted:** run the `livekit/livekit-server` container (needs UDP 50000–60000
or a TURN/TCP fallback and a TLS-terminated `wss://` in front). Put the key/secret
in its `keys:` config. The app only needs the signalling URL and one key pair.

### 3. Environment (server-side only — never `NEXT_PUBLIC_`)

```
LIVEKIT_URL=wss://<project>.livekit.cloud
LIVEKIT_API_KEY=API…
LIVEKIT_API_SECRET=…
```

Set them on Netlify → Environment variables and redeploy. Nothing else to configure:
rooms are created on demand and tokens are minted per join.

If any of the three is missing or malformed the studio does **not** silently fall
back: the invite panel shows *"Panels with 2+ guests need the room service
configured…"* and *Add another guest* is disabled. One guest still works P2P.

## How it behaves

| Step | What happens |
| --- | --- |
| Host creates the first link | P2P, exactly as before (`room_id` NULL). |
| Host presses **Add another guest** | `POST /api/admin/podcast/invites { add: true }` checks capacity, creates the room (DB row, then `RoomService.CreateRoom`), moves the existing live invite into it and mints the new link. |
| Guest 1 was already in the booth | Their next poll sees `session.room`; the booth fetches a fresh token (`action: 'room'`) and swaps transport without touching mic, consent or a running backup. |
| Guest joins | `POST …/[token] { action: 'join' }` returns `roomToken` (identity `guest:<inviteId>`, expires with the invite, mic + camera only). |
| Host tab | `POST /api/admin/podcast/rooms` mints the `host` token; `GuestRoomPanel` subscribes to all guests. |
| Revoke | Ends the guest's link; when no live invite points at the room, the row gets `ended_at` and the provider room is deleted. |
| New (replacing) link | Revokes every live link, ends the room, and the new link is P2P again. |

**Editor (Production room):** guest 1 keeps the existing *Guest* lane; guests 2..n
appear as extra voice people (three take slots each) recorded from their own room
stream — one `MediaStreamTrack` per guest into the existing per-lane capture. Their
uploaded backups are listed under each invite in *Guest backups*.

**Live show:** every guest is a compositor source. Scenes: Host / Guest / PIP /
**Grid** (host + up to 3 guests: 2 side by side, 3 with the lone tile centred, 2×2
for 4). Guest audio is folded into one Program guest bus, so Safe slate, the guest
fader and voice disguise apply to all guests at once. Face blur for "guest" blurs
every guest tile.

**Controls** (`lib/podcast/guest-signal-schema.ts`, unchanged schema) travel on the
room data channel per guest (`destinationIdentities`), and safety/recording-critical
kinds (`record`, `mute`, `camera`, `pause`, `hangup`) are also written to the
signal table as before. Talkback and Cue are published once as named tracks and
reach every guest.

## Cost notes

- **P2P (1 guest):** free. Optional TURN as documented in `.env.local.example`.
- **LiveKit Cloud free tier:** currently includes a monthly allowance of
  participant-minutes and egress bandwidth that comfortably covers a few panel
  episodes a month (check cloud.livekit.io/pricing — plans change). A 60-minute
  panel with a host and 3 guests is 4 participants × 60 min = 240 participant-minutes
  plus the bandwidth of each subscriber (~100–300 kbps audio-only per stream,
  ~1–1.5 Mbps with cameras).
- **Self-hosted:** one small VM (2 vCPU / 4 GB) handles a handful of 4–6 person rooms;
  the real cost is egress bandwidth (each guest's stream is forwarded to every
  other participant).
- Rooms empty out after 10 minutes with nobody in them, so a forgotten tab does
  not keep billing.

## Limits

- Hard cap `MAX_ROOM_GUESTS = 6` per episode room (`lib/podcast/rooms/types.ts`).
  The live **Grid** draws at most 4 people (host + 3); more guests are still
  recorded and can be shown with Guest/PIP but not tiled.
- The room needs the server env; there is no browser-only fallback for 2+ guests.
- Voice disguise, the live guest fader and Safe slate act on the merged guest
  bus in the live room, not per guest (per-guest mute / safe pause still exist in
  the panel).
- "Add the guest's uploaded recording to the timeline" in the editor is wired to
  guest 1; other guests' backups are downloaded from the *Guest backups* list per
  invite.
- Guest-to-host control over the data channel is delivered by the SFU; the HTTP
  signal table is used for the durable kinds only (no polling of guest signals in
  room mode).
- A room is one per open episode; a second room for the same episode (after the
  first ended) gets a `-N` suffix.
- Tokens: guest tokens last at most 6 h and never beyond the invite expiry; host
  tokens 6 h. Reconnects within the SDK reuse the token; a fresh join mints a new one.

## Files

- `lib/podcast/rooms/types.ts` — shapes, identities, room naming, caps
- `lib/podcast/rooms/provider.ts` — provider interface, `inviteCapacity`, env check
- `lib/podcast/rooms/livekit.ts` — HS256 token claims + RoomService calls (no server SDK)
- `lib/podcast/rooms/server.ts` — DB rows, room lifecycle, token minting (`server-only`)
- `lib/podcast/rooms/client.ts` — browser room (livekit-client): per-guest streams, control channel, host lines
- `lib/podcast/rooms/layout.ts` — grid cells + lane assignment (pure)
- `components/podcast/guest-room-panel.tsx` — host panel UI; `guest-invite-panel.tsx` chooses P2P vs room
- `components/podcast/guest-portal.tsx` — booth transport switch
- `app/api/admin/podcast/rooms/route.ts`, `app/api/admin/podcast/invites/route.ts`, `app/api/studio/guest/[token]/route.ts`
- `tests/unit/rooms/rooms.test.ts`
