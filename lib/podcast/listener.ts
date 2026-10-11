import { createHash } from 'crypto'

/** One listener per episode per UTC day. The raw IP is not stored. */
export function listenerHash(ip: string, userAgent: string, episodeId: string, day = new Date().toISOString().slice(0, 10)) {
  return createHash('sha256').update(`${ip}|${userAgent}|${episodeId}|${day}`).digest('hex').slice(0, 32)
}

export function requestIp(request: Request) {
  return (
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}
