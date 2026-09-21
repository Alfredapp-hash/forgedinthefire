#!/usr/bin/env node
/**
 * Attach generated covers to blog posts, podcast episodes, and Studio topics.
 *
 * Usage: node --env-file=.env.local scripts/attach-advocacy-covers.mjs
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const calendar = JSON.parse(readFileSync(resolve(root, 'data/advocacy-content-calendar-2026.json'), 'utf8'))
const covers = JSON.parse(readFileSync(resolve(root, 'public/content-covers/manifest.json'), 'utf8'))
const byCycle = new Map(covers.map((c) => [c.cycle, c]))
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://forgedinthefireohio.org'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function absUrl(path) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

const releases = calendar.weeks.filter((w) => w.purpose === 'Release week')
const followups = calendar.weeks.filter((w) => w.purpose !== 'Release week')
let blogs = 0
let episodes = 0
let topics = 0

for (const week of releases) {
  const c = byCycle.get(week.cycle)
  if (!c) continue

  const blogSlug = slugify(week.blog_title)
  const epSlug = slugify(week.podcast_title)
  const topicSlug = slugify(`c${week.cycle}-${week.theme}`)

  const featured_image = {
    id: randomUUID(),
    url: c.blog,
    alt: `${week.theme} — Forged in the Fire`,
  }
  const { data: bData, error: bErr } = await supabase
    .from('content')
    .update({ featured_image })
    .eq('slug', blogSlug)
    .select('id')
  if (bErr) console.warn('blog', blogSlug, bErr.message)
  else if (bData?.length) blogs++

  const { data: eData, error: eErr } = await supabase
    .from('podcast_episodes')
    .update({ cover_url: c.podcast })
    .eq('slug', epSlug)
    .select('id')
  if (eErr) console.warn('episode', epSlug, eErr.message)
  else if (eData?.length) episodes++

  const topicCover = absUrl(c.topic || c.podcast)
  const { data: tData, error: tErr } = await supabase
    .from('content_topics')
    .update({ cover_url: topicCover })
    .eq('slug', topicSlug)
    .select('id')
  if (tErr) {
    if (!String(tErr.message).includes('cover_url')) console.warn('topic', topicSlug, tErr.message)
  } else if (tData?.length) topics++
}

let topicColMissing = false
for (const week of followups) {
  const c = byCycle.get(week.cycle)
  if (!c) continue
  const followSlug = slugify(`c${week.cycle}-followup-w${week.week}`)
  const topicCover = absUrl(c.topic || c.podcast)
  const { data: tData, error: tErr } = await supabase
    .from('content_topics')
    .update({ cover_url: topicCover })
    .eq('slug', followSlug)
    .select('id')
  if (tErr) {
    if (String(tErr.message).includes('cover_url')) topicColMissing = true
    else console.warn('followup', followSlug, tErr.message)
  } else if (tData?.length) topics++
}

console.log({ blogs, episodes, topics })
if (topicColMissing) {
  console.log('Note: run supabase/migrations/20260918_content_topics_cover.sql to persist topic cover_url (Studio still resolves covers from public/content-covers/manifest.json).')
}
