import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    await requireAdmin()
    const admin = await createAdminClient()
    const { data, error } = await admin
      .from('media_assets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    if (err instanceof Error && err.message.includes('Admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to load media' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const alt = (formData.get('alt') as string) || ''

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const admin = await createAdminClient()
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await admin.storage
      .from('media')
      .upload(path, buffer, { contentType: file.type, upsert: false })

    if (uploadError) {
      // Bucket may not exist — return data URL fallback for dev
      if (uploadError.message.includes('Bucket not found')) {
        return NextResponse.json({
          error: 'Storage bucket "media" not configured. Create it in Supabase Storage.',
        }, { status: 503 })
      }
      throw uploadError
    }

    const { data: urlData } = admin.storage.from('media').getPublicUrl(path)
    const url = urlData.publicUrl

    const { data: asset, error: dbError } = await admin
      .from('media_assets')
      .insert({
        filename: file.name,
        url,
        alt,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: user.id,
      })
      .select()
      .single()

    if (dbError) throw dbError
    return NextResponse.json(asset, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('Media upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
