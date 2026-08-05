import type { ContentBlock } from '@/src/features/content/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import Image from 'next/image'
import Link from 'next/link'
import { ORG } from '@/lib/constants'

/**
 * Renders content blocks for public-facing blog posts
 */

interface BlockRendererProps {
  block: ContentBlock
}

export function BlockRenderer({ block }: BlockRendererProps) {
  switch (block.type) {
    case 'hero':
      return <HeroBlock block={block.data} />
    case 'intro':
      return <IntroBlock block={block.data} />
    case 'heading':
      return <HeadingBlock block={block.data} />
    case 'text':
      return <TextBlock block={block.data} />
    case 'imageText':
      return <ImageTextBlock block={block.data} />
    case 'quote':
      return <QuoteBlock block={block.data} />
    case 'testimonial':
      return <TestimonialBlock block={block.data} />
    case 'teamMember':
      return <TeamMemberBlock block={block.data} />
    case 'cta':
      return <CTABlock block={block.data} />
    case 'faq':
      return <FAQBlock block={block.data} />
    case 'checklist':
      return <ChecklistBlock block={block.data} />
    case 'quickAnswer':
      return <QuickAnswerBlock block={block.data} />
    case 'stats':
      return <StatsBlock block={block.data} />
    case 'gallery':
      return <GalleryBlock block={block.data} />
    case 'video':
      return <VideoBlock block={block.data} />
    case 'divider':
      return <DividerBlock block={block.data} />
    case 'beforeAfter':
      return <BeforeAfterBlock block={block.data} />
    case 'contactForm':
      return <ContactFormBlock block={block.data} />
    case 'relatedResources':
      return <RelatedResourcesBlock block={block.data} />
    case 'map':
      return <MapBlock block={block.data} />
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
  const getYouTubeId = (url: string) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/)
    return match?.[1]
  }
  const youtubeId = getYouTubeId(block.url)
  return (
    <figure className="space-y-2">
      {youtubeId ? (
        <div className="relative aspect-video rounded-lg overflow-hidden bg-charcoal-700">
          <iframe src={`https://www.youtube.com/embed/${youtubeId}`} title={block.title || 'Embedded video'} className="absolute inset-0 w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      ) : (
        <div className="relative aspect-video rounded-lg overflow-hidden bg-charcoal-700 flex items-center justify-center">
          <a href={block.url} target="_blank" rel="noopener noreferrer" className="text-cream-100 hover:text-gold transition-colors">Watch Video →</a>
        </div>
      )}
      {block.caption && <figcaption className="text-sm text-cream-100/60 text-center">{block.caption}</figcaption>}
    </figure>
  )
}

function IntroBlock({ block }: { block: { text: string } }) {
  if (!block.text) return null
  return <p className="text-xl text-cream-100/90 leading-relaxed font-medium">{block.text}</p>
}

function HeadingBlock({ block }: { block: { text: string; level: 2 | 3 | 4 } }) {
  const Tag = `h${block.level}` as 'h2' | 'h3' | 'h4'
  const sizes = { 2: 'text-3xl', 3: 'text-2xl', 4: 'text-xl' }
  return <Tag className={`font-playfair font-bold text-cream-100 ${sizes[block.level]} mb-4`}>{block.text}</Tag>
}

function ChecklistBlock({ block }: { block: { title?: string; items: { text: string }[] } }) {
  return (
    <div>
      {block.title && <h3 className="font-semibold text-gold mb-3">{block.title}</h3>}
      <ul className="space-y-2">
        {block.items.filter((i) => i.text).map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-cream-100/90"><span className="text-gold">✓</span>{item.text}</li>
        ))}
      </ul>
    </div>
  )
}

function QuickAnswerBlock({ block }: { block: { question: string; answer: string } }) {
  return (
    <Card className="bg-teal/20 border-teal/40 p-6">
      <p className="text-sm font-bold uppercase tracking-wider text-gold mb-2">Quick Answer</p>
      <h3 className="font-semibold text-cream-100 mb-2">{block.question}</h3>
      <p className="text-cream-100/80">{block.answer}</p>
    </Card>
  )
}

function StatsBlock({ block }: { block: { items: { value: string; label: string }[] } }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {block.items.map((item, i) => (
        <div key={i} className="text-center p-4 bg-charcoal-700/50 rounded-xl">
          <p className="text-3xl font-bold text-gold">{item.value}</p>
          <p className="text-sm text-cream-100/70 mt-1">{item.label}</p>
        </div>
      ))}
    </div>
  )
}

