import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { MEDIA_MAX_BYTES, MEDIA_PATH_PATTERN, baseMediaMime, mediaExtension } from '@/lib/admin/media-policy'

export const dynamic = 'force-dynamic'

/**
 * Register a media_assets row after a successful signed direct upload.
 * The URL is derived server-side from the path (client `publicUrl` is ignored),
 * and the stored object's size/type are re-checked against the upload policy.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    const body = (await request.json().catch(() => ({}))) as {
      path?: string
      filename?: string
      mime_type?: string
      size_bytes?: number
      alt?: string
      publicUrl?: string
    }
    const path = String(body.path || '').trim()
    if (!MEDIA_PATH_PATTERN.test(path)) {
      return NextResponse.json({ error: 'path required' }, { status: 400 })
    }

    const admin = createServiceClient()
    const { data: listed } = await admin.storage.from('media').list('', { search: path, limit: 5 })
    const obj = (listed || []).find((o) => o.name === path)
    if (!obj) return NextResponse.json({ error: 'Upload not found' }, { status: 400 })
    const meta = (obj.metadata || {}) as { size?: number; mimetype?: string }
    const storedMime = baseMediaMime(meta.mimetype || body.mime_type)
    const ext = path.slice(path.lastIndexOf('.') + 1)
    if (mediaExtension(storedMime, `x.${ext}`) !== ext || Number(meta.size || 0) > MEDIA_MAX_BYTES) {
      await admin.storage.from('media').remove([path])
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }

    const { data: urlData } = admin.storage.from('media').getPublicUrl(path)

    const { data: asset, error } = await admin
      .from('media_assets')
      .insert({
        filename: String(body.filename || path).slice(0, 200),
        url: urlData.publicUrl,
        alt: String(body.alt || '').slice(0, 500),
        mime_type: storedMime,
        size_bytes: Number(meta.size || body.size_bytes || 0) || null,
        uploaded_by: user.id,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(asset, { status: 201 })
  } catch (err) {
    if (err instanceof Error && /admin|authenticated|privileges/i.test(err.message)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Complete failed' }, { status: 500 })
  }
}
