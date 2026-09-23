import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, ExternalLink } from 'lucide-react';
import { educationGuides, getEducationGuide } from '@/lib/education-resources';
import { generateMetaTags } from '@/lib/utils';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return educationGuides().map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getEducationGuide(slug);
  if (!guide) return {};
  return generateMetaTags({
    title: guide.title,
    description: guide.description,
  });
}

export default async function EducationGuidePage({ params }: PageProps) {
  const { slug } = await params;
  const guide = getEducationGuide(slug);
  if (!guide) notFound();
  const filename = guide.href.split('/').pop() || `${guide.slug}.pdf`;

  return (
    <div className="min-h-screen">
      <section className="bg-gradient-to-b from-charcoal-900 to-charcoal pb-16 pt-32">
        <div className="container-wide section-padding">
          <div className="mx-auto max-w-3xl">
            <p className="mb-3 text-sm text-cream-300/80">
              <Link href="/resources" className="text-ember hover:underline">
                Resources
              </Link>
            </p>
            <h1 className="mb-4 font-serif text-4xl font-bold text-cream-100 sm:text-5xl">
              {guide.title}
            </h1>
            <p className="mb-8 text-lg leading-relaxed text-cream-300/80">{guide.description}</p>
            <div className="flex flex-wrap gap-3">
              <a
                href={guide.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-ember bg-ember px-4 py-2 text-sm font-semibold text-[#061016]"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                View PDF
              </a>
              <a
                href={guide.href}
                download={filename}
                className="inline-flex items-center gap-2 rounded-lg border border-ember/40 px-4 py-2 text-sm font-semibold text-cream-100"
              >
                <Download className="h-4 w-4" aria-hidden />
                Download PDF
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
