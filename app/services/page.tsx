import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SERVICES } from '@/lib/constants';
import { generateMetaTags } from '@/lib/utils';
import { 
  Shield, Briefcase, Users, GraduationCap, Scale, Home, Brain,
  ArrowRight, ChevronRight 
} from 'lucide-react';

export const metadata: Metadata = generateMetaTags({
  title: 'Human Trafficking Survivor Services Lorain County Ohio',
  description:
    'Explore trauma informed survivor support services in Lorain County and Northeast Ohio, including victim advocacy, workforce development, mentorship, education, and reintegration support.',
});

const serviceIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield, Briefcase, Users, GraduationCap, Scale, Home, Brain,
};

export default function ServicesPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="pt-32 pb-20 relative overflow-hidden" style={{ background: '#1E1714' }}>
        {/* Subtle gradient overlay */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(30,107,115,0.08) 0%, transparent 50%)',
          }}
        />
        
        <div className="container-wide section-padding relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <span className="font-medium mb-4 block" style={{ color: '#C8A46B' }}>Comprehensive Support</span>
            <h1 className="font-serif text-5xl sm:text-6xl font-bold mb-6" style={{ color: '#F6F0E8' }}>
              Human Trafficking Survivor Support Services in Lorain County, Ohio
            </h1>
            <p className="text-xl leading-relaxed max-w-3xl mx-auto" style={{ color: '#CDBDAF' }}>
              Holistic, trauma-informed programs available in Lorain County, Ohio and throughout 
              Northeast Ohio. Designed to meet survivors where they are and support them on 
              their journey to healing, independence, and hope.
            </p>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-24 bg-[#1E1714]">
        <div className="container-wide section-padding">
          <div className="grid lg:grid-cols-2 gap-8">
            {SERVICES.map((service) => {
              const Icon = serviceIcons[service.icon] || Shield;
              const hasDetailPage = ['victim-advocacy', 'workforce-development', 'mentorship', 'community-education', 'accountability'].includes(service.id);
              
              return (
                <Link 
                  key={service.id} 
                  href={hasDetailPage ? `/services/${service.id}` : '#'}
                  className={hasDetailPage ? 'group' : 'pointer-events-none'}
                >
                  <Card 
                    className={`bg-[#3A2A24] border-[rgba(216,203,190,0.08)] overflow-hidden h-full transition-all duration-300 ${
                      hasDetailPage ? 'hover:shadow-[0_12px_40px_rgba(0,0,0,0.45)] hover:border-[#8B5E3C]/30' : ''
                    }`}
                    style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}
                  >
                    <CardContent className="p-0">
                      <div className="p-8">
                        <div className="flex items-start gap-4 mb-6">
                          <div 
                            className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                            style={{ background: 'rgba(200,164,107,0.1)' }}
                          >
                            <Icon className="h-7 w-7 text-[#C8A46B]" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h2 
                                className="font-serif text-2xl font-bold transition-colors"
                                style={{ color: '#F6F0E8' }}
                              >
                                {service.title}
                              </h2>
                              {hasDetailPage && (
                                <ArrowRight className="h-5 w-5 text-[#4C9AA3] opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                              )}
                            </div>
                            <p style={{ color: '#CDBDAF' }}>{service.description}</p>
                          </div>
                        </div>
                        
                        <div className="space-y-3 mb-6">
                          {service.features.map((feature, index) => (
                            <div key={index} className="flex items-center gap-3">
                              <div 
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ background: '#8B5E3C' }}
                              />
                              <span style={{ color: '#B8A89A' }}>{feature}</span>
                            </div>
                          ))}
                        </div>
                        
                        {hasDetailPage && (
                          <div className="flex items-center text-sm font-medium" style={{ color: '#4C9AA3' }}>
                            Learn more 
                            <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trauma-Informed Approach */}
      <section className="py-24" style={{ background: '#2A1F1A' }}>
        <div className="container-wide section-padding">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <span className="font-medium mb-4 block" style={{ color: '#4C9AA3' }}>Our Method</span>
              <h2 className="font-serif text-4xl font-bold mb-6" style={{ color: '#F6F0E8' }}>
                Trauma-Informed Care
              </h2>
              <p className="text-lg" style={{ color: '#CDBDAF' }}>
                Every service is delivered through a trauma-informed lens, ensuring survivors 
                feel safe, empowered, and supported throughout their healing journey.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              {[
                { title: 'Safety First', desc: 'Physical and emotional safety are prioritized in every interaction.' },
                { title: 'Trustworthiness', desc: 'Clear, consistent, and transparent communication builds trust.' },
                { title: 'Peer Support', desc: 'Survivor-led support fosters connection and mutual empowerment.' },
                { title: 'Collaboration', desc: 'Decisions are made together, honoring survivor autonomy.' },
                { title: 'Empowerment', desc: 'Strengths-based approaches build confidence and self-efficacy.' },
                { title: 'Cultural Humility', desc: 'Services are responsive to diverse cultural backgrounds.' },
              ].map((item, index) => (
                <Card 
                  key={index} 
                  className="border-0"
                  style={{ 
                    background: '#241B18',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
                  }}
                >
                  <CardContent className="p-6">
                    <h3 className="font-semibold mb-2" style={{ color: '#F6F0E8' }}>{item.title}</h3>
                    <p className="text-sm" style={{ color: '#CDBDAF' }}>{item.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 relative overflow-hidden" style={{ background: '#181210' }}>
        {/* Subtle glow */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(30,107,115,0.1) 0%, transparent 60%)',
          }}
        />
        
        <div className="container-wide section-padding relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="font-serif text-4xl font-bold mb-6" style={{ color: '#F6F0E8' }}>
              Ready to Get Support?
            </h2>
            <p className="text-xl mb-8" style={{ color: '#CDBDAF' }}>
              Our team is here to help you navigate available resources and find the right support for your needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                asChild
                size="lg"
              >
                <Link href="/get-help">
                  Get Help Now <ChevronRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
              >
                <Link href="/resources">
                  View Resources
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
