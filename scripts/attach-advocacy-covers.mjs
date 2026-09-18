#!/usr/bin/env node
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
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

function slugify(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

const releases = calendar.weeks.filter((w) => w.purpose === 'Release week')
let blogs = 0, episodes = 0
for (const week of releases) {
  const c = byCycle.get(week.cycle)
  if (!c) continue
  const blogSlug = slugify(week.blog_title)
  const epSlug = slugify(week.podcast_title)
  const featured_image = { id: randomUUID(), url: c.blog, alt: `${week.blog_title} — Forged in the Fire` }
  const { data: bData, error: bErr } = await supabase.from('content').update({ featured_image }).eq('slug', blogSlug).select('id')
  if (bErr) console.warn('blog', blogSlug, bErr.message)
  else if (bData?.length) blogs++
  const { data: eData, error: eErr } = await supabase.from('podcast_episodes').update({ cover_url: c.podcast }).eq('slug', epSlug).select('id')
  if (eErr) console.warn('episode', epSlug, eErr.message)
  else if (eData?.length) episodes++
}
console.log({ blogs, episodes })
