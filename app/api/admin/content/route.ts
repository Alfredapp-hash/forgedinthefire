import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { NextResponse } from 'next/server'
import { contentFromDb, contentToDb } from '@/lib/content-db'

// GET /api/admin/content - List all content
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    await requireAdmin()

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const template = searchParams.get('template')
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const featured = searchParams.get('featured')

    let query = supabase.from('content').select('*')

    if (type) query = query.eq('type', type)
    if (template) query = query.eq('template', template)
    if (category) query = query.eq('category', category)
    if (status) query = query.eq('status', status)
    if (featured) query = query.eq('featured', featured === 'true')

    const { data, error } = await query.order('updated_at', { ascending: false })

    if (error) throw error
    return NextResponse.json((data || []).map((row) => contentFromDb(row)))
  } catch (err) {
    if (err instanceof Error && err.message === 'Admin access required') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }
    console.error('Content list error:', err)
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 })
  }
}

// POST /api/admin/content - Create new content
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const user = await requireAdmin()

    const body = await request.json()
    const dbRow = contentToDb(body)

    const { data, error } = await supabase
      .from('content')
      .insert({
        ...dbRow,
        author_id: user.id,
        author_name: body.authorName || user.email?.split('@')[0] || 'Admin',
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(contentFromDb(data), { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'Admin access required') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }
    console.error('Content create error:', err)
    return NextResponse.json({ error: 'Failed to create content' }, { status: 500 })
  }
}
