'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { HeroAnimation } from '@/components/hero-animation';
import { ORG, CORE_VALUES, SERVICES, IMPACT_STATS } from '@/lib/constants';
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
      {/* Hero Section */}
      <section className="relative">
        <HeroAnimation>
          <div className="container-wide">
            <div className="mx-auto max-w-3xl text-center">
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                className="mb-4 font-serif text-[1.75rem] font-bold leading-[1.2] tracking-tight text-[#F6F0E8] sm:text-4xl lg:text-[2.625rem]"
              >
                Human Trafficking Victim Advocacy in Lorain County, Ohio
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
                className="mb-4 font-serif text-2xl font-bold leading-tight tracking-tight text-[#F6F0E8] sm:text-3xl lg:text-4xl"
              >
                Restoring Hope.{' '}
                <span className="text-[#4C9AA3]">Rebuilding Lives.</span>
              </motion.p>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
                className="mx-auto mb-7 max-w-xl text-base leading-relaxed text-[#CDBDAF] sm:text-lg"
              >
                {ORG.mission}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.65, ease: [0.25, 0.1, 0.25, 1] }}
                className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4"
              >
                <Button asChild size="lg" className="px-8 py-6 text-base">
                  <Link href="/get-help">
                    Get Help Now <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="px-8 py-6 text-base">
                  <a href="https://www.zeffy.com/en-US/donation-form/donate-to-change-lives-13754" target="_blank" rel="noopener noreferrer">
                    Support Our Mission <Heart className="ml-2 h-5 w-5" />
                  </a>
                </Button>
              </motion.div>
              
              {/* Trust Indicators - Final Fade */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.8 }}
                className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-sm"
              >
                {/* 501(c)(3) Badge */}
                <span className="flex flex-col items-center">
                  <span className="flex items-center gap-1.5 font-medium text-[#E8DCCF] drop-shadow-sm">
                    <Shield className="w-4 h-4 text-[#4C9AA3]" />
                    501(c)(3) Nonprofit
                  </span>
                  <span className="text-xs text-[#B8A89A] mt-0.5">39-3438993</span>
                </span>

                <span className="w-1 h-1 rounded-full bg-[#8B5E3C]/50 self-center" />

                {/* Survivor-Centered Badge */}
                <span className="flex items-center gap-1.5 font-medium text-[#E8DCCF] drop-shadow-sm">
                  <Users className="w-4 h-4 text-[#4C9AA3]" />
                  Survivor-Centered
                </span>

                <span className="w-1 h-1 rounded-full bg-[#8B5E3C]/50 self-center" />

                {/* Trauma-Informed Badge */}
                <span className="flex items-center gap-1.5 font-medium text-[#E8DCCF] drop-shadow-sm">
                  <HandHeart className="w-4 h-4 text-[#4C9AA3]" />
                  Trauma-Informed Care
                </span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
                className="mt-10 sm:mt-12"
              >
                <span className="inline-flex items-center gap-2 rounded-full border border-[#8B5E3C]/30 bg-[#3A2A24]/80 px-4 py-2 text-sm font-medium text-[#C8A46B] backdrop-blur-sm">
                  <Flame className="h-4 w-4" />
                  Empowering Survivors Since 2020
                </span>
              </motion.div>
            </div>
          </div>
        </HeroAnimation>
      </section>

      {/* Impact Stats - Emotional Warmth Section */}
      <section className="py-20 bg-[#352722] border-y border-[#4A2F22]/30">
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
                <div className="font-serif text-4xl sm:text-5xl font-bold text-[#4C9AA3] mb-2">
                  {stat.value}
                </div>
                <div className="text-[#F6F0E8] font-medium mb-1">{stat.label}</div>
                <div className="text-sm text-[#B8A89A]">{stat.description}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Local SEO Section - Serving Lorain County and Northeast Ohio */}
      <section className="py-20 bg-[#2A1F1A] border-y border-[#3A2A24]">
        <div className="container-wide section-padding">
          <div className="max-w-3xl mx-auto text-center">
            <span className="text-[#C8A46B] font-medium mb-4 block tracking-wide uppercase text-sm">Our Community</span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#F6F0E8] mb-6 leading-tight">
              Serving Lorain County and Northeast Ohio
            </h2>
            <p className="text-lg text-[#CDBDAF] leading-relaxed">
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
      <section className="py-24 bg-[#241B18]">
        <div className="container-wide section-padding">
          <div className="mx-auto max-w-3xl">
            <span className="text-[#4C9AA3] font-medium mb-4 block tracking-wide uppercase text-sm">Our Mission</span>
            <h2 className="font-serif text-4xl sm:text-5xl font-bold text-[#F6F0E8] mb-6 leading-tight">
              Healing Through <span className="text-[#C8A46B]">Leadership</span>
            </h2>
            <p className="text-lg text-[#CDBDAF] mb-6 leading-relaxed">
              We believe that survivors are the experts of their own experiences. Our approach centers 
              on amplifying survivor voices, honoring their choices, and walking alongside them on 
              their journey to healing and independence.
            </p>
            <p className="text-lg text-[#CDBDAF] mb-8 leading-relaxed">
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
      <section className="py-24 bg-[#2A1F1A]">
        <div className="container-wide section-padding">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-[#4C9AA3] font-medium mb-4 block tracking-wide uppercase text-sm">What Guides Us</span>
            <h2 className="font-serif text-4xl sm:text-5xl font-bold text-[#F6F0E8] mb-6">
              Our Core Values
            </h2>
            <p className="text-lg text-[#CDBDAF]">
              These principles shape every interaction, program, and decision we make.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {CORE_VALUES.map((value, index) => {
              const IconComponent = valueIcons[value.icon] || Heart;
              return (
                <Card key={index} className="bg-[#3A2A24] border-[rgba(216,203,190,0.08)] hover:border-[#8B5E3C]/30 transition-all duration-300 group shadow-[0_12px_40px_rgba(0,0,0,0.35)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-xl bg-[#1E6B73]/20 flex items-center justify-center mb-4 group-hover:bg-[#1E6B73]/30 transition-colors">
                      {IconComponent && <IconComponent className="h-6 w-6 text-[#4C9AA3]" />}
                    </div>
                    <h3 className="font-serif text-xl font-semibold text-[#F6F0E8] mb-2">
                      {value.title}
                    </h3>
                    <p className="text-[#CDBDAF] leading-relaxed">{value.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Services Preview - Hopeful Action */}
      <section className="py-24 bg-[#241B18]">
        <div className="container-wide section-padding">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-[#C8A46B] font-medium mb-4 block tracking-wide uppercase text-sm">Comprehensive Support</span>
            <h2 className="font-serif text-4xl sm:text-5xl font-bold text-[#F6F0E8] mb-6">
              Our Services
            </h2>
            <p className="text-lg text-[#CDBDAF]">
              Holistic, trauma-informed programs designed to meet survivors where they are 
              and support them on their journey to independence.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {SERVICES.slice(0, 6).map((service) => {
              const IconComponent = serviceIcons[service.icon] || Shield;
              return (
                <Link key={service.id} href={`/services/${service.id}`}>
                  <Card className="h-full bg-[#3A2A24] border-[rgba(216,203,190,0.08)] hover:border-[#C8A46B]/30 transition-all duration-300 group shadow-[0_12px_40px_rgba(0,0,0,0.35)] hover:shadow-[0_12px_40px_rgba(139,94,60,0.15)]">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-[#C8A46B]/10 flex items-center justify-center shrink-0 group-hover:bg-[#C8A46B]/20 transition-colors">
                          {IconComponent && <IconComponent className="h-6 w-6 text-[#C8A46B]" />}
                        </div>
                        <div>
                          <h3 className="font-serif text-lg font-semibold text-[#F6F0E8] mb-2 group-hover:text-[#C8A46B] transition-colors">
                            {service.shortTitle}
                          </h3>
                          <p className="text-sm text-[#B8A89A] line-clamp-2 leading-relaxed">
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
