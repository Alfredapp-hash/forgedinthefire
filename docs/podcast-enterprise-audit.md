# Podcast enterprise audit

Audited tree: `main` at `74a2be0` (2026-10-11). Method: read the podcast migrations, publish/RSS/download paths, admin auth, live/room docs, and the studio UX audit. The sprint below is what changed after that read, including the live ForgedDB project.

**Verdict.** The product is a custom studio (record, remote guests, edit, survivor-safety gates, RSS, live show) built for one nonprofit show. A staff member can produce an episode in the browser, and the safety gates now hold after an episode is scheduled. What still needs a person is directory submission and the live-show accounts (LiveKit, TURN, WHIP, PodPing).

“Enterprise” here means a small staff can run a public survivor podcast with the controls a board, an insurer, and Apple/Spotify would expect. It does not mean multi-tenant SaaS.

## Sprint status (2026-10-11)

Landed in this branch and applied to ForgedDB (`mxjsbhldmovwpjcotmsd`) as `podcast_enterprise_sprint`:

1. **Guest approval stays pinned.** `podcast_require_guest_approval` runs on every update. A scheduled or published episode is checked again when the audio, transcript, guest, or sign-off changes. Title edits and the hourly scheduled-to-published step with no file change still pass. Episodes with no named guest stay releasable.
2. **Private files are not permanent public URLs.** Bucket `podcast-private` is private. A private episode’s audio or video is copied there and stored as `private://podcast-private/…`. `/podcast/dl` signs that for four hours. A private episode that still has a public URL returns 404. The video RSS enclosure goes through `/podcast/dl/:id/video.mp4`.
3. **Retention.** The hourly publish job deletes guest-take objects 14 days after the invite is revoked or expires, and clears `audio_url_previous` 14 days after publish. `pg_cron` is not installed on this project, so the job stays on `/api/cron/publish-scheduled`.
4. **Analytics.** Anonymous insert on `podcast_analytics_events` is revoked. Plays and downloads are written with the service role. The desk reads `podcast_analytics_summary` (unique listener per episode per day), with a 5,000-row fallback if the function is missing.
5. **Safeguarding and an audit log.** `admin_users.role` allows `owner`, `admin`, and `safeguarding`. Safeguarding can open `/admin/podcast` and record sign-offs. They are not added to `is_admin()`, so they cannot write every podcast table through the Data API. `podcast_audit_log` is append-only: service-role insert, staff select. Episode create, edit, delete, publish, invite create and revoke, live end, and staff changes are recorded.
6. **The two existing owners stay owners.** The migration only widens the role check. It does not update or delete `admin_users` rows. `is_admin()` still means owner or admin, so a safeguarding login cannot write every podcast table through the Data API. The users API refuses to remove or demote the last owner. A throwaway scheduled episode was used to confirm a title-only save still passes and adding a guest without approval is rejected, then that row was deleted. Both owners are still owners.

The public feed at `https://forgedinthefireohio.org/podcast/rss.xml` returns RSS with no enclosures yet, which matches zero published episodes. GitHub’s API did not allow this run to list Actions secrets, so confirm `CRON_SECRET` is set on the repository before relying on the hourly job.

Still a person, not this repository:

- Submit `https://forgedinthefireohio.org/podcast/rss.xml` to Apple Podcasts and Spotify, and name someone on the Distribution tab.
- Provision LiveKit, TURN, WHIP or Cloudflare Stream, and PodPing, then set those secrets on Netlify. Names are in `.env.local.example`. `CRON_SECRET` must match the GitHub Actions secret used by `.github/workflows/publish-scheduled.yml`.
- A sitewide Content-Security-Policy was not turned on. Face blur loads MediaPipe from jsDelivr and model files from Google Storage. An enforcing policy needs those hosts and a Next.js nonce, and a wrong policy takes the public site down.
- IAB download certification is out of scope. The unique-download count is the same day-hash the desk already used.
- Hosted recording still encodes in the host browser. A second operator can already end a live show; that action is now in the audit log. Provisioning the media server is the remaining step.

## What is already in place

