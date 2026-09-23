import { randomUUID } from 'crypto'
import {
  bodyErrorResponse,
  checkGuestSession,
  guestFail,
  guestJson,
  limitGuest,
  openGuestRoute,
  readJsonBody,
  touchInvite,
} from '@/lib/podcast/guest-access'
import { isMissingTable } from '@/lib/podcast/guest-consent'
import {
  CHUNK_MAX_BYTES,
  CHUNK_TIMESLICE_MS,
  GUEST_TAKE_BUCKET_NAME,
  MAX_CHUNK_INDEX,
  SIGN_BATCH_MAX,
  TAKE_MAX_BYTES,
  baseMime,
  chunkPath,
  chunkedTakeRef,
  takeExt,
  takeFolder,
  type GuestTakeKind,
} from '@/lib/podcast/upload/guest-take-manifest'
import {
  containerForExt,
  listTakeChunks,
  loadTake,
  missingIndices,
  sniffObject,
} from '@/lib/podcast/upload/guest-take-server'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type Body = {
  action?: string
  kind?: string
  mime?: string
  takeId?: string
  from?: number
  count?: number
  chunks?: number
  sessionSec?: number | null
  hostAt?: number | null
  startedAtSessionSec?: number | null
  guestStartHostMs?: number | null
  clockRttMs?: number | null
  durationSec?: number | null
}

