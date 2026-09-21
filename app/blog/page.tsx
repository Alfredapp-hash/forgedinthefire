import { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { getBlogPosts, getCategoryLabel, formatDate } from '@/src/lib/blog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Calendar, User, FileText, Heart, Mail, Sparkles, Loader2 } from 'lucide-react'
import type { ContentCategory } from '@/src/features/content/types'

// Newsletter signup component that opens the navbar subscribe modal via URL param
function NewsletterSection() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#11161C] border border-[#1A232C] shadow-lg">
      {/* Decorative gradient line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#53D6FF] via-[#8DEBFF] to-[#53D6FF]" />
      
      {/* Subtle background glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#53D6FF]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#53D6FF]/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />
      
      <div className="relative p-8 md:p-10">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
          {/* Left side - Content */}
          <div className="lg:w-1/2">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#53D6FF]/20 flex items-center justify-center border border-[#53D6FF]/30">
                <Mail className="w-5 h-5 text-[#53D6FF]" />
              </div>
              <div className="flex items-center gap-1.5 text-[#8DEBFF]">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-xs font-medium tracking-wider uppercase">Monthly Newsletter</span>
              </div>
            </div>
            
            <h3 className="font-serif text-2xl font-semibold text-[#F6FAFC] mb-3">
              Stay Connected
            </h3>
            
            <p className="text-[#B8C4CF] leading-relaxed">
              Subscribe to receive Forged in the Fire updates, survivor support resources, 
              community news, and new blog posts directly in your inbox.
            </p>
          </div>

          {/* Right side - CTA */}
          <div className="lg:w-1/2 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 text-sm text-[#A9B8C6]">
              <p>No spam. Unsubscribe anytime.</p>
              <p>We respect your privacy.</p>
            </div>
            <Button 
              asChild
              size="lg" 
              className="bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016] px-8 shadow-lg shadow-[#53D6FF]/20 transition-all duration-300"
            >
              <Link href="/?subscribe=1">Subscribe</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export const metadata: Metadata = {
  title: 'Blog | Forged in the Fire',
  description: 'Stories, resources, newsletters, and updates from Forged in the Fire, supporting survivors of human trafficking in Lorain County and Northeast Ohio.',
  openGraph: {
    title: 'Blog | Forged in the Fire',
    description: 'Stories, resources, newsletters, and updates from Forged in the Fire.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog | Forged in the Fire',
    description: 'Stories, resources, newsletters, and updates from Forged in the Fire.',
  },
  alternates: {
    canonical: 'https://forgedinthefireohio.org/blog',
  },
}

// Simplified category list for filtering
const categoryFilters: { value: ContentCategory | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'resources', label: 'Survivor Resources' },
  { value: 'news', label: 'Community Updates' },
  { value: 'donor-updates', label: 'Newsletter' },
  { value: 'impact-stories', label: 'Education' },
  { value: 'events', label: 'Events' },
]

