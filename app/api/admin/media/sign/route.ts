import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { MEDIA_MAX_BYTES, baseMediaMime, mediaExtension, mediaObjectPath } from '@/lib/admin/media-policy'

export const dynamic = 'force-dynamic'

/**
 * Signed direct-to-storage upload for large podcast audio (bypasses ~6MB function body limit).
 * Client: PUT file to `signedUrl`, then POST /api/admin/media/complete with path metadata.
 * The object key is server-generated (no user path segments); the signed URL is single-object
 * and single-use (upsert off), and /complete re-checks size and type before registering it.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    const body = (await request.json().catch(() => ({}))) as {
      filename?: string
      mime_type?: string
      size_bytes?: number
    }
    const filename = String(body.filename || '').trim().slice(0, 200)
    const mime = baseMediaMime(body.mime_type || 'application/octet-stream')
    if (!filename) {
      return NextResponse.json({ error: 'filename required' }, { status: 400 })
    }
    const ext = mediaExtension(mime, filename)
    if (!ext) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }
    const size = Number(body.size_bytes || 0)
    if (!Number.isFinite(size) || size < 0 || size > MEDIA_MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 200MB)' }, { status: 413 })
    }

    const admin = createServiceClient()
    const path = mediaObjectPath(ext)

    const { data, error } = await admin.storage.from('media').createSignedUploadUrl(path)
    if (error || !data) {
      console.error('[media-sign]', error?.message)
      return NextResponse.json({ error: 'Could not create signed upload URL' }, { status: 502 })
    }

    const { data: urlData } = admin.storage.from('media').getPublicUrl(path)

    return NextResponse.json(
      {
        path,
        token: data.token,
        signedUrl: data.signedUrl,
        publicUrl: urlData.publicUrl,
        mime_type: mime,
        filename,
        size_bytes: size || null,
        uploaded_by: user.id,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    if (err instanceof Error && /admin|authenticated|privileges/i.test(err.message)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Sign failed' }, { status: 500 })
  }
}
