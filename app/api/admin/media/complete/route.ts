import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/server'

/** Register a media_assets row after a successful signed direct upload. */
export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    const body = (await request.json()) as {
      path?: string
      filename?: string
      mime_type?: string
      size_bytes?: number
      alt?: string
      publicUrl?: string
    }
    const path = String(body.path || '').trim()
    if (!path || path.includes('..')) {
      return NextResponse.json({ error: 'path required' }, { status: 400 })
    }

    const admin = await createAdminClient()
    const { data: urlData } = admin.storage.from('media').getPublicUrl(path)
    const url = body.publicUrl || urlData.publicUrl

    const { data: asset, error } = await admin
      .from('media_assets')
      .insert({
        filename: body.filename || path,
        url,
        alt: body.alt || '',
        mime_type: body.mime_type || 'application/octet-stream',
        size_bytes: body.size_bytes ?? null,
        uploaded_by: user.id,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(asset, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Complete failed' }, { status: 500 })
  }
}
