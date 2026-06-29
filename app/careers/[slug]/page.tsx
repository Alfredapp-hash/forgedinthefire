import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Briefcase, 
  MapPin, 
  Clock, 
  ArrowLeft, 
  Mail,
  CheckCircle,
  List,
  FileText,
  Building2,
  Calendar,
  Heart,
  Flame,
  ArrowRight
} from 'lucide-react'
import type { JobPosition } from '@/src/features/careers/types'
import ShareButton from './ShareButton'

interface JobPageProps {
  params: Promise<{ slug: string }>
}

async function getJobBySlug(slug: string): Promise<JobPosition | null> {
  const supabase = await createClient()
  
  if (!supabase) {
    return null
  }
  
  const { data, error } = await supabase
    .from('job_positions')
    .select('*')
    .eq('slug', slug)
    .eq('active', true)
    .single()
  
  if (error || !data) {
    return null
  }
  
  return data
}

export async function generateMetadata({ params }: JobPageProps): Promise<Metadata> {
  const { slug } = await params
  const job = await getJobBySlug(slug)
  
  if (!job) {
    return {
      title: 'Position Not Found | Careers | Forged in the Fire',
    }
  }
  
  const description = job.description?.slice(0, 160) || 'Join the Forged in the Fire team and help empower survivors of human trafficking through meaningful work.'
  
  return {
    title: `${job.title} | Careers | Forged in the Fire`,
    description,
    openGraph: {
      title: `${job.title} | Careers | Forged in the Fire`,
      description,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${job.title} | Careers | Forged in the Fire`,
      description,
    },
    alternates: {
      canonical: `/careers/${job.slug}`,
    },
  }
}

export default async function JobDetailPage({ params }: JobPageProps) {
  const { slug } = await params
  const job = await getJobBySlug(slug)
  
  if (!job) {
    notFound()
  }

  // Format date for display
  const formatJobDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    })
  }

  // Split content into arrays for better rendering
  const responsibilities = job.duties?.split('\n').filter(line => line.trim()) || []
  const qualifications = job.requirements?.split('\n').filter(line => line.trim()) || []

  return (
    <div className="min-h-screen bg-charcoal">
      {/* Premium Hero Section */}
      <section className="relative py-16 md:py-24 bg-gradient-to-b from-charcoal via-charcoal-800 to-charcoal">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal/5 via-transparent to-transparent" />
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-5xl mx-auto">
            {/* Breadcrumb / Eyebrow */}
            <div className="flex items-center gap-3 mb-8">
              <Link 
                href="/careers"
                className="group inline-flex items-center gap-2 text-sm text-cream-100/60 hover:text-teal transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span>Careers</span>
              </Link>
              <span className="text-cream-100/30">/</span>
              <span className="text-teal font-medium text-sm tracking-wide uppercase">Open Position</span>
            </div>

            {/* Job Title */}
            <h1 className="font-playfair text-4xl md:text-5xl lg:text-6xl font-bold text-cream-100 mb-6 leading-tight">
              {job.title}
            </h1>

            {/* Metadata Row */}
            <div className="flex flex-wrap items-center gap-3 mb-8">
              <Badge className="bg-teal/20 text-teal border-teal/30 px-3 py-1">
                <Briefcase className="w-3.5 h-3.5 mr-1.5" />
                {job.type}
              </Badge>
              {job.location && (
                <Badge variant="secondary" className="bg-charcoal-600/80 text-cream-100/90 border-charcoal-500 px-3 py-1">
                  <MapPin className="w-3.5 h-3.5 mr-1.5" />
                  {job.location}
                </Badge>
              )}
              {job.created_at && (
                <Badge variant="secondary" className="bg-charcoal-600/80 text-cream-100/90 border-charcoal-500 px-3 py-1">
                  <Calendar className="w-3.5 h-3.5 mr-1.5" />
                  Posted {formatJobDate(job.created_at)}
                </Badge>
              )}
            </div>

            {/* Primary CTAs */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                asChild 
                size="lg"
                className="bg-teal hover:bg-teal-600 text-white px-8 py-6 text-base font-semibold shadow-lg shadow-teal/20"
              >
                <a 
                  href={`mailto:tracys@forgedinthefireohio.org?subject=Application for ${encodeURIComponent(job.title)}`}
                  className="flex items-center gap-2"
                >
                  <Heart className="w-5 h-5" />
                  Apply for This Role
                </a>
              </Button>
              <Button 
                asChild 
                variant="outline" 
                size="lg"
                className="border-cream-100/30 text-cream-100 hover:bg-cream-100/10 px-8 py-6 text-base"
              >
                <Link href="/careers" className="flex items-center gap-2">
                  View All Open Roles
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Job Overview Card */}
      <section className="py-8 -mt-8 relative z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <Card className="bg-charcoal-700/80 backdrop-blur-sm border-charcoal-600 shadow-xl">
              <CardContent className="p-6 md:p-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-2 text-teal mb-2">
                      <Building2 className="w-4 h-4" />
                      <span className="text-xs uppercase tracking-wider font-medium">Location</span>
                    </div>
                    <p className="text-cream-100 font-medium">{job.location || 'Lorain County, OH'}</p>
                  </div>
                  <div className="text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-2 text-teal mb-2">
                      <Briefcase className="w-4 h-4" />
                      <span className="text-xs uppercase tracking-wider font-medium">Type</span>
                    </div>
                    <p className="text-cream-100 font-medium">{job.type}</p>
                  </div>
                  {job.pay_range && (
                    <div className="text-center md:text-left">
                      <div className="flex items-center justify-center md:justify-start gap-2 text-teal mb-2">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs uppercase tracking-wider font-medium">Compensation</span>
                      </div>
                      <p className="text-cream-100 font-medium">{job.pay_range}</p>
                    </div>
                  )}
                  <div className="text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-2 text-teal mb-2">
                      <Calendar className="w-4 h-4" />
                      <span className="text-xs uppercase tracking-wider font-medium">Posted</span>
                    </div>
                    <p className="text-cream-100 font-medium">{formatJobDate(job.created_at)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Main Content - 2/3 width */}
              <div className="lg:col-span-2 space-y-8">
                {/* Description */}
                <div className="bg-charcoal-800/50 rounded-2xl p-6 md:p-8 border border-charcoal-700">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-teal/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-teal" />
                    </div>
                    <h2 className="font-playfair text-2xl font-semibold text-cream-100">
                      About This Role
                    </h2>
                  </div>
                  <div className="prose prose-invert prose-charcoal max-w-none">
                    <p className="text-cream-100/80 leading-relaxed text-lg">
                      {job.description}
                    </p>
                  </div>
                </div>

                {/* Responsibilities */}
                {responsibilities.length > 0 && (
                  <div className="bg-charcoal-800/50 rounded-2xl p-6 md:p-8 border border-charcoal-700">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-teal/10 flex items-center justify-center">
                        <List className="w-5 h-5 text-teal" />
                      </div>
                      <h2 className="font-playfair text-2xl font-semibold text-cream-100">
                        What You Will Do
                      </h2>
                    </div>
                    <ul className="space-y-4">
                      {responsibilities.map((duty, index) => (
                        <li key={index} className="flex items-start gap-4 text-cream-100/80">
                          <div className="w-6 h-6 rounded-full bg-teal/20 flex items-center justify-center shrink-0 mt-0.5">
                            <CheckCircle className="w-3.5 h-3.5 text-teal" />
                          </div>
                          <span className="leading-relaxed">{duty.trim().replace(/^[-•]\s*/, '')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Qualifications */}
                {qualifications.length > 0 && (
                  <div className="bg-charcoal-800/50 rounded-2xl p-6 md:p-8 border border-charcoal-700">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-gold" />
                      </div>
                      <h2 className="font-playfair text-2xl font-semibold text-cream-100">
                        What We Are Looking For
                      </h2>
                    </div>
                    <ul className="space-y-4">
                      {qualifications.map((req, index) => (
                        <li key={index} className="flex items-start gap-4 text-cream-100/80">
                          <div className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center shrink-0 mt-0.5">
                            <CheckCircle className="w-3.5 h-3.5 text-gold" />
                          </div>
                          <span className="leading-relaxed">{req.trim().replace(/^[-•]\s*/, '')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* No content fallback */}
                {responsibilities.length === 0 && qualifications.length === 0 && (
                  <div className="bg-charcoal-800/50 rounded-2xl p-6 md:p-8 border border-charcoal-700">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-teal/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-teal" />
                      </div>
                      <h2 className="font-playfair text-2xl font-semibold text-cream-100">
                        Role Overview
                      </h2>
                    </div>
                    <p className="text-cream-100/80 leading-relaxed">
                      {job.description}
                    </p>
                    <div className="mt-6 p-4 bg-teal/5 rounded-xl border border-teal/20">
                      <p className="text-cream-100/70 text-sm">
                        Detailed responsibilities and qualifications will be discussed during the interview process. 
                        We welcome candidates who are passionate about our mission and eager to learn.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar - 1/3 width */}
              <div className="lg:col-span-1">
                <div className="sticky top-24 space-y-6">
                  {/* Apply CTA Card */}
                  <Card className="bg-gradient-to-br from-charcoal-700 to-charcoal-800 border-charcoal-600 shadow-xl overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-teal to-gold" />
                    <CardContent className="p-6">
                      <h3 className="font-playfair text-xl font-semibold text-cream-100 mb-3">
                        Ready to Join Us?
                      </h3>
                      <p className="text-cream-100/70 text-sm mb-6 leading-relaxed">
                        Be part of meaningful work that restores hope and rebuilds lives. 
                        Your skills can make a real difference.
                      </p>
                      <Button 
                        asChild 
                        className="w-full bg-teal hover:bg-teal-600 text-white mb-3"
                      >
                        <a 
                          href={`mailto:tracys@forgedinthefireohio.org?subject=Application for ${encodeURIComponent(job.title)}`}
                          className="flex items-center justify-center gap-2"
                        >
                          <Mail className="w-4 h-4" />
                          Apply Now
                        </a>
                      </Button>
                      <p className="text-xs text-cream-100/50 text-center mb-4">
                        Or reach out through our{' '}
                        <Link href="/contact" className="text-teal hover:underline">
                          contact form
                        </Link>
                      </p>
                      
                      {/* Application Instructions */}
                      <div className="pt-4 border-t border-charcoal-600">
                        <p className="text-xs text-cream-100/60">
                          <span className="text-teal font-medium">Include in your email:</span>
                          <br />• Your resume
                          <br />• Brief introduction
                          <br />• Why this role interests you
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Share Card */}
                  <Card className="bg-charcoal-700/50 border-charcoal-600">
                    <CardContent className="p-6">
                      <h3 className="font-playfair text-lg font-semibold text-cream-100 mb-2">
                        Know Someone Perfect?
                      </h3>
                      <p className="text-sm text-cream-100/70 mb-4">
                        Share this opportunity with someone who would thrive in this role.
                      </p>
                      <ShareButton />
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brand Mission Block */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-charcoal-800 to-charcoal relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-teal/5 via-transparent to-transparent" />
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal/20 to-gold/20 flex items-center justify-center mx-auto mb-8 border border-teal/30">
              <Flame className="w-8 h-8 text-teal" />
            </div>
            <h2 className="font-playfair text-3xl md:text-4xl font-bold text-cream-100 mb-6">
              Built on Purpose. Driven by Service.
            </h2>
            <p className="text-lg text-cream-100/80 leading-relaxed mb-8 max-w-2xl mx-auto">
              Forged in the Fire is built around purpose, discipline, service, and meaningful community impact. 
              If that sounds like the kind of work you want to be part of, we would like to hear from you.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                asChild 
                size="lg"
                className="bg-teal hover:bg-teal-600 text-white px-8"
              >
                <a 
                  href={`mailto:tracys@forgedinthefireohio.org?subject=Application for ${encodeURIComponent(job.title)}`}
                  className="flex items-center gap-2"
                >
                  <Heart className="w-5 h-5" />
                  Apply for This Role
                </a>
              </Button>
              <Button 
                asChild 
                variant="outline" 
                size="lg"
                className="border-cream-100/30 text-cream-100 hover:bg-cream-100/10 px-8"
              >
                <Link href="/about" className="flex items-center gap-2">
                  Learn About Our Mission
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Navigation */}
      <section className="py-8 border-t border-charcoal-700 bg-charcoal">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link 
              href="/careers"
              className="group inline-flex items-center gap-2 text-sm text-cream-100/60 hover:text-teal transition-all"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Back to All Open Roles
            </Link>
            <p className="text-sm text-cream-100/40">
              Questions? Contact us at{' '}
              <a href="mailto:tracys@forgedinthefireohio.org" className="text-teal hover:underline">
                tracys@forgedinthefireohio.org
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

