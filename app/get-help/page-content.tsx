'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { HOTLINES } from '@/lib/constants';
import { Phone, MessageSquare, Clock, AlertTriangle, Shield, ChevronRight, Send, ExternalLink, Globe, HeartPulse, MapPin, Users, Baby, Brain } from 'lucide-react';

export default function GetHelpPageContent() {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
    isSurvivor: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate form submission
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSubmitting(false);
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen">
      {/* Hero - Crisis Warning */}
      <section className="pt-32 pb-20 bg-gradient-to-b from-[#53D6FF]/10 to-charcoal">
        <div className="container-wide section-padding">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 text-sm font-medium text-[#8DEBFF] bg-[rgba(83,214,255,0.1)] rounded-full border border-[rgba(83,214,255,0.35)]">
              <AlertTriangle className="h-4 w-4" />
              If you are in immediate danger, call 911
            </div>
            <h1 className="font-serif text-5xl sm:text-6xl font-bold text-cream-100 mb-6">
              Get Help for Human Trafficking in Lorain County, Ohio
            </h1>
            <p className="text-xl text-cream-300/80 leading-relaxed max-w-2xl mx-auto">
              You are not alone. Confidential support is available 24/7. 
              Reach out when you&apos;re ready—we&apos;re here to help.
            </p>
          </div>
        </div>
      </section>

      {/* Local Support Section */}
      <section className="py-16 bg-charcoal-900 border-y border-steel-800">
        <div className="container-wide section-padding">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="font-serif text-2xl font-bold text-cream-100 mb-4">
              Support in Lorain County and Northeast Ohio
            </h2>
            <p className="text-cream-300/80 leading-relaxed">
              Forged in the Fire provides victim advocacy and support services for survivors 
              of human trafficking in Lorain County and throughout Northeast Ohio. 
              While we are not an emergency response organization, we work alongside survivors 
              to help them navigate systems, access resources, and build pathways to safety and healing.
            </p>
          </div>
        </div>
      </section>

      {/* Emergency Hotlines */}
      <section className="py-20 bg-charcoal border-y border-steel-800">
        <div className="container-wide section-padding">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="font-serif text-3xl font-bold text-cream-100 mb-4">
              24/7 Crisis Hotlines
            </h2>
            <p className="text-cream-300/80">
              These confidential hotlines provide immediate support, resources, and guidance.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {HOTLINES.map((hotline, index) => (
              <Card key={index} className="bg-charcoal-800/50 border-steel-700 hover:border-healing/50 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-healing/10 flex items-center justify-center shrink-0">
                      <Phone className="h-6 w-6 text-healing" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-cream-100 mb-1">{hotline.name}</h3>
                      <a 
                        href={`tel:${hotline.phone.replace(/\D/g, '')}`}
                        className="text-2xl font-bold text-healing hover:text-healing-400 block mb-2"
                      >
                        {hotline.phone}
                      </a>
                      {'sms' in hotline && hotline.sms && (
                        <p className="text-sm text-silver-label mb-2">
                          Text &quot;{'text' in hotline ? hotline.text : 'HELP'}&quot; to {hotline.sms}
                        </p>
                      )}
                      <p className="text-sm text-silver-label">{hotline.description}</p>
                      <div className="flex items-center gap-2 mt-3 text-healing text-sm">
                        <Clock className="h-4 w-4" />
                        <span>Available {hotline.available}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Internal Links - Our Support Services */}
          <div className="mt-16 pt-12 border-t border-steel-700">
            <div className="text-center max-w-3xl mx-auto mb-8">
              <h3 className="font-serif text-xl font-semibold text-cream-100 mb-3">
                Ongoing Support Services in Lorain County
              </h3>
              <p className="text-silver-label">
                Beyond immediate crisis support, we offer trauma-informed victim advocacy 
                and resources for survivors in Northeast Ohio.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button asChild variant="outline">
                <Link href="/services/victim-advocacy">
                  Explore Victim Advocacy Services
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/resources">
                  View Human Trafficking Resources
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Survivor Rights */}
      <section className="py-24 bg-charcoal">
        <div className="container-wide section-padding">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-ember font-medium mb-4 block">Your Rights</span>
              <h2 className="font-serif text-4xl font-bold text-cream-100 mb-6">
                You Have Rights
              </h2>
              <div className="space-y-4">
                {[
                  'The right to safety and confidentiality',
                  'The right to be believed and supported',
                  'The right to make your own choices',
                  'The right to access services without judgment',
                  'The right to legal protection and advocacy',
                  'The right to heal at your own pace',
                ].map((right, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-ember/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Shield className="h-3 w-3 text-ember" />
                    </div>
                    <p className="text-cream-300/80">{right}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-charcoal-800/50 rounded-2xl p-8 border border-steel-700">
              <Shield className="h-16 w-16 text-healing mb-6" />
              <h3 className="font-serif text-2xl font-bold text-cream-100 mb-4">
                Safety Planning
              </h3>
              <p className="text-cream-300/80 mb-6">
                Our advocates can work with you to create a personalized safety plan 
                tailored to your unique situation and needs.
              </p>
              <Button asChild variant="outline">
                <Link href="/services/victim-advocacy">Learn About Advocacy <ChevronRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* External Resources */}
      <section className="py-24" style={{ background: '#05070A' }}>
        <div className="container-wide section-padding">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="font-medium mb-4 block" style={{ color: '#53D6FF' }}>Additional Support</span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold mb-4" style={{ color: '#F6FAFC' }}>
              Additional Resources
            </h2>
            <p style={{ color: '#B8C4CF' }}>
              Trusted organizations and support services available nationwide.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {/* National Human Trafficking Hotline */}
            <Card 
              className="border-0 h-full transition-all duration-300 hover:shadow-forge"
              style={{ background: '#1A232C', boxShadow: '0 0 40px rgba(83,214,255,0.12)' }}
            >
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex items-start gap-3 mb-4">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(83, 214, 255,0.2)' }}
                  >
                    <Globe className="h-5 w-5 text-[#53D6FF]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg" style={{ color: '#F6FAFC' }}>
                      National Human Trafficking Hotline
                    </h3>
                  </div>
                </div>
                <p className="text-sm mb-4 flex-1" style={{ color: '#B8C4CF' }}>
                  24/7 confidential support, crisis intervention, safety planning, and referrals for victims and survivors of trafficking.
                </p>
                <div className="space-y-2">
                  <Button 
                    asChild 
                    size="sm" 
                    className="w-full bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016]"
                  >
                    <a 
                      href="https://humantraffickinghotline.org" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      aria-label="Visit National Human Trafficking Hotline website"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Visit Website
                    </a>
                  </Button>
                  <div className="flex gap-2">
                    <Button 
                      asChild 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 border-[#27313B] text-[#8DEBFF] hover:bg-[#1A232C]/15"
                    >
                      <a href="tel:18883737888" aria-label="Call National Human Trafficking Hotline">
                        <Phone className="mr-2 h-4 w-4" />
                        Call
                      </a>
                    </Button>
                    <Button 
                      asChild 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 border-[#27313B] text-[#8DEBFF] hover:bg-[#1A232C]/15"
                    >
                      <a href="sms:233733?body=BEFREE" aria-label="Text National Human Trafficking Hotline">
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Text
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Emergency Services */}
            <Card 
              className="border-0 h-full transition-all duration-300 hover:shadow-forge"
              style={{ background: '#1A232C', boxShadow: '0 0 40px rgba(83,214,255,0.12)' }}
            >
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex items-start gap-3 mb-4">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(141, 235, 255,0.15)' }}
                  >
                    <AlertTriangle className="h-5 w-5 text-[#8DEBFF]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg" style={{ color: '#F6FAFC' }}>
                      Emergency Assistance
                    </h3>
                  </div>
                </div>
                <p className="text-sm mb-4 flex-1" style={{ color: '#B8C4CF' }}>
                  If you are in immediate danger or need urgent emergency assistance, call emergency services immediately.
                </p>
                <Button 
                  asChild 
                  size="lg" 
                  className="w-full bg-[#8DEBFF] hover:bg-[#B6F3FF] text-[#061016] font-bold"
                >
                  <a href="tel:911" aria-label="Call 911 for emergency assistance">
                    <Phone className="mr-2 h-5 w-5" />
                    Call 911
                  </a>
                </Button>
              </CardContent>
            </Card>

            {/* Ohio Attorney General */}
            <Card 
              className="border-0 h-full transition-all duration-300 hover:shadow-forge"
              style={{ background: '#1A232C', boxShadow: '0 0 40px rgba(83,214,255,0.12)' }}
            >
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex items-start gap-3 mb-4">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(83, 214, 255,0.2)' }}
                  >
                    <MapPin className="h-5 w-5 text-[#53D6FF]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg" style={{ color: '#F6FAFC' }}>
                      Ohio Human Trafficking Resources
                    </h3>
                  </div>
                </div>
                <p className="text-sm mb-4 flex-1" style={{ color: '#B8C4CF' }}>
                  State-level trafficking awareness, reporting, victim assistance, and prevention resources.
                </p>
                <Button 
                  asChild 
                  size="sm" 
                  className="w-full bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016]"
                >
                  <a 
                    href="https://www.ohioattorneygeneral.gov/Individuals-and-Families/Victims/Human-Trafficking" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    aria-label="Visit Ohio Attorney General Human Trafficking resources"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Visit Website
                  </a>
                </Button>
              </CardContent>
            </Card>

            {/* RAINN */}
            <Card 
              className="border-0 h-full transition-all duration-300 hover:shadow-forge"
              style={{ background: '#1A232C', boxShadow: '0 0 40px rgba(83,214,255,0.12)' }}
            >
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex items-start gap-3 mb-4">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(141, 235, 255,0.15)' }}
                  >
                    <HeartPulse className="h-5 w-5 text-[#8DEBFF]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg" style={{ color: '#F6FAFC' }}>
                      RAINN Sexual Assault Support
                    </h3>
                  </div>
                </div>
                <p className="text-sm mb-4 flex-1" style={{ color: '#B8C4CF' }}>
                  Confidential crisis support and resources for survivors of sexual violence and abuse.
                </p>
                <div className="space-y-2">
                  <Button 
                    asChild 
                    size="sm" 
                    className="w-full bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016]"
                  >
                    <a 
                      href="https://www.rainn.org" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      aria-label="Visit RAINN website"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Visit Website
                    </a>
                  </Button>
                  <Button 
                    asChild 
                    variant="outline" 
                    size="sm" 
                    className="w-full border-[#27313B] text-[#8DEBFF] hover:bg-[#1A232C]/15"
                  >
                    <a href="tel:18006564673" aria-label="Call RAINN National Sexual Assault Hotline">
                      <Phone className="mr-2 h-4 w-4" />
                      Hotline: 1-800-656-4673
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* SAMHSA */}
            <Card 
              className="border-0 h-full transition-all duration-300 hover:shadow-forge"
              style={{ background: '#1A232C', boxShadow: '0 0 40px rgba(83,214,255,0.12)' }}
            >
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex items-start gap-3 mb-4">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(83, 214, 255,0.2)' }}
                  >
                    <Brain className="h-5 w-5 text-[#53D6FF]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg" style={{ color: '#F6FAFC' }}>
                      Mental Health & Crisis Support
                    </h3>
                  </div>
                </div>
                <p className="text-sm mb-4 flex-1" style={{ color: '#B8C4CF' }}>
                  Mental health, substance use, and emotional crisis support resources available nationwide.
                </p>
                <Button 
                  asChild 
                  size="sm" 
                  className="w-full bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016]"
                >
                  <a 
                    href="https://www.samhsa.gov" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    aria-label="Visit SAMHSA website"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Visit SAMHSA
                  </a>
                </Button>
              </CardContent>
            </Card>

            {/* 988 Crisis Lifeline */}
            <Card 
              className="border-0 h-full transition-all duration-300 hover:shadow-forge"
              style={{ background: '#1A232C', boxShadow: '0 0 40px rgba(83,214,255,0.12)' }}
            >
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex items-start gap-3 mb-4">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(141, 235, 255,0.15)' }}
                  >
                    <HeartPulse className="h-5 w-5 text-[#8DEBFF]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg" style={{ color: '#F6FAFC' }}>
                      988 Crisis Lifeline
                    </h3>
                  </div>
                </div>
                <p className="text-sm mb-4 flex-1" style={{ color: '#B8C4CF' }}>
                  24/7 emotional crisis support for anyone experiencing emotional distress or mental health crisis.
                </p>
                <div className="space-y-2">
                  <Button 
                    asChild 
                    size="sm" 
                    className="w-full bg-[#8DEBFF] hover:bg-[#B6F3FF] text-[#061016] font-bold"
                  >
                    <a href="tel:988" aria-label="Call or text 988 Crisis Lifeline">
                      <Phone className="mr-2 h-4 w-4" />
                      Call or Text 988
                    </a>
                  </Button>
                  <Button 
                    asChild 
                    variant="outline" 
                    size="sm" 
                    className="w-full border-[#27313B] text-[#8DEBFF] hover:bg-[#1A232C]/15"
                  >
                    <a 
                      href="https://988lifeline.org" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      aria-label="Visit 988 Lifeline website"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Visit Website
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Domestic Violence Hotline */}
            <Card 
              className="border-0 h-full transition-all duration-300 hover:shadow-forge"
              style={{ background: '#1A232C', boxShadow: '0 0 40px rgba(83,214,255,0.12)' }}
            >
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex items-start gap-3 mb-4">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(83, 214, 255,0.2)' }}
                  >
                    <Users className="h-5 w-5 text-[#53D6FF]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg" style={{ color: '#F6FAFC' }}>
                      National Domestic Violence Hotline
                    </h3>
                  </div>
                </div>
                <p className="text-sm mb-4 flex-1" style={{ color: '#B8C4CF' }}>
                  Support, safety planning, and confidential help for individuals experiencing abuse or violence.
                </p>
                <div className="space-y-2">
                  <Button 
                    asChild 
                    size="sm" 
                    className="w-full bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016]"
                  >
                    <a 
                      href="https://www.thehotline.org" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      aria-label="Visit National Domestic Violence Hotline website"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Visit Website
                    </a>
                  </Button>
                  <Button 
                    asChild 
                    variant="outline" 
                    size="sm" 
                    className="w-full border-[#27313B] text-[#8DEBFF] hover:bg-[#1A232C]/15"
                  >
                    <a href="tel:18007997233" aria-label="Call National Domestic Violence Hotline">
                      <Phone className="mr-2 h-4 w-4" />
                      1-800-799-7233
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Missing & Exploited Children */}
            <Card 
              className="border-0 h-full transition-all duration-300 hover:shadow-forge"
              style={{ background: '#1A232C', boxShadow: '0 0 40px rgba(83,214,255,0.12)' }}
            >
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex items-start gap-3 mb-4">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(141, 235, 255,0.15)' }}
                  >
                    <Baby className="h-5 w-5 text-[#8DEBFF]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg" style={{ color: '#F6FAFC' }}>
                      Missing & Exploited Children Resources
                    </h3>
                  </div>
                </div>
                <p className="text-sm mb-4 flex-1" style={{ color: '#B8C4CF' }}>
                  Support and reporting resources related to child exploitation and trafficking concerns.
                </p>
                <Button 
                  asChild 
                  size="sm" 
                  className="w-full bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016]"
                >
                  <a 
                    href="https://www.missingkids.org" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    aria-label="Visit Missing and Exploited Children website"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Visit Website
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section className="py-24" style={{ background: '#151B22' }}>
        <div className="container-wide section-padding">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <span className="font-medium mb-4 block" style={{ color: '#8DEBFF' }}>Reach Out</span>
              <h2 className="font-serif text-4xl font-bold mb-4" style={{ color: '#F6FAFC' }}>
                Contact Our Team
              </h2>
              <p style={{ color: '#B8C4CF' }}>
                Fill out this form and a member of our team will reach out to you within 24 hours.
                All communications are confidential.
              </p>
            </div>

            {submitted ? (
              <Card className="bg-charcoal-800/50 border-healing/30">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-healing/20 flex items-center justify-center mx-auto mb-4">
                    <Send className="h-8 w-8 text-healing" />
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-cream-100 mb-2">
                    Message Sent
                  </h3>
                  <p className="text-cream-300/80">
                    Thank you for reaching out. A member of our team will contact you within 24 hours.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-charcoal-800/50 border-steel-700">
                <CardContent className="p-8">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="name">Name (optional)</Label>
                        <Input
                          id="name"
                          placeholder="How should we address you?"
                          value={formState.name}
                          onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email or Phone *</Label>
                        <Input
                          id="email"
                          type="text"
                          required
                          placeholder="How can we reach you?"
                          value={formState.email}
                          onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">Message *</Label>
                      <Textarea
                        id="message"
                        required
                        rows={5}
                        placeholder="Tell us how we can help. You can share as much or as little as you're comfortable with."
                        value={formState.message}
                        onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                      />
                    </div>

                    <div className="flex items-start gap-3 p-4 bg-charcoal-900/50 rounded-lg">
                      <input
                        type="checkbox"
                        id="isSurvivor"
                        checked={formState.isSurvivor}
                        onChange={(e) => setFormState({ ...formState, isSurvivor: e.target.checked })}
                        className="mt-1 h-4 w-4 rounded border-steel-600 bg-charcoal-800 text-ember focus:ring-ember"
                      />
                      <Label htmlFor="isSurvivor" className="text-sm text-cream-300/80 leading-relaxed cursor-pointer">
                        I am a survivor seeking support (this helps us connect you with the right resources)
                      </Label>
                    </div>

                    <Button 
                      type="submit" 
                      size="lg" 
                      className="w-full"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Sending...' : 'Send Message'}
                      <Send className="ml-2 h-4 w-4" />
                    </Button>

                    <p className="text-xs text-silver-label text-center">
                      Your privacy is important to us. This form is secure and your information will be kept confidential.
                    </p>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