// Error fallback component
function BlogErrorState() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-16 md:py-24 bg-transparent">
        <div className="container-wide section-padding">
          <div className="max-w-3xl mx-auto text-center">
            <span className="text-[#53D6FF] font-medium text-sm tracking-widest uppercase mb-4 block">
              Forged in the Fire Blog
            </span>
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-[#F6FAFC] mb-6 leading-tight">
              Stories, Resources, and Updates
            </h1>
            <p className="text-lg text-[#B8C4CF] leading-relaxed">
              Read survivor centered resources, organizational updates, and community news from Forged in the Fire.
            </p>
          </div>
        </div>
      </section>

      {/* Error Message */}
      <section className="py-12">
        <div className="container-wide section-padding">
          <div className="max-w-xl mx-auto text-center py-16 px-6 bg-[#11161C] rounded-2xl border border-[#1A232C]">
            <div className="w-16 h-16 rounded-full bg-[#1A232C] flex items-center justify-center mx-auto mb-6">
              <FileText className="w-8 h-8 text-[#A9B8C6]" />
            </div>
            <h2 className="font-serif text-xl text-[#F6FAFC] mb-3">
              We could not load blog posts right now.
            </h2>
            <p className="text-[#B8C4CF] mb-6">
              Please check back soon for survivor resources, organizational updates, and monthly newsletters.
            </p>
            <Button asChild>
              <Link href="/">Return Home</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

// Empty state component
function BlogEmptyState({ category }: { category?: string }) {
  return (
    <div className="text-center py-16 px-6 bg-[#11161C]/50 rounded-2xl border border-[#1A232C]">
      <div className="w-14 h-14 rounded-full bg-[#1A232C] flex items-center justify-center mx-auto mb-5">
        <FileText className="w-7 h-7 text-[#A9B8C6]" />
      </div>
      <p className="font-serif text-lg text-[#F6FAFC] mb-2">
        {category ? 'No posts in this category yet.' : 'No blog posts have been published yet.'}
      </p>
      <p className="text-[#B8C4CF] text-sm max-w-md mx-auto">
        Check back soon for survivor resources, organizational updates, and monthly newsletters.
      </p>
    </div>
  )
}

// Featured Post Card
function FeaturedPostCard({ post }: { post: Awaited<ReturnType<typeof getBlogPosts>>[0] }) {
  return (
    <Card className="group overflow-hidden bg-[#11161C] border-[#1A232C] hover:border-[#8DEBFF]/50 transition-all duration-300">
      <Link href={`/blog/${post.slug}`} className="block">
        <div className="relative aspect-[16/10] overflow-hidden">
          {post.featuredImage?.url ? (
            <Image
              src={post.featuredImage.url}
              alt={post.featuredImage.alt || post.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#53D6FF]/20 to-[#11161C] flex items-center justify-center">
              <span className="font-serif text-2xl text-[#27313B]">Forged</span>
            </div>
          )}
          <div className="absolute top-4 left-4">
            <Badge className="bg-[#53D6FF] text-[#05070A] font-semibold text-xs">
              {getCategoryLabel(post.category)}
            </Badge>
          </div>
        </div>
        <CardContent className="p-6">
          <h3 className="font-serif text-xl font-semibold text-[#F6FAFC] mb-2 group-hover:text-[#8DEBFF] transition-colors line-clamp-2">
            {post.title}
          </h3>
          <p className="text-[#B8C4CF] text-sm line-clamp-3 mb-4">
            {post.excerpt || 'Read more about this topic...'}
          </p>
          <div className="flex items-center gap-4 text-xs text-[#A9B8C6]">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(post.publishedAt || post.createdAt)}
            </span>
            {post.authorName && (
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {post.authorName}
              </span>
            )}
          </div>
        </CardContent>
      </Link>
    </Card>
  )
}

// Regular Post Card
function PostCard({ post }: { post: Awaited<ReturnType<typeof getBlogPosts>>[0] }) {
  return (
    <Card className="group overflow-hidden bg-[#11161C] border-[#1A232C] hover:border-[#53D6FF]/50 transition-all duration-300">
      <Link href={`/blog/${post.slug}`} className="block">
        <div className="relative aspect-[16/10] overflow-hidden">
          {post.featuredImage?.url ? (
            <Image
              src={post.featuredImage.url}
              alt={post.featuredImage.alt || post.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#1A232C] to-[#11161C] flex items-center justify-center">
              <span className="font-serif text-xl text-[#27313B]">Forged</span>
            </div>
          )}
        </div>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="secondary" className="bg-[#1A232C] text-[#B8C4CF] text-xs border-0">
              {getCategoryLabel(post.category)}
            </Badge>
            <span className="text-xs text-[#A9B8C6] flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(post.publishedAt || post.createdAt)}
            </span>
          </div>
          <h3 className="font-serif text-lg font-semibold text-[#F6FAFC] mb-2 group-hover:text-[#53D6FF] transition-colors line-clamp-2">
            {post.title}
          </h3>
          <p className="text-[#B8C4CF]/80 text-sm line-clamp-2 mb-3">
            {post.excerpt || 'Read more about this topic...'}
          </p>
          <span className="text-sm text-[#53D6FF] font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
            Read More <ArrowRight className="w-4 h-4" />
          </span>
        </CardContent>
      </Link>
    </Card>
  )
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: ContentCategory }>
}) {
  const params = await searchParams
  // Defensive data fetching with try/catch
  let posts: Awaited<ReturnType<typeof getBlogPosts>> = []
  let fetchError = false

  try {
    posts = await getBlogPosts({
      category: params.category,
    })
  } catch (error) {
    console.error('Blog fetch error:', error)
    fetchError = true
  }

  // If there's a critical error, show error state
  if (fetchError) {
    return <BlogErrorState />
  }

  const featuredPosts = posts.filter(p => p.featured).slice(0, 2)
  const regularPosts = posts.filter(p => !p.featured)
  const activeCategory = params.category

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-16 md:py-24 bg-transparent">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#53D6FF]/5 via-transparent to-transparent" />
        
        <div className="container-wide section-padding relative">
          <div className="max-w-3xl mx-auto text-center">
            <span className="text-[#53D6FF] font-medium text-sm tracking-widest uppercase mb-4 block">
              Forged in the Fire Blog
            </span>
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-[#F6FAFC] mb-6 leading-tight">
              Stories, Resources, and Updates
            </h1>
            <p className="text-lg md:text-xl text-[#B8C4CF] leading-relaxed">
              Read survivor centered resources, organizational updates, and community news from Forged in the Fire.
            </p>
          </div>
        </div>
      </section>

      {/* Newsletter Section - Near Top */}
      <section className="py-8 bg-transparent">
        <div className="container-wide section-padding">
          <NewsletterSection />
        </div>
      </section>

      {/* Category Filter */}
      <section className="py-6 border-y border-[#1A232C] bg-[#11161C]">
        <div className="container-wide section-padding">
          <div className="flex flex-wrap gap-2 justify-center">
            {categoryFilters.map((cat) => (
              <Link
                key={cat.value || 'all'}
                href={cat.value ? `/blog?category=${cat.value}` : '/blog'}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
                  (activeCategory === cat.value) || (!activeCategory && !cat.value)
                    ? 'bg-[#53D6FF] text-[#061016]'
                    : 'bg-[#1A232C] text-[#B8C4CF] hover:bg-[#27313B] hover:text-[#F6FAFC]'
                }`}
              >
                {cat.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Posts */}
      {featuredPosts.length > 0 && (
        <section className="py-12 bg-transparent">
          <div className="container-wide section-padding">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-8 h-8 rounded-lg bg-[#53D6FF]/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#8DEBFF]" />
              </div>
              <h2 className="font-serif text-2xl font-semibold text-[#F6FAFC]">
                Featured Stories
              </h2>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {featuredPosts.map((post) => (
                <FeaturedPostCard key={post.id} post={post} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* All Posts */}
      <section className="py-12 bg-transparent">
        <div className="container-wide section-padding">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-serif text-2xl font-semibold text-[#F6FAFC]">
              {activeCategory ? getCategoryLabel(activeCategory) : 'Latest Articles'}
            </h2>
            {!activeCategory && posts.length > 0 && (
              <span className="text-[#A9B8C6] text-sm">
                {posts.length} {posts.length === 1 ? 'article' : 'articles'}
              </span>
            )}
          </div>
          
          {posts.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {regularPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <BlogEmptyState category={activeCategory} />
          )}
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-16 bg-transparent relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-[#53D6FF]/5 via-transparent to-transparent" />
        
        <div className="container-wide section-padding relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#53D6FF]/20 to-[#8DEBFF]/20 flex items-center justify-center mx-auto mb-6 border border-[#53D6FF]/30">
              <Heart className="w-7 h-7 text-heart" />
            </div>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-[#F6FAFC] mb-4">
              Be Part of the Story
            </h2>
            <p className="text-lg text-[#B8C4CF] leading-relaxed mb-8 max-w-xl mx-auto">
              Your support helps us continue sharing stories of resilience, creating resources for survivors, and building a stronger community.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="px-8">
                <Link href="/donate">Support Our Mission</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="px-8">
                <Link href="/volunteer">Get Involved</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
