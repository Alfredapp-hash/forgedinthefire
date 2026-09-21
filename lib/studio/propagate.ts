import { revalidatePath } from 'next/cache'

const SITE = 'https://forgedinthefireohio.org'

export function propagatePublicSurfaces(opts: {
  blogSlug?: string | null
  episodeSlug?: string | null
}) {
  revalidatePath('/blog')
  revalidatePath('/blog/rss.xml')
  revalidatePath('/podcast')
  revalidatePath('/podcast/rss.xml')
  revalidatePath('/sitemap.xml')
  if (opts.blogSlug) revalidatePath(`/blog/${opts.blogSlug}`)
  if (opts.episodeSlug) {
    revalidatePath(`/podcast/${opts.episodeSlug}`)
    revalidatePath(`/podcast/${opts.episodeSlug}/transcript.vtt`)
  }
}

export function publicUrl(path: string) {
  return `${SITE}${path.startsWith('/') ? path : `/${path}`}`
}
