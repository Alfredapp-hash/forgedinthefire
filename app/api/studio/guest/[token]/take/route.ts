import type { SupabaseClient } from '@supabase/supabase-js'
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
import { GUEST_TAKE_BUCKET, guestTakeRef, parseGuestTakeRef } from '@/lib/podcast/guest-invite'
import {
  CHUNK_MAX_BYTES,
  TAKE_AUDIO_TYPES,
  TAKE_VIDEO_TYPES,
  baseMime,
} from '@/lib/podcast/upload/guest-take-manifest'
import { containerForExt, sniffContainer } from '@/lib/podcast/upload/guest-take-server'

export const dynamic = 'force-dynamic'

/**
 * Single-object uploads (older booths). New booths upload progressively in
 * chunks via ./chunks (up to 2 GB per take). One object is capped by the
 * bucket's per-object limit (50 MB, 20260924000001_podcast_guest_v2.sql).
 */
const AUDIO_MAX = CHUNK_MAX_BYTES
const CAMERA_MAX = CHUNK_MAX_BYTES

/** Base MIME (no codecs) -> file extension. Anything else is refused. */
const AUDIO_TYPES = TAKE_AUDIO_TYPES
const VIDEO_TYPES = TAKE_VIDEO_TYPES

type TakeKind = 'audio' | 'camera'

function takeKind(value: unknown): TakeKind {
  return value === 'camera' ? 'camera' : 'audio'
}

async function inspectUpload(supabase: SupabaseClient, path: string) {
  const slash = path.lastIndexOf('/')
  const dir = path.slice(0, slash)
  const name = path.slice(slash + 1)
  const { data: listed, error } = await supabase.storage.from(GUEST_TAKE_BUCKET).list(dir, { search: name, limit: 5 })
  if (error) throw error
  const obj = (listed || []).find((o) => o.name === name)
  if (!obj) return null
  const meta = (obj.metadata || {}) as { size?: number; mimetype?: string }
  const { data: signed } = await supabase.storage.from(GUEST_TAKE_BUCKET).createSignedUrl(path, 60)
  let container: string | null = null
  if (signed?.signedUrl) {
    const res = await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-15' }, redirect: 'error' })
    if (res.ok) container = sniffContainer(new Uint8Array(await res.arrayBuffer()).slice(0, 16))
  }
  return { size: Number(meta.size || 0), mime: baseMime(meta.mimetype), container }
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params
    const open = await openGuestRoute(request, token)
    if (open.response) return open.response
    const sessionError = checkGuestSession(open.row, request)
    if (sessionError) return guestJson({ error: sessionError }, { status: 409 })
    // The booth only needs to know an upload landed. Files are host-only.
    return guestJson({
      takeUrl: null,
      takeMime: open.row.take_mime,
      takeReady: Boolean(open.row.take_url),
      cameraUrl: null,
      cameraMime: open.row.camera_mime,
      cameraReady: Boolean(open.row.camera_url),
    })
  } catch (err) {
    return guestFail('take', err, 'Could not check your take')
  }
}

/** Start an upload: a single-use signed PUT into the private guest bucket. */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params
    const open = await openGuestRoute(request, token)
    if (open.response) return open.response
    const { supabase, row } = open
    const sessionError = checkGuestSession(row, request)
    if (sessionError) return guestJson({ error: sessionError }, { status: 409 })
    const limited = await limitGuest(supabase, request, 'take', row.id)
    if (limited) return limited

    let body: { mime?: string; size?: number; kind?: string }
    try {
      body = (await readJsonBody(request, 1024)) as typeof body
    } catch (err) {
      return bodyErrorResponse(err) || guestFail('take', err)
    }
    const kind = takeKind(body.kind)
    const mime = baseMime(body.mime || (kind === 'camera' ? 'video/webm' : 'audio/webm'))
    const table = kind === 'camera' ? VIDEO_TYPES : AUDIO_TYPES
    const ext = table[mime]
    if (!ext) {
      return guestJson({ error: kind === 'camera' ? 'Camera backup must be WebM or MP4 video' : 'Take must be WebM, Ogg, MP4 or WAV audio' }, { status: 400 })
    }
    const size = Number(body.size)
    const max = kind === 'camera' ? CAMERA_MAX : AUDIO_MAX
    if (!Number.isFinite(size) || size <= 0) return guestJson({ error: 'File size required' }, { status: 400 })
    if (size > max) {
      return guestJson({ error: 'This file is too large for a single upload (50 MB). Please reload the booth and try again.' }, { status: 413 })
    }

    const path = `guest-takes/${row.id}/${kind === 'camera' ? 'camera-' : ''}${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from(GUEST_TAKE_BUCKET).createSignedUploadUrl(path)
    if (error || !data) return guestFail('take-sign', error, 'Could not start the upload')
    // publicUrl is kept for older clients; it is an opaque private ref, not a fetchable URL.
    return guestJson({ signedUrl: data.signedUrl, path, publicUrl: guestTakeRef(path), mime })
  } catch (err) {
    return guestFail('take', err, 'Take upload failed')
  }
}

/** Finish an upload: verify the object (size, type, magic bytes) then point the invite at it. */
export async function PUT(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params
    const open = await openGuestRoute(request, token)
    if (open.response) return open.response
    const { supabase, row } = open
    const sessionError = checkGuestSession(row, request)
    if (sessionError) return guestJson({ error: sessionError }, { status: 409 })

    let body: { path?: string; kind?: string }
    try {
      body = (await readJsonBody(request, 2048)) as typeof body
    } catch (err) {
      return bodyErrorResponse(err) || guestFail('take', err)
    }
    const kind = takeKind(body.kind)
    const path = String(body.path || '')
    const ref = guestTakeRef(path)
    const isCameraPath = path.includes('/camera-')
    if (
      parseGuestTakeRef(ref) !== path ||
      !path.startsWith(`guest-takes/${row.id}/`) ||
      isCameraPath !== (kind === 'camera')
    ) {
      return guestJson({ error: 'Invalid take path' }, { status: 400 })
    }

    const info = await inspectUpload(supabase, path)
    if (!info) return guestJson({ error: 'Upload not found. Please try again.' }, { status: 400 })
    const table = kind === 'camera' ? VIDEO_TYPES : AUDIO_TYPES
    const max = kind === 'camera' ? CAMERA_MAX : AUDIO_MAX
    const ext = path.slice(path.lastIndexOf('.') + 1)
    const expected = containerForExt(ext)
    const ok =
      info.size > 0 &&
      info.size <= max &&
      (!info.mime || Boolean(table[info.mime])) &&
      info.container === expected
    if (!ok) {
      await supabase.storage.from(GUEST_TAKE_BUCKET).remove([path])
      return guestJson({ error: 'That file did not look like a recording, so it was not saved.' }, { status: 400 })
    }

    const mime = info.mime && table[info.mime] ? info.mime : kind === 'camera' ? `video/${expected === 'mp4' ? 'mp4' : 'webm'}` : `audio/${expected === 'mp4' ? 'mp4' : expected}`
    const patch = kind === 'camera' ? { camera_url: ref, camera_mime: mime } : { take_url: ref, take_mime: mime }
    const next = await touchInvite(supabase, row.id, patch)
    return guestJson({
      takeReady: Boolean(next.take_url),
      cameraReady: Boolean(next.camera_url),
    })
  } catch (err) {
    return guestFail('take-finalize', err, 'Could not save your take')
  }
}
