import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const target = new URL(request.url).searchParams.get('url')
    if (!target) return NextResponse.json({ error: 'url required' }, { status: 400 })
    const allowedHost = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : ''
    const host = new URL(target).hostname
    if (!host.endsWith('.supabase.co') && host !== allowedHost) {
      return NextResponse.json({ error: 'Only media stored on this project can be edited' }, { status: 400 })
    }
    const res = await fetch(target)
    if (!res.ok) return NextResponse.json({ error: 'Audio not reachable' }, { status: 502 })
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Proxy failed' }, { status: 500 })
  }
}
