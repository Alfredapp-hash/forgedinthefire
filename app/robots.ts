import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api', '/preview', '/login', '/unauthorized'],
      },
    ],
    sitemap: 'https://forgedinthefireohio.org/sitemap.xml',
  }
}
