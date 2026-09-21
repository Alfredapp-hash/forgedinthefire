import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Signed direct-to-storage upload for large podcast audio (bypasses ~6MB function body limit).
 * Client: PUT file to `signedUrl`, then POST /api/admin/media/complete with path metadata.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    const body = (await request.json()) as {
      filename?: string
      mime_type?: string
      size_bytes?: number
    }
    const filename = String(body.filename || '').trim()
    const mime = String(body.mime_type || 'application/octet-stream')
    if (!filename) {
      return NextResponse.json({ error: 'filename required' }, { status: 400 })
    }
    if (!/^(image|audio|video)\//.test(mime) && mime !== 'application/pdf') {
      return NextResponse.json({ error: 'Unsupported mime type' }, { status: 400 })
    }
    // Soft guard — warn above 200MB
    if (body.size_bytes && body.size_bytes > 200 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 200MB)' }, { status: 400 })
    }

    const admin = await createAdminClient()
    const ext = filename.split('.').pop() ?? 'bin'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { data, error } = await admin.storage.from('media').createSignedUploadUrl(path)
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Could not create signed upload URL' },
        { status: 502 },
      )
    }

    const { data: urlData } = admin.storage.from('media').getPublicUrl(path)

    return NextResponse.json({
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      publicUrl: urlData.publicUrl,
      mime_type: mime,
      filename,
      size_bytes: body.size_bytes ?? null,
      uploaded_by: user.id,
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Sign failed' }, { status: 500 })
  }
}
