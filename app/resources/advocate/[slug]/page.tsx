import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdvocateGuideArticle } from '@/components/advocate-guide-article';
import { GUIDE_META, GUIDE_SECTIONS } from '@/lib/advocate-resource-guide';
import { getGuideSection, guidePdfPath } from '@/lib/advocate-guide-routes';
import { generateMetaTags } from '@/lib/utils';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return GUIDE_SECTIONS.map((section) => ({ slug: section.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const section = getGuideSection(slug);
  if (!section) return {};
  return generateMetaTags({
    title: `${section.title} | Adult Advocate Resource Guide`,
    description: section.intro || `${section.title}. ${GUIDE_META.coverage}.`,
  });
}

export default async function AdvocateGuideSectionPage({ params }: PageProps) {
  const { slug } = await params;
  const section = getGuideSection(slug);
  if (!section) notFound();

  return (
    <div className="min-h-screen">
      <section className="bg-gradient-to-b from-charcoal-900 to-charcoal pb-10 pt-32">
        <div className="container-wide section-padding">
          <div className="mx-auto max-w-5xl">
            <p className="mb-3 text-sm text-cream-300/80">
              <Link href="/resources" className="text-ember hover:underline">
                Resources
              </Link>
              <span className="mx-2">/</span>
              <Link href="/resources/advocate" className="text-ember hover:underline">
                Adult advocate guide
              </Link>
            </p>
            <p className="mb-3 font-medium text-ember">
              {section.group} · {GUIDE_META.version} · Reviewed {GUIDE_META.reviewed}
            </p>
            <h1 className="font-serif text-4xl font-bold text-cream-100 sm:text-5xl">{section.title}</h1>
          </div>
        </div>
      </section>
      <section className="bg-charcoal py-12">
        <div className="container-wide section-padding">
          <div className="mx-auto max-w-5xl">
            <AdvocateGuideArticle
              title={section.title}
              sections={[section]}
              pdfHref={guidePdfPath(section.id)}
              pdfFilename={`${section.id}.pdf`}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
