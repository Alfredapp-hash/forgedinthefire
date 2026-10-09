import { NextResponse } from 'next/server'
import {
  escapeXml,
  formatDuration,
  getDefaultShow,
  getPublishedEpisode,
  getPublishedEpisodes,
  showToMeta,
} from '@/lib/podcast'

export const dynamic = 'force-dynamic'

/**
 * Embeddable player: /podcast/embed (latest 5) or /podcast/embed?episode=<slug>.
 * CSP frame-ancestors overrides the site-wide X-Frame-Options: DENY in modern browsers.
 */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('episode')
  const show = await getDefaultShow()
  const meta = showToMeta(show)
  const single = slug ? await getPublishedEpisode(slug) : null
  const episodes = single ? [single] : (await getPublishedEpisodes()).slice(0, 5)
  const items = episodes.map((ep) => `
    <li style="margin:0 0 14px">
      <a href="${escapeXml(`${meta.site}/podcast/${ep.slug}`)}" target="_blank" rel="noopener" style="color:#F6FAFC;text-decoration:none;font-size:15px">${escapeXml(ep.title)}</a>
      ${ep.audio_url ? `<audio controls preload="none" data-ep="${escapeXml(ep.id)}" src="${escapeXml(ep.audio_url)}" style="width:100%;margin-top:6px"></audio>` : ''}
      <p style="margin:4px 0 0;font-size:11px;color:#A9B8C6">${escapeXml(formatDuration(ep.duration_seconds))}</p>
    </li>`).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${escapeXml(meta.title)} Podcast Player</title>
  <style>body{margin:0;background:#05070A;color:#F6FAFC;font-family:Georgia,serif}</style>
</head>
<body>
  <div style="padding:16px;border:1px solid #27313B;border-radius:12px;background:#151B22">
    <p style="margin:0;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8DEBFF">Podcast</p>
    <h1 style="margin:6px 0 12px;font-size:18px"><a href="${escapeXml(meta.page)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${escapeXml(meta.title)}</a></h1>
    ${episodes.length ? `<ul style="list-style:none;margin:0;padding:0">${items}</ul>` : '<p style="color:#A9B8C6;font-size:14px">No published episodes yet.</p>'}
  </div>
  <script>
    document.querySelectorAll('audio[data-ep]').forEach(function (a) {
      a.addEventListener('play', function once() {
        a.removeEventListener('play', once);
        fetch('/api/podcast/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
          body: JSON.stringify({ episode_id: a.dataset.ep, event_type: 'embed_play' }) }).catch(function () {});
      });
    });
  </script>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
      'Content-Security-Policy': "frame-ancestors *",
    },
  })
}
