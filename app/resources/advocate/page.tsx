import type { Metadata } from 'next';
import Link from 'next/link';
import { AdvocateGuideArticle } from '@/components/advocate-guide-article';
import { GUIDE_META, GUIDE_SECTIONS } from '@/lib/advocate-resource-guide';
import { FULL_GUIDE_PDF } from '@/lib/advocate-guide-routes';
import { generateMetaTags } from '@/lib/utils';

export const metadata: Metadata = generateMetaTags({
  title: 'Cuyahoga County Adult Advocate Resource Guide',
  description: `${GUIDE_META.purpose} Reviewed ${GUIDE_META.reviewed}.`,
});

export default function FullAdvocateGuidePage() {
  return (
    <div className="min-h-screen">
      <section className="bg-gradient-to-b from-charcoal-900 to-charcoal pb-10 pt-32">
        <div className="container-wide section-padding">
          <div className="mx-auto max-w-5xl">
            <p className="mb-3 text-sm text-cream-300/80">
              <Link href="/resources" className="text-ember hover:underline">
                Resources
              </Link>
            </p>
            <p className="mb-3 font-medium text-ember">
              {GUIDE_META.version} · Reviewed {GUIDE_META.reviewed}
            </p>
            <h1 className="font-serif text-4xl font-bold text-cream-100 sm:text-5xl">{GUIDE_META.title}</h1>
          </div>
        </div>
      </section>
      <section className="bg-charcoal py-12">
        <div className="container-wide section-padding">
          <div className="mx-auto max-w-5xl">
            <AdvocateGuideArticle
              title={GUIDE_META.title}
              sections={GUIDE_SECTIONS}
              pdfHref={FULL_GUIDE_PDF}
              pdfFilename="cuyahoga-county-adult-advocate-resource-guide.pdf"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
