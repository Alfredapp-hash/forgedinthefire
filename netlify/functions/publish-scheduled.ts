function env(name: string) {
  try {
    const fromNetlify = (globalThis as { Netlify?: { env?: { get?: (key: string) => string | undefined } } }).Netlify?.env?.get?.(name)
    if (fromNetlify) return fromNetlify
  } catch {
    // Netlify.env is only present in the Functions runtime
  }
  return process.env[name]
}

/**
 * Scheduler that hits the Next.js cron route to publish due blog posts and
 * podcast episodes. Runs every 15 minutes so a scheduled release goes out
 * close to its time. Requires CRON_SECRET in Netlify env (same value the
 * App Router route expects as a Bearer token) — without it nothing publishes.
 */
const publishScheduled = async () => {
  const site = env('URL') || 'https://forgedinthefireohio.org'
  const secret = env('CRON_SECRET')
  if (!secret) {
    console.error('CRON_SECRET is not set — refusing to call publish-scheduled')
    return new Response(JSON.stringify({ error: 'CRON_SECRET missing' }), { status: 500 })
  }
  const target = `${site.replace(/\/$/, '')}/api/cron/publish-scheduled`

  const res = await fetch(target, {
    method: 'POST',
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

export default publishScheduled

export const config = {
  schedule: '*/15 * * * *',
}
