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
    <div className="relative overflow-hidden rounded-2xl bg-[#241B18] border border-[#3A2A24] shadow-lg">
      {/* Decorative gradient line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#1E6B73] via-[#C8A46B] to-[#1E6B73]" />
      
      {/* Subtle background glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#1E6B73]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#C8A46B]/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />
      
      <div className="relative p-8 md:p-10">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
          {/* Left side - Content */}
          <div className="lg:w-1/2">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#1E6B73]/20 flex items-center justify-center border border-[#1E6B73]/30">
                <Mail className="w-5 h-5 text-[#4C9AA3]" />
              </div>
              <div className="flex items-center gap-1.5 text-[#C8A46B]">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-xs font-medium tracking-wider uppercase">Monthly Newsletter</span>
              </div>
            </div>
            
            <h3 className="font-serif text-2xl font-semibold text-[#F6F0E8] mb-3">
              Stay Connected
            </h3>
            
            <p className="text-[#CDBDAF] leading-relaxed">
              Subscribe to receive Forged in the Fire updates, survivor support resources, 
              community news, and new blog posts directly in your inbox.
            </p>
          </div>

          {/* Right side - CTA */}
          <div className="lg:w-1/2 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 text-sm text-[#B8A89A]">
              <p>No spam. Unsubscribe anytime.</p>
              <p>We respect your privacy.</p>
            </div>
            <Button 
              asChild
              size="lg" 
              className="bg-[#1E6B73] hover:bg-[#4C9AA3] text-[#F6F0E8] px-8 shadow-lg shadow-[#1E6B73]/20 transition-all duration-300"
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
    <div className="min-h-screen bg-[#181210]">
      {/* Hero Section */}
      <section className="relative py-16 md:py-24 bg-[#181210]">
        <div className="container-wide section-padding">
          <div className="max-w-3xl mx-auto text-center">
            <span className="text-[#4C9AA3] font-medium text-sm tracking-widest uppercase mb-4 block">
              Forged in the Fire Blog
            </span>
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-[#F6F0E8] mb-6 leading-tight">
              Stories, Resources, and Updates
            </h1>
            <p className="text-lg text-[#CDBDAF] leading-relaxed">
              Read survivor centered resources, organizational updates, and community news from Forged in the Fire.
            </p>
          </div>
        </div>
      </section>

      {/* Error Message */}
      <section className="py-12">
        <div className="container-wide section-padding">
          <div className="max-w-xl mx-auto text-center py-16 px-6 bg-[#241B18] rounded-2xl border border-[#3A2A24]">
            <div className="w-16 h-16 rounded-full bg-[#3A2A24] flex items-center justify-center mx-auto mb-6">
              <FileText className="w-8 h-8 text-[#B8A89A]" />
            </div>
            <h2 className="font-serif text-xl text-[#F6F0E8] mb-3">
              We could not load blog posts right now.
            </h2>
            <p className="text-[#CDBDAF] mb-6">
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
    <div className="text-center py-16 px-6 bg-[#241B18]/50 rounded-2xl border border-[#3A2A24]">
      <div className="w-14 h-14 rounded-full bg-[#3A2A24] flex items-center justify-center mx-auto mb-5">
        <FileText className="w-7 h-7 text-[#B8A89A]" />
      </div>
      <p className="font-serif text-lg text-[#F6F0E8] mb-2">
        {category ? 'No posts in this category yet.' : 'No blog posts have been published yet.'}
      </p>
      <p className="text-[#CDBDAF] text-sm max-w-md mx-auto">
        Check back soon for survivor resources, organizational updates, and monthly newsletters.
      </p>
    </div>
  )
}

