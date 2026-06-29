import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Briefcase, MapPin, Clock, ArrowRight, Heart } from 'lucide-react'
import type { JobPosition } from '@/src/features/careers/types'

export const metadata: Metadata = {
  title: 'Join Our Team | Forged in the Fire',
  description: 'Build something meaningful with us. Explore current opportunities to join the Forged in the Fire team and help empower survivors of human trafficking.',
  openGraph: {
    title: 'Join Our Team | Forged in the Fire',
    description: 'Explore career opportunities at Forged in the Fire. Join us in empowering survivors and restoring hope.',
  },
}

async function getActiveJobs(): Promise<JobPosition[]> {
  const supabase = await createClient()
  
  if (!supabase) {
    return []
  }
  
  const { data, error } = await supabase
    .from('job_positions')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching jobs:', error)
    return []
  }
  
  return data || []
}

export default async function CareersPage() {
  const jobs = await getActiveJobs()

  return (
    <div className="min-h-screen bg-charcoal">
      {/* Hero Section */}
      <section className="relative py-16 md:py-24 bg-gradient-to-b from-charcoal to-charcoal-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="font-playfair text-4xl md:text-5xl lg:text-6xl font-bold text-cream-100 mb-6">
              Join Our Team
            </h1>
            <p className="text-lg md:text-xl text-cream-100/80 leading-relaxed">
              Build something meaningful with us. Explore current opportunities to join the Forged in the Fire team.
            </p>
          </div>
        </div>
      </section>

      {/* Jobs Section */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {jobs.length > 0 ? (
            <div className="max-w-4xl mx-auto">
              <div className="grid gap-6">
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-16 bg-charcoal-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-teal/20 flex items-center justify-center mx-auto mb-6">
              <Heart className="w-8 h-8 text-teal" />
            </div>
            <h2 className="font-playfair text-2xl md:text-3xl font-bold text-cream-100 mb-4">
              Why Work With Us?
            </h2>
            <p className="text-cream-100/80 leading-relaxed mb-8">
              At Forged in the Fire, you will be part of a mission-driven team dedicated to 
              empowering survivors of human trafficking. We offer a supportive work environment, 
              opportunities for professional growth, and the chance to make a real difference 
              in the lives of those we serve.
            </p>
            <div className="grid sm:grid-cols-3 gap-6 text-left">
              <div className="p-6 bg-charcoal-700 rounded-xl border border-charcoal-600">
                <h3 className="font-semibold text-cream-100 mb-2">Mission-Driven</h3>
                <p className="text-sm text-cream-100/60">
                  Every role contributes directly to survivor empowerment and restoration.
                </p>
              </div>
              <div className="p-6 bg-charcoal-700 rounded-xl border border-charcoal-600">
                <h3 className="font-semibold text-cream-100 mb-2">Supportive Culture</h3>
                <p className="text-sm text-cream-100/60">
                  Trauma-informed workplace that prioritizes staff wellbeing and growth.
                </p>
              </div>
              <div className="p-6 bg-charcoal-700 rounded-xl border border-charcoal-600">
                <h3 className="font-semibold text-cream-100 mb-2">Community Impact</h3>
                <p className="text-sm text-cream-100/60">
                  Be part of transformative change in Lorain County and beyond.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="font-playfair text-2xl font-bold text-cream-100 mb-4">
              Do not See the Right Fit?
            </h2>
            <p className="text-cream-100/80 mb-8">
              We are always interested in connecting with mission-aligned people. 
              Reach out to learn about future opportunities or volunteer roles.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild >
                <Link href="/contact">Contact Us</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/volunteer">Explore Volunteering</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function JobCard({ job }: { job: JobPosition }) {
  return (
    <Card className="group bg-charcoal-700 border-charcoal-600 hover:border-teal/50 transition-all">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge className="bg-teal/20 text-teal border-0">
                <Briefcase className="w-3 h-3 mr-1" />
                {job.type}
              </Badge>
              {job.location && (
                <Badge variant="secondary" className="bg-charcoal-600 text-cream-100/80 border-0">
                  <MapPin className="w-3 h-3 mr-1" />
                  {job.location}
                </Badge>
              )}
            </div>
            <h3 className="font-playfair text-xl font-semibold text-cream-100 mb-2 group-hover:text-teal transition-colors">
              {job.title}
            </h3>
            <p className="text-cream-100/70 text-sm line-clamp-2 mb-4">
              {job.description}
            </p>
            <div className="flex items-center gap-4 text-xs text-cream-100/50">
              {job.pay_range && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {job.pay_range}
                </span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0">
            <Button asChild >
              <Link href={`/careers/${job.slug}`} className="flex items-center gap-2">
                View Details
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="max-w-2xl mx-auto text-center py-16">
      <div className="w-20 h-20 rounded-full bg-charcoal-700 flex items-center justify-center mx-auto mb-6">
        <Briefcase className="w-10 h-10 text-cream-100/40" />
      </div>
      <h2 className="font-playfair text-2xl font-bold text-cream-100 mb-4">
        No Open Positions Right Now
      </h2>
      <p className="text-cream-100/70 mb-8 leading-relaxed">
        We are not hiring for any open roles right now, but we are always interested 
        in connecting with mission-aligned people. Please check back soon for new opportunities.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Button asChild >
          <Link href="/contact">Get in Touch</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/volunteer">Volunteer With Us</Link>
        </Button>
      </div>
    </div>
  )
}
