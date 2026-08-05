'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mail, CheckCircle, AlertCircle, Loader2, Sparkles } from 'lucide-react'

type SubmitState = 'idle' | 'loading' | 'success' | 'error'

export default function NewsletterSignup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<SubmitState>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    if (!email.trim()) {
      setStatus('error')
      setMessage('Please enter your email address.')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setStatus('error')
      setMessage('Please enter a valid email address.')
      return
    }

    setStatus('loading')
    setMessage('')

    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          source: 'blog-newsletter',
          preferences: {
            monthly_newsletter: true,
            blog_notifications: false,
            volunteer_opportunities: false,
            donor_updates: false,
            community_events: false,
            survivor_support: false,
          },
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setStatus('success')
        setMessage(data.existing 
          ? 'You are already subscribed. Your preferences have been updated.'
          : 'Welcome to the Forged in the Fire community. You will receive our monthly newsletter with stories, resources, and updates.'
        )
        setName('')
        setEmail('')
      } else {
        setStatus('error')
        setMessage(data.error || 'Something went wrong. Please try again.')
      }
    } catch (err) {
      console.error('Newsletter signup error:', err)
      setStatus('error')
      setMessage('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-charcoal-700 via-charcoal-800 to-charcoal-900 border border-charcoal-600 shadow-2xl">
      {/* Decorative gradient line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal via-gold to-teal" />
      
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-teal/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-gold/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
      
      <div className="relative p-8 md:p-12">
        <div className="flex flex-col lg:flex-row lg:items-center gap-8 lg:gap-12">
          {/* Left side - Content */}
          <div className="lg:w-5/12">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal/20 to-teal/5 flex items-center justify-center border border-teal/30">
                <Mail className="w-6 h-6 text-teal" />
              </div>
              <div className="flex items-center gap-2 text-gold">
                <Sparkles className="w-4 h-4" />
                <span className="text-xs font-medium tracking-wider uppercase">Monthly</span>
              </div>
            </div>
            
            <h3 className="font-playfair text-2xl md:text-3xl font-bold text-cream-100 mb-4">
              Join Our Newsletter
            </h3>
            
            <p className="text-cream-100/70 leading-relaxed mb-4">
              Get the latest Forged in the Fire updates, stories, resources, and community highlights delivered once a month.
            </p>
            
            <p className="text-sm text-cream-100/50">
              No spam. Unsubscribe anytime. We respect your privacy.
            </p>
          </div>

          {/* Right side - Form */}
          <div className="lg:w-7/12">
            {status === 'success' ? (
              <div className="flex items-start gap-4 p-6 bg-[#8DEBFF]/10 rounded-2xl border border-[#8DEBFF]/30">
                <div className="w-12 h-12 rounded-full bg-[#8DEBFF]/10 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-6 h-6 text-[#8DEBFF]" />
                </div>
                <div>
                  <p className="text-[#8DEBFF] font-medium text-lg mb-1">You are Subscribed!</p>
                  <p className="text-cream-100/70">{message}</p>
                  <button
                    onClick={() => setStatus('idle')}
                    className="text-sm text-teal hover:text-teal-300 mt-3 underline underline-offset-2"
                  >
                    Subscribe another email address
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-5 gap-4">
                  <div className="sm:col-span-2">
                    <label 
                      htmlFor="newsletter-name" 
                      className="block text-cream-100/60 text-sm mb-2 font-medium"
                    >
                      Name <span className="text-silver-label">(optional)</span>
                    </label>
                    <Input
                      id="newsletter-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="bg-charcoal-900/50 border-charcoal-500 text-cream-100 placeholder:text-silver-label focus:border-teal focus:ring-1 focus:ring-teal/50 h-12"
                      disabled={status === 'loading'}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label 
                      htmlFor="newsletter-email" 
                      className="block text-cream-100/60 text-sm mb-2 font-medium"
                    >
                      Email Address <span className="text-teal">*</span>
                    </label>
                    <Input
                      id="newsletter-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="bg-charcoal-900/50 border-charcoal-500 text-cream-100 placeholder:text-silver-label focus:border-teal focus:ring-1 focus:ring-teal/50 h-12"
                      disabled={status === 'loading'}
                      aria-describedby="newsletter-error"
                    />
                  </div>
                </div>

                {status === 'error' && (
                  <div className="flex items-start gap-3 p-4 bg-[#8DEBFF]/10 rounded-xl border border-[#8DEBFF]/35">
                    <AlertCircle className="w-5 h-5 text-[#8DEBFF] shrink-0 mt-0.5" />
                    <p id="newsletter-error" className="text-sm text-[#8DEBFF]">
                      {message}
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full bg-gradient-to-r from-teal to-teal-600 hover:from-teal-500 hover:to-teal-700 text-white h-12 text-base font-semibold shadow-lg shadow-teal/20 transition-all duration-300"
                >
                  {status === 'loading' ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Subscribing...
                    </>
                  ) : (
                    <>
                      <Mail className="w-5 h-5 mr-2" />
                      Subscribe to Newsletter
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
