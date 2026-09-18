#!/usr/bin/env node
/**
 * Generate Forged-brand cover images for each advocacy calendar topic.
 * Topic text is the hero. Blog / podcast variants keep the same topic
 * and add the release-specific title as secondary copy.
 *
 * Outputs under public/content-covers/:
 *   - topic  1080×1080  (Studio calendar / social)
 *   - podcast 1400×1400
 *   - blog    1200×630  (OG / featured)
 *
 * Usage: node scripts/generate-advocacy-covers.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const calendar = JSON.parse(
  readFileSync(resolve(root, 'data/advocacy-content-calendar-2026.json'), 'utf8'),
)
const outDir = resolve(root, 'public/content-covers')
mkdirSync(outDir, { recursive: true })

const INK = '#05070A'
const PANEL = '#0C141C'
const ICE = '#53D6FF'
const GLOW = '#8DEBFF'
const PAPER = '#F6FAFC'
const MUTE = '#B8C4CF'

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function wrapTitle(title, maxChars = 22, maxLines = 4) {
  const words = String(title).split(/\s+/).filter(Boolean)
  const lines = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length > maxChars && cur) {
      lines.push(cur)
      cur = w
      if (lines.length >= maxLines) break
    } else {
      cur = next
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  const joined = lines.join(' ')
  if (lines.length === maxLines && words.join(' ').length > joined.length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\.?$/, '…')
  }
  return lines.slice(0, maxLines)
}

function coverSvg({
  width,
  height,
  cycle,
  theme,
  subtitle,
  kind, // 'topic' | 'podcast' | 'blog'
}) {
  const square = width === height
  const topicChars = square ? 18 : 26
  const topicLines = wrapTitle(theme, topicChars, 4)
  const topicFont = Math.round(width * (square ? 0.072 : 0.052))
  const topicStartY = Math.round(height * (square ? 0.4 : 0.38))
  const topicLineH = Math.round(topicFont * 1.18)
  const topicTspans = topicLines
    .map((line, i) => `<tspan x="${Math.round(width * 0.08)}" dy="${i === 0 ? 0 : topicLineH}">${escapeXml(line)}</tspan>`)
    .join('')

  const subLines = subtitle ? wrapTitle(subtitle, square ? 28 : 36, 2) : []
  const subFont = Math.round(width * (square ? 0.028 : 0.024))
  const subStartY = topicStartY + topicLines.length * topicLineH + Math.round(height * 0.04)
  const subTspans = subLines
    .map((line, i) => `<tspan x="${Math.round(width * 0.08)}" dy="${i === 0 ? 0 : Math.round(subFont * 1.25)}">${escapeXml(line)}</tspan>`)
    .join('')

  const kindLabel =
    kind === 'topic' ? 'TOPIC' : kind === 'podcast' ? 'PODCAST' : 'BLOG'

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${INK}"/>
      <stop offset="55%" stop-color="${PANEL}"/>
      <stop offset="100%" stop-color="#061018"/>
    </linearGradient>
    <radialGradient id="ember" cx="85%" cy="15%" r="55%">
      <stop offset="0%" stop-color="${ICE}" stop-opacity="0.35"/>
      <stop offset="45%" stop-color="${GLOW}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${INK}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ICE}"/>
      <stop offset="100%" stop-color="${GLOW}" stop-opacity="0.4"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#ember)"/>
  <rect x="0" y="0" width="${Math.round(width * 0.012)}" height="100%" fill="${ICE}"/>
  <rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.3)}" width="${Math.round(width * 0.18)}" height="3" fill="url(#bar)"/>

  <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.14)}"
    font-family="Georgia, 'Times New Roman', serif" font-size="${Math.round(width * 0.028)}"
    letter-spacing="0.22em" fill="${GLOW}">FORGED IN THE FIRE</text>

  <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.22)}"
    font-family="system-ui, -apple-system, sans-serif" font-size="${Math.round(width * 0.022)}"
    letter-spacing="0.16em" fill="${MUTE}">${kindLabel} · CYCLE ${cycle}</text>

  <text y="${topicStartY}"
    font-family="Georgia, 'Times New Roman', serif" font-size="${topicFont}"
    font-weight="700" fill="${PAPER}">${topicTspans}</text>

  ${
    subtitle
      ? `<text y="${subStartY}"
    font-family="system-ui, -apple-system, sans-serif" font-size="${subFont}"
    fill="${ICE}">${subTspans}</text>`
      : ''
  }

  <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.92)}"
    font-family="system-ui, -apple-system, sans-serif" font-size="${Math.round(width * 0.018)}"
    fill="${MUTE}">Dignity first · No spectacle · forgedinthefireohio.org</text>
</svg>`
}

async function renderOne(week) {
  const base = `cycle-${String(week.cycle).padStart(2, '0')}-${slugify(week.theme)}`
  const mark = sharp(resolve(root, 'public/brand/fitf-mark.png')).resize(160, 240, { fit: 'inside' })

  const jobs = [
    {
      kind: 'topic',
      subtitle: null,
      w: 1080,
      h: 1080,
      file: `${base}-topic.png`,
      markLeft: 860,
      markTop: 60,
    },
    {
      kind: 'podcast',
      subtitle: week.podcast_title,
      w: 1400,
      h: 1400,
      file: `${base}-podcast.png`,
      markLeft: 1120,
      markTop: 80,
    },
    {
      kind: 'blog',
      subtitle: week.blog_title,
      w: 1200,
      h: 630,
      file: `${base}-blog.png`,
      markLeft: 1000,
      markTop: 40,
    },
  ]

  const paths = {}
  for (const job of jobs) {
    const svg = coverSvg({
      width: job.w,
      height: job.h,
      cycle: week.cycle,
      theme: week.theme,
      subtitle: job.subtitle,
      kind: job.kind,
    })
    const markBuf = await mark.clone().toBuffer()
    const buf = await sharp(Buffer.from(svg))
      .png()
      .composite([{ input: markBuf, left: job.markLeft, top: job.markTop, blend: 'over' }])
      .toBuffer()
    const abs = resolve(outDir, job.file)
    writeFileSync(abs, buf)
    paths[job.kind] = `/content-covers/${job.file}`
  }
  return { cycle: week.cycle, theme: week.theme, ...paths }
}

async function main() {
  const releases = calendar.weeks.filter((w) => w.purpose === 'Release week')
  const manifest = []
  for (const week of releases) {
    const row = await renderOne(week)
    manifest.push(row)
    console.log(`cover cycle ${week.cycle}: ${row.topic}`)
  }
  writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`Wrote ${manifest.length * 3} covers → public/content-covers/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
