'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getContentItem, updateContentItem, publishContentItem, unpublishContentItem } from '@/src/features/content/store'
import type { ContentItem, ContentBlock } from '@/src/features/content/types'
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
  ArrowDown
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const [item, setItem] = useState<ContentItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'content' | 'seo'>('content')
  const router = useRouter()

  useEffect(() => {
    const loadItem = async () => {
      const { id } = await params
      const data = await getContentItem(id)
      if (!data) {
        router.push('/admin/content')
        return
      }
      setItem(data)
      setLoading(false)
    }
    loadItem()
  }, [params, router])

  const handleSave = useCallback(async () => {
    if (!item) return
    setSaving(true)
    try {
      await updateContentItem(item.id, item)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [item])

  const handlePublish = async () => {
    if (!item) return
    const updated = await publishContentItem(item.id)
    if (updated) setItem(updated)
  }

  const handleUnpublish = async () => {
    if (!item) return
    const updated = await unpublishContentItem(item.id)
    if (updated) setItem(updated)
  }

  const updateBlock = (index: number, updates: Partial<ContentBlock>) => {
    if (!item) return
    const newBlocks = [...item.blocks]
    newBlocks[index] = { ...newBlocks[index], ...updates } as ContentBlock
    setItem({ ...item, blocks: newBlocks })
  }

  const addBlock = (type: ContentBlock['type']) => {
    if (!item) return
    const newBlock: ContentBlock = 
      type === 'hero' ? { type: 'hero', data: { title: '' } } :
      type === 'text' ? { type: 'text', data: { content: '' } } :
      type === 'imageText' ? { type: 'imageText', data: { image: '', imageAlt: '', imagePosition: 'left', content: '' } } :
      type === 'quote' ? { type: 'quote', data: { text: '' } } :
      type === 'faq' ? { type: 'faq', data: { items: [] } } :
      type === 'gallery' ? { type: 'gallery', data: { images: [] } } :
      type === 'video' ? { type: 'video', data: { url: '' } } :
      { type: 'cta', data: { text: '', url: '' } }
    
    setItem({ ...item, blocks: [...item.blocks, newBlock] })
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#53D6FF]" />
      </div>
    )
  }

  if (!item) return null

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link 
            href="/admin/content" 
            className="inline-flex items-center gap-2 text-sm text-[#A9B8C6] hover:text-[#8DEBFF] transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Content
          </Link>
          <h1 className="text-2xl font-bold text-[#F6FAFC]">Edit Content</h1>
          <p className="text-sm text-[#A9B8C6]">/{item.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          {item.status === 'published' ? (
            <Button
              variant="outline"
              onClick={handleUnpublish}
              className="border-[#53D6FF]/30 text-[#8DEBFF] hover:bg-[#53D6FF]/10"
            >
              <Clock className="w-4 h-4 mr-2" />
              Unpublish
            </Button>
          ) : (
            <Button
              onClick={handlePublish}
              className="bg-[#8DEBFF]/15 hover:bg-[#8DEBFF]/15 text-white"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Publish
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016]"
          >
            <Save className="w-4 h-4 mr-2" />
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
          SEO
        </button>
      </div>

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          {/* Title */}
          <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
            <label className="block text-sm font-medium text-[#F6FAFC] mb-2">Title</label>
            <input
              type="text"
              value={item.title}
              onChange={(e) => setItem({ ...item, title: e.target.value })}
              className="w-full text-xl font-semibold border border-[#27313B] rounded-lg px-4 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF] transition-colors"
            />
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

                {/* Block Editor */}
                {block.type === 'hero' && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={block.data.title || ''}
                      onChange={(e) => updateBlock(index, { type: 'hero', data: { ...block.data, title: e.target.value } })}
                      placeholder="Hero Title"
                      className="w-full font-semibold border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
                    />
                    <input
                      type="text"
                      value={block.data.subtitle || ''}
                      onChange={(e) => updateBlock(index, { type: 'hero', data: { ...block.data, subtitle: e.target.value } })}
                      placeholder="Subtitle (optional)"
                      className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
                    />
                  </div>
                )}

                {block.type === 'text' && (
                  <textarea
                    value={block.data.content || ''}
                    onChange={(e) => updateBlock(index, { type: 'text', data: { content: e.target.value } })}
                    placeholder="Enter your content here..."
                    rows={6}
                    className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF] resize-y"
                  />
                )}

                {block.type === 'quote' && (
                  <div className="space-y-3">
                    <textarea
                      value={block.data.text || ''}
                      onChange={(e) => updateBlock(index, { type: 'quote', data: { ...block.data, text: e.target.value } })}
                      placeholder="Quote text..."
                      rows={3}
                      className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] italic focus:outline-none focus:border-[#53D6FF]"
                    />
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={block.data.author || ''}
                        onChange={(e) => updateBlock(index, { type: 'quote', data: { ...block.data, author: e.target.value } })}
                        placeholder="Author name"
                        className="flex-1 border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
                      />
                      <input
                        type="text"
                        value={block.data.role || ''}
                        onChange={(e) => updateBlock(index, { type: 'quote', data: { ...block.data, role: e.target.value } })}
                        placeholder="Role/Title"
                        className="flex-1 border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
                      />
                    </div>
                  </div>
                )}

                {block.type === 'imageText' && (
                  <div className="space-y-3">
                    <select
                      value={block.data.imagePosition || 'left'}
                      onChange={(e) => updateBlock(index, { type: 'imageText', data: { ...block.data, imagePosition: e.target.value as 'left' | 'right' } })}
                      className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF] bg-[#151B22]"
                    >
                      <option value="left">Image on Left</option>
                      <option value="right">Image on Right</option>
                    </select>
                    <input
                      type="text"
                      value={block.data.image || ''}
                      onChange={(e) => updateBlock(index, { type: 'imageText', data: { ...block.data, image: e.target.value } })}
                      placeholder="Image URL"
                      className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
                    />
                    <input
                      type="text"
                      value={block.data.imageAlt || ''}
                      onChange={(e) => updateBlock(index, { type: 'imageText', data: { ...block.data, imageAlt: e.target.value } })}
                      placeholder="Alt text (for accessibility)"
                      className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
                    />
                    <textarea
                      value={block.data.content || ''}
                      onChange={(e) => updateBlock(index, { type: 'imageText', data: { ...block.data, content: e.target.value } })}
                      placeholder="Content text..."
                      rows={3}
                      className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
                    />
                  </div>
                )}

                {block.type === 'cta' && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={block.data.text || ''}
                      onChange={(e) => updateBlock(index, { type: 'cta', data: { ...block.data, text: e.target.value } })}
                      placeholder="Button text"
                      className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
                    />
                    <input
                      type="text"
                      value={block.data.url || ''}
                      onChange={(e) => updateBlock(index, { type: 'cta', data: { ...block.data, url: e.target.value } })}
                      placeholder="URL (e.g., /get-help or https://...)"
                      className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Block */}
          <div className="bg-[#05070A] rounded-xl border border-[#27313B] p-4">
            <p className="text-sm font-medium text-[#A9B8C6] mb-3">Add Block</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => addBlock('text')} className="border-[#27313B]">
                <Plus className="w-4 h-4 mr-1" /> Text
              </Button>
              <Button variant="outline" size="sm" onClick={() => addBlock('quote')} className="border-[#27313B]">
                <Plus className="w-4 h-4 mr-1" /> Quote
              </Button>
              <Button variant="outline" size="sm" onClick={() => addBlock('imageText')} className="border-[#27313B]">
                <Plus className="w-4 h-4 mr-1" /> Image + Text
              </Button>
              <Button variant="outline" size="sm" onClick={() => addBlock('cta')} className="border-[#27313B]">
                <Plus className="w-4 h-4 mr-1" /> CTA Button
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SEO Tab */}
      {activeTab === 'seo' && (
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-[#F6FAFC] mb-2">
              SEO Title
              <span className="text-xs text-[#A9B8C6] ml-2">({item.seo?.title?.length || 0}/60)</span>
            </label>
            <input
              type="text"
              value={item.seo?.title || ''}
              onChange={(e) => setItem({ 
                ...item, 
                seo: { ...item.seo, title: e.target.value }
              })}
              placeholder="Page title for search engines"
              className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
            />
            <p className="text-xs text-[#A9B8C6] mt-1">
              Defaults to: {item.title} | Forged in the Fire
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#F6FAFC] mb-2">
              Meta Description
              <span className="text-xs text-[#A9B8C6] ml-2">({item.seo?.description?.length || 0}/160)</span>
            </label>
            <textarea
              value={item.seo?.description || ''}
              onChange={(e) => setItem({ 
                ...item, 
                seo: { ...item.seo, description: e.target.value }
              })}
              placeholder="Brief description for search results"
              rows={3}
              className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF] resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#F6FAFC] mb-2">Focus Keywords</label>
            <input
              type="text"
              value={(item.seo?.keywords || []).join(', ')}
              onChange={(e) => setItem({ 
                ...item, 
                seo: { 
                  ...item.seo, 
                  keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
                }
              })}
              placeholder="human trafficking advocacy, Lorain County Ohio, survivor support"
              className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
            />
            <p className="text-xs text-[#A9B8C6] mt-1">Separate keywords with commas</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#F6FAFC] mb-2">Canonical URL</label>
            <input
              type="text"
              value={item.seo?.canonicalUrl || ''}
              onChange={(e) => setItem({ 
                ...item, 
                seo: { ...item.seo, canonicalUrl: e.target.value }
              })}
              placeholder="https://www.forgedinthefireohio.org/blog/your-post"
              className="w-full border border-[#27313B] rounded-lg px-3 py-2 text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]"
            />
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-[#27313B]">
            <input
              type="checkbox"
              id="noIndex"
              checked={item.seo?.noIndex || false}
              onChange={(e) => setItem({ 
                ...item, 
                seo: { ...item.seo, noIndex: e.target.checked }
              })}
              className="rounded border-[#27313B]"
            />
            <label htmlFor="noIndex" className="text-sm text-[#F6FAFC]">
              Hide from search engines (noindex)
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
