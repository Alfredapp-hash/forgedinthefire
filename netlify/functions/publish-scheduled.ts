import type { Config } from '@netlify/functions'

/**
 * Hourly scheduler that hits the Next.js cron route to publish due blog posts
 * and podcast episodes. Requires CRON_SECRET in Netlify env (same value the
 * App Router route expects as Bearer token).
 */
export default async () => {
  const site = Netlify.env.get('URL') || Netlify.env.get('DEPLOY_PRIME_URL') || 'https://forgedinthefireohio.org'
  const secret = Netlify.env.get('CRON_SECRET')
  if (!secret) {
    console.error('CRON_SECRET is not set — refusing to call publish-scheduled')
    return new Response(JSON.stringify({ error: 'CRON_SECRET missing' }), { status: 500 })
  }
  const target = `${site.replace(/\/$/, '')}/api/cron/publish-scheduled`

  const res = await fetch(target, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  const body = await res.text()
  if (!res.ok) {
    console.error('publish-scheduled failed', res.status, body.slice(0, 500))
    return new Response(body, { status: res.status })
  }
  console.log('publish-scheduled ok', body.slice(0, 500))
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const config: Config = {
  schedule: '@hourly',
}
