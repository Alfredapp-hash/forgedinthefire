export function campaignLandingWithUtm(opts: {
  path?: string | null
  origin?: string
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
}) {
  const origin = opts.origin || 'https://forgedinthefireohio.org'
  const raw = opts.path || '/donate'
  const url = raw.startsWith('http') ? new URL(raw) : new URL(raw.startsWith('/') ? raw : `/${raw}`, origin)
  if (opts.utm_source) url.searchParams.set('utm_source', opts.utm_source)
  if (opts.utm_medium) url.searchParams.set('utm_medium', opts.utm_medium)
  if (opts.utm_campaign) url.searchParams.set('utm_campaign', opts.utm_campaign)
  if (opts.utm_content) url.searchParams.set('utm_content', opts.utm_content)
  return url.toString()
}
