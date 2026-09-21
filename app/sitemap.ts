import { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

const baseUrl = 'https://forgedinthefireohio.org'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticLastmod = new Date().toISOString()

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: staticLastmod,
      changeFrequency: 'weekly',
      priority: 1,
      images: [`${baseUrl}/brand/fitf-lockup.png`, `${baseUrl}/opengraph-image.jpeg`],
    },
    { url: `${baseUrl}/get-help`, lastModified: staticLastmod, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/services`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/services/victim-advocacy`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/services/workforce-development`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/services/mentorship`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/services/community-education`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/services/accountability`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/about`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/resources`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/donate`, lastModified: staticLastmod, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/campaigns`, lastModified: staticLastmod, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/volunteer`, lastModified: staticLastmod, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/contact`, lastModified: staticLastmod, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/blog`, lastModified: staticLastmod, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${baseUrl}/podcast`, lastModified: staticLastmod, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${baseUrl}/privacy`, lastModified: staticLastmod, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: staticLastmod, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/accessibility`, lastModified: staticLastmod, changeFrequency: 'yearly', priority: 0.3 },
  ]

  const dynamic: MetadataRoute.Sitemap = []
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (url && key) {
    try {
      const supabase = createClient(url, key)
      const [{ data: posts }, { data: episodes }, { data: campaigns }] = await Promise.all([
        supabase
          .from('content')
          .select('slug, published_at, updated_at')
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(500),
        supabase
          .from('podcast_episodes')
          .select('slug, published_at, updated_at, visibility')
          .eq('status', 'published')
          .neq('visibility', 'private')
          .order('published_at', { ascending: false })
          .limit(200),
        supabase
          .from('fundraising_campaigns')
          .select('slug, published_at, updated_at')
          .eq('status', 'live')
          .order('published_at', { ascending: false })
          .limit(100),
      ])

      for (const post of posts ?? []) {
        if (!post.slug) continue
        dynamic.push({
          url: `${baseUrl}/blog/${post.slug}`,
          lastModified: post.published_at || post.updated_at || staticLastmod,
          changeFrequency: 'monthly',
          priority: 0.7,
        })
      }
      for (const ep of episodes ?? []) {
        if (!ep.slug) continue
        dynamic.push({
          url: `${baseUrl}/podcast/${ep.slug}`,
          lastModified: ep.published_at || ep.updated_at || staticLastmod,
          changeFrequency: 'monthly',
          priority: 0.7,
        })
      }
      for (const campaign of campaigns ?? []) {
        if (!campaign.slug) continue
        dynamic.push({
          url: `${baseUrl}/campaigns/${campaign.slug}`,
          lastModified: campaign.published_at || campaign.updated_at || staticLastmod,
          changeFrequency: 'weekly',
          priority: 0.75,
        })
      }
    } catch (err) {
      console.error('Sitemap dynamic fetch failed:', err)
    }
  }

  return [...staticEntries, ...dynamic]
}
