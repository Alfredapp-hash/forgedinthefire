import type { ContentItem, ContentStatus } from '@/src/features/content/types'

/** Map ContentItem (camelCase) to Supabase row (snake_case) */
export function contentToDb(patch: Partial<ContentItem> & { publishedAt?: string | null }): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  // Only accept real UUIDs — never client nanoids
  if (patch.id !== undefined) {
    const id = String(patch.id)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      row.id = id
    }
  }
  if (patch.title !== undefined) row.title = patch.title
  if (patch.slug !== undefined) row.slug = patch.slug
  if (patch.template !== undefined) row.template = patch.template
  if (patch.category !== undefined) row.category = patch.category
  if (patch.tags !== undefined) row.tags = patch.tags
  if (patch.excerpt !== undefined) row.excerpt = patch.excerpt
  if (patch.blocks !== undefined) row.blocks = patch.blocks
  if (patch.featuredImage !== undefined) row.featured_image = patch.featuredImage
  if (patch.galleryImages !== undefined) row.gallery_images = patch.galleryImages
  if (patch.seo !== undefined) row.seo = patch.seo
  if (patch.cta !== undefined) row.cta = patch.cta
  if (patch.status !== undefined) row.status = patch.status
  if (patch.featured !== undefined) row.featured = patch.featured
  if (patch.authorName !== undefined) row.author_name = patch.authorName
  if (patch.authorId !== undefined) row.author_id = patch.authorId
  if (patch.sendBlogNotification !== undefined) row.send_blog_notification = patch.sendBlogNotification
  if (patch.notificationSentAt !== undefined) row.notification_sent_at = patch.notificationSentAt
  if (patch.emailSubject !== undefined) row.email_subject = patch.emailSubject
  if (patch.emailExcerpt !== undefined) row.email_excerpt = patch.emailExcerpt
  if (patch.includeInNewsletter !== undefined) row.include_in_newsletter = patch.includeInNewsletter
  if (patch.featuredInNewsletter !== undefined) row.featured_in_newsletter = patch.featuredInNewsletter
  if (patch.newsletterCategory !== undefined) row.newsletter_category = patch.newsletterCategory
  if (patch.createdAt !== undefined) row.created_at = patch.createdAt
  if (patch.updatedAt !== undefined) row.updated_at = patch.updatedAt
  if (patch.publishedAt !== undefined) row.published_at = patch.publishedAt
  if (patch.scheduledFor !== undefined) row.scheduled_for = patch.scheduledFor
  if (patch.consentConfirmed !== undefined) row.consent_confirmed = patch.consentConfirmed
  if (patch.topicId !== undefined) row.topic_id = patch.topicId
  return row
}

/** Map Supabase row to ContentItem */
export function contentFromDb(row: Record<string, unknown>): ContentItem {
  return {
    id: row.id as string,
    title: row.title as string,
    slug: row.slug as string,
    template: row.template as ContentItem['template'],
    category: row.category as ContentItem['category'],
    tags: (row.tags as string[]) || [],
    excerpt: (row.excerpt as string) || '',
    blocks: (row.blocks as ContentItem['blocks']) || [],
    featuredImage: row.featured_image as ContentItem['featuredImage'],
    galleryImages: (row.gallery_images as ContentItem['galleryImages']) || [],
    seo: (row.seo as ContentItem['seo']) || {},
    cta: row.cta as ContentItem['cta'],
    status: row.status as ContentStatus,
    featured: Boolean(row.featured),
    authorName: row.author_name as string | undefined,
    authorId: row.author_id as string | undefined,
    sendBlogNotification: Boolean(row.send_blog_notification),
    notificationSentAt: row.notification_sent_at as string | undefined,
    emailSubject: row.email_subject as string | undefined,
    emailExcerpt: row.email_excerpt as string | undefined,
    includeInNewsletter: Boolean(row.include_in_newsletter),
    featuredInNewsletter: Boolean(row.featured_in_newsletter),
    newsletterCategory: row.newsletter_category as string | undefined,
    consentConfirmed: Boolean(row.consent_confirmed),
    topicId: (row.topic_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    publishedAt: row.published_at as string | undefined,
    scheduledFor: row.scheduled_for as string | undefined,
  }
}
