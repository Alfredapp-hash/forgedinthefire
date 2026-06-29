import type { ContentBlock } from '@/src/features/content/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import Image from 'next/image'

/**
 * Renders content blocks for public-facing blog posts
 * Each block type has its own visual treatment
 */

interface BlockRendererProps {
  block: ContentBlock
}

export function BlockRenderer({ block }: BlockRendererProps) {
  switch (block.type) {
    case 'hero':
      return <HeroBlock block={block.data} />
    case 'text':
      return <TextBlock block={block.data} />
    case 'imageText':
      return <ImageTextBlock block={block.data} />
    case 'quote':
      return <QuoteBlock block={block.data} />
    case 'cta':
      return <CTABlock block={block.data} />
    case 'faq':
      return <FAQBlock block={block.data} />
    case 'gallery':
      return <GalleryBlock block={block.data} />
    case 'video':
      return <VideoBlock block={block.data} />
    default:
      return null
  }
}

function HeroBlock({ block }: { block: { title: string; subtitle?: string; image?: string } }) {
  return (
    <section className="relative py-16 md:py-24 lg:py-32">
      {block.image && (
        <div className="absolute inset-0 z-0">
          <Image
            src={block.image}
            alt={block.title}
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-charcoal/70 via-charcoal/50 to-charcoal" />
        </div>
      )}
      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="font-playfair text-3xl md:text-4xl lg:text-5xl font-bold text-cream-100 mb-4">
            {block.title}
          </h1>
          {block.subtitle && (
            <p className="text-lg md:text-xl text-cream-100/80">
              {block.subtitle}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function TextBlock({ block }: { block: { content: string } }) {
  if (!block.content) return null
  
  return (
    <div className="prose prose-invert prose-lg max-w-none">
      {/* Simple paragraph rendering - could use a markdown parser for more complex content */}
      {block.content.split('\n\n').map((paragraph, i) => (
        <p key={i} className="text-cream-100/90 leading-relaxed mb-4">
          {paragraph}
        </p>
      ))}
    </div>
  )
}

function ImageTextBlock({ block }: { block: { image: string; imageAlt: string; imagePosition: 'left' | 'right'; title?: string; content: string } }) {
  const imageSide = block.imagePosition === 'left' ? 'md:flex-row' : 'md:flex-row-reverse'
  
  return (
    <div className={`flex flex-col ${imageSide} gap-8 items-center`}>
      <div className="w-full md:w-1/2">
        <div className="relative aspect-video rounded-lg overflow-hidden">
          <Image
            src={block.image}
            alt={block.imageAlt}
            fill
            className="object-cover"
          />
        </div>
      </div>
      <div className="w-full md:w-1/2">
        {block.title && (
          <h3 className="font-playfair text-2xl font-semibold text-cream-100 mb-4">
            {block.title}
          </h3>
        )}
        <div className="text-cream-100/80 leading-relaxed">
          {block.content.split('\n\n').map((paragraph, i) => (
            <p key={i} className="mb-4">{paragraph}</p>
          ))}
        </div>
      </div>
    </div>
  )
}

function QuoteBlock({ block }: { block: { text: string; author?: string; role?: string } }) {
  return (
    <blockquote className="relative py-8 px-6 md:px-12 border-l-4 border-gold bg-charcoal-700/50 rounded-r-lg">
      <svg
        className="absolute top-4 left-4 w-8 h-8 text-gold/30"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
      </svg>
      <p className="font-playfair text-xl md:text-2xl italic text-cream-100 mb-4 pl-8">
        "{block.text}"
      </p>
      {(block.author || block.role) && (
        <footer className="pl-8">
          {block.author && (
            <cite className="not-italic font-semibold text-gold">
              — {block.author}
            </cite>
          )}
          {block.role && (
            <span className="text-cream-100/60 text-sm ml-2">
              {block.role}
            </span>
          )}
        </footer>
      )}
    </blockquote>
  )
}

function CTABlock({ block }: { block: { text: string; url: string; style?: 'primary' | 'secondary' | 'outline' } }) {
  const variantMap = {
    primary: 'default',
    secondary: 'secondary',
    outline: 'outline',
  } as const

  return (
    <div className="flex justify-center py-8">
      <Button
        asChild
        variant={variantMap[block.style || 'primary']}
        size="lg"
      >
        <a href={block.url}>{block.text}</a>
      </Button>
    </div>
  )
}

function FAQBlock({ block }: { block: { items: { question: string; answer: string }[] } }) {
  return (
    <div className="space-y-4">
      {block.items.map((item, i) => (
        <Card key={i} className="bg-charcoal-700/50 border-charcoal-600">
          <div className="p-6">
            <h4 className="font-semibold text-gold mb-2">{item.question}</h4>
            <p className="text-cream-100/80">{item.answer}</p>
          </div>
        </Card>
      ))}
    </div>
  )
}

function GalleryBlock({ block }: { block: { images: { src: string; alt: string; caption?: string }[] } }) {
  if (!block.images?.length) return null
  
  const gridCols = block.images.length === 1 ? 'grid-cols-1' : 
                   block.images.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 
                   'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
  
  return (
    <div className={`grid ${gridCols} gap-4`}>
      {block.images.map((image, i) => (
        <figure key={i} className="relative">
          <div className="relative aspect-square rounded-lg overflow-hidden">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              className="object-cover"
            />
          </div>
          {image.caption && (
            <figcaption className="mt-2 text-sm text-cream-100/60 text-center">
              {image.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  )
}

function VideoBlock({ block }: { block: { url: string; title?: string; caption?: string } }) {
  // Extract YouTube video ID
  const getYouTubeId = (url: string) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/)
    return match?.[1]
  }
  
  const youtubeId = getYouTubeId(block.url)
  
  return (
    <figure className="space-y-2">
      {youtubeId ? (
        <div className="relative aspect-video rounded-lg overflow-hidden bg-charcoal-700">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}`}
            title={block.title || 'Embedded video'}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="relative aspect-video rounded-lg overflow-hidden bg-charcoal-700 flex items-center justify-center">
          <a 
            href={block.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-cream-100 hover:text-gold transition-colors"
          >
            Watch Video →
          </a>
        </div>
      )}
      {block.caption && (
        <figcaption className="text-sm text-cream-100/60 text-center">
          {block.caption}
        </figcaption>
      )}
    </figure>
  )
}
