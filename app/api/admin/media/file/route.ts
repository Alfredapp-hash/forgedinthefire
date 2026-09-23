import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { GUEST_TAKE_BUCKET, parseGuestTakeRef } from '@/lib/podcast/guest-invite'

export const dynamic = 'force-dynamic'

function projectHost() {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : ''
  } catch {
    return ''
  }
}

/**
 * Admin-only media proxy for the editor (same-origin fetch, no CORS).
 * Accepts this project's storage URLs, or a private guest-take ref
 * (private://podcast-guest-takes/...) which is resolved to a 60 s signed URL.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin()
    const target = new URL(request.url).searchParams.get('url')
    if (!target) return NextResponse.json({ error: 'url required' }, { status: 400 })

    let fetchUrl: string
    const privatePath = parseGuestTakeRef(target)
    if (privatePath) {
      const { data, error } = await createServiceClient()
        .storage.from(GUEST_TAKE_BUCKET)
        .createSignedUrl(privatePath, 60)
      if (error || !data?.signedUrl) return NextResponse.json({ error: 'Guest take not found' }, { status: 404 })
      fetchUrl = data.signedUrl
    } else {
      let parsed: URL
      try {
        parsed = new URL(target)
      } catch {
        return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
      }
      const allowedHost = projectHost()
      const hostOk = allowedHost ? parsed.hostname === allowedHost : parsed.hostname.endsWith('.supabase.co')
      if (parsed.protocol !== 'https:' || !hostOk || !parsed.pathname.startsWith('/storage/v1/object/')) {
        return NextResponse.json({ error: 'Only media stored on this project can be edited' }, { status: 400 })
      }
      fetchUrl = parsed.toString()
    }

    const res = await fetch(fetchUrl, { redirect: 'error', cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: 'Audio not reachable' }, { status: 502 })
    const type = res.headers.get('content-type') || 'application/octet-stream'
    const safeType = /^(audio|video|image)\//.test(type) && !type.includes('svg') ? type : 'application/octet-stream'
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': safeType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  } catch (err) {
    if (err instanceof Error && /admin|authenticated|privileges/i.test(err.message)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Proxy failed' }, { status: 500 })
  }
}
