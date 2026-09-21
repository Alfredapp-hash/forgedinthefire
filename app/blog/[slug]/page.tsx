import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { getBlogPost, getRelatedPosts, getCategoryLabel, formatDate } from '@/src/lib/blog'
import { BlockRenderer } from '@/src/components/blog/BlockRenderer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, User, ArrowLeft, Clock, Share2 } from 'lucide-react'
import { articleJsonLd } from '@/lib/seo/json-ld'

interface BlogPostPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getBlogPost(slug)
  
  if (!post) {
    return {
      title: 'Post Not Found | Forged in the Fire',
    }
  }
  
  return {
    title: `${post.seo.title || post.title} | Forged in the Fire`,
    description: post.seo.description || post.excerpt,
    keywords: post.seo.keywords,
    openGraph: {
      title: post.seo.ogTitle || post.seo.title || post.title,
      description: post.seo.ogDescription || post.seo.description || post.excerpt,
      type: 'article',
      publishedTime: post.publishedAt ?? undefined,
      authors: post.authorName ? [post.authorName] : undefined,
      images: post.seo.ogImage || post.featuredImage?.url ? [
        {
          url: post.seo.ogImage || post.featuredImage?.url || '',
          alt: post.featuredImage?.alt || post.title,
        }
      ] : undefined,
    },
    alternates: {
      canonical: post.seo.canonicalUrl || `/blog/${post.slug}`,
    },
    robots: post.seo.noIndex ? 'noindex' : undefined,
  }
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params
  const post = await getBlogPost(slug)
  
  if (!post) {
    notFound()
  }
  
  const relatedPosts = await getRelatedPosts(post.id, post.category, 3)
  
  // Separate hero block from content blocks
  const heroBlock = post.blocks.find(b => b.type === 'hero')
  const contentBlocks = post.blocks.filter(b => b.type !== 'hero')
  
  return (
    <article className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(post)) }}
      />
      {/* Navigation Breadcrumb */}
      <nav className="py-4 border-b border-charcoal-700">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <Link 
            href="/blog" 
            className="text-sm text-cream-100/60 hover:text-gold transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Blog
          </Link>
        </div>
      </nav>
      
      {/* Hero Section */}
      {heroBlock ? (
        <BlockRenderer block={heroBlock} />
      ) : (
        <section className="py-16 md:py-24 bg-gradient-to-b from-charcoal to-charcoal-800">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <Badge className="mb-4 bg-forged text-forged-on">
                {getCategoryLabel(post.category)}
              </Badge>
              <h1 className="font-playfair text-3xl md:text-4xl lg:text-5xl font-bold text-cream-100 mb-4">
                {post.title}
              </h1>
              <div className="flex items-center justify-center gap-4 text-sm text-cream-100/60">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(post.publishedAt || post.createdAt)}
                </span>
                {post.authorName && (
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {post.authorName}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Content */}
      <main className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            {/* Meta Bar (if hero block was used) */}
            {heroBlock && (
              <div className="flex flex-wrap items-center gap-4 mb-8 pb-8 border-b border-charcoal-700">
                <Badge className="bg-forged text-forged-on">
                  {getCategoryLabel(post.category)}
                </Badge>
                <span className="text-sm text-cream-100/60 flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(post.publishedAt || post.createdAt)}
                </span>
                {post.authorName && (
                  <span className="text-sm text-cream-100/60 flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {post.authorName}
                  </span>
                )}
              </div>
            )}
            
            {/* Excerpt (if present) */}
            {post.excerpt && !heroBlock && (
              <p className="text-xl text-cream-100/80 leading-relaxed mb-8 font-light">
                {post.excerpt}
              </p>
            )}
            
            {/* Featured Image (if not in hero) */}
            {post.featuredImage?.url && !heroBlock?.data.image && (
              <figure className="mb-12">
                <div className="relative aspect-video rounded-lg overflow-hidden">
                  <Image
                    src={post.featuredImage.url}
                    alt={post.featuredImage.alt || post.title}
                    fill
                    className="object-cover"
                    priority
                  />
                </div>
                {post.featuredImage.caption && (
                  <figcaption className="mt-2 text-sm text-cream-100/50 text-center">
                    {post.featuredImage.caption}
                  </figcaption>
                )}
              </figure>
            )}
            
            {/* Content Blocks */}
            <div className="space-y-12">
              {contentBlocks.map((block, index) => (
                <BlockRenderer key={index} block={block} />
              ))}
            </div>
            
            {/* CTA Section */}
            {post.cta && (
              <div className="mt-16 pt-8 border-t border-charcoal-700">
                <Card className="bg-gradient-to-r from-teal-900/50 to-charcoal-700 border-teal/30">
                  <CardContent className="p-8 text-center">
                    <h3 className="font-playfair text-xl font-semibold text-cream-100 mb-4">
                      Take Action
                    </h3>
                    <Button asChild className="font-semibold">
                      <Link href={post.cta.url}>{post.cta.text}</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
            
            {/* Tags */}
            {post.tags.length > 0 && (
              <div className="mt-12 pt-8 border-t border-charcoal-700">
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span 
                      key={tag}
                      className="px-3 py-1 bg-charcoal-700 text-cream-100/70 text-sm rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Share */}
            <div className="mt-8 pt-8 border-t border-charcoal-700">
              <div className="flex items-center justify-between">
                <span className="text-sm text-cream-100/60">
                  Share this story
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <section className="py-16 bg-charcoal-800">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="font-playfair text-2xl font-semibold text-cream-100 mb-8">
              More {getCategoryLabel(post.category)}
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {relatedPosts.map((relatedPost) => (
                <RelatedPostCard key={relatedPost.id} post={relatedPost} />
              ))}
            </div>
          </div>
        </section>
      )}
      
      {/* Bottom CTA */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="font-playfair text-3xl font-bold text-cream-100 mb-4">
              Support Our Mission
            </h2>
            <p className="text-cream-100/80 mb-8">
              Your support helps us provide safe housing, trauma-informed care, and hope to survivors of human trafficking.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild>
                <Link href="/donate">Donate Now</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/volunteer">Become a Volunteer</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </article>
  )
}

function RelatedPostCard({ post }: { post: Awaited<ReturnType<typeof getRelatedPosts>>[0] }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group">
      <Card className="overflow-hidden bg-charcoal-700 border-charcoal-600 hover:border-teal/50 transition-all">
        <div className="relative aspect-video">
          {post.featuredImage?.url ? (
            <Image
              src={post.featuredImage.url}
              alt={post.featuredImage.alt || post.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-charcoal-800 to-charcoal-700" />
          )}
        </div>
        <CardContent className="p-4">
          <h3 className="font-playfair text-lg font-semibold text-cream-100 group-hover:text-teal transition-colors line-clamp-2">
            {post.title}
          </h3>
          <p className="text-sm text-cream-100/50 mt-2 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(post.publishedAt || post.createdAt)}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
