'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { HeroAnimation } from '@/components/hero-animation';
import { CORE_VALUES, SERVICES, IMPACT_STATS } from '@/lib/constants';
import { 
  ArrowRight, 
  Heart, 
  Shield, 
  Users, 
  Zap, 
  Flame,
  Briefcase,
  GraduationCap,
  Home,
  Brain,
  ChevronRight,
  HandHeart,
  Scale
} from 'lucide-react';

const serviceIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield,
  Briefcase,
  Users,
  GraduationCap,
  Scale,
  Home,
  Brain,
};

const valueIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Heart,
  HandHeart,
  Shield,
  Zap,
  Users,
  Flame,
};

export function HomeContent() {
  return (
    <div className="min-h-screen">
      {/* Hero — full viewport video lock; overlays next */}
      <HeroAnimation />

      {/* Impact Stats - Emotional Warmth Section */}
      <section className="py-20 bg-[#1A232C] border-y border-[#27313B]/30">
        <div className="container-wide section-padding">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {IMPACT_STATS.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center"
              >
                <div className="font-serif text-4xl sm:text-5xl font-bold text-[#53D6FF] mb-2">
                  {stat.value}
                </div>
                <div className="text-[#F6FAFC] font-medium mb-1">{stat.label}</div>
                <div className="text-sm text-[#A9B8C6]">{stat.description}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Local SEO Section - Serving Lorain County and Northeast Ohio */}
      <section className="py-20 bg-[#151B22] border-y border-[#1A232C]">
        <div className="container-wide section-padding">
          <div className="max-w-3xl mx-auto text-center">
            <span className="text-[#8DEBFF] font-medium mb-4 block tracking-wide uppercase text-sm">Our Community</span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#F6FAFC] mb-6 leading-tight">
              Serving Lorain County and Northeast Ohio
            </h2>
            <p className="text-lg text-[#B8C4CF] leading-relaxed">
              Forged in the Fire is based in Lorain County, Ohio and provides trauma-informed victim
              advocacy and survivor support throughout Lorain County—including Lorain, Elyria, and
              communities across the greater Northeast Ohio region. We are committed to meeting
              survivors where they are and walking alongside them on their journey toward healing,
              safety, and independence.
            </p>
          </div>
        </div>
      </section>

      {/* Mission Section - Warm Human Connection */}
      <section className="py-24 bg-[#11161C]">
        <div className="container-wide section-padding">
          <div className="mx-auto max-w-3xl">
            <span className="text-[#53D6FF] font-medium mb-4 block tracking-wide uppercase text-sm">Our Mission</span>
            <h2 className="font-serif text-4xl sm:text-5xl font-bold text-[#F6FAFC] mb-6 leading-tight">
              Healing Through <span className="text-[#8DEBFF]">Leadership</span>
            </h2>
            <p className="text-lg text-[#B8C4CF] mb-6 leading-relaxed">
              We believe that survivors are the experts of their own experiences. Our approach centers 
              on amplifying survivor voices, honoring their choices, and walking alongside them on 
              their journey to healing and independence.
            </p>
            <p className="text-lg text-[#B8C4CF] mb-8 leading-relaxed">
              Every service we provide is rooted in trauma-informed care, recognizing that healing 
              is not linear and that each survivor&apos;s path is unique.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild variant="outline">
                <Link href="/about">Learn Our Story <ChevronRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/services/victim-advocacy">Explore Victim Advocacy Services</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Core Values - Safety and Stability */}
      <section className="py-24 bg-[#151B22]">
        <div className="container-wide section-padding">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-[#53D6FF] font-medium mb-4 block tracking-wide uppercase text-sm">What Guides Us</span>
            <h2 className="font-serif text-4xl sm:text-5xl font-bold text-[#F6FAFC] mb-6">
              Our Core Values
            </h2>
            <p className="text-lg text-[#B8C4CF]">
              These principles shape every interaction, program, and decision we make.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {CORE_VALUES.map((value, index) => {
              const IconComponent = valueIcons[value.icon] || Heart;
              return (
                <Card key={index} className="bg-[#1A232C] border-[rgba(39, 49, 59,0.08)] hover:border-[#27313B]/30 transition-all duration-300 group shadow-forge hover:shadow-forge">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-xl bg-[#53D6FF]/20 flex items-center justify-center mb-4 group-hover:bg-[#53D6FF]/30 transition-colors">
                      {IconComponent && <IconComponent className="h-6 w-6 text-[#53D6FF]" />}
                    </div>
                    <h3 className="font-serif text-xl font-semibold text-[#F6FAFC] mb-2">
                      {value.title}
                    </h3>
                    <p className="text-[#B8C4CF] leading-relaxed">{value.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Services Preview - Hopeful Action */}
      <section className="py-24 bg-[#11161C]">
        <div className="container-wide section-padding">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-[#8DEBFF] font-medium mb-4 block tracking-wide uppercase text-sm">Comprehensive Support</span>
            <h2 className="font-serif text-4xl sm:text-5xl font-bold text-[#F6FAFC] mb-6">
              Our Services
            </h2>
            <p className="text-lg text-[#B8C4CF]">
              Holistic, trauma-informed programs designed to meet survivors where they are 
              and support them on their journey to independence.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {SERVICES.slice(0, 6).map((service) => {
              const IconComponent = serviceIcons[service.icon] || Shield;
              return (
                <Link key={service.id} href={`/services/${service.id}`}>
                  <Card className="h-full bg-[#1A232C] border-[rgba(39, 49, 59,0.08)] hover:border-[#8DEBFF]/30 transition-all duration-300 group shadow-forge hover:shadow-[0_12px_40px_rgba(83, 214, 255,0.15)]">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-[#53D6FF]/10 flex items-center justify-center shrink-0 group-hover:bg-[#53D6FF]/20 transition-colors">
                          {IconComponent && <IconComponent className="h-6 w-6 text-[#8DEBFF]" />}
                        </div>
                        <div>
                          <h3 className="font-serif text-lg font-semibold text-[#F6FAFC] mb-2 group-hover:text-[#8DEBFF] transition-colors">
                            {service.shortTitle}
                          </h3>
                          <p className="text-sm text-[#A9B8C6] line-clamp-2 leading-relaxed">
                            {service.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
          
          <div className="text-center mt-12">
            <Button asChild variant="outline">
              <Link href="/services">View All Services <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
