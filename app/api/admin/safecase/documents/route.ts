import { NextResponse } from 'next/server'
import { safecaseError, withSafeCaseAdmin } from '@/lib/safecase/api'

export async function GET(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const clientId = new URL(request.url).searchParams.get('client_id')
    if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 })
    const { data, error } = await admin
      .from('safecase_documents')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    return safecaseError(err)
  }
}

export async function POST(request: Request) {
  try {
    const { user, admin } = await withSafeCaseAdmin()
    const form = await request.formData()
    const file = form.get('file') as File | null
    const clientId = String(form.get('client_id') || '')
    if (!file || !clientId) {
      return NextResponse.json({ error: 'File and client are required' }, { status: 400 })
    }
    const ext = file.name.split('.').pop() ?? 'bin'
    const path = `safecase/${clientId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await admin.storage
      .from('media')
      .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (uploadError) throw uploadError
    const { data: urlData } = admin.storage.from('media').getPublicUrl(path)
    const { data, error } = await admin
      .from('safecase_documents')
      .insert({
        client_id: clientId,
        filename: file.name,
        url: urlData.publicUrl,
        mime_type: file.type || null,
        size_bytes: file.size,
        created_by: user.email,
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return safecaseError(err)
  }
}

export async function DELETE(request: Request) {
  try {
    const { admin } = await withSafeCaseAdmin()
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { error } = await admin.from('safecase_documents').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return safecaseError(err)
  }
}
