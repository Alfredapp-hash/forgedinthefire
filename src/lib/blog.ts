import { createClient } from '@/lib/supabase/server'
import { contentFromDb } from '@/lib/content-db'
import type { ContentItem, ContentCategory, PostTemplate } from '@/src/features/content/types'

/**
 * Fetch all published blog posts
 */
export async function getBlogPosts(
  options?: {
    category?: ContentCategory
    template?: PostTemplate
    featured?: boolean
    limit?: number
  }
): Promise<ContentItem[]> {
  const supabase = await createClient()
  
  // If Supabase client is null (env vars missing), return empty array gracefully
  if (!supabase) {
    console.warn('Supabase client unavailable - returning empty blog posts')
    return []
  }
  
  let query = supabase
    .from('content')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  
  if (options?.category) {
    query = query.eq('category', options.category)
  }
  
  if (options?.template) {
    query = query.eq('template', options.template)
  }
  
  if (options?.featured) {
    query = query.eq('featured', true)
  }
  
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Error fetching blog posts:', error)
    return []
  }
  
  return (data || []).map(transformContentRow)
}

/**
 * Fetch a single blog post by slug
 */
export async function getBlogPost(slug: string): Promise<ContentItem | null> {
  const supabase = await createClient()
  
  // If Supabase client is null, return null gracefully
  if (!supabase) {
    console.warn('Supabase client unavailable - cannot fetch blog post')
    return null
  }
  
  const { data, error } = await supabase
    .from('content')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()
  
  if (error || !data) {
    console.error('Error fetching blog post:', error)
    return null
  }
  
  return transformContentRow(data)
}

/**
 * Fetch related posts (same category, excluding current)
 */
export async function getRelatedPosts(
  currentId: string,
  category: ContentCategory,
  limit: number = 3
): Promise<ContentItem[]> {
  const supabase = await createClient()
  
  // If Supabase client is null, return empty array gracefully
  if (!supabase) {
    console.warn('Supabase client unavailable - returning empty related posts')
    return []
  }
  
  const { data, error } = await supabase
    .from('content')
    .select('*')
    .eq('status', 'published')
    .eq('category', category)
    .neq('id', currentId)
    .order('published_at', { ascending: false })
    .limit(limit)
  
  if (error) {
    console.error('Error fetching related posts:', error)
    return []
  }
  
  return (data || []).map(transformContentRow)
}

/**
 * Transform database row to ContentItem
 */
function transformContentRow(row: Record<string, unknown>): ContentItem {
  return contentFromDb(row)
}

/**
 * Get category display label
 */
export function getCategoryLabel(category: ContentCategory): string {
  const labels: Record<ContentCategory, string> = {
    'news': 'News',
    'events': 'Events',
    'impact-stories': 'Impact Stories',
    'volunteer': 'Volunteer',
    'donor-updates': 'Donor Updates',
    'resources': 'Resources',
    'partners': 'Partners',
    'fundraising': 'Fundraising',
  }
  return labels[category] || category
}

/**
 * Get template display label
 */
export function getTemplateLabel(template: PostTemplate): string {
  const labels: Record<PostTemplate, string> = {
    'standard': 'Article',
    'event': 'Event',
    'impact-story': 'Impact Story',
    'volunteer-opp': 'Volunteer Opportunity',
    'donor-update': 'Update',
    'resource-guide': 'Resource',
    'partner-spotlight': 'Partner',
    'fundraising': 'Campaign',
  }
  return labels[template] || template
}

/**
 * Format date for display
 */
export function formatDate(dateString?: string | null): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
