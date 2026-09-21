'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createContentItem } from '@/src/features/content/store'
import type { PostTemplate, ContentCategory } from '@/src/features/content/types'
import { 
  ArrowLeft, 
  Plus, 
  FileText, 
  Calendar, 
  Heart, 
  Users, 
  Gift, 
  BookOpen, 
  Handshake, 
  Megaphone,
  Loader2,
  CheckCircle,
  AlertCircle,
  Link as LinkIcon,
  Image as ImageIcon,
  Tag,
  User,
  Eye,
  EyeOff,
  Clock,
  Save
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const templates: { 
  value: PostTemplate
  label: string
  description: string
  icon: React.ElementType
  category: ContentCategory
}[] = [
  { 
    value: 'standard', 
    label: 'Standard Post', 
    description: 'General blog post or article',
    icon: FileText,
    category: 'news'
  },
  { 
    value: 'event', 
    label: 'Event', 
    description: 'Event announcement or recap',
    icon: Calendar,
    category: 'events'
  },
  { 
    value: 'impact-story', 
    label: 'Impact Story', 
    description: 'Survivor journey or success story',
    icon: Heart,
    category: 'impact-stories'
  },
  { 
    value: 'volunteer-opp', 
    label: 'Volunteer Opportunity', 
    description: 'Volunteer position or opportunity',
    icon: Users,
    category: 'volunteer'
  },
  { 
    value: 'donor-update', 
    label: 'Donor Update', 
    description: 'Update for donors and supporters',
    icon: Gift,
    category: 'donor-updates'
  },
  { 
    value: 'resource-guide', 
    label: 'Resource Guide', 
    description: 'Helpful resource or guide',
    icon: BookOpen,
    category: 'resources'
  },
  { 
    value: 'partner-spotlight', 
    label: 'Partner Spotlight', 
    description: 'Feature a partner organization',
    icon: Handshake,
    category: 'partners'
  },
  { 
    value: 'fundraising', 
    label: 'Fundraising', 
    description: 'Campaign or fundraising update',
    icon: Megaphone,
    category: 'fundraising'
  },
]

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

// Slugify function (same as server)
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export default function NewBlogPostPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  // Form state
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [excerpt, setExcerpt] = useState('')
  const [featuredImage, setFeaturedImage] = useState('')
  const [featuredImageAlt, setFeaturedImageAlt] = useState('')
  const [category, setCategory] = useState<ContentCategory>('news')
  const [template, setTemplate] = useState<PostTemplate>('standard')
  const [tags, setTags] = useState('')
  const [author, setAuthor] = useState('')
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'published'>('draft')
  const [publishDate, setPublishDate] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [slugError, setSlugError] = useState<string | null>(null)

  // Auto-generate slug from title
  useEffect(() => {
    if (!slugManuallyEdited && title) {
      setSlug(slugify(title))
    }
  }, [title, slugManuallyEdited])

  // Update category when template changes
  useEffect(() => {
    const templateCategory = templates.find(t => t.value === template)?.category
    if (templateCategory) {
      setCategory(templateCategory)
    }
  }, [template])

  // Validate slug uniqueness (basic validation)
  const validateSlug = useCallback(async (slugToCheck: string) => {
    if (!slugToCheck) {
      setSlugError(null)
      return true
    }
    
    // Basic slug validation
    if (!/^[a-z0-9-]+$/.test(slugToCheck)) {
      setSlugError('Slug can only contain lowercase letters, numbers, and hyphens')
      return false
    }
    
    setSlugError(null)
    return true
  }, [])

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugManuallyEdited(true)
    const newSlug = e.target.value
    setSlug(newSlug)
    validateSlug(newSlug)
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value
    setTitle(newTitle)
    
    // Auto-generate SEO title if not manually set
    if (!seoTitle || seoTitle === title) {
      setSeoTitle(newTitle)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validation
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    
    if (!slug.trim()) {
      setError('Slug is required')
      return
    }
    
    if (slugError) {
      setError('Please fix the slug error before saving')
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      if (status === 'scheduled' && !scheduledFor) {
        setError('Pick a schedule date/time before saving as scheduled')
        setLoading(false)
        return
      }

      // Parse tags
      const tagArray = tags.split(',').map(t => t.trim()).filter(Boolean)
      
      // Parse publish date
      const publishedAt = status === 'published' 
        ? (publishDate ? new Date(publishDate).toISOString() : new Date().toISOString())
        : undefined
      const scheduledAt =
        status === 'scheduled' && scheduledFor
          ? new Date(scheduledFor).toISOString()
          : undefined

      // Create the content item with all fields
      const newItem = await createContentItem(
        title.trim(),
        template,
        category
      )
      
      // Build the full update payload
      const updatePayload = {
        slug: slug.trim(),
        excerpt: excerpt.trim(),
        category,
        template,
        tags: tagArray,
        authorName: author.trim() || undefined,
        status,
        publishedAt,
        scheduledFor: scheduledAt,
        featuredImage: featuredImage ? {
          id: crypto.randomUUID(),
          url: featuredImage.trim(),
          alt: featuredImageAlt.trim() || title
        } : undefined,
        seo: {
          title: seoTitle.trim() || title,
          description: seoDescription.trim(),
          keywords: ['human trafficking advocacy', 'Lorain County Ohio', 'survivor support'],
        }
      }
      
      // Update with all additional fields
      const { updateContentItem } = await import('@/src/features/content/store')
      await updateContentItem(newItem.id, updatePayload)
      
      setSuccess(true)
      
      // Redirect to edit page after short delay
      setTimeout(() => {
        router.push(`/admin/blog/${newItem.id}`)
      }, 500)
      
    } catch (err) {
      console.error('Failed to create post:', err)
      setError(err instanceof Error ? err.message : 'Failed to create post. Please try again.')
      setLoading(false)
    }
  }

  const handleCancel = () => {
    if (title || excerpt || featuredImage) {
      if (!confirm('You have unsaved changes. Are you sure you want to leave?')) {
        return
      }
    }
    router.push('/admin/blog')
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="bg-[#8DEBFF]/15 border border-[#8DEBFF]/30 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#8DEBFF]/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-[#8DEBFF]" />
          </div>
          <h2 className="text-xl font-semibold text-[#8DEBFF] mb-2">Post Created Successfully!</h2>
          <p className="text-[#8DEBFF] mb-4">
            "{title}" has been created as a {status}.
          </p>
          <p className="text-sm text-[#8DEBFF]">Redirecting to editor...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button 
          onClick={handleCancel}
          className="inline-flex items-center gap-2 text-sm text-[#A9B8C6] hover:text-[#8DEBFF] transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Blog
        </button>
        <h1 className="text-2xl font-bold text-[#F6FAFC]">Create New Post</h1>
        <p className="text-sm text-[#A9B8C6]">Fill in the details below to create your blog post.</p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 bg-[#8DEBFF]/15 border border-[#8DEBFF]/35 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#8DEBFF] shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-[#8DEBFF]">Error</p>
            <p className="text-sm text-[#8DEBFF]">{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info Section */}
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6 space-y-6">
          <h2 className="text-lg font-semibold text-[#F6FAFC] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#53D6FF]" />
            Basic Information
          </h2>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
              Post Title <span className="text-[#8DEBFF]">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e)}
              placeholder="Enter a compelling title..."
              className="w-full text-lg border border-[#27313B] rounded-lg px-4 py-3 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] placeholder-[#A9B8C6] focus:outline-none focus:border-[#53D6FF] transition-colors"
              required
            />
            <p className="text-xs text-[#A9B8C6] mt-1">
              {title.length}/65 characters recommended for SEO
            </p>
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
              URL Slug <span className="text-[#8DEBFF]">*</span>
              <span className="text-xs font-normal text-[#A9B8C6] ml-2">(auto-generated, can edit)</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#A9B8C6]">/blog/</span>
              <input
                type="text"
                value={slug}
                onChange={handleSlugChange}
                placeholder="post-url-slug"
                className={`flex-1 border rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF] transition-colors ${
                  slugError ? 'border-[#8DEBFF]/35 bg-[#8DEBFF]/15' : 'border-[#27313B]'
                }`}
                required
              />
            </div>
            {slugError && (
              <p className="text-xs text-[#8DEBFF] mt-1">{slugError}</p>
            )}
            <p className="text-xs text-[#A9B8C6] mt-1">
              This will be the permanent URL for your post
            </p>
          </div>

          {/* Excerpt */}
          <div>
            <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
              Excerpt / Summary
            </label>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Brief description for previews, search results, and social sharing..."
              rows={3}
              className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF] resize-none"
            />
            <p className="text-xs text-[#A9B8C6] mt-1">
              {excerpt.length}/160 characters recommended for SEO
            </p>
          </div>
        </div>

        {/* Template & Category */}
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6 space-y-6">
          <h2 className="text-lg font-semibold text-[#F6FAFC] flex items-center gap-2">
            <Tag className="w-5 h-5 text-[#53D6FF]" />
            Template & Category
          </h2>

          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium text-[#F6FAFC] mb-3">
              Post Template <span className="text-[#8DEBFF]">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {templates.map((t) => {
                const Icon = t.icon
                return (
                  <label
                    key={t.value}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      template === t.value
                        ? 'border-[#53D6FF] bg-[#53D6FF]/5'
                        : 'border-[#27313B] hover:border-[#27313B]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={t.value}
                      checked={template === t.value}
                      onChange={(e) => setTemplate(e.target.value as PostTemplate)}
                      className="sr-only"
                    />
                    <div className="flex flex-col items-center text-center gap-2">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        template === t.value ? 'bg-[#53D6FF] text-[#061016]' : 'bg-[#05070A] text-[#A9B8C6]'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-[#F6FAFC]">{t.label}</p>
                        <p className="text-xs text-[#A9B8C6]">{t.description}</p>
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
              Category <span className="text-[#8DEBFF]">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ContentCategory)}
              className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
            >
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
              Tags
              <span className="text-xs font-normal text-[#A9B8C6] ml-2">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="survivor stories, cleveland, advocacy, housing..."
              className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
            />
          </div>
        </div>

        {/* Featured Image */}
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6 space-y-4">
          <h2 className="text-lg font-semibold text-[#F6FAFC] flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-[#53D6FF]" />
            Featured Image
          </h2>

          <div className="flex gap-4">
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
                  Image URL
                </label>
                <input
                  type="url"
                  value={featuredImage}
                  onChange={(e) => setFeaturedImage(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
                  Alt Text <span className="text-xs font-normal text-[#A9B8C6]">(for accessibility)</span>
                </label>
                <input
                  type="text"
                  value={featuredImageAlt}
                  onChange={(e) => setFeaturedImageAlt(e.target.value)}
                  placeholder="Descriptive text for screen readers"
                  className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
                />
              </div>
            </div>
            {featuredImage && (
              <div className="w-32 h-32 shrink-0 rounded-lg bg-[#05070A] flex items-center justify-center overflow-hidden border border-[#27313B]">
                <img 
                  src={featuredImage} 
                  alt={featuredImageAlt || 'Preview'} 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Author & Publishing */}
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6 space-y-6">
          <h2 className="text-lg font-semibold text-[#F6FAFC] flex items-center gap-2">
            <User className="w-5 h-5 text-[#53D6FF]" />
            Author & Publishing
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Author */}
            <div>
              <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
                Author Name
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g., Jane Smith"
                className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
              />
            </div>

            {/* Publish / schedule date */}
            <div>
              <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
                {status === 'scheduled' ? 'Go live at' : 'Publish Date'}
                <span className="text-xs font-normal text-[#A9B8C6] ml-2">
                  {status === 'scheduled' ? '(required)' : '(if published)'}
                </span>
              </label>
              <input
                type="datetime-local"
                value={status === 'scheduled' ? scheduledFor : publishDate}
                onChange={(e) => {
                  if (status === 'scheduled') setScheduledFor(e.target.value)
                  else setPublishDate(e.target.value)
                }}
                className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-[#F6FAFC] mb-2">
              Status
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="draft"
                  checked={status === 'draft'}
                  onChange={() => setStatus('draft')}
                  className="rounded border-[#27313B]"
                />
                <span className="flex items-center gap-1.5 text-sm text-[#F6FAFC]">
                  <EyeOff className="w-4 h-4 text-[#8DEBFF]" />
                  Draft
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="scheduled"
                  checked={status === 'scheduled'}
                  onChange={() => setStatus('scheduled')}
                  className="rounded border-[#27313B]"
                />
                <span className="flex items-center gap-1.5 text-sm text-[#F6FAFC]">
                  <Eye className="w-4 h-4 text-[#8DEBFF]" />
                  Scheduled
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="published"
                  checked={status === 'published'}
                  onChange={() => setStatus('published')}
                  className="rounded border-[#27313B]"
                />
                <span className="flex items-center gap-1.5 text-sm text-[#F6FAFC]">
                  <Eye className="w-4 h-4 text-[#8DEBFF]" />
                  Published
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* SEO Settings */}
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6 space-y-4">
          <h2 className="text-lg font-semibold text-[#F6FAFC] flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-[#53D6FF]" />
            SEO Settings
          </h2>

          <div>
            <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
              SEO Title
              <span className="text-xs font-normal text-[#A9B8C6] ml-2">(defaults to post title)</span>
            </label>
            <input
              type="text"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              placeholder="Title for search engines"
              className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]"
            />
            <p className="text-xs text-[#A9B8C6] mt-1">
              {seoTitle.length}/65 characters
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#F6FAFC] mb-1.5">
              Meta Description
            </label>
            <textarea
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              placeholder="Description for search results..."
              rows={2}
              className="w-full border border-[#27313B] rounded-lg px-3 py-2 bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF] resize-none"
            />
            <p className="text-xs text-[#A9B8C6] mt-1">
              {seoDescription.length}/160 characters
            </p>
          </div>
        </div>

        {/* Tips */}
        <div className="bg-[#05070A] rounded-xl p-5 border border-[#27313B]">
          <h3 className="text-sm font-semibold text-[#8DEBFF] mb-3">Writing Tips</h3>
          <ul className="space-y-2 text-sm text-[#B8C4CF]">
            <li className="flex items-start gap-2">
              <span className="text-[#53D6FF]">•</span>
              Keep titles under 65 characters for SEO
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#53D6FF]">•</span>
              For impact stories, always obtain proper consent
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#53D6FF]">•</span>
              Include clear calls to action (donate, volunteer, etc.)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#53D6FF]">•</span>
              Add featured images for better engagement
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            className="border-[#27313B] text-[#A9B8C6]"
          >
            Cancel
          </Button>
          
          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={loading || !!slugError}
              variant="outline"
              onClick={() => setStatus('draft')}
              className="border-[#27313B] text-[#A9B8C6]"
            >
              {loading && status === 'draft' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save as Draft
            </Button>
            
            <Button
              type="submit"
              disabled={loading || !!slugError}
              onClick={() => setStatus('published')}
              className="bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016]"
            >
              {loading && status === 'published' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create & Publish
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
