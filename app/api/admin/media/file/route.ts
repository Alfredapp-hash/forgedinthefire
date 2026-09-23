import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { GUEST_TAKE_BUCKET, parseGuestTakeRef } from '@/lib/podcast/guest-invite'
import { parseChunkedTakeRef } from '@/lib/podcast/upload/guest-take-manifest'
import { buildTakeManifest, loadTake } from '@/lib/podcast/upload/guest-take-server'

export const dynamic = 'force-dynamic'

/** Signed URLs handed to the editor live this long (seconds). */
const SIGNED_TTL = 300
/** A chunked take this small is concatenated server-side so older editor code keeps working. */
const INLINE_CONCAT_MAX = 18 * 1024 * 1024

const NO_STORE_REDIRECT = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }

function projectHost() {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : ''
  } catch {
    return ''
  }
}

function redirect(location: string) {
  return new NextResponse(null, { status: 302, headers: { Location: location, ...NO_STORE_REDIRECT } })
}

/** /storage/v1/object/{public|authenticated|sign}/<bucket>/<path> -> { mode, bucket, path } */
function parseStoragePath(pathname: string) {
  const m = /^\/storage\/v1\/object\/(public|authenticated|sign)\/([^/]+)\/(.+)$/.exec(pathname)
  if (!m) return null
  try {
    return { mode: m[1], bucket: decodeURIComponent(m[2]), path: decodeURIComponent(m[3]) }
  } catch {
    return null
  }
}

/**
 * Admin-only media resolver for the editor.
 *
 * - Private single-object guest take (private://podcast-guest-takes/guest-takes/...): 302 to a signed URL.
 * - Chunked guest take (private://podcast-guest-takes/take/<invite>/<take>): small takes are
 *   concatenated here; larger ones return 409 { chunked: true, manifest } and the editor must
 *   reassemble via lib/podcast/upload/guest-take-client.ts (fetchGuestTakeBlob).
 * - This project's storage URLs (episode audio etc.): 302 to a short-lived signed URL, so large
 *   files never stream through the Netlify function. Storage serves CORS, so fetch() follows it.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin()
    const target = new URL(request.url).searchParams.get('url')
    if (!target) return NextResponse.json({ error: 'url required' }, { status: 400 })
    const supabase = createServiceClient()

    const chunked = parseChunkedTakeRef(target)
    if (chunked) {
      const take = await loadTake(supabase, chunked.takeId)
      if (!take || take.invite_id !== chunked.inviteId) {
        return NextResponse.json({ error: 'Guest take not found' }, { status: 404 })
      }
      const manifest = await buildTakeManifest(supabase, take, SIGNED_TTL)
      const manifestUrl = `/api/admin/podcast/invites/${take.invite_id}/takes?take=${take.id}`
      if (!manifest.chunks.length) return NextResponse.json({ error: 'Guest take has no data yet' }, { status: 404 })
      if (manifest.bytes > INLINE_CONCAT_MAX || manifest.missing.length) {
        return NextResponse.json(
          {
            error: 'This guest take is uploaded in parts. Load it with fetchGuestTakeBlob().',
            chunked: true,
            manifest: manifestUrl,
            startedAtSessionSec: manifest.startedAtSessionSec,
          },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        )
      }
      const urls = manifest.chunks.map((c) => c.url)
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for (const url of urls) {
              const res = await fetch(url, { redirect: 'error', cache: 'no-store' })
              if (!res.ok || !res.body) throw new Error('chunk unreachable')
              const reader = res.body.getReader()
              for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                if (value) controller.enqueue(value)
              }
            }
            controller.close()
          } catch (err) {
            controller.error(err)
          }
        },
      })
      return new NextResponse(body, {
        headers: {
          'Content-Type': manifest.mime,
          'Content-Length': String(manifest.bytes),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'X-Guest-Take-Start-Sec': manifest.startedAtSessionSec == null ? '' : String(manifest.startedAtSessionSec),
        },
      })
    }

    const privatePath = parseGuestTakeRef(target)
    if (privatePath) {
      const { data, error } = await supabase.storage.from(GUEST_TAKE_BUCKET).createSignedUrl(privatePath, SIGNED_TTL)
      if (error || !data?.signedUrl) return NextResponse.json({ error: 'Guest take not found' }, { status: 404 })
      return redirect(data.signedUrl)
    }

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

    const storage = parseStoragePath(parsed.pathname)
    if (storage?.mode === 'sign' && parsed.searchParams.get('token')) return redirect(parsed.toString())
    if (storage && storage.bucket !== GUEST_TAKE_BUCKET) {
      const { data } = await supabase.storage.from(storage.bucket).createSignedUrl(storage.path, SIGNED_TTL)
      if (data?.signedUrl) return redirect(data.signedUrl)
    }

    // Fallback (object not signable): same-origin proxy, as before.
    const res = await fetch(parsed.toString(), { redirect: 'error', cache: 'no-store' })
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