| Area | Maturity | Where it lives |
| --- | --- | --- |
| Production room (plan → record → edit → publish) | Usable in Chrome/Edge. Simple vs Advanced tools. Loudness target, chapters, stems, MP4 export. | `app/admin/podcast/RecordingStudio.tsx`, `components/podcast/audio-editor.tsx` |
| Remote guest, one person | Peer-to-peer WebRTC, consent, one device per invite, chunked backup to a private bucket. | `components/podcast/guest-portal.tsx`, `20260922_podcast_guest_invites.sql`, `20260924000010_podcast_guest_uploads.sql` |
| Panel (2–6 guests) | LiveKit room, host subscribes, guests hear each other. Refuses to start if LiveKit env is missing. | `docs/podcast-multi-guest.md`, `lib/podcast/rooms/` |
| Survivor safety on the way to release | Guest final-cut approval pinned to the audio URL and SHA-256, protected-term review, transcript review, withdrawal block. Database trigger mirrors the checklist on the transition into `scheduled` or `published`. | `lib/podcast/safety/checklist.ts`, `20260924000002_podcast_ai_safety.sql` |
| Public feed | RSS 2.0 + iTunes + Podcasting 2.0: GUID, locked, transcripts, chapters, person, funding, explicit, episode type. Private token feeds. Video feed when `video_url` is set. | `lib/podcast-rss.ts`, `app/podcast/rss.xml/route.ts`, `app/podcast/video.xml/route.ts` |
| Release calendar | Hourly GitHub Action calls `/api/cron/publish-scheduled` with `CRON_SECRET`. Held episodes stay scheduled and are logged. | `.github/workflows/publish-scheduled.yml`, `app/api/cron/publish-scheduled/route.ts` |
| Distribution tracking | Checklist rows for Apple, Spotify, Amazon, YouTube, iHeart, Pocket Casts, Overcast, RSS. Status is typed in by staff. | `podcast_distribution`, Podcast Desk |
| First-party analytics | Enclosure redirect hashes IP + user agent + episode + day, skips HEAD and Apple’s `bytes=0-1` probe, drops obvious bots. Web plays are a separate event. | `app/podcast/dl/_download.ts`, `app/api/admin/podcast/analytics/route.ts` |
| Live show | Host-browser program, 0–30s delay, DUMP, face blur (fail closed), voice disguise, moderated chat, simulcast keys encrypted at rest. | `docs/podcast-live.md`, `lib/podcast/live/` |
| Access control (baseline) | Podcast admin APIs call `requireAdmin()`. Sensitive tables were tightened from “any signed-in user” to `is_admin()`, and subscriber tokens are service-role only. | `lib/admin/auth.ts`, `20260923000003_podcast_security.sql`, `20260921_podcast_hardening.sql` |
| UX of the studio | The 2026-09-29 UX audit’s P0 and P1 items are marked fixed. Leftovers are target size, the pulsing record button, and a few guest-booth phrases. | `docs/studio-ux-audit.md` |

Unit tests cover loudness, edit/ripple, guest backup, rooms, chat moderation, and the safety checklist. End-to-end coverage still skips the live room, a full guest WebRTC join, and crash recovery (`e2e/live.spec.ts`, `e2e/guest.spec.ts`, `e2e/studio.spec.ts` are `test.fixme`).

## Gaps, ranked

The list below is the original audit. The sprint status section is what has landed since. These write-ups stay so the reason for each control is still on the page.

### P0 — do these before calling the setup enterprise

**1. The safety gate does not re-check an episode that is already scheduled or published.**

`podcast_require_guest_approval()` returns immediately when the old status is already `scheduled` or `published` (`20260924000002_podcast_ai_safety.sql`). The episode PATCH route (`app/api/admin/studio/episodes/route.ts`) re-checks feed compliance (title, enclosure, cover) on every save of a live episode, and it does not load or check guest approval, protected terms, or transcript review. Replacing `audio_url` on a published guest episode therefore does not demand a new approval, even though the approval columns are explicitly pinned to one file.

Fix: on any change to `audio_url`, `audio_sha256`, or `transcript` while status is `scheduled` or `published`, either refuse the write or clear the stale approval and block until it is recorded again. Same rule in the trigger and in the API.

**2. “Private” audio is public once the redirect is followed.**

Subscriber feeds put a token on `/podcast/dl/[id]/…`. That route checks the token, then answers `302` to `audio_url`. Episode audio is uploaded to the `media` bucket and stored as `getPublicUrl()` (`app/api/admin/media/route.ts`, `sign/route.ts`). Anyone who sees the redirected URL — a podcast app, a log, a shared link — has the file with no token and no expiry. The video feed skips the redirect entirely and puts `video_url` in the enclosure (`lib/podcast-rss.ts`).

Fix: keep released public audio on the public bucket if you want cheap CDN delivery. Keep private and pre-release masters in a private bucket and hand out short-lived signed URLs. Do not 302 a private episode at a permanent public object.

**3. Guest recordings and unredacted masters have no retention clock.**

`podcast_guest_cleanup()` deletes signaling rows older than six hours and expired rate-limit buckets. It does not delete objects in `podcast-guest-takes`. `audio_url_previous` is documented as possibly containing unredacted names and is only removed if someone presses delete in the editor. Chat messages purge after 30 days only when `pg_cron` is enabled. There is no export or delete path for a guest who asks for their recording back.

