'use client'

import { nanoid } from 'nanoid'
import type { ContentItem, PostTemplate, ContentCategory, ContentStatus, SEOSettings, ContentBlock, ContentCTA } from './types'

const BASE = '/api/admin/content'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error: string }).error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function generateDefaultSEO(title: string): SEOSettings {
  return {
    title: `${title} | Forged in the Fire`,
    description: '',
    keywords: ['human trafficking advocacy', 'Lorain County Ohio', 'survivor support'],
  }
}

export async function getContentItems(
  template?: PostTemplate,
  category?: ContentCategory,
  status?: ContentStatus
): Promise<ContentItem[]> {
  const params = new URLSearchParams()
  if (template) params.append('template', template)
  if (category) params.append('category', category)
  if (status) params.append('status', status)
  const url = params.toString() ? `${BASE}?${params.toString()}` : BASE
  return apiFetch<ContentItem[]>(url)
}

export async function getContentItem(id: string): Promise<ContentItem | null> {
  try {
    return await apiFetch<ContentItem>(`${BASE}/${id}`)
  } catch {
    return null
  }
}

function generateDefaultBlocks(template: PostTemplate, title: string): ContentBlock[] {
  const now = new Date().toISOString()
  
  switch (template) {
    case 'event':
      return [
        { type: 'hero', data: { title, subtitle: 'Join us for this special event' } },
        { type: 'text', data: { content: 'Event details coming soon...' } },
        { type: 'cta', data: { text: 'Register Now', url: '/contact', style: 'primary' } }
      ]
    case 'impact-story':
      return [
        { type: 'hero', data: { title } },
        { type: 'text', data: { content: 'A story of hope and healing...' } },
        { type: 'quote', data: { text: 'This is where a powerful quote from the story would appear.' } },
        { type: 'cta', data: { text: 'Support Our Work', url: '/donate', style: 'primary' } }
      ]
    case 'volunteer-opp':
      return [
        { type: 'hero', data: { title, subtitle: 'Make a difference in your community' } },
        { type: 'text', data: { content: 'Learn about this volunteer opportunity...' } },
        { type: 'cta', data: { text: 'Apply to Volunteer', url: '/volunteer', style: 'primary' } }
      ]
    case 'fundraising':
      return [
        { type: 'hero', data: { title, subtitle: 'Help us reach our goal' } },
        { type: 'text', data: { content: 'Your support makes a difference...' } },
        { type: 'cta', data: { text: 'Donate Now', url: '/donate', style: 'primary' } }
      ]
    case 'partner-spotlight':
      return [
        { type: 'hero', data: { title } },
        { type: 'text', data: { content: 'Learn about our partnership...' } },
        { type: 'quote', data: { text: 'A quote from our partner organization.' } }
      ]
    default: // standard, donor-update, resource-guide
      return [
        { type: 'hero', data: { title } },
        { type: 'text', data: { content: '' } }
      ]
  }
}

function generateDefaultCTA(template: PostTemplate): ContentCTA | undefined {
  switch (template) {
    case 'event':
      return { type: 'event', text: 'Learn More About This Event', url: '/events' }
    case 'impact-story':
      return { type: 'donate', text: 'Support Survivors', url: '/donate' }
    case 'volunteer-opp':
      return { type: 'volunteer', text: 'Join Our Team', url: '/volunteer' }
    case 'fundraising':
      return { type: 'donate', text: 'Contribute to This Campaign', url: '/donate' }
    default:
      return { type: 'learn-more', text: 'Learn More', url: '/about' }
  }
}

function getDefaultCategory(template: PostTemplate): ContentCategory {
  switch (template) {
    case 'event': return 'events'
    case 'impact-story': return 'impact-stories'
    case 'volunteer-opp': return 'volunteer'
    case 'donor-update': return 'donor-updates'
    case 'resource-guide': return 'resources'
    case 'partner-spotlight': return 'partners'
    case 'fundraising': return 'fundraising'
    default: return 'news'
  }
}

export async function createContentItem(
  title: string,
  template: PostTemplate = 'standard',
  category?: ContentCategory
): Promise<ContentItem> {
  const now = new Date().toISOString()
  const newItem: ContentItem = {
    id: nanoid(),
    title,
    slug: slugify(title),
    template,
    category: category || getDefaultCategory(template),
    tags: [],
    status: 'draft',
    excerpt: '',
    blocks: generateDefaultBlocks(template, title),
    seo: generateDefaultSEO(title),
    cta: generateDefaultCTA(template),
    featured: false,
    sendBlogNotification: false,
    includeInNewsletter: false,
    featuredInNewsletter: false,
    createdAt: now,
    updatedAt: now,
  }
  return apiFetch<ContentItem>(BASE, { method: 'POST', body: JSON.stringify(newItem) })
}

export async function updateContentItem(
  id: string, 
  patch: Partial<ContentItem>
): Promise<ContentItem | null> {
  const slugPatch = patch.slug ?? (patch.title ? slugify(patch.title) : undefined)
  return apiFetch<ContentItem>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ 
      ...patch, 
      ...(slugPatch ? { slug: slugPatch } : {}),
      updatedAt: new Date().toISOString(),
    }),
  })
}

export async function deleteContentItem(id: string): Promise<boolean> {
  try {
    await apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' })
    return true
  } catch {
    return false
  }
}

export async function publishContentItem(id: string): Promise<ContentItem | null> {
  return updateContentItem(id, { 
    status: 'published', 
    publishedAt: new Date().toISOString() 
  })
}

export async function unpublishContentItem(id: string): Promise<ContentItem | null> {
  return updateContentItem(id, { status: 'draft', publishedAt: undefined })
}

export async function duplicateContentItem(id: string): Promise<ContentItem | null> {
  const original = await getContentItem(id)
  if (!original) return null
  
  const now = new Date().toISOString()
  const copy: ContentItem = {
    ...original,
    id: nanoid(),
    title: `${original.title} (Copy)`,
    slug: `${original.slug}-copy-${Date.now()}`,
    status: 'draft',
    featured: false,
    publishedAt: undefined,
    createdAt: now,
    updatedAt: now,
  }
  
  return apiFetch<ContentItem>(BASE, { method: 'POST', body: JSON.stringify(copy) })
}

export async function archiveContentItem(id: string): Promise<ContentItem | null> {
  return updateContentItem(id, { status: 'archived' })
}
