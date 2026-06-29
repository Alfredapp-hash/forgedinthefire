'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ORG } from '@/lib/constants';
import { 
  Shield, Briefcase, Users, GraduationCap, Scale, ArrowRight, 
  ChevronRight, Phone, Mail, CheckCircle2, Home, Brain
} from 'lucide-react';
import { notFound } from 'next/navigation';

const serviceIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield, Briefcase, Users, GraduationCap, Scale, Home, Brain,
};

interface ServiceData {
  id: string;
  title: string;
  icon: string;
}

interface ServiceContent {
  subtitle: string;
  intro: string;
  overview: string[];
  whatWeProvide: { title: string; description: string }[];
  whyItMatters: string[];
  approach: { title: string; description: string }[];
  ctas: { label: string; href: string; variant: 'default' | 'outline' }[];
}

interface ServicePageContentProps {
  service: ServiceData;
  content: ServiceContent;
}

export default function ServicePageContent({ service, content }: ServicePageContentProps) {
  const Icon = serviceIcons[service.icon] || Shield;

  return (
    <div className="min-h-screen bg-[#1E1714]">
      {/* Hero Section */}
      <section className="pt-32 pb-20 relative overflow-hidden">
        {/* Background gradient */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(30,107,115,0.08) 0%, transparent 50%)',
          }}
        />
        
        <div className="container-wide section-padding relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-3 mb-6">
                <div 
                  className="w-14 h-14 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(30,107,115,0.2)' }}
                >
                  <Icon className="h-7 w-7 text-[#4C9AA3]" />
                </div>
              </div>
              
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold mb-4" style={{ color: '#F6F0E8' }}>
                {service.title}
              </h1>
              
              <p className="text-xl sm:text-2xl mb-6" style={{ color: '#C8A46B' }}>
                {content.subtitle}
              </p>
              
              <p className="text-lg leading-relaxed max-w-3xl mx-auto" style={{ color: '#CDBDAF' }}>
                {content.intro}
              </p>
            </motion.div>
            
            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10"
            >
              {content.ctas.map((cta, index) => (
                <Button
                  key={index}
                  asChild
                  size="lg"
                  variant={cta.variant === 'default' ? 'default' : 'outline'}
                >
                  <Link href={cta.href}>
                    {cta.label} <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Full Service Overview */}
      <section className="py-20" style={{ background: '#241B18' }}>
        <div className="container-wide section-padding">
          <div className="max-w-4xl mx-auto">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="font-serif text-3xl sm:text-4xl font-bold mb-12 text-center"
              style={{ color: '#F6F0E8' }}
            >
              About This Service
            </motion.h2>
            
            <div className="space-y-6">
              {content.overview.map((paragraph, index) => (
                <motion.p
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="text-lg leading-relaxed"
                  style={{ color: '#CDBDAF' }}
                >
                  {paragraph}
                </motion.p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What We Provide */}
      <section className="py-20" style={{ background: '#1E1714' }}>
        <div className="container-wide section-padding">
          <div className="max-w-6xl mx-auto">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="font-serif text-3xl sm:text-4xl font-bold mb-4 text-center"
              style={{ color: '#F6F0E8' }}
            >
              What We Provide
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-center mb-12 max-w-2xl mx-auto"
              style={{ color: '#B8A89A' }}
            >
              Comprehensive support designed to meet survivors where they are and empower lasting change.
            </motion.p>
            
            <div className="grid md:grid-cols-2 gap-6">
              {content.whatWeProvide.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Card 
                    className="h-full border-0 transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
                    style={{ 
                      background: '#3A2A24',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                    }}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(30,107,115,0.2)' }}
                        >
                          <CheckCircle2 className="h-5 w-5 text-[#4C9AA3]" />
                        </div>
                        <div>
                          <h3 
                            className="font-semibold text-lg mb-2"
                            style={{ color: '#F6F0E8' }}
                          >
                            {item.title}
                          </h3>
                          <p style={{ color: '#CDBDAF' }}>
                            {item.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why This Matters */}
      <section className="py-20 relative overflow-hidden" style={{ background: '#241B18' }}>
        {/* Subtle background accent */}
        <div 
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(139,94,60,0.08) 0%, transparent 50%)',
          }}
        />
        
        <div className="container-wide section-padding relative z-10">
          <div className="max-w-4xl mx-auto">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="font-serif text-3xl sm:text-4xl font-bold mb-4 text-center"
              style={{ color: '#F6F0E8' }}
            >
              Why This Matters
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-center mb-12 max-w-2xl mx-auto"
              style={{ color: '#C8A46B' }}
            >
              Understanding the impact of this work on survivors, communities, and systemic change.
            </motion.p>
            
            <div className="space-y-6">
              {content.whyItMatters.map((paragraph, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="p-6 rounded-xl"
                  style={{ 
                    background: 'rgba(58,42,36,0.5)',
                    borderLeft: '3px solid #8B5E3C',
                  }}
                >
                  <p className="text-lg leading-relaxed" style={{ color: '#CDBDAF' }}>
                    {paragraph}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trauma-Informed Approach */}
      <section className="py-20" style={{ background: '#2A1F1A' }}>
        <div className="container-wide section-padding">
          <div className="max-w-6xl mx-auto">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="font-serif text-3xl sm:text-4xl font-bold mb-4 text-center"
              style={{ color: '#F6F0E8' }}
            >
              Our Trauma-Informed Approach
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-center mb-12 max-w-2xl mx-auto"
              style={{ color: '#B8A89A' }}
            >
              Every service is grounded in principles that honor survivor dignity, autonomy, and healing.
            </motion.p>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {content.approach.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Card 
                    className="h-full border-0"
                    style={{ 
                      background: '#241B18',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
                    }}
                  >
                    <CardContent className="p-6">
                      <h3 
                        className="font-semibold text-lg mb-3"
                        style={{ color: '#4C9AA3' }}
                      >
                        {item.title}
                      </h3>
                      <p style={{ color: '#CDBDAF' }}>
                        {item.description}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact/CTA Section */}
      <section className="py-20 relative overflow-hidden" style={{ background: '#181210' }}>
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(30,107,115,0.1) 0%, transparent 60%)',
          }}
        />
        
        <div className="container-wide section-padding relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="font-serif text-3xl sm:text-4xl font-bold mb-6"
              style={{ color: '#F6F0E8' }}
            >
              Take the Next Step
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-lg mb-10 max-w-2xl mx-auto"
              style={{ color: '#CDBDAF' }}
            >
              Whether you&apos;re seeking support, looking to partner, or want to contribute to this work, 
              we&apos;re here to connect with you.
            </motion.p>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Button
                asChild
                size="lg"
              >
                <Link href="/contact">
                  <Mail className="mr-2 h-5 w-5" />
                  Contact Us
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
              >
                <Link href="/get-help">
                  <Phone className="mr-2 h-5 w-5" />
                  Get Help Now
                </Link>
              </Button>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}
