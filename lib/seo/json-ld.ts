const SITE = 'https://forgedinthefireohio.org'

export function articleJsonLd(post: {
  title: string
  slug: string
  excerpt?: string
  publishedAt?: string
  updatedAt?: string
  authorName?: string
  featuredImage?: { url?: string } | null
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    author: post.authorName
      ? { '@type': 'Person', name: post.authorName }
      : { '@type': 'Organization', name: 'Forged in the Fire' },
    publisher: {
      '@type': 'Organization',
      name: 'Forged in the Fire',
      url: SITE,
      logo: { '@type': 'ImageObject', url: `${SITE}/brand/fitf-lockup.png` },
    },
    image: post.featuredImage?.url,
    mainEntityOfPage: `${SITE}/blog/${post.slug}`,
    url: `${SITE}/blog/${post.slug}`,
  }
}

export function podcastSeriesJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'PodcastSeries',
    name: 'Forged in the Fire',
    url: `${SITE}/podcast`,
    webFeed: `${SITE}/podcast/rss.xml`,
  }
}
