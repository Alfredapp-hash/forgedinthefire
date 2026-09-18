#!/usr/bin/env node
/**
 * Seed 52-week advocacy calendar as Studio topics + Blog + Podcast drafts.
 *
 * Source: data/advocacy-content-calendar-2026.json
 * (from Forged_in_the_Fire_Advocacy_Content_Master.xlsx)
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-advocacy-calendar.mjs
 *
 * Idempotent: skips rows whose slug already exists.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const calendar = JSON.parse(
  readFileSync(resolve(root, 'data/advocacy-content-calendar-2026.json'), 'utf8'),
)
const coverManifest = JSON.parse(
  readFileSync(resolve(root, 'public/content-covers/manifest.json'), 'utf8'),
)
const coversByCycle = new Map(coverManifest.map((c) => [c.cycle, c]))
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://forgedinthefireohio.org'

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function blogBlocks(week) {
  return [
    {
      type: 'intro',
      data: {
        text: `Draft outline for “${week.blog_title}” — Cycle ${week.cycle}, Week ${week.week} (${week.theme}). Survivor-centered; no graphic detail.`,
      },
    },
    {
      type: 'heading',
      data: { text: 'Why this matters', level: 2 },
    },
    {
      type: 'text',
      data: {
        content: `<p>Theme: <strong>${week.theme}</strong>.</p><p>Write for helping professionals, community members, and survivors seeking clarity—not spectacle.</p>`,
      },
    },
    {
      type: 'heading',
      data: { text: 'Key points to cover', level: 2 },
    },
    {
      type: 'checklist',
      data: {
        title: 'Outline',
        items: [
          { text: `Open with the lived reality of: ${week.theme}` },
          { text: 'Define terms in plain language' },
          { text: 'Name common misconceptions without graphic examples' },
          { text: 'Offer practical takeaways for advocates / community' },
          { text: `Close with CTA: ${week.cta || 'Learn more and get help'}` },
        ],
      },
    },
    {
      type: 'heading',
      data: { text: 'Cross-platform notes', level: 2 },
    },
    {
      type: 'text',
      data: {
        content: `<p><strong>Short-form:</strong> ${week.tiktok || '—'}</p><p><strong>Facebook:</strong> ${week.facebook || '—'}</p><p><strong>YouTube:</strong> ${week.youtube || '—'}</p><p><strong>Guest / format:</strong> ${week.guest_format || '—'}</p>`,
      },
    },
    {
      type: 'cta',
      data: {
        text: week.cta || 'Get help',
        url: '/get-help',
        style: 'primary',
      },
    },
  ]
}

function podcastSummary(week) {
  return [
    `Cycle ${week.cycle} · ${week.theme}.`,
    week.guest_format ? `Format: ${week.guest_format}.` : '',
    week.cta ? `CTA: ${week.cta}.` : '',
    'Dignity first. No spectacle. Draft for recording — not published.',
  ]
    .filter(Boolean)
    .join(' ')
}

async function existingSlugs(table, column = 'slug') {
  const { data, error } = await supabase.from(table).select(column)
  if (error) throw error
  return new Set((data || []).map((r) => r[column]))
}

async function main() {
  const releases = calendar.weeks.filter((w) => w.purpose === 'Release week')
  const followups = calendar.weeks.filter((w) => w.purpose === 'Follow-up week')

  console.log(`Calendar: ${calendar.weeks.length} weeks · ${releases.length} release packages`)
  console.log(`Covers loaded: ${coversByCycle.size}`)

  let contentSlugs
  let topicSlugs
  let episodeSlugs
  try {
    console.log('Loading existing slugs…')
    ;[contentSlugs, topicSlugs, episodeSlugs] = await Promise.all([
      existingSlugs('content'),
      existingSlugs('content_topics'),
      existingSlugs('podcast_episodes'),
    ])
    console.log(`Existing content=${contentSlugs.size} topics=${topicSlugs.size} episodes=${episodeSlugs.size}`)
  } catch (err) {
    console.error('Could not read tables — apply studio migrations first:', err.message)
    process.exit(1)
  }

  const stats = { topics: 0, blogs: 0, episodes: 0, clips: 0, skipped: 0 }

  for (const week of releases) {
    const topicSlug = slugify(`c${week.cycle}-${week.theme}`)
    const blogSlug = slugify(week.blog_title)
    const epSlug = slugify(week.podcast_title)
    const covers = coversByCycle.get(week.cycle)
    const blogCover = covers ? `${SITE}${covers.blog}` : null
    const podCover = covers ? `${SITE}${covers.podcast}` : null
    console.log(`→ Cycle ${week.cycle}: ${week.theme}`)

    // --- Topic ---
    let topicId = null
    if (topicSlugs.has(topicSlug)) {
      const { data } = await supabase
        .from('content_topics')
        .select('id')
        .eq('slug', topicSlug)
        .maybeSingle()
      topicId = data?.id || null
      stats.skipped++
    } else {
      const talking = [
        week.theme,
        week.cta,
        `Short-form: ${week.tiktok}`,
        `Guest/format: ${week.guest_format}`,
      ].filter(Boolean)
      const { data, error } = await supabase
        .from('content_topics')
        .insert({
          title: `Cycle ${week.cycle}: ${week.theme}`,
          slug: topicSlug,
          summary: `Release week ${week.week} · Blog “${week.blog_title}” · Podcast “${week.podcast_title}”`,
          talking_points: talking,
          scheduled_on: week.blog_date,
          status: 'planned',
          created_by: 'calendar-seed',
        })
        .select('id')
        .single()
      if (error) {
        console.error('Topic insert failed', topicSlug, error.message)
      } else {
        topicId = data.id
        topicSlugs.add(topicSlug)
        stats.topics++
      }
    }

    // --- Blog ---
    let blogId = null
    if (contentSlugs.has(blogSlug)) {
      const { data } = await supabase.from('content').select('id').eq('slug', blogSlug).maybeSingle()
      blogId = data?.id || null
      stats.skipped++
    } else {
      const { data, error } = await supabase
        .from('content')
        .insert({
          title: week.blog_title,
          slug: blogSlug,
          template: 'resource-guide',
          category: 'resources',
          tags: ['advocacy-calendar', `cycle-${week.cycle}`, week.theme],
          excerpt: `${week.theme}. Matched podcast: “${week.podcast_title}”. Scheduled ${week.blog_date}.`,
          blocks: blogBlocks(week),
          seo: {
            title: week.blog_title,
            description: `Forged in the Fire — ${week.theme}. ${week.cta || ''}`.slice(0, 160),
          },
          status: 'scheduled',
          scheduled_for: `${week.blog_date}T14:00:00.000Z`,
          featured: false,
          featured_image: blogCover
            ? { id: `cover-c${week.cycle}-blog`, url: covers.blog, alt: `${week.blog_title} — Forged in the Fire` }
            : null,
          author_name: 'Forged in the Fire',
          topic_id: topicId,
        })
        .select('id')
        .single()
      if (error) {
        // fallback without topic_id / scheduled if columns missing
        console.warn('Blog insert retry', blogSlug, error.message)
        const { data: d2, error: e2 } = await supabase
          .from('content')
          .insert({
            title: week.blog_title,
            slug: blogSlug,
            template: 'resource-guide',
            category: 'resources',
            tags: ['advocacy-calendar', `cycle-${week.cycle}`],
            excerpt: `${week.theme}. Matched podcast: “${week.podcast_title}”.`,
            blocks: blogBlocks(week),
            featured_image: blogCover
              ? { src: covers.blog, alt: week.blog_title, url: covers.blog }
              : null,
            status: 'draft',
            author_name: 'Forged in the Fire',
          })
          .select('id')
          .single()
        if (e2) console.error('Blog insert failed', blogSlug, e2.message)
        else {
          blogId = d2.id
          contentSlugs.add(blogSlug)
          stats.blogs++
        }
      } else {
        blogId = data.id
        contentSlugs.add(blogSlug)
        stats.blogs++
      }
    }

    if (topicId && blogId) {
      await supabase.from('content_topics').update({ blog_post_id: blogId }).eq('id', topicId)
    }

    // --- Podcast episode ---
    if (episodeSlugs.has(epSlug)) {
      stats.skipped++
    } else {
      const insert = {
        topic_id: topicId,
        title: week.podcast_title,
        slug: epSlug,
        summary: podcastSummary(week),
        season: 1,
        episode_number: week.cycle,
        status: 'draft',
        cover_url: covers?.podcast || null,
        created_by: 'calendar-seed',
      }
      // Prefer richer fields when enterprise migration is applied
      const rich = {
        ...insert,
        show_notes: [
          `## ${week.podcast_title}`,
          ``,
          `**Theme:** ${week.theme}`,
          `**Format / guest:** ${week.guest_format || 'TBD'}`,
          `**Matched blog:** ${week.blog_title}`,
          `**CTA:** ${week.cta || '—'}`,
        ].join('\n'),
        episode_type: 'full',
        visibility: 'public',
        status: 'scheduled',
        scheduled_for: week.podcast_date ? `${week.podcast_date}T16:00:00.000Z` : null,
      }
      let { error } = await supabase.from('podcast_episodes').insert(rich)
      if (error) {
        console.warn('Episode insert basic', epSlug, error.message)
        ;({ error } = await supabase.from('podcast_episodes').insert(insert))
        if (error) console.error('Episode insert failed', epSlug, error.message)
        else {
          episodeSlugs.add(epSlug)
          stats.episodes++
        }
      } else {
        episodeSlugs.add(epSlug)
        stats.episodes++
      }
    }

    // --- Social clip stubs on topic ---
    if (topicId) {
      const { count } = await supabase
        .from('studio_clips')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topicId)
      if (!count) {
        const platforms = [
          { platform: 'tiktok', hook: week.tiktok, format: '9:16' },
          { platform: 'instagram', hook: week.tiktok, format: '9:16' },
          { platform: 'facebook', hook: week.facebook, format: '1:1' },
          { platform: 'youtube_shorts', hook: week.youtube, format: '9:16' },
        ]
        const rows = platforms.map((p) => ({
          topic_id: topicId,
          platform: p.platform,
          format: p.format,
          hook: p.hook,
          script: null,
          caption: `${week.blog_title}\n\n${week.cta || ''}\n\n#ForgedInTheFire #SurvivorSupport #NortheastOhio`,
          cta: week.cta,
          canvas: {},
          status: 'draft',
        }))
        const { error } = await supabase.from('studio_clips').insert(rows)
        if (error) console.warn('Clips insert', topicSlug, error.message)
        else stats.clips += rows.length
      }
    }
  }

  // Follow-up weeks: light topics only (promotion checklist)
  for (const week of followups) {
    const topicSlug = slugify(`c${week.cycle}-followup-w${week.week}`)
    if (topicSlugs.has(topicSlug)) {
      stats.skipped++
      continue
    }
    const { error } = await supabase.from('content_topics').insert({
      title: `Cycle ${week.cycle} follow-up: ${week.theme}`,
      slug: topicSlug,
      summary: `Promotion week ${week.week}. Podcast: ${week.podcast_title}. Blog: ${week.blog_title}.`,
      talking_points: [
        week.tiktok,
        week.facebook,
        week.youtube,
        week.cta,
      ].filter(Boolean),
      scheduled_on: week.week_of,
      status: 'idea',
      created_by: 'calendar-seed',
    })
    if (error) console.warn('Follow-up topic', topicSlug, error.message)
    else {
      topicSlugs.add(topicSlug)
      stats.topics++
    }
  }

  console.log('Done:', stats)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
