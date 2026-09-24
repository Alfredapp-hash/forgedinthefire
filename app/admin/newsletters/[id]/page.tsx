'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  ArrowLeft, 
  Save, 
  Send, 
  Eye, 
  Loader2, 
  CheckCircle,
  Mail,
  AlertCircle,
  GripVertical,
  Trash2
} from 'lucide-react'
import type { Newsletter } from '@/src/features/subscribers/types'
import type { ContentItem } from '@/src/features/content/types'
import { isEmailConfigured, sendTestNewsletter, sendMonthlyNewsletter } from '@/src/lib/email/service'

interface NewsletterDetailPageProps {
  params: Promise<{ id: string }>
}

export default function NewsletterDetailPage({ params }: NewsletterDetailPageProps) {
  const [newsletter, setNewsletter] = useState<Newsletter | null>(null)
  const [posts, setPosts] = useState<ContentItem[]>([])
  const [selectedPosts, setSelectedPosts] = useState<string[]>([])
  const [introMessage, setIntroMessage] = useState('')
  const [closingMessage, setClosingMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()
  const emailConfigured = isEmailConfigured()

  const loadNewsletter = useCallback(async () => {
    if (!supabase) return
    const { id } = await params
    
    // Load newsletter
    const { data: newsletterData } = await supabase
      .from('newsletters')
      .select('*')
      .eq('id', id)
      .single()
    
    if (!newsletterData) {
      router.push('/admin/newsletters')
      return
    }
    
    setNewsletter(newsletterData as Newsletter)
    setIntroMessage(newsletterData.intro_message || '')
    setClosingMessage(newsletterData.closing_message || '')
    
    // Load selected posts
    const { data: postRelations } = await supabase
      .from('newsletter_posts')
      .select('post_id')
      .eq('newsletter_id', id)
    
    if (postRelations) {
      setSelectedPosts(postRelations.map(r => r.post_id))
    }
    
    // Load available posts (published and marked for newsletter)
    const { data: availablePosts } = await supabase
      .from('content')
      .select('*')
      .eq('status', 'published')
      .eq('include_in_newsletter', true)
      .order('published_at', { ascending: false })
    
    setPosts((availablePosts as ContentItem[]) || [])
    setLoading(false)
  }, [params, router, supabase])

  useEffect(() => {
    loadNewsletter()
  }, [loadNewsletter])

  // Rules of Hooks: guard after all hooks are declared, never before them.
  if (!supabase) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-[#53D6FF]/10 border border-[#53D6FF]/30 rounded-lg p-6">
          <h2 className="text-[#8DEBFF] font-medium mb-2">Database Not Connected</h2>
          <p className="text-[#8DEBFF]/80 text-sm">
            Supabase environment variables are missing. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </p>
        </div>
      </div>
    )
  }

  const handleSave = async () => {
    if (!newsletter) return
    
    setSaving(true)
    try {
      // Update newsletter
      const { error } = await supabase
        .from('newsletters')
        .update({
          intro_message: introMessage,
          closing_message: closingMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', newsletter.id)
      
      if (error) throw error
      
      // Update post selections
      // First, remove existing selections
      await supabase
        .from('newsletter_posts')
        .delete()
        .eq('newsletter_id', newsletter.id)
      
      // Add new selections
      if (selectedPosts.length > 0) {
        const relations = selectedPosts.map((postId, index) => ({
          newsletter_id: newsletter.id,
          post_id: postId,
          sort_order: index,
        }))
        
        await supabase.from('newsletter_posts').insert(relations)
      }
      
      alert('Newsletter saved successfully')
    } catch (err) {
      console.error('Failed to save newsletter:', err)
      alert('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleSendTest = async () => {
    if (!newsletter || !testEmail) return
    if (!emailConfigured) {
      alert('Email delivery is not configured. Add RESEND_API_KEY to send emails.')
      return
    }
    
    setSending(true)
    setSendResult(null)
    
    const selectedPostData = posts.filter(p => selectedPosts.includes(p.id))
    const result = await sendTestNewsletter(newsletter, selectedPostData, testEmail)
    
    setSendResult({
      success: result.success,
      message: result.success 
        ? 'Test email sent successfully!'
        : result.error || 'Failed to send test email'
    })
    
    setSending(false)
  }

  const handleSendToAll = async () => {
    if (!newsletter) return
    if (!emailConfigured) {
      alert('Email delivery is not configured. Add RESEND_API_KEY to send emails.')
      return
    }
    
    if (!confirm(`Send "${newsletter.title}" to all active subscribers?`)) {
      return
    }
    
    setSending(true)
    setSendResult(null)
    
    try {
      const selectedPostData = posts.filter(p => selectedPosts.includes(p.id))
      
      // Call API to send newsletter to all subscribers
      const res = await fetch(`/api/admin/newsletters/${newsletter.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          introMessage,
          closingMessage,
          selectedPosts: selectedPostData
        })
      })
      
      const result = await res.json()
      
      if (res.ok) {
        setSendResult({
          success: true,
          message: `Newsletter sent to ${result.recipientCount} subscribers!`
        })
        // Reload to show sent state
        loadNewsletter()
      } else {
        setSendResult({
          success: false,
          message: result.error || 'Failed to send newsletter'
        })
      }
    } catch (err) {
      console.error('Send newsletter error:', err)
      setSendResult({
        success: false,
        message: 'Failed to send newsletter. Please try again.'
      })
    } finally {
      setSending(false)
    }
  }

  const togglePost = (postId: string) => {
    setSelectedPosts(prev => 
      prev.includes(postId) 
        ? prev.filter(id => id !== postId)
        : [...prev, postId]
    )
  }

  const movePost = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...selectedPosts]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    
    if (newIndex < 0 || newIndex >= newOrder.length) return
    
    const temp = newOrder[index]
    newOrder[index] = newOrder[newIndex]
    newOrder[newIndex] = temp
    
    setSelectedPosts(newOrder)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#53D6FF]" />
      </div>
    )
  }

  if (!newsletter) return null

  const isSent = newsletter.status === 'sent'
  const selectedPostData = posts.filter(p => selectedPosts.includes(p.id))

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link
            href="/admin/newsletters"
            className="inline-flex items-center gap-2 text-sm text-[#A9B8C6] hover:text-[#8DEBFF] transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Newsletters
          </Link>
          <h1 className="text-2xl font-bold text-[#F6FAFC]">{newsletter.title}</h1>
          <p className="text-sm text-[#A9B8C6]">
            {new Date(newsletter.year, newsletter.month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
            {isSent && (
              <span className="ml-2 text-[#8DEBFF]">
                • Sent {newsletter.sent_at && new Date(newsletter.sent_at).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
        
        {!isSent && (
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              variant="outline"
              className="border-[#27313B]"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Draft
            </Button>
          </div>
        )}
      </div>

      {/* Email Config Warning */}
      {!emailConfigured && !isSent && (
        <div className="bg-[#53D6FF]/10 border border-[#53D6FF]/30 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#8DEBFF] mt-0.5" />
          <div>
            <p className="font-medium text-[#8DEBFF]">Email delivery not configured</p>
            <p className="text-sm text-[#8DEBFF] mt-1">
              You can create and save drafts, but emails cannot be sent until an email provider is configured.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Intro Message */}
        {!isSent && (
          <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
            <Label htmlFor="intro" className="block text-sm font-medium text-[#F6FAFC] mb-2">
              Introduction Message
            </Label>
            <Textarea
              id="intro"
              value={introMessage}
              onChange={(e) => setIntroMessage(e.target.value)}
              placeholder="Write a warm introduction to welcome readers to this month's newsletter..."
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-[#A9B8C6] mt-2">
              This appears at the top of the newsletter before the blog posts.
            </p>
          </div>
        )}

        {isSent && introMessage && (
          <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
            <Label className="block text-sm font-medium text-[#F6FAFC] mb-2">
              Introduction Message
            </Label>
            <p className="text-[#B8C4CF] whitespace-pre-wrap">{introMessage}</p>
          </div>
        )}

        {/* Selected Posts */}
        <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
          <div className="flex items-center justify-between mb-4">
            <Label className="text-[#F6FAFC] font-medium">
              Selected Blog Posts ({selectedPosts.length})
            </Label>
          </div>
          
          {selectedPostData.length === 0 ? (
            <div className="text-center py-8 bg-[#05070A] rounded-lg">
              <Mail className="w-8 h-8 text-[#A9B8C6]/40 mx-auto mb-2" />
              <p className="text-sm text-[#A9B8C6]">
                No posts selected. Choose posts from the list below.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedPostData.map((post, index) => (
                <div
                  key={post.id}
                  className="flex items-center gap-3 p-3 bg-[#05070A] rounded-lg"
                >
                  {!isSent && (
                    <>
                      <GripVertical className="w-4 h-4 text-[#A9B8C6] cursor-move" />
                      <button
                        onClick={() => movePost(index, 'up')}
                        disabled={index === 0}
                        className="text-[#A9B8C6] hover:text-[#53D6FF] disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => movePost(index, 'down')}
                        disabled={index === selectedPostData.length - 1}
                        className="text-[#A9B8C6] hover:text-[#53D6FF] disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </>
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-[#F6FAFC]">{post.title}</p>
                    <p className="text-sm text-[#A9B8C6]">
                      {post.featuredInNewsletter && (
                        <span className="text-[#8DEBFF] mr-2">★ Featured</span>
                      )}
                      {post.excerpt?.slice(0, 80)}...
                    </p>
                  </div>
                  {!isSent && (
                    <button
                      onClick={() => togglePost(post.id)}
                      className="text-[#A9B8C6] hover:text-[#8DEBFF]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available Posts */}
        {!isSent && (
          <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
            <Label className="block text-sm font-medium text-[#F6FAFC] mb-4">
              Available Posts (marked for newsletter)
            </Label>
            
            {posts.length === 0 ? (
              <div className="text-center py-8 bg-[#05070A] rounded-lg">
                <p className="text-sm text-[#A9B8C6] mb-2">
                  No posts marked for newsletter inclusion.
                </p>
                <Link
                  href="/admin/blog"
                  className="text-[#53D6FF] hover:text-[#53D6FF] text-sm font-medium"
                >
                  Go to Blog Studio →
                </Link>
              </div>
            ) : (
              <div className="grid gap-2 max-h-64 overflow-y-auto">
                {posts
                  .filter(p => !selectedPosts.includes(p.id))
                  .map((post) => (
                    <label
                      key={post.id}
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-[#1A232C] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPosts.includes(post.id)}
                        onChange={() => togglePost(post.id)}
                        className="mt-1 rounded border-[#27313B]"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-[#F6FAFC] text-sm">{post.title}</p>
                        <p className="text-xs text-[#A9B8C6]">
                          {post.newsletterCategory && (
                            <span className="text-[#53D6FF] mr-2">{post.newsletterCategory}</span>
                          )}
                          {post.excerpt?.slice(0, 60)}...
                        </p>
                      </div>
                    </label>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Closing Message */}
        {!isSent && (
          <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
            <Label htmlFor="closing" className="block text-sm font-medium text-[#F6FAFC] mb-2">
              Closing Message
            </Label>
            <Textarea
              id="closing"
              value={closingMessage}
              onChange={(e) => setClosingMessage(e.target.value)}
              placeholder="End with a warm closing message, upcoming events, or ways to get involved..."
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-[#A9B8C6] mt-2">
              This appears at the bottom of the newsletter after all posts.
            </p>
          </div>
        )}

        {isSent && closingMessage && (
          <div className="bg-[#151B22] rounded-xl border border-[#27313B] p-6">
            <Label className="block text-sm font-medium text-[#F6FAFC] mb-2">
              Closing Message
            </Label>
            <p className="text-[#B8C4CF] whitespace-pre-wrap">{closingMessage}</p>
          </div>
        )}

        {/* Test & Send */}
        {!isSent && (
          <div className="bg-[#05070A] rounded-xl border border-[#27313B] p-6">
            <h3 className="text-lg font-bold text-[#8DEBFF] mb-4">Send Newsletter</h3>
            
            {/* Test Send */}
            <div className="mb-6">
              <Label className="text-[#B8C4CF] mb-2 block">Send Test Email</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="bg-[#05070A] border-[#27313B] text-[#F6FAFC] placeholder:text-[#A9B8C6]"
                />
                <Button
                  onClick={handleSendTest}
                  disabled={sending || !testEmail}
                  variant="outline"
                  className="border-[#27313B] text-[#8DEBFF] hover:bg-[#1A232C]"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 mr-2" />
                  )}
                  Test
                </Button>
              </div>
              
              {sendResult && (
                <div className={`mt-2 text-sm ${sendResult.success ? 'text-[#8DEBFF]' : 'text-[#8DEBFF]'}`}>
                  {sendResult.message}
                </div>
              )}
            </div>

            {/* Send to All */}
            <div className="border-t border-[#27313B] pt-4">
              <p className="text-[#B8C4CF] text-sm mb-4">
                This will send the newsletter to all subscribers who opted into the Monthly Newsletter.
              </p>
              <Button
                onClick={handleSendToAll}
                disabled={sending || !emailConfigured || selectedPosts.length === 0}
                className="bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016]"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {sending ? 'Sending...' : 'Send to All Subscribers'}
              </Button>
              
              {!emailConfigured && (
                <p className="text-[#8DEBFF] text-sm mt-2">
                  Email delivery must be configured before sending.
                </p>
              )}
            </div>
          </div>
        )}

        {isSent && (
          <div className="bg-[#8DEBFF]/15 rounded-xl border border-[#8DEBFF]/30 p-6 text-center">
            <CheckCircle className="w-12 h-12 text-[#8DEBFF] mx-auto mb-2" />
            <p className="font-semibold text-[#8DEBFF]">Newsletter Sent</p>
            <p className="text-sm text-[#8DEBFF]">
              This newsletter was sent to {newsletter.recipient_count || 0} subscribers on{' '}
              {newsletter.sent_at && new Date(newsletter.sent_at).toLocaleDateString()}.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