// Featured Post Card
function FeaturedPostCard({ post }: { post: Awaited<ReturnType<typeof getBlogPosts>>[0] }) {
  return (
    <Card className="group overflow-hidden bg-[#241B18] border-[#3A2A24] hover:border-[#C8A46B]/50 transition-all duration-300">
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
            <div className="absolute inset-0 bg-gradient-to-br from-[#1E6B73]/20 to-[#241B18] flex items-center justify-center">
              <span className="font-serif text-2xl text-[#F6F0E8]/20">Forged</span>
            </div>
          )}
          <div className="absolute top-4 left-4">
            <Badge className="bg-[#C8A46B] text-[#181210] font-semibold text-xs">
              {getCategoryLabel(post.category)}
            </Badge>
          </div>
        </div>
        <CardContent className="p-6">
          <h3 className="font-serif text-xl font-semibold text-[#F6F0E8] mb-2 group-hover:text-[#C8A46B] transition-colors line-clamp-2">
            {post.title}
          </h3>
          <p className="text-[#CDBDAF] text-sm line-clamp-3 mb-4">
            {post.excerpt || 'Read more about this topic...'}
          </p>
          <div className="flex items-center gap-4 text-xs text-[#B8A89A]">
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
    <Card className="group overflow-hidden bg-[#241B18] border-[#3A2A24] hover:border-[#1E6B73]/50 transition-all duration-300">
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
            <div className="absolute inset-0 bg-gradient-to-br from-[#3A2A24] to-[#241B18] flex items-center justify-center">
              <span className="font-serif text-xl text-[#F6F0E8]/15">Forged</span>
            </div>
          )}
        </div>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="secondary" className="bg-[#3A2A24] text-[#CDBDAF] text-xs border-0">
              {getCategoryLabel(post.category)}
            </Badge>
            <span className="text-xs text-[#B8A89A] flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(post.publishedAt || post.createdAt)}
            </span>
          </div>
          <h3 className="font-serif text-lg font-semibold text-[#F6F0E8] mb-2 group-hover:text-[#4C9AA3] transition-colors line-clamp-2">
            {post.title}
          </h3>
          <p className="text-[#CDBDAF]/80 text-sm line-clamp-2 mb-3">
            {post.excerpt || 'Read more about this topic...'}
          </p>
          <span className="text-sm text-[#4C9AA3] font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
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
  searchParams: { category?: ContentCategory }
}) {
  // Defensive data fetching with try/catch
  let posts: Awaited<ReturnType<typeof getBlogPosts>> = []
  let fetchError = false

  try {
    posts = await getBlogPosts({
      category: searchParams.category,
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
  const activeCategory = searchParams.category

  return (
    <div className="min-h-screen bg-[#181210]">
      {/* Hero Section */}
      <section className="relative py-16 md:py-24 bg-[#181210]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1E6B73]/5 via-transparent to-transparent" />
        
        <div className="container-wide section-padding relative">
          <div className="max-w-3xl mx-auto text-center">
            <span className="text-[#4C9AA3] font-medium text-sm tracking-widest uppercase mb-4 block">
              Forged in the Fire Blog
            </span>
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-[#F6F0E8] mb-6 leading-tight">
              Stories, Resources, and Updates
            </h1>
            <p className="text-lg md:text-xl text-[#CDBDAF] leading-relaxed">
              Read survivor centered resources, organizational updates, and community news from Forged in the Fire.
            </p>
          </div>
        </div>
      </section>

      {/* Newsletter Section - Near Top */}
      <section className="py-8 bg-[#1E1714]">
        <div className="container-wide section-padding">
          <NewsletterSection />
        </div>
      </section>

      {/* Category Filter */}
      <section className="py-6 border-y border-[#3A2A24] bg-[#241B18]">
        <div className="container-wide section-padding">
          <div className="flex flex-wrap gap-2 justify-center">
            {categoryFilters.map((cat) => (
              <Link
                key={cat.value || 'all'}
                href={cat.value ? `/blog?category=${cat.value}` : '/blog'}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
                  (activeCategory === cat.value) || (!activeCategory && !cat.value)
                    ? 'bg-[#1E6B73] text-[#F6F0E8]'
                    : 'bg-[#3A2A24] text-[#CDBDAF] hover:bg-[#4A3A34] hover:text-[#F6F0E8]'
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
        <section className="py-12 bg-[#181210]">
          <div className="container-wide section-padding">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-8 h-8 rounded-lg bg-[#C8A46B]/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#C8A46B]" />
              </div>
              <h2 className="font-serif text-2xl font-semibold text-[#F6F0E8]">
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
      <section className="py-12 bg-[#181210]">
        <div className="container-wide section-padding">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-serif text-2xl font-semibold text-[#F6F0E8]">
              {activeCategory ? getCategoryLabel(activeCategory) : 'Latest Articles'}
            </h2>
            {!activeCategory && posts.length > 0 && (
              <span className="text-[#B8A89A] text-sm">
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
      <section className="py-16 bg-[#1E1714] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-[#1E6B73]/5 via-transparent to-transparent" />
        
        <div className="container-wide section-padding relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1E6B73]/20 to-[#C8A46B]/20 flex items-center justify-center mx-auto mb-6 border border-[#1E6B73]/30">
              <Heart className="w-7 h-7 text-[#4C9AA3]" />
            </div>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-[#F6F0E8] mb-4">
              Be Part of the Story
            </h2>
            <p className="text-lg text-[#CDBDAF] leading-relaxed mb-8 max-w-xl mx-auto">
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
