import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { generateMetaTags } from '@/lib/utils';
import { BookOpen, Download, FileText, Video, ExternalLink, ChevronRight } from 'lucide-react';

export const metadata: Metadata = generateMetaTags({
  title: 'Human Trafficking Resources Lorain County Ohio',
  description:
    'Free human trafficking resources for Lorain County and Northeast Ohio, including survivor support information, awareness education, prevention materials, and trusted hotline links.',
});

const RESOURCES = [
  {
    category: 'Awareness',
    items: [
      { title: 'Human Trafficking 101', type: 'PDF', desc: 'Understanding the basics of human trafficking', href: '/resources/human-trafficking-101.pdf' },
      { title: 'Recognizing the Signs', type: 'PDF', desc: 'How to identify potential trafficking situations', href: '/resources/recognizing-the-signs.pdf' },
      { title: 'Myths vs Facts', type: 'PDF', desc: 'Common misconceptions about trafficking', href: '/resources/myths-vs-facts-human-trafficking.pdf' },
    ],
  },
  {
    category: 'For Survivors',
    items: [
      { title: 'Safety Planning Guide', type: 'PDF', desc: 'Creating a personalized safety plan', href: '/resources/safety-planning-guide.pdf' },
      { title: 'Know Your Rights', type: 'PDF', desc: 'Legal rights and protections for survivors', href: '/resources/know-your-rights-human-trafficking-survivors.pdf' },
      { title: 'Healing Resources', type: 'PDF', desc: 'Self-care and trauma recovery tools', href: '/resources/healing-after-trafficking.pdf' },
    ],
  },
  {
    category: 'For Professionals',
    items: [
      { title: 'Trauma-Informed Care Guide', type: 'PDF', desc: 'Best practices for service providers', href: null },
      { title: 'Screening Toolkit', type: 'PDF', desc: 'Identifying trafficking in healthcare settings', href: '/resources/human-trafficking-screening-toolkit.pdf' },
      { title: 'Multi-Disciplinary Team Guide', type: 'PDF', desc: 'Coordinating comprehensive response', href: '/resources/multi-disciplinary-anti-trafficking-response.pdf' },
    ],
  },
];

const EXTERNAL_RESOURCES = [
  { name: 'National Human Trafficking Hotline', url: 'https://humantraffickinghotline.org', desc: '24/7 support and resources' },
  { name: 'Polaris Project', url: 'https://polarisproject.org', desc: 'Leading data and research on trafficking' },
  { name: 'Office for Victims of Crime', url: 'https://ovc.ojp.gov', desc: 'Federal resources for crime victims' },
  { name: 'RAINN', url: 'https://rainn.org', desc: 'Sexual assault support and resources' },
];

export default function ResourcesPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="pt-32 pb-20 bg-gradient-to-b from-charcoal-900 to-charcoal">
        <div className="container-wide section-padding">
          <div className="max-w-4xl mx-auto text-center">
            <span className="text-ember font-medium mb-4 block">Knowledge is Power</span>
            <h1 className="font-serif text-5xl sm:text-6xl font-bold text-cream-100 mb-6">
              Human Trafficking Resources for Lorain County and Northeast Ohio
            </h1>
            <p className="text-xl text-cream-300/80 leading-relaxed max-w-2xl mx-auto">
              Access educational materials, downloadable guides, and trusted external 
              resources for human trafficking awareness and survivor support in Lorain County 
              and Northeast Ohio.
            </p>
          </div>
        </div>
      </section>

      {/* Downloadable Resources */}
      <section className="py-24 bg-charcoal">
        <div className="container-wide section-padding">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-serif text-4xl font-bold text-cream-100 mb-4">Downloadable Resources</h2>
            <p className="text-lg text-cream-300/80">Free guides and materials for survivors, advocates, and professionals.</p>
          </div>
          
          <div className="space-y-12 max-w-5xl mx-auto">
            {RESOURCES.map((section) => (
              <div key={section.category}>
                <h3 className="font-serif text-2xl font-semibold text-cream-100 mb-6 flex items-center gap-3">
                  <BookOpen className="h-6 w-6 text-ember" />
                  {section.category}
                </h3>
                <div className="grid md:grid-cols-3 gap-4">
                  {section.items.map((item) => (
                    item.href ? (
                      <a
                        key={item.title}
                        href={item.href}
                        download
                        className="block group"
                        aria-label={`Download ${item.title} PDF`}
                      >
                        <Card className="h-full bg-charcoal-800/50 border-steel-700 hover:border-ember/30 transition-colors group">
                          <CardContent className="p-5">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-lg bg-ember/10 flex items-center justify-center shrink-0">
                                <FileText className="h-5 w-5 text-ember" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-cream-100 mb-1 group-hover:text-ember transition-colors">{item.title}</h4>
                                <p className="text-sm text-silver-label mb-3">{item.desc}</p>
                                <div className="flex items-center gap-2 text-xs text-ember">
                                  <Download className="h-3 w-3" />
                                  <span>{item.type}</span>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </a>
                    ) : (
                      <Card key={item.title} className="bg-charcoal-800/50 border-steel-700 opacity-60 cursor-not-allowed">
                        <CardContent className="p-5">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-ember/10 flex items-center justify-center shrink-0">
                              <FileText className="h-5 w-5 text-ember" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-cream-100 mb-1">{item.title}</h4>
                              <p className="text-sm text-silver-label mb-3">{item.desc}</p>
                              <div className="flex items-center gap-2 text-xs text-silver-label">
                                <Download className="h-3 w-3" />
                                <span>Coming Soon</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* External Resources */}
      <section className="py-24 bg-charcoal-900">
        <div className="container-wide section-padding">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="font-serif text-3xl font-bold text-cream-100 mb-4">Trusted External Resources</h2>
              <p className="text-cream-300/80">Connect with national organizations and resources.</p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              {EXTERNAL_RESOURCES.map((resource) => (
                <a
                  key={resource.name}
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-4 p-5 bg-charcoal-800/50 rounded-lg border border-steel-700 hover:border-healing/30 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-healing/10 flex items-center justify-center shrink-0">
                    <ExternalLink className="h-5 w-5 text-healing" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-cream-100 mb-1 group-hover:text-healing transition-colors">{resource.name}</h4>
                    <p className="text-sm text-silver-label">{resource.desc}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Training Section */}
      <section className="py-24 bg-charcoal">
        <div className="container-wide section-padding">
          <div className="max-w-4xl mx-auto text-center">
            <div className="bg-gradient-to-br from-ember/10 to-healing/10 rounded-2xl p-12 border border-ember/20">
              <Video className="h-12 w-12 text-ember mx-auto mb-6" />
              <h2 className="font-serif text-3xl font-bold text-cream-100 mb-4">Professional Training</h2>
              <p className="text-cream-300/80 mb-8 max-w-2xl mx-auto">
                We offer comprehensive training programs for professionals, organizations, and community groups 
                seeking to better understand and respond to human trafficking.
              </p>
              <Button asChild variant="outline">
                <Link href="/services/community-education">Learn More About Training <ChevronRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
