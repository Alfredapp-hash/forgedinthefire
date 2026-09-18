import { NextResponse } from 'next/server'
import { formatDuration, getDefaultShow, getPublishedEpisodes, showToMeta, escapeXml } from '@/lib/podcast'

export const dynamic = 'force-dynamic'

export async function GET() {
  const show = await getDefaultShow()
  const meta = showToMeta(show)
  const episodes = (await getPublishedEpisodes()).slice(0, 5)
  const items = episodes.map((ep) => `
    <li style="margin:0 0 12px">
      <p style="margin:0 0 4px;font-size:14px">${escapeXml(ep.title)}</p>
      ${ep.audio_url ? `<audio controls preload="none" src="${escapeXml(ep.audio_url)}" style="width:100%"></audio>` : ''}
      <p style="margin:4px 0 0;font-size:11px;color:#A9B8C6">${escapeXml(formatDuration(ep.duration_seconds))}</p>
    </li>`).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeXml(meta.title)} Embed</title>
  <style>
    body{margin:0;background:#05070A;color:#F6FAFC;font-family:Georgia,serif}
  </style>
</head>
<body>
  <div style="padding:16px;border:1px solid #27313B;border-radius:12px;background:#151B22">
    <p style="margin:0;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8DEBFF">Podcast</p>
    <h1 style="margin:6px 0 12px;font-size:18px">${escapeXml(meta.title)}</h1>
    ${episodes.length ? `<ul style="list-style:none;margin:0;padding:0">${items}</ul>` : '<p style="color:#A9B8C6;font-size:14px">No published episodes yet.</p>'}
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
    },
  })
}
