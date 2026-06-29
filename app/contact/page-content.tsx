'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ORG, HOTLINES } from '@/lib/constants';
import { Mail, Phone, MapPin, Clock, Send, CheckCircle } from 'lucide-react';

export default function ContactPage() {
  const [formState, setFormState] = useState({ name: '', email: '', subject: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsSubmitting(false);
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="pt-32 pb-20 bg-gradient-to-b from-charcoal-900 to-charcoal">
        <div className="container-wide section-padding">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="font-serif text-5xl sm:text-6xl font-bold text-cream-100 mb-6">
              Contact Our Lorain County Victim Advocacy Team
            </h1>
            <p className="text-xl text-cream-300/80 leading-relaxed max-w-2xl mx-auto">
              Have questions about our victim advocacy services in Lorain County and Northeast Ohio? 
              We&apos;d love to hear from you. For immediate help, please use the resources below.
            </p>
          </div>
        </div>
      </section>

      {/* Emergency Banner */}
      <section className="py-12 bg-healing/10 border-y border-healing/20">
        <div className="container-wide section-padding">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <p className="font-semibold text-healing mb-1">Need immediate assistance?</p>
              <p className="text-cream-300/80 text-sm">The National Human Trafficking Hotline is available 24/7</p>
            </div>
            <div className="flex items-center gap-6">
              <a href={`tel:${HOTLINES[0].phone.replace(/\D/g, '')}`} className="text-2xl font-bold text-healing hover:text-healing-400">
                {HOTLINES[0].phone}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Info & Form */}
      <section className="py-24 bg-charcoal">
        <div className="container-wide section-padding">
          <div className="grid lg:grid-cols-2 gap-16 max-w-6xl mx-auto">
            {/* Contact Info */}
            <div>
              <h2 className="font-serif text-3xl font-bold text-cream-100 mb-8">Get in Touch</h2>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-ember/10 flex items-center justify-center shrink-0">
                    <Mail className="h-6 w-6 text-ember" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-cream-100 mb-1">Email</h3>
                    <a href={`mailto:${ORG.email}`} className="text-cream-300/80 hover:text-ember">{ORG.email}</a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-ember/10 flex items-center justify-center shrink-0">
                    <Phone className="h-6 w-6 text-ember" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-cream-100 mb-1">Phone</h3>
                    <a href={`tel:${ORG.phone.replace(/\D/g, '')}`} className="text-cream-300/80 hover:text-ember">{ORG.phone}</a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-ember/10 flex items-center justify-center shrink-0">
                    <MapPin className="h-6 w-6 text-ember" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-cream-100 mb-1">Address</h3>
                    <p className="text-cream-300/80">{ORG.address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-ember/10 flex items-center justify-center shrink-0">
                    <Clock className="h-6 w-6 text-ember" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-cream-100 mb-1">Office Hours</h3>
                    <p className="text-cream-300/80">Monday - Friday: 9:00 AM - 5:00 PM</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div>
              {submitted ? (
                <Card className="bg-charcoal-800/50 border-healing/30">
                  <CardContent className="p-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-healing/20 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="h-8 w-8 text-healing" />
                    </div>
                    <h3 className="font-serif text-2xl font-bold text-cream-100 mb-2">Message Sent</h3>
                    <p className="text-cream-300/80">Thank you for reaching out. We&apos;ll respond within 24-48 hours.</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-charcoal-800/50 border-steel-700">
                  <CardContent className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid sm:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label htmlFor="name">Name *</Label>
                          <Input id="name" required value={formState.name} onChange={(e) => setFormState({...formState, name: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email">Email *</Label>
                          <Input id="email" type="email" required value={formState.email} onChange={(e) => setFormState({...formState, email: e.target.value})} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="subject">Subject *</Label>
                        <Input id="subject" required value={formState.subject} onChange={(e) => setFormState({...formState, subject: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="message">Message *</Label>
                        <Textarea id="message" required rows={5} value={formState.message} onChange={(e) => setFormState({...formState, message: e.target.value})} />
                      </div>
                      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                        {isSubmitting ? 'Sending...' : 'Send Message'}
                        <Send className="ml-2 h-4 w-4" />
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