function finiteOrNull(v: unknown, min: number, max: number) {
  const n = typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

/**
 * Progressive guest backup upload (one object per ~10 s chunk).
 *
 * POST { action: 'start', kind, mime, sessionSec?, hostAt? }
 *   -> { takeId, ext, mime, chunkMaxBytes, takeMaxBytes, timesliceMs }
 * POST { action: 'sign', takeId, from, count<=12 }
 *   -> { urls: [{ index, signedUrl, path }] }   single-object signed upload URLs (2 h, upsert)
 * POST { action: 'finish', takeId, chunks, durationSec?, startedAtSessionSec?, guestStartHostMs?, clockRttMs? }
 *   -> { takeReady, cameraReady, missing: number[] }  (missing non-empty = re-upload those, then finish again)
 */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params
    const open = await openGuestRoute(request, token)
    if (open.response) return open.response
    const { supabase, row } = open
    const sessionError = checkGuestSession(row, request)
    if (sessionError) return guestJson({ error: sessionError }, { status: 409 })

    let body: Body
    try {
      body = (await readJsonBody(request, 2048)) as Body
    } catch (err) {
      return bodyErrorResponse(err) || guestFail('chunk', err)
    }

    if (body.action === 'start') {
      const limited = await limitGuest(supabase, request, 'take', row.id)
      if (limited) return limited
      const kind: GuestTakeKind = body.kind === 'camera' ? 'camera' : 'audio'
      const mime = baseMime(body.mime || (kind === 'camera' ? 'video/webm' : 'audio/webm'))
      const ext = takeExt(kind, mime)
      if (!ext) {
        return guestJson(
          { error: kind === 'camera' ? 'Camera backup must be WebM or MP4 video' : 'Backup must be WebM, Ogg, MP4 or WAV audio' },
          { status: 400 },
        )
      }
      const takeId = randomUUID()
      const { error } = await supabase.from('podcast_guest_takes').insert({
        id: takeId,
        invite_id: row.id,
        episode_id: row.episode_id,
        kind,
        mime,
        ext,
        session_sec: finiteOrNull(body.sessionSec, 0, 172_800),
        host_at_ms: finiteOrNull(body.hostAt, 1, Number.MAX_SAFE_INTEGER),
      })
      if (error) {
        if (isMissingTable(error)) {
          return guestJson({ error: 'Backup uploads are not switched on yet. Your backup is kept in this tab.' }, { status: 503 })
        }
        throw error
      }
      return guestJson({
        takeId,
        ext,
        mime,
        chunkMaxBytes: CHUNK_MAX_BYTES,
        takeMaxBytes: TAKE_MAX_BYTES,
        timesliceMs: CHUNK_TIMESLICE_MS,
      })
    }

    const takeId = String(body.takeId || '')
    if (!UUID.test(takeId)) return guestJson({ error: 'Invalid take' }, { status: 400 })
    const take = await loadTake(supabase, takeId)
    if (!take || take.invite_id !== row.id) return guestJson({ error: 'Invalid take' }, { status: 404 })

    if (body.action === 'sign') {
      const limited = await limitGuest(supabase, request, 'chunk', row.id)
      if (limited) return limited
      if (take.status === 'abandoned') return guestJson({ error: 'This take was closed' }, { status: 410 })
      const from = Number(body.from)
      const count = Math.min(SIGN_BATCH_MAX, Math.max(1, Math.floor(Number(body.count) || 1)))
      if (!Number.isSafeInteger(from) || from < 0 || from + count - 1 > MAX_CHUNK_INDEX) {
        return guestJson({ error: 'Invalid chunk index' }, { status: 400 })
      }
      const urls: { index: number; signedUrl: string; path: string }[] = []
      for (let index = from; index < from + count; index++) {
        const path = chunkPath(row.id, take.id, index, take.ext)
        const { data, error } = await supabase.storage
          .from(GUEST_TAKE_BUCKET_NAME)
          .createSignedUploadUrl(path, { upsert: true })
        if (error || !data) return guestFail('chunk-sign', error, 'Could not prepare the upload')
        urls.push({ index, signedUrl: data.signedUrl, path })
      }
      return guestJson({ urls })
    }

    if (body.action === 'finish') {
      const expected = Math.floor(Number(body.chunks))
      if (!Number.isSafeInteger(expected) || expected < 0 || expected > MAX_CHUNK_INDEX + 1) {
        return guestJson({ error: 'Invalid chunk count' }, { status: 400 })
      }
      const chunks = await listTakeChunks(supabase, take)
      const missing = missingIndices(chunks, expected)
      if (missing.length) return guestJson({ takeReady: false, cameraReady: false, missing: missing.slice(0, 500) })
      const inRange = chunks.filter((c) => c.index < expected)
      const bytes = inRange.reduce((sum, c) => sum + c.bytes, 0)
      if (expected === 0 || bytes <= 0) {
        await supabase.from('podcast_guest_takes').update({ status: 'abandoned', updated_at: new Date().toISOString() }).eq('id', take.id)
        return guestJson({ takeReady: false, cameraReady: false, missing: [] })
      }
      if (bytes > TAKE_MAX_BYTES) {
        return guestJson({ error: 'This backup is larger than 2 GB, so it was not saved.' }, { status: 413 })
      }
      const first = await sniffObject(supabase, `${takeFolder(row.id, take.id)}/${inRange[0].name}`)
      if (first !== containerForExt(take.ext)) {
        await supabase.from('podcast_guest_takes').update({ status: 'abandoned', updated_at: new Date().toISOString() }).eq('id', take.id)
        return guestJson({ error: 'That file did not look like a recording, so it was not saved.' }, { status: 400 })
      }
      const now = new Date().toISOString()
      const { error: upErr } = await supabase
        .from('podcast_guest_takes')
        .update({
          status: 'complete',
          chunk_count: expected,
          bytes,
          duration_sec: finiteOrNull(body.durationSec, 0, 172_800),
          started_at_session_sec: finiteOrNull(body.startedAtSessionSec, -60, 172_800),
          guest_start_host_ms: finiteOrNull(body.guestStartHostMs, 1, Number.MAX_SAFE_INTEGER),
          clock_rtt_ms: finiteOrNull(body.clockRttMs, 0, 60_000),
          completed_at: now,
          updated_at: now,
        })
        .eq('id', take.id)
      if (upErr) throw upErr
      const ref = chunkedTakeRef(row.id, take.id)
      const patch = take.kind === 'camera' ? { camera_url: ref, camera_mime: take.mime } : { take_url: ref, take_mime: take.mime }
      const next = await touchInvite(supabase, row.id, patch)
      return guestJson({ takeReady: Boolean(next.take_url), cameraReady: Boolean(next.camera_url), missing: [] })
    }

    return guestJson({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return guestFail('chunk', err, 'Backup upload failed')
  }
}
