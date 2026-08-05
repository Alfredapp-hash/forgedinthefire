'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { VOLUNTEER_ROLES } from '@/lib/constants';
import { Check, ChevronRight, Clock, Shield, Users, Send, Award } from 'lucide-react';

export default function VolunteerPage() {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    message: '',
  });
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
            <span className="inline-flex items-center gap-2 px-4 py-2 mb-6 text-sm font-medium text-healing bg-healing/10 rounded-full border border-healing/20">
              <Users className="h-4 w-4" />
              Join Our Community
            </span>
            <h1 className="font-serif text-5xl sm:text-6xl font-bold text-cream-100 mb-6">
              Volunteer to Help Human Trafficking Survivors in Lorain County, Ohio
            </h1>
            <p className="text-xl text-cream-300/80 leading-relaxed max-w-2xl mx-auto">
              Your time and skills can transform lives in Lorain County and Northeast Ohio. 
              Join our community of dedicated volunteers supporting local survivors on 
              their journey to healing.
            </p>
          </div>
        </div>
      </section>

      {/* Why Volunteer */}
      <section className="py-20 bg-charcoal-900 border-y border-steel-800">
        <div className="container-wide section-padding">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="w-16 h-16 rounded-full bg-ember/10 flex items-center justify-center mx-auto mb-4">
                <Shield className="h-8 w-8 text-ember" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-cream-100 mb-2">Make an Impact</h3>
              <p className="text-silver-label">Directly support survivors in their journey to healing and independence</p>
            </div>
            <div>
              <div className="w-16 h-16 rounded-full bg-healing/10 flex items-center justify-center mx-auto mb-4">
                <Award className="h-8 w-8 text-healing" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-cream-100 mb-2">Gain Skills</h3>
              <p className="text-silver-label">Receive comprehensive training in trauma-informed care and advocacy</p>
            </div>
            <div>
              <div className="w-16 h-16 rounded-full bg-ember/10 flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-ember" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-cream-100 mb-2">Join a Community</h3>
              <p className="text-silver-label">Connect with passionate advocates and survivor-leaders</p>
            </div>
          </div>
        </div>
      </section>

      {/* Volunteer Roles */}
      <section className="py-24 bg-charcoal">
        <div className="container-wide section-padding">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-ember font-medium mb-4 block">Opportunities</span>
            <h2 className="font-serif text-4xl font-bold text-cream-100 mb-6">
              Volunteer Roles
            </h2>
            <p className="text-lg text-cream-300/80">
              Find the role that matches your skills, experience, and passion.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {VOLUNTEER_ROLES.map((role, index) => (
              <Card key={index} className="bg-charcoal-800/50 border-steel-700 h-full">
                <CardContent className="p-6">
                  <h3 className="font-serif text-xl font-semibold text-cream-100 mb-3">{role.title}</h3>
                  <p className="text-cream-300/80 mb-4">{role.description}</p>
                  <div className="flex items-center gap-2 text-sm text-healing mb-4">
                    <Clock className="h-4 w-4" />
                    <span>{role.timeCommitment}</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-silver-label font-medium">Requirements:</p>
                    {role.requirements.map((req, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-silver-label">
                        <Check className="h-3 w-3 text-ember" />
                        <span>{req}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Training Info */}
      <section className="py-24 bg-charcoal-900">
        <div className="container-wide section-padding">
          <div className="max-w-4xl mx-auto">
            <Card className="bg-charcoal-800/50 border-steel-700">
              <CardContent className="p-8">
                <h2 className="font-serif text-3xl font-bold text-cream-100 mb-6 text-center">
                  Volunteer Training Process
                </h2>
                <div className="space-y-6">
                  {[
                    { step: 1, title: 'Application', desc: 'Complete the volunteer application form' },
                    { step: 2, title: 'Interview', desc: 'Meet with our volunteer coordinator' },
                    { step: 3, title: 'Background Check', desc: 'Complete required screenings' },
                    { step: 4, title: 'Training', desc: 'Attend comprehensive orientation and training' },
                    { step: 5, title: 'Placement', desc: 'Begin in your chosen volunteer role' },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-ember/20 flex items-center justify-center shrink-0">
                        <span className="font-bold text-ember">{item.step}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-cream-100">{item.title}</h3>
                        <p className="text-silver-label">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section className="py-24 bg-charcoal">
        <div className="container-wide section-padding">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <span className="text-ember font-medium mb-4 block">Apply Now</span>
              <h2 className="font-serif text-4xl font-bold text-cream-100 mb-4">
                Volunteer Application
              </h2>
              <p className="text-cream-300/80">
                Fill out the form below and our volunteer coordinator will contact you within 3-5 business days.
              </p>
            </div>

            {submitted ? (
              <Card className="bg-charcoal-800/50 border-healing/30">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-healing/20 flex items-center justify-center mx-auto mb-4">
                    <Send className="h-8 w-8 text-healing" />
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-cream-100 mb-2">Application Received</h3>
                  <p className="text-cream-300/80">
                    Thank you for your interest! Our volunteer coordinator will contact you soon.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-charcoal-800/50 border-steel-700">
                <CardContent className="p-8">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="name">Full Name *</Label>
                        <Input id="name" required value={formState.name} onChange={(e) => setFormState({...formState, name: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email *</Label>
                        <Input id="email" type="email" required value={formState.email} onChange={(e) => setFormState({...formState, email: e.target.value})} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input id="phone" type="tel" value={formState.phone} onChange={(e) => setFormState({...formState, phone: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Preferred Role *</Label>
                      <select
                        id="role"
                        required
                        value={formState.role}
                        onChange={(e) => setFormState({...formState, role: e.target.value})}
                        className="w-full h-10 rounded-md border border-steel-700 bg-charcoal-800/50 px-3 text-cream-100 focus:border-ember focus:outline-none"
                      >
                        <option value="">Select a role...</option>
                        {VOLUNTEER_ROLES.map((role) => (
                          <option key={role.title} value={role.title}>{role.title}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="message">Why do you want to volunteer? *</Label>
                      <Textarea id="message" required rows={4} value={formState.message} onChange={(e) => setFormState({...formState, message: e.target.value})} />
                    </div>
                    <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? 'Submitting...' : 'Submit Application'}
                      <Send className="ml-2 h-4 w-4" />
                    </Button>
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
