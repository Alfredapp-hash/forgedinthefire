import { nanoid } from 'nanoid'
import type { ContentBlock, ContentBlockType } from './types'

export type BlockCategory = 'content' | 'media' | 'cta' | 'layout' | 'social' | 'data'

export type BlockMeta = {
  type: ContentBlockType
  label: string
  icon: string
  category: BlockCategory
  createDefault: () => ContentBlock
}

export const BLOCK_REGISTRY: BlockMeta[] = [
  { type: 'hero', label: 'Hero', icon: '🎯', category: 'content', createDefault: () => ({ type: 'hero', data: { title: '', subtitle: '' } }) },
  { type: 'intro', label: 'Introduction', icon: '📝', category: 'content', createDefault: () => ({ type: 'intro', data: { text: '' } }) },
  { type: 'heading', label: 'Heading', icon: 'H', category: 'content', createDefault: () => ({ type: 'heading', data: { text: '', level: 2 } }) },
  { type: 'text', label: 'Rich Text', icon: '¶', category: 'content', createDefault: () => ({ type: 'text', data: { content: '' } }) },
  { type: 'quickAnswer', label: 'Quick Answer', icon: '💡', category: 'content', createDefault: () => ({ type: 'quickAnswer', data: { question: '', answer: '' } }) },
  { type: 'checklist', label: 'Checklist', icon: '☑', category: 'content', createDefault: () => ({ type: 'checklist', data: { title: '', items: [{ text: '' }] } }) },
  { type: 'faq', label: 'FAQ', icon: '❓', category: 'content', createDefault: () => ({ type: 'faq', data: { items: [{ question: '', answer: '' }] } }) },
  { type: 'quote', label: 'Quote', icon: '💬', category: 'social', createDefault: () => ({ type: 'quote', data: { text: '' } }) },
  { type: 'testimonial', label: 'Testimonial', icon: '⭐', category: 'social', createDefault: () => ({ type: 'testimonial', data: { text: '', author: '' } }) },
  { type: 'teamMember', label: 'Team Member', icon: '👤', category: 'social', createDefault: () => ({ type: 'teamMember', data: { name: '', role: '' } }) },
  { type: 'imageText', label: 'Image + Text', icon: '🖼', category: 'media', createDefault: () => ({ type: 'imageText', data: { image: '', imageAlt: '', imagePosition: 'left', content: '' } }) },
  { type: 'gallery', label: 'Gallery', icon: '📷', category: 'media', createDefault: () => ({ type: 'gallery', data: { images: [] } }) },
  { type: 'video', label: 'Video', icon: '▶', category: 'media', createDefault: () => ({ type: 'video', data: { url: '' } }) },
  { type: 'beforeAfter', label: 'Before / After', icon: '↔', category: 'media', createDefault: () => ({ type: 'beforeAfter', data: { beforeImage: '', afterImage: '', beforeLabel: 'Before', afterLabel: 'After' } }) },
  { type: 'cta', label: 'Call to Action', icon: '🔔', category: 'cta', createDefault: () => ({ type: 'cta', data: { text: 'Learn More', url: '/contact', style: 'primary' } }) },
  { type: 'contactForm', label: 'Contact Form', icon: '📋', category: 'cta', createDefault: () => ({ type: 'contactForm', data: { heading: 'Get in Touch', formType: 'contact' } }) },
  { type: 'relatedResources', label: 'Related Resources', icon: '🔗', category: 'data', createDefault: () => ({ type: 'relatedResources', data: { title: 'Related Resources', items: [{ title: '', url: '' }] } }) },
  { type: 'stats', label: 'Impact Stats', icon: '📊', category: 'data', createDefault: () => ({ type: 'stats', data: { items: [{ value: '100+', label: 'Survivors Served' }] } }) },
  { type: 'map', label: 'Map / Location', icon: '📍', category: 'data', createDefault: () => ({ type: 'map', data: { heading: 'Our Service Area', address: 'Lorain County, Ohio' } }) },
  { type: 'divider', label: 'Divider', icon: '—', category: 'layout', createDefault: () => ({ type: 'divider', data: { style: 'line' } }) },
]

export const BLOCK_BY_TYPE = Object.fromEntries(
  BLOCK_REGISTRY.map((b) => [b.type, b])
) as Record<ContentBlockType, BlockMeta>

export const CATEGORY_LABELS: Record<BlockCategory, string> = {
  content: 'Content',
  media: 'Media',
  cta: 'Calls to Action',
  layout: 'Layout',
  social: 'Social Proof',
  data: 'Data & Resources',
}

export function createBlock(type: ContentBlockType): ContentBlock {
  return BLOCK_BY_TYPE[type]?.createDefault() ?? { type: 'text', data: { content: '' } }
}

export function newMediaAsset(url: string, alt = '') {
  return { id: nanoid(), url, alt }
}
