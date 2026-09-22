import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { QuickExit } from '@/components/quick-exit';
import { OrganizationStructuredData, WebsiteStructuredData } from '@/components/structured-data';
import AnalyticsGate from '@/components/analytics-gate';
import { getSiteSettings } from '@/lib/site-settings';
import { META_DEFAULTS, ORG, GEO } from '@/lib/constants';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-playfair',
});

export const metadata: Metadata = {
  title: META_DEFAULTS.title,
  description: META_DEFAULTS.description,
  keywords: [...META_DEFAULTS.keywords],
  authors: META_DEFAULTS.authors.map((name) => ({ name })),
  creator: META_DEFAULTS.creator,
  publisher: META_DEFAULTS.publisher,
  robots: META_DEFAULTS.robots,
  metadataBase: new URL('https://forgedinthefireohio.org'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: META_DEFAULTS.title,
    description: META_DEFAULTS.description,
    type: 'website',
    locale: 'en_US',
    siteName: ORG.name,
    images: [
      {
        url: '/opengraph-image.jpeg',
        width: 1200,
        height: 630,
        alt: `Forged in the Fire - Human Trafficking Victim Advocacy in ${GEO.seoLocality}`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: META_DEFAULTS.title,
    description: META_DEFAULTS.description,
    images: ['/opengraph-image.jpeg'],
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSiteSettings()
  const gaId = settings.google_analytics_id || process.env.NEXT_PUBLIC_GA_ID || ''

  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable}`}
      suppressHydrationWarning
    >
      <head>
        <OrganizationStructuredData />
        <WebsiteStructuredData />
      </head>
      {/* Background is owned by globals.css so the page radial gradient shows. */}
      <body className="min-h-screen text-cream-100 antialiased" suppressHydrationWarning>
        {/* Navbar is a body child, not inside the relative page shell, so the
            mobile sheet can sit on the viewport instead of inside header glass. */}
        <Navbar />
        <div className="relative flex min-h-screen flex-col">
          <main className="flex-1" id="main-content">
            {children}
          </main>
          <Footer />
          <QuickExit />
          <AnalyticsGate measurementId={gaId || undefined} />
        </div>
      </body>
    </html>
  );
}
