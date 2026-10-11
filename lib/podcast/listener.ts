import { createHash } from 'crypto'

/** One listener per episode per UTC day. The raw IP is not stored. */
export function listenerHash(ip: string, userAgent: string, episodeId: string, day = new Date().toISOString().slice(0, 10)) {
  return createHash('sha256').update(`${ip}|${userAgent}|${episodeId}|${day}`).digest('hex').slice(0, 32)
}

export function requestIp(request: Request) {
  return (
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

/** Two-letter country from the edge. Vercel sends x-vercel-ip-country. Unknown codes are dropped. */
export function requestCountry(request: Request) {
  const raw =
    request.headers.get('x-country') ||
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('x-nf-geo-country') ||
    request.headers.get('cf-ipcountry') ||
    ''
  const code = raw.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return null
  return code
}
