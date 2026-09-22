import { NextResponse } from 'next/server'
import { denyGuest, loadInviteByToken, touchInvite } from '@/lib/podcast/guest-access'

export const dynamic = 'force-dynamic'

const AUDIO_MAX = 80 * 1024 * 1024
const CAMERA_MAX = 400 * 1024 * 1024

function takeKind(value: unknown): 'audio' | 'camera' {
  return value === 'camera' ? 'camera' : 'audio'
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const { row, live } = await loadInviteByToken(token)
    const deny = denyGuest(row, live)
    if (deny || !row) return NextResponse.json({ error: deny || 'Invite not found' }, { status: 404 })
    return NextResponse.json({
      takeUrl: row.take_url,
      takeMime: row.take_mime,
      takeReady: Boolean(row.take_url),
      cameraUrl: row.camera_url,
      cameraMime: row.camera_mime,
      cameraReady: Boolean(row.camera_url),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Take lookup failed'
    return NextResponse.json({ error: message.slice(0, 180) }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const { supabase, row, live } = await loadInviteByToken(token)
    const deny = denyGuest(row, live)
    if (deny || !row) return NextResponse.json({ error: deny || 'Invite not found' }, { status: 404 })
    const body = (await request.json()) as { mime?: string; size?: number; kind?: string }
    const kind = takeKind(body.kind)
    const mime = String(body.mime || (kind === 'camera' ? 'video/webm' : 'audio/webm'))
    if (kind === 'camera') {
      if (!mime.startsWith('video/')) return NextResponse.json({ error: 'Camera backup must be video' }, { status: 400 })
      if (body.size && body.size > CAMERA_MAX) {
        return NextResponse.json({ error: 'Camera take is too large (400MB max)' }, { status: 400 })
      }
    } else {
      if (!mime.startsWith('audio/')) return NextResponse.json({ error: 'Audio only' }, { status: 400 })
      if (body.size && body.size > AUDIO_MAX) {
        return NextResponse.json({ error: 'Take is too large (80MB max)' }, { status: 400 })
      }
    }
    const ext = mime.includes('mp4') ? (kind === 'camera' ? 'mp4' : 'm4a') : 'webm'
    const path = `guest-takes/${row.id}/${kind === 'camera' ? 'camera-' : ''}${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from('media').createSignedUploadUrl(path)
    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Could not start take upload' }, { status: 502 })
    }
    const { data: urlData } = supabase.storage.from('media').getPublicUrl(path)
    return NextResponse.json({ signedUrl: data.signedUrl, path, publicUrl: urlData.publicUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Take upload failed'
    return NextResponse.json({ error: message.slice(0, 180) }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const { supabase, row, live } = await loadInviteByToken(token)
    const deny = denyGuest(row, live)
    if (deny || !row) return NextResponse.json({ error: deny || 'Invite not found' }, { status: 404 })
    const body = (await request.json()) as { path?: string; publicUrl?: string; mime?: string; kind?: string }
    if (!body.publicUrl || !String(body.path || '').startsWith(`guest-takes/${row.id}/`)) {
      return NextResponse.json({ error: 'Invalid take path' }, { status: 400 })
    }
    const kind = takeKind(body.kind)
    const patch =
      kind === 'camera'
        ? { camera_url: body.publicUrl, camera_mime: String(body.mime || 'video/webm') }
        : { take_url: body.publicUrl, take_mime: String(body.mime || 'audio/webm') }
    const next = await touchInvite(supabase, row.id, patch)
    return NextResponse.json({
      takeReady: Boolean(next.take_url),
      cameraReady: Boolean(next.camera_url),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Take finalize failed'
    return NextResponse.json({ error: message.slice(0, 180) }, { status: 500 })
  }
}
