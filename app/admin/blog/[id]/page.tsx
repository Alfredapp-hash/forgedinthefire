'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  getContentItem, 
  updateContentItem, 
  publishContentItem, 
  unpublishContentItem 
} from '@/src/features/content/store'
import SEOPanel from '@/src/features/content/SEOPanel'
import BlockEditor from '@/src/features/content/BlockEditor'
import AddSectionMenu from '@/src/features/content/AddSectionMenu'
import BlogPostPreview from '@/src/features/content/BlogPostPreview'
import BlogPublishingChecklist from '@/src/features/content/BlogPublishingChecklist'
import MediaLibraryModal from '@/src/features/content/MediaLibraryModal'
import { createBlock } from '@/src/features/content/blockRegistry'
import { useAutosave, type SaveState } from '@/src/features/content/useAutosave'
import type { ContentItem, ContentBlock, ContentCategory, ContentCTA, ContentBlockType } from '@/src/features/content/types'
import { 
  ArrowLeft, 
  Save, 
  Eye, 
  CheckCircle, 
  Clock,
  Plus,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Star,
  Mail,
  Bell,
  Send,
  Loader2,
  AlertCircle,
  Tag,
  Link as LinkIcon,
  Calendar,
  User
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const categories: { value: ContentCategory; label: string }[] = [
  { value: 'news', label: 'News' },
  { value: 'events', label: 'Events' },
  { value: 'impact-stories', label: 'Impact Stories' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'donor-updates', label: 'Donor Updates' },
  { value: 'resources', label: 'Resources' },
  { value: 'partners', label: 'Partners' },
  { value: 'fundraising', label: 'Fundraising' },
]

const ctaOptions = [
  { value: 'donate', label: 'Donate', text: 'Donate Now', url: '/donate' },
  { value: 'volunteer', label: 'Volunteer', text: 'Become a Volunteer', url: '/volunteer' },
  { value: 'contact', label: 'Contact', text: 'Contact Us', url: '/contact' },
  { value: 'event', label: 'Event', text: 'Learn More', url: '/events' },
  { value: 'learn-more', label: 'Learn More', text: 'Learn More', url: '/about' },
]

export default function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const [item, setItem] = useState<ContentItem | null>(null)
  const [originalItem, setOriginalItem] = useState<ContentItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'content' | 'seo' | 'preview'>('content')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [showMedia, setShowMedia] = useState(false)
  const [mediaCallback, setMediaCallback] = useState<((url: string) => void) | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [slugError, setSlugError] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const loadItem = async () => {
      const { id } = await params
      const data = await getContentItem(id)
      if (!data) {
        router.push('/admin/blog')
        return
      }
      setItem(data)
      setOriginalItem(JSON.parse(JSON.stringify(data))) // Deep copy for comparison
      setLastSaved(new Date(data.updatedAt))
      setLoading(false)
    }
    loadItem()
  }, [params, router])

  // Track unsaved changes
  useEffect(() => {
    if (!item || !originalItem) return
    const hasChanges = JSON.stringify(item) !== JSON.stringify(originalItem)
    setHasUnsavedChanges(hasChanges)
  }, [item, originalItem])

  // Warn about unsaved changes when leaving
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  const handleSave = useCallback(async (saveItem?: ContentItem) => {
    const target = saveItem ?? item
    if (!target || slugError) return
    setSaving(true)
    try {
      await updateContentItem(target.id, target)
      setOriginalItem(JSON.parse(JSON.stringify(target)))
      setLastSaved(new Date())
      setHasUnsavedChanges(false)
    } catch (err) {
      console.error('Save failed:', err)
      if (!saveItem) alert('Failed to save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [item, slugError])

  useAutosave(item, handleSave, setSaveState, 30000)

  const openMedia = (callback: (url: string) => void) => {
    setMediaCallback(() => callback)
    setShowMedia(true)
  }

  const handlePublish = async () => {
    if (!item || slugError) return
    // Save first if there are unsaved changes
    if (hasUnsavedChanges) {
      await handleSave()
    }
    const updated = await publishContentItem(item.id, {
      sendBlogNotification: item.sendBlogNotification,
    })
    if (updated) {
      setItem(updated)
      setOriginalItem(JSON.parse(JSON.stringify(updated)))
      setLastSaved(new Date())
    }
  }

  const handleUnpublish = async () => {
    if (!item) return
    const updated = await unpublishContentItem(item.id)
    if (updated) {
      setItem(updated)
      setOriginalItem(JSON.parse(JSON.stringify(updated)))
      setLastSaved(new Date())
    }
  }

  // Slug validation
  const validateSlug = (slug: string) => {
    if (!slug) {
      setSlugError('Slug is required')
      return false
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setSlugError('Slug can only contain lowercase letters, numbers, and hyphens')
      return false
    }
    setSlugError(null)
    return true
  }

  const handleSlugChange = (newSlug: string) => {
    if (!item) return
    validateSlug(newSlug)
    setItem({ ...item, slug: newSlug })
  }

  const updateBlock = (index: number, newBlock: ContentBlock) => {
    if (!item) return
    const newBlocks = [...item.blocks]
    newBlocks[index] = newBlock
    setItem({ ...item, blocks: newBlocks })
  }

  const updateBlockData = (index: number, dataUpdates: Record<string, unknown>) => {
    if (!item) return
    const block = item.blocks[index]
    // Use type assertion for discriminated union updates
    const updatedBlock = { 
      ...block, 
      data: { ...block.data, ...dataUpdates } 
    } as ContentBlock
    updateBlock(index, updatedBlock)
  }

  const addBlock = (type: ContentBlockType) => {
    if (!item) return
    setItem({ ...item, blocks: [...item.blocks, createBlock(type)] })
  }

  const removeBlock = (index: number) => {
    if (!item) return
    const newBlocks = item.blocks.filter((_, i) => i !== index)
    setItem({ ...item, blocks: newBlocks })
  }

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    if (!item) return
    const newBlocks = [...item.blocks]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= newBlocks.length) return
    
    const temp = newBlocks[index]
    newBlocks[index] = newBlocks[newIndex]
    newBlocks[newIndex] = temp
    setItem({ ...item, blocks: newBlocks })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#53D6FF] mx-auto mb-4" />
          <p className="text-sm text-[#A9B8C6]">Loading post...</p>
        </div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="bg-[#8DEBFF]/15 border border-[#8DEBFF]/35 rounded-2xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-[#8DEBFF] mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-[#8DEBFF] mb-2">Post Not Found</h2>
          <p className="text-[#8DEBFF] mb-4">The post you're looking for doesn't exist or has been deleted.</p>
          <Button asChild>
            <Link href="/admin/blog">Back to Blog</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link 
            href="/admin/blog" 
            className="inline-flex items-center gap-2 text-sm text-[#A9B8C6] hover:text-[#8DEBFF] transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Blog
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#F6FAFC]">Edit Post</h1>
            {hasUnsavedChanges && (
              <span className="px-2 py-1 rounded-full bg-[#53D6FF]/10 text-[#8DEBFF] text-xs font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Unsaved changes
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-[#A9B8C6]">/{item.slug}</p>
            {lastSaved && (
              <p className="text-xs text-[#7C8B97] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {item.status === 'published' ? (
            <Button
              variant="outline"
              onClick={handleUnpublish}
              disabled={saving}
              className="border-[#53D6FF]/30 text-[#8DEBFF] hover:bg-[#53D6FF]/10"
            >
              <Clock className="w-4 h-4 mr-2" />
              Unpublish
            </Button>
          ) : (
            <Button
              onClick={handlePublish}
              disabled={saving || slugError !== null}
              className="bg-[#8DEBFF]/15 hover:bg-[#8DEBFF]/15 text-white"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Publish
            </Button>
          )}
          <Button
            onClick={() => void handleSave()}
            disabled={saving || slugError !== null}
            className="bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016]"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saving ? 'Saving...' : 'Save'}
          </Button>
          {item.status === 'published' && (
            <Link
              href={`/blog/${item.slug}`}
              target="_blank"
              className="inline-flex items-center px-3 py-2 rounded-lg border border-[#27313B] text-[#A9B8C6] hover:text-[#53D6FF] hover:border-[#53D6FF] transition-colors"
            >
              <Eye className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#151B22] rounded-xl p-1 border border-[#27313B] w-fit">
        <button
          onClick={() => setActiveTab('content')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'content'
              ? 'bg-[#53D6FF] text-[#061016]'
              : 'text-[#A9B8C6] hover:bg-[#1A232C]/10'
          }`}
        >
          Content
        </button>
        <button
          onClick={() => setActiveTab('seo')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'seo'
              ? 'bg-[#53D6FF] text-[#061016]'
              : 'text-[#A9B8C6] hover:bg-[#1A232C]/10'
          }`}
        >
          SEO & Settings
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'preview'
              ? 'bg-[#53D6FF] text-[#061016]'
              : 'text-[#A9B8C6] hover:bg-[#1A232C]/10'
          }`}
        >
          Preview
        </button>
        {saveState !== 'idle' && (
          <span className="px-3 py-2 text-xs text-[#A9B8C6]">
            {saveState === 'saving' ? 'Autosaving...' : saveState === 'saved' ? 'Saved' : 'Unsaved changes'}
          </span>
        )}
      </div>

      {activeTab === 'content' && item && (
        <div className="mb-6">
          <BlogPublishingChecklist item={item} onChange={(patch) => setItem({ ...item, ...patch })} />
        </div>
      )}

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          {/* Title & Meta */}
          <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">Title</label>
              <input
                type="text"
                value={item.title}
                onChange={(e) => setItem({ ...item, title: e.target.value })}
                className="w-full text-xl font-semibold border border-[#27313B] rounded-lg px-4 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF] transition-colors"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">Category</label>
                <select
                  value={item.category}
                  onChange={(e) => setItem({ ...item, category: e.target.value as ContentCategory })}
                  className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
                >
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.featured}
                    onChange={(e) => setItem({ ...item, featured: e.target.checked })}
                    className="rounded border-[#27313B]"
                  />
                  <span className="text-sm text-[#F6FAFC]">Featured post</span>
                  <Star className={`w-4 h-4 ${item.featured ? 'text-[#8DEBFF] fill-[#8DEBFF]' : 'text-[#A9B8C6]'}`} />
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">Excerpt</label>
              <textarea
                value={item.excerpt}
                onChange={(e) => setItem({ ...item, excerpt: e.target.value })}
                placeholder="Brief summary for previews and search results..."
                rows={2}
                className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF] resize-none"
              />
              <p className="text-xs text-[#A9B8C6] mt-1">{item.excerpt?.length || 0}/160 characters</p>
            </div>

            {/* Slug */}
            <div>
              <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5 flex items-center gap-1.5">
                <LinkIcon className="w-4 h-4 text-[#A9B8C6]" />
                URL Slug
                <span className="text-xs font-normal text-[#A9B8C6]">(permanent URL)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#A9B8C6]">/blog/</span>
                <input
                  type="text"
                  value={item.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  className={`flex-1 border rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF] transition-colors ${
                    slugError ? 'border-[#8DEBFF]/35 bg-[#8DEBFF]/15' : 'border-[#27313B]'
                  }`}
                />
              </div>
              {slugError && (
                <p className="text-xs text-[#8DEBFF] mt-1">{slugError}</p>
              )}
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-[#A9B8C6]" />
                Tags
                <span className="text-xs font-normal text-[#A9B8C6]">(comma-separated)</span>
              </label>
              <input
                type="text"
                value={item.tags?.join(', ') || ''}
                onChange={(e) => setItem({ ...item, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                placeholder="e.g., survivor stories, advocacy, cleveland, housing..."
                className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
              />
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {item.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 bg-[#53D6FF]/10 text-[#53D6FF] text-xs rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Author */}
            <div>
              <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5 flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#A9B8C6]" />
                Author
              </label>
              <input
                type="text"
                value={item.authorName || ''}
                onChange={(e) => setItem({ ...item, authorName: e.target.value })}
                placeholder="e.g., Jane Smith"
                className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
              />
            </div>
          </div>

          {/* Newsletter & Email Options */}
          <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
            <div className="flex items-center gap-2 mb-4">
              <Mail className="w-5 h-5 text-[#53D6FF]" />
              <h3 className="font-medium text-[#F6FAFC]">Newsletter & Email Options</h3>
            </div>
            
            <div className="space-y-4">
              {/* Blog Notification Toggle */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.sendBlogNotification}
                  onChange={(e) => setItem({ ...item, sendBlogNotification: e.target.checked })}
                  className="mt-1 rounded border-[#27313B]"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-[#F6FAFC]">Notify subscribers when this post is published</span>
                  <p className="text-xs text-[#A9B8C6] mt-0.5">
                    Sends an email to subscribers who opted into New Blog Post Notifications.
                    {item.notificationSentAt && (
                      <span className="text-[#8DEBFF] ml-1">
                        • Notification sent {new Date(item.notificationSentAt).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
              </label>

              {/* Include in Newsletter Toggle */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.includeInNewsletter}
                  onChange={(e) => setItem({ ...item, includeInNewsletter: e.target.checked })}
                  className="mt-1 rounded border-[#27313B]"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-[#F6FAFC]">Include this post in the monthly newsletter</span>
                  <p className="text-xs text-[#A9B8C6] mt-0.5">
                    Makes this post available for selection in monthly newsletters.
                  </p>
                </div>
              </label>

              {/* Featured in Newsletter Toggle */}
              {item.includeInNewsletter && (
                <label className="flex items-start gap-3 cursor-pointer ml-6">
                  <input
                    type="checkbox"
                    checked={item.featuredInNewsletter}
                    onChange={(e) => setItem({ ...item, featuredInNewsletter: e.target.checked })}
                    className="mt-1 rounded border-[#27313B]"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-[#F6FAFC]">Feature prominently in newsletter</span>
                    <Star className={`w-4 h-4 inline ml-1 ${item.featuredInNewsletter ? 'text-[#8DEBFF] fill-[#8DEBFF]' : 'text-[#A9B8C6]'}`} />
                  </div>
                </label>
              )}

              {/* Newsletter Category */}
              {item.includeInNewsletter && (
                <div className="ml-6">
                  <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
                    Newsletter Section (optional)
                  </label>
                  <input
                    type="text"
                    value={item.newsletterCategory || ''}
                    onChange={(e) => setItem({ ...item, newsletterCategory: e.target.value })}
                    placeholder="e.g., Survivor Stories, Events, Volunteer Spotlight"
                    className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
                  />
                </div>
              )}

              {/* Email Subject Override */}
              <div>
                <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
                  Email Subject Override (optional)
                </label>
                <input
                  type="text"
                  value={item.emailSubject || ''}
                  onChange={(e) => setItem({ ...item, emailSubject: e.target.value })}
                  placeholder={`Default: "New from Forged in the Fire: ${item.title}"`}
                  className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
                />
              </div>

              {/* Email Excerpt Override */}
              <div>
                <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
                  Email Excerpt Override (optional)
                </label>
                <textarea
                  value={item.emailExcerpt || ''}
                  onChange={(e) => setItem({ ...item, emailExcerpt: e.target.value })}
                  placeholder={`Default: "${item.excerpt?.slice(0, 100)}..."`}
                  rows={2}
                  className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF] resize-none"
                />
                <p className="text-xs text-[#A9B8C6] mt-1">
                  A shorter excerpt specifically for email notifications.
                </p>
              </div>
            </div>
          </div>

          {/* Featured Image */}
          <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
            <label className="block text-sm font-medium text-[#F6FAFC] mb-2">Featured Image</label>
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={item.featuredImage?.url || ''}
                  onChange={(e) => setItem({ 
                    ...item, 
                    featuredImage: { 
                      ...item.featuredImage, 
                      id: item.featuredImage?.id || crypto.randomUUID(),
                      url: e.target.value,
                      alt: item.featuredImage?.alt || ''
                    } 
                  })}
                  placeholder="Image URL"
                  className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
                />
                <input
                  type="text"
                  value={item.featuredImage?.alt || ''}
                  onChange={(e) => setItem({ 
                    ...item, 
                    featuredImage: { 
                      ...item.featuredImage,
                      id: item.featuredImage?.id || crypto.randomUUID(),
                      url: item.featuredImage?.url || '',
                      alt: e.target.value 
                    } 
                  })}
                  placeholder="Alt text (for accessibility)"
                  className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
                />
              </div>
              {item.featuredImage?.url && (
                <div className="w-24 h-24 rounded-lg bg-[#05070A] flex items-center justify-center overflow-hidden">
                  <img 
                    src={item.featuredImage.url} 
                    alt={item.featuredImage.alt} 
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Blocks */}
          <div className="space-y-4">
            {item.blocks.map((block, index) => (
              <div key={index} className="bg-[#151B22] rounded-xl border border-[#27313B] p-4">
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-[#27313B]">
                  <GripVertical className="w-4 h-4 text-[#A9B8C6]" />
                  <span className="text-sm font-medium text-[#A9B8C6] uppercase">{block.type}</span>
                  <div className="flex-1" />
                  <button
                    onClick={() => moveBlock(index, 'up')}
                    disabled={index === 0}
                    className="p-1 rounded hover:bg-[#1A232C]/10 text-[#A9B8C6] disabled:opacity-30"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveBlock(index, 'down')}
                    disabled={index === item.blocks.length - 1}
                    className="p-1 rounded hover:bg-[#1A232C]/10 text-[#A9B8C6] disabled:opacity-30"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeBlock(index)}
                    className="p-1 rounded hover:bg-[#8DEBFF]/15 text-[#A9B8C6] hover:text-[#8DEBFF]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <BlockEditor
                  block={block}
                  index={index}
                  onChange={(b) => updateBlock(index, b)}
                  onOpenMedia={(_field, cb) => openMedia(cb)}
                />
              </div>
            ))}
          </div>

          <AddSectionMenu onAdd={addBlock} />

          {/* CTA Section */}
          <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
            <label className="block text-sm font-medium text-[#F6FAFC] mb-2">Call to Action</label>
            <select
              value={item.cta?.type || ''}
              onChange={(e) => {
                const option = ctaOptions.find(o => o.value === e.target.value)
                if (option) {
                  setItem({ ...item, cta: { type: option.value as ContentCTA['type'], text: option.text, url: option.url } })
                } else {
                  setItem({ ...item, cta: undefined })
                }
              }}
              className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
            >
              <option value="">No CTA</option>
              {ctaOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {item.cta && (
              <div className="mt-3 p-3 bg-[#05070A] rounded-lg text-sm">
                <p className="text-[#F6FAFC] font-medium">{item.cta.text}</p>
                <p className="text-[#A9B8C6]">{item.cta.url}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SEO Tab */}
      {activeTab === 'seo' && (
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
          <SEOPanel 
            item={item} 
            onChange={(seo) => setItem({ ...item, seo })} 
          />
        </div>
      )}

      {activeTab === 'preview' && item && (
        <BlogPostPreview item={item} />
      )}

      {showMedia && mediaCallback && (
        <MediaLibraryModal
          onSelect={(url) => mediaCallback(url)}
          onClose={() => { setShowMedia(false); setMediaCallback(null) }}
        />
      )}
    </div>
  )
}