Fix: a retention job (for example: delete guest takes N days after the episode is published or the invite is revoked, unless a legal hold is set), a one-click “delete previous audio” that is the default after the safe render, and a staff procedure for a deletion request.

**4. Schema and secrets are ahead of the deploy tooling.**

`scripts/apply-podcast-enterprise.mjs` applies only `20260917_studio.sql` and `20260918_podcast_enterprise.sql`, and it pins one Supabase project ref. Twelve later podcast migrations (hardening, guests, live, rooms, clips, safety, video) are not in that script. `.env.local.example` lists TURN and omits everything else the studio reads:

| Needed for | Variables |
| --- | --- |
| Scheduled publish | `CRON_SECRET` (also a GitHub Actions secret) |
| Strict guest networks | `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` |
| Two or more guests | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Live ingest and playback | `LIVE_WHIP_URL`, `LIVE_WHIP_BEARER`, `LIVE_PLAYBACK_HLS_URL`, `LIVE_PLAYBACK_WHEP_URL` |
| Simulcast | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`, `LIVE_CF_INPUT_ID`, `LIVE_DESTINATION_SECRET` |
| Chat bans that survive a restart | `LIVE_CHAT_SALT` |
| Fast directory ingest | `PODPING_TOKEN`, `WEBSUB_HUB` |
| Public media | a `media` storage bucket (not created by the podcast migrations) |

PodPing and WebSub fail soft: publishing succeeds and platforms keep polling. Live and multi-guest fail closed, which is the right default, and it means those features are off until someone sets the variables and redeploys.

Fix: one ordered migration runner (or `supabase db push`) covering every file under `supabase/migrations/`, and an env checklist in `.env.local.example` with no secret values. Confirm on the live database that `is_admin()`, the safety trigger, and `podcast-guest-takes` exist before the next guest session.

### P1 — needed before a live survivor show or a directory launch you will stand behind

**5. Any admin is a full producer, and nothing records who did what.**

`requireAdmin()` allows `admin` or `owner` and nothing finer (`lib/admin/auth.ts`). There is no producer / editor / safeguarding role, no SSO, and no requirement in this app that MFA is on. Searches find no audit table. Final-cut fields store a free-text “approved by,” not a user id tied to an immutable event. Episode delete is a single API call.

Fix: at least three roles (owner, producer, safeguarding reviewer), an append-only log of publish, audio replace, approval, invite create/revoke, and delete, and Supabase MFA required for those accounts. SSO can wait; the log cannot.

**6. Audience numbers are a first-party sketch, and they can be forged.**

The migration comment calls the table “IAB-shaped analytics without certification paperwork.” The redirect prefix is the right idea, and the dashboard tries to count one listener per episode per day. Gaps that make the number unfit for a board report:

- `podcast_analytics_events` allows `INSERT` from `anon` with `WITH CHECK (true)`. `POST /api/podcast/events` uses the anon key, does not check that the episode is published, and has no rate limit. Plays can be inflated by anyone who has the public anon key (it ships in the browser).
- The admin report reads at most 5,000 events and at most 90 days (`app/api/admin/podcast/analytics/route.ts`). Past that, totals are wrong.
- Bot filtering is a substring check (`bot`, `crawler`, `spider`) in `guessApp`, not the IAB user-agent list.
- Uniqueness is computed in the dashboard, not enforced at insert, and play events store no `listener_hash`.
- Video downloads are not counted, because the video enclosure is the raw file URL.
- A 302 prefix under-counts clients that do not follow redirects. IAB certification expects a filtered, deduplicated prefix or a byte-serving log. This code is honest about not being that.

Fix: inserts only from the service role (the download route and a rate-limited play beacon). Unique constraint on `(episode_id, listener_hash, event_type, day)` or a daily rollup table. Decide explicitly: first-party directional numbers, or an IAB-certified prefix (OP3, Podtrac, or your own byte log). Do not present the current dashboard as certified downloads.

**7. Live is one laptop.**

There is no server-side encoder. Netlify cannot run ffmpeg. The host tab composites, delays, publishes WHIP, and records to IndexedDB (`ff-live-recorder`, newest two recordings, memory fallback in a private window). A crashed tab leaves the session `live` until the heartbeat goes stale (documented as about three minutes) and the recording exists only in that browser profile. Cloudflare “automatic record” and HLS simulcast are documented as unreliable for WHIP ingest. Face blur loads WASM and the model from jsDelivr and Google Storage; the site has no Content-Security-Policy, so a future CSP will silently break blur unless those hosts are allowed. Guest face-blur consent is not stored; blur defaults on. Voice disguise is documented as not anonymity. Chat’s per-network rate limit fails open if `api_rate_limit_hit` is missing. The three live end-to-end specs are still `fixme`.

Fix before a survivor is on a public stream: a hosted ingest that records server-side (MediaMTX or LiveKit egress to object storage), a second operator path that can mark the session ended, a written DUMP drill, and a CSP that allows the blur runtime. Treat “Save as episode draft” as a copy of a local file, not as the archive.

**8. Directory distribution is a spreadsheet.**

Nothing submits to Apple Podcasts Connect, Spotify for Podcasters, or YouTube. Staff update status and paste a listing URL. That is fine for one show if someone owns the checklist. It is not an integration. `ad_markers` are stored and edited (`EpisodeEditor.tsx`) and are not emitted in RSS, so they do not drive mid-roll insertion. For this organization, dynamic ads are optional; getting the public feed accepted is not.

Fix: a one-page runbook (feed URL, cover rules, explicit flag, PodPing token, who checks Apple and Spotify after the first scheduled publish) and an owner for the Distribution tab. Confirm the hourly cron returns 200 in GitHub Actions and that a held episode is visible to staff, not only in function logs.

**9. Critical paths are untested in a browser.**

Documented `fixme` specs: live room without a provider, go-live gating, provider failure, guest join through WebRTC plus backup upload, and crash-take recovery. The guest relay warning is still not gated on an actual ICE failure (`docs/studio-ux-audit.md`, item 7). A regression in consent, backup, or DUMP would not fail CI.

Fix: promote those specs off `fixme` against the dev harnesses, with the provider mocked. Keep the real LiveKit and Cloudflare checks as a manual pre-show list until a staging project exists.

### P2 — scale, polish, and things this show can defer

- **One show is the product.** `podcast_shows` allows more than one row and enforces a single default. The public site reads the default show. Multi-show is schema, not a second production.
- **Collaboration is one editor at a time.** No lock, no assignment, no comment thread on a timeline. `created_by` is a column. Two people in the same episode can overwrite each other.
- **Host browser support is narrow.** WebCodecs delay wants current desktop Chrome or Edge. Firefox and Safari fall back to a heavier frame buffer. Guests and viewers are broader.
- **Analytics geography depends on edge headers** (`x-nf-geo-country` and similar). City and region columns exist and are usually empty.
- **Remaining UX.** 28px mixer chips, a record button that pulses for the whole take, guest copy that still says the host “punches Record,” phone target size. None of these block a trained producer. They do block the “first hour without a manual” bar from the UX audit.
- **No status page, paging, or media backup.** A Supabase storage outage or a dropped Netlify env var is discovered when a host or a listener hits it. Point-in-time backup of the `media` and `podcast-guest-takes` buckets is an operational decision, not something this repo does.

## Operating picture

```
Staff browser (studio + live control)
  ├─ Supabase Auth ── admin_users (owner | admin | safeguarding)
  ├─ Postgres (episodes, safety, invites, live, analytics, audit log)
  ├─ Storage: media (public) + podcast-private + podcast-guest-takes (both private)
  ├─ Optional: LiveKit (2+ guests), TURN, Cloudflare WHIP / MediaMTX
  └─ RSS ── /podcast/dl 302 ── public URL, or a four-hour signed URL for private files
         └── hourly cron ── scheduled → published (if checks pass) + retention
                            └── PodPing / WebSub if tokens exist
```

The top row works when Supabase and an admin login exist. Everything in the optional row, and the privacy of the bottom row, is the enterprise gap.

## Suggested order of work

1. **Prove the live database.** Apply every podcast migration. Confirm `is_admin()`, the safety trigger, both storage buckets, and `CRON_SECRET` on the hourly workflow. Fill `.env.local.example` so the next person can see what “off” means.
2. **Close the two privacy holes.** Re-check safety when a released file or transcript changes. Stop redirecting private episodes at permanent public objects, and put a retention job on guest takes and previous audio.
3. **Make the numbers and the staff list honest.** Service-role-only analytics inserts, a rollup that does not stop at 5,000 rows, and an audit log plus a safeguarding role that is not the same as “can delete the episode.”
4. **Only then turn live on for a guest.** Hosted recording, a second person who can end the show, DUMP practiced, blur CSP allowed, LiveKit and TURN set if more than one guest is in the room.
5. **Submit the feed once** and assign an owner to the Distribution tab. PodPing is the code path; Apple and Spotify acceptance is a human step.

Items 1–3 are the difference between a capable studio and an enterprise setup. Items 4–5 are how you run a show on top of it.
