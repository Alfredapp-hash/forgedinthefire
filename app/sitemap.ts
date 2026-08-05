import { MetadataRoute } from 'next';

/**
 * SITEMAP STRATEGY FOR FORGEDINTHEFIREOHIO.ORG
 *
 * Best Practices Implemented:
 * 1. URL Coverage: All 16 important pages included (excludes error pages, API routes)
 * 2. Priority Hierarchy: Homepage & Get Help = 1.0, Services = 0.9, Content = 0.8, Legal = 0.3
 * 3. Change Frequency: Matches actual content update patterns (weekly for dynamic, yearly for static)
 * 4. Image Extensions: Added for key pages to improve image indexing
 * 5. Canonical URLs: All URLs use https://forgedinthefireohio.org
 *
 * Google Search Console Submission:
 * - Sitemap URL: https://forgedinthefireohio.org/sitemap.xml
 * - Submit via: Google Search Console > Sitemaps > Add new sitemap
 *
 * Sitemap Limits (Google):
 * - Max 50,000 URLs per sitemap
 * - Max 50MB uncompressed file size
 * - Current: 16 URLs (well within limits)
 *
 * Note: Next.js automatically generates /sitemap.xml from this file at build time
 */

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://forgedinthefireohio.org';

  // Static lastmod dates for content that changes infrequently
  // Update these when significant content changes are made
  const staticLastmod = '2025-05-13';

  return [
    // CORE PAGES - Highest Priority
    {
      url: baseUrl,
      lastModified: staticLastmod,
      changeFrequency: 'weekly',
      priority: 1,
      images: [
        `${baseUrl}/brand/fitf-lockup.png`,
        `${baseUrl}/opengraph-image.jpeg`,
      ],
    },
    {
      url: `${baseUrl}/get-help`,
      lastModified: staticLastmod,
      changeFrequency: 'weekly',
      priority: 1,
    },

    // SERVICE PAGES - High Priority
    {
      url: `${baseUrl}/services`,
      lastModified: staticLastmod,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/services/victim-advocacy`,
      lastModified: staticLastmod,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/services/workforce-development`,
      lastModified: staticLastmod,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/services/mentorship`,
      lastModified: staticLastmod,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/services/community-education`,
      lastModified: staticLastmod,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/services/accountability`,
      lastModified: staticLastmod,
      changeFrequency: 'monthly',
      priority: 0.8,
    },

    // CONTENT PAGES - Medium Priority
    {
      url: `${baseUrl}/about`,
      lastModified: staticLastmod,
      changeFrequency: 'monthly',
      priority: 0.8,
      images: [`${baseUrl}/Founder-headshot.png`],
    },
    {
      url: `${baseUrl}/resources`,
      lastModified: staticLastmod,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/donate`,
      lastModified: staticLastmod,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/volunteer`,
      lastModified: staticLastmod,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: staticLastmod,
      changeFrequency: 'monthly',
      priority: 0.7,
    },

    // LEGAL/UTILITY PAGES - Low Priority
    {
      url: `${baseUrl}/privacy`,
      lastModified: staticLastmod,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: staticLastmod,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/accessibility`,
      lastModified: staticLastmod,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