function TestimonialBlock({ block }: { block: { text: string; author: string; role?: string; image?: string } }) {
  return (
    <div className="flex gap-4 items-start p-6 bg-charcoal-700/50 rounded-xl">
      {block.image && <div className="relative w-16 h-16 rounded-full overflow-hidden shrink-0"><Image src={block.image} alt={block.author} fill className="object-cover" /></div>}
      <div>
        <p className="text-cream-100/90 italic mb-2">&ldquo;{block.text}&rdquo;</p>
        <p className="font-semibold text-gold">{block.author}</p>
        {block.role && <p className="text-sm text-cream-100/60">{block.role}</p>}
      </div>
    </div>
  )
}

function TeamMemberBlock({ block }: { block: { name: string; role: string; bio?: string; image?: string } }) {
  return (
    <div className="text-center p-6">
      {block.image && <div className="relative w-24 h-24 rounded-full overflow-hidden mx-auto mb-4"><Image src={block.image} alt={block.name} fill className="object-cover" /></div>}
      <h3 className="font-playfair text-xl font-semibold text-cream-100">{block.name}</h3>
      <p className="text-gold text-sm mb-2">{block.role}</p>
      {block.bio && <p className="text-cream-100/70 text-sm">{block.bio}</p>}
    </div>
  )
}

function DividerBlock({ block }: { block: { style?: 'line' | 'dots' | 'space' } }) {
  if (block.style === 'space') return <div className="h-8" />
  if (block.style === 'dots') return <div className="text-center text-gold tracking-widest py-4">• • •</div>
  return <hr className="border-charcoal-600 my-8" />
}

function BeforeAfterBlock({ block }: { block: { beforeImage: string; afterImage: string; beforeLabel?: string; afterLabel?: string; caption?: string } }) {
  return (
    <figure>
      <div className="grid grid-cols-2 gap-4">
        {[{ src: block.beforeImage, label: block.beforeLabel ?? 'Before' }, { src: block.afterImage, label: block.afterLabel ?? 'After' }].map((side, i) => (
          <div key={i}>
            <p className="text-sm font-semibold text-gold mb-2 text-center">{side.label}</p>
            {side.src && <div className="relative aspect-video rounded-lg overflow-hidden"><Image src={side.src} alt={side.label} fill className="object-cover" /></div>}
          </div>
        ))}
      </div>
      {block.caption && <figcaption className="text-sm text-cream-100/60 text-center mt-3">{block.caption}</figcaption>}
    </figure>
  )
}

function ContactFormBlock({ block }: { block: { heading: string; description?: string; formType: 'contact' | 'volunteer' | 'donate' } }) {
  const urls = { contact: '/contact', volunteer: '/volunteer', donate: '/donate' }
  return (
    <Card className="bg-charcoal-700/50 border-charcoal-600 p-8 text-center">
      <h3 className="font-playfair text-2xl font-semibold text-cream-100 mb-2">{block.heading}</h3>
      {block.description && <p className="text-cream-100/70 mb-6">{block.description}</p>}
      <Button asChild><Link href={urls[block.formType]}>Get Started</Link></Button>
    </Card>
  )
}

function RelatedResourcesBlock({ block }: { block: { title?: string; items: { title: string; url: string; description?: string }[] } }) {
  return (
    <div>
      {block.title && <h3 className="font-playfair text-xl font-semibold text-cream-100 mb-4">{block.title}</h3>}
      <ul className="space-y-3">
        {block.items.filter((i) => i.title).map((item, i) => (
          <li key={i}><Link href={item.url} className="text-gold hover:text-cream-100 font-medium">{item.title}</Link>{item.description && <p className="text-sm text-cream-100/60">{item.description}</p>}</li>
        ))}
      </ul>
    </div>
  )
}

function MapBlock({ block }: { block: { heading?: string; address: string; embedUrl?: string } }) {
  const query = encodeURIComponent(block.address || ORG.address)
  return (
    <div>
      {block.heading && <h3 className="font-playfair text-xl font-semibold text-cream-100 mb-4">{block.heading}</h3>}
      <p className="text-cream-100/80 mb-4">{block.address}</p>
      <div className="relative aspect-video rounded-lg overflow-hidden bg-charcoal-700">
        <iframe title="Map" src={block.embedUrl ?? `https://maps.google.com/maps?q=${query}&output=embed`} className="absolute inset-0 w-full h-full border-0" loading="lazy" />
      </div>
    </div>
  )
}
