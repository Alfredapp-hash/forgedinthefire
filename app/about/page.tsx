import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ORG, CORE_VALUES } from '@/lib/constants';
import { ZEFFY_DONATE_URL } from '@/lib/fundraising/types';
import { generateMetaTags } from '@/lib/utils';
import {
  Heart,
  Award,
  ArrowRight,
  CheckCircle2,
  Gavel,
  BookOpen,
  Handshake,
} from 'lucide-react';

export const metadata: Metadata = generateMetaTags({
  title: 'About Forged in the Fire | Anti Trafficking Nonprofit Lorain County Ohio',
  description:
    "Meet Forged in the Fire, a Lorain County based anti human trafficking nonprofit serving survivors in Northeast Ohio through advocacy, education, mentorship, and survivor centered support.",
});

const CREDENTIALS = [
  {
    icon: Award,
    label: '15+ Years',
    detail: 'Direct victim advocacy experience in anti-human trafficking work',
  },
  {
    icon: CheckCircle2,
    label: 'Certified Victim Advocate',
    detail: 'National Advocate Credentialing Program (NACP)',
  },
  {
    icon: CheckCircle2,
    label: 'Registered Advocate',
    detail: 'Ohio Victim Advocates',
  },
  {
    icon: BookOpen,
    label: '500+ Training Hours',
    detail: 'Specialized trauma response, sexual assault, and human trafficking',
  },
  {
    icon: Handshake,
    label: 'Designated Victim Advocate',
    detail: 'Northeast Ohio Human Trafficking Task Force',
  },
  {
    icon: Gavel,
    label: 'Expert Court Witness',
    detail: 'Testifying on the psychological, social, and community impacts of trafficking',
  },
];

const PARTNERS = [
  'National Human Trafficking Hotline',
  'Northeast Ohio Human Trafficking Task Force',
  'Local Law Enforcement Agencies',
  'District Attorney Offices',
  'Community Health Centers',
  'Housing Authorities',
  'Legal Aid Organizations',
];

export default function AboutPage() {
  return (
    <div className="min-h-screen">

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 bg-gradient-to-b from-[#000000] via-[#05070A] to-[#05070A]">
        <div className="container-wide section-padding">
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block text-[#8DEBFF] font-medium mb-4 tracking-wide uppercase text-sm">
              About Us
            </span>
            <h1 className="font-serif text-5xl sm:text-6xl font-bold text-[#F6FAFC] mb-6 leading-tight">
              About Forged in the Fire: Lorain County Anti Trafficking Nonprofit
            </h1>
            <p className="text-xl text-[#B8C4CF] leading-relaxed max-w-2xl mx-auto mb-4">
              Restoring hope. Rebuilding lives. Empowering survivors.
            </p>
            <p className="text-lg text-[#A9B8C6] leading-relaxed max-w-2xl mx-auto">
              Forged in the Fire exists to provide trauma-informed support, advocacy, safe housing
              pathways, and holistic care for survivors of commercial sex trafficking — meeting
              survivors where they are and walking alongside them toward freedom and healing.
            </p>
          </div>
        </div>
      </section>

      {/* ── Mission & Vision ── */}
      <section className="py-24 bg-transparent">
        <div className="container-wide section-padding">
          <div className="grid lg:grid-cols-2 gap-10">
            <Card className="bg-[#151B22] border-[#1A232C]">
              <CardContent className="p-8">
                <div className="w-12 h-12 rounded-lg bg-[#53D6FF]/15 flex items-center justify-center mb-6">
                  <Heart className="h-6 w-6 text-heart" />
                </div>
                <h2 className="font-serif text-3xl font-bold text-[#F6FAFC] mb-4">Our Mission</h2>
                <p className="text-lg text-[#B8C4CF] leading-relaxed">
                  Forged in the Fire is committed to empowering survivors of commercial sex
                  trafficking through safe housing, trauma-informed advocacy, crisis support,
                  education, vocational support, and community reintegration — fostering healing,
                  independence, and lasting hope.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-[#151B22] border-[#1A232C]">
              <CardContent className="p-8">
                <div className="w-12 h-12 rounded-lg bg-[#53D6FF]/15 flex items-center justify-center mb-6">
                  <Award className="h-6 w-6 text-[#53D6FF]" />
                </div>
                <h2 className="font-serif text-3xl font-bold text-[#F6FAFC] mb-4">Our Vision</h2>
                <p className="text-lg text-[#B8C4CF] leading-relaxed">{ORG.vision}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ── Our Location & Service Area ── */}
      <section className="py-24 bg-[#11161C] border-y border-[#1A232C]">
        <div className="container-wide section-padding">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-block text-[#8DEBFF] font-medium mb-4 tracking-wide uppercase text-sm">
              Our Location
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#F6FAFC] mb-6">
              Lorain County Based, Northeast Ohio Focused
            </h2>
            <p className="text-lg text-[#B8C4CF] leading-relaxed mb-6">
              Forged in the Fire operates from Lorain County, Ohio, serving survivors and communities 
              throughout Lorain County and the greater Northeast Ohio region. Our location allows 
              us to respond to the unique needs of urban, suburban, and rural communities facing 
              human trafficking and commercial sexual exploitation.
            </p>
            <p className="text-lg text-[#A9B8C6] leading-relaxed">
              Through our collaboration with the Northeast Ohio Human Trafficking Task Force and 
              partnerships with local law enforcement, health systems, and community organizations, 
              we bring coordinated, survivor-centered care to those who need it most.
            </p>
          </div>
        </div>
      </section>

      {/* ── Founder & Executive Leadership ── */}
      <section id="team" className="py-24 bg-transparent">
        <div className="container-wide section-padding">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-block text-[#8DEBFF] font-medium mb-4 tracking-wide uppercase text-sm">
              Leadership
            </span>
            <h2 className="font-serif text-4xl font-bold text-[#F6FAFC] mb-4">
              Founder &amp; Executive Leadership
            </h2>
            <p className="text-lg text-[#B8C4CF]">
              Guided by experience, driven by purpose.
            </p>
          </div>

          {/* Two-column founder card */}
          <div className="max-w-5xl mx-auto">
            <Card className="bg-[#151B22] border-[#1A232C] overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col lg:flex-row">

                  {/* Photo column */}
                  <div className="lg:w-72 xl:w-80 flex-shrink-0 bg-[#11161C] flex items-center justify-center p-10 lg:p-12">
                    <div className="relative w-48 lg:w-56 rounded-2xl overflow-hidden shadow-forge border border-[#1A232C]" style={{ aspectRatio: '1024 / 1536' }}>
                      <Image
                        src="/Founder-headshot.png"
                        alt="Tracy Springford, Founder, President & CEO of Forged in the Fire, Lorain County victim advocate"
                        fill
                        className="object-cover object-top"
                        sizes="(max-width: 1024px) 192px, 224px"
                        priority
                      />
                    </div>
                  </div>

                  {/* Bio column */}
                  <div className="flex-1 p-8 lg:p-12">
                    <div className="mb-6">
                      <h3 className="font-serif text-3xl font-bold text-[#F6FAFC] mb-1">
                        Tracy Springford, B.A., C.A.
                      </h3>
                      <p className="text-[#53D6FF] font-medium text-lg">
                        Founder, President &amp; CEO
                      </p>
                    </div>

                    <div className="space-y-4 text-[#B8C4CF] leading-relaxed">
                      <p>
                        Tracy Springford is a nationally recognized victim advocate specializing
                        in crisis intervention for survivors of sexual assault and commercial sex
                        trafficking. She brings more than 15 years of direct service experience
                        in anti-human trafficking work, including over a decade serving in
                        California.
                      </p>
                      <p>
                        Tracy currently serves as the designated Victim Advocate for the
                        Northeast Ohio Human Trafficking Task Force, where she actively
                        participates in statewide sting operations, search warrants, and arrest
                        operations — providing immediate, trauma-informed advocacy to victims
                        during law enforcement actions.
                      </p>
                      <p>
                        She has conducted extensive community outreach and professional training
                        for businesses, schools, law enforcement agencies, and public and private
                        organizations. She holds a Bachelor of Arts and is a Certified Victim
                        Advocate through the National Advocate Credentialing Program, with more
                        than 500 hours of specialized training in trauma response, sexual assault,
                        and human trafficking.
                      </p>
                      <p>
                        Tracy is recognized as an expert court witness, frequently testifying on
                        the psychological, social, and community impacts of human trafficking.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ── Credential Highlights ── */}
      <section className="py-24 bg-transparent">
        <div className="container-wide section-padding">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-block text-[#8DEBFF] font-medium mb-4 tracking-wide uppercase text-sm">
              Qualifications
            </span>
            <h2 className="font-serif text-4xl font-bold text-[#F6FAFC] mb-4">
              Credentials &amp; Recognition
            </h2>
            <p className="text-lg text-[#B8C4CF]">
              A record of expertise built through dedication, training, and direct service.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {CREDENTIALS.map((cred, index) => {
              const Icon = cred.icon;
              return (
                <div
                  key={index}
                  className="flex gap-4 p-6 bg-[#151B22] rounded-xl border border-[#1A232C] hover:border-[#53D6FF]/40 transition-colors duration-300"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#53D6FF]/15 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-[#53D6FF]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[#F6FAFC] mb-1">{cred.label}</p>
                    <p className="text-sm text-[#A9B8C6] leading-snug">{cred.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Work & Impact ── */}
      <section className="py-24 bg-transparent">
        <div className="container-wide section-padding">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <span className="inline-block text-[#8DEBFF] font-medium mb-4 tracking-wide uppercase text-sm">
                Impact
              </span>
              <h2 className="font-serif text-4xl font-bold text-[#F6FAFC] mb-4">
                Work in the Field
              </h2>
              <p className="text-lg text-[#B8C4CF] max-w-2xl mx-auto">
                Tracy&apos;s work spans every dimension of survivor advocacy — from the moment of
                crisis to long-term empowerment.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              {[
                {
                  title: 'Crisis Intervention',
                  description:
                    'Providing immediate, trauma-informed support to survivors during law enforcement operations and in the critical hours of initial disclosure.',
                },
                {
                  title: 'Community Outreach',
                  description:
                    'Building awareness and response capacity across businesses, schools, faith communities, and public organizations throughout Ohio and beyond.',
                },
                {
                  title: 'Law Enforcement Collaboration',
                  description:
                    'Working directly alongside task force operations — sting operations, search warrants, and arrest actions — to ensure survivor voices are centered from the first moment.',
                },
                {
                  title: 'Professional Training',
                  description:
                    'Delivering specialized training for law enforcement, healthcare providers, educators, and community leaders on trauma-informed response to trafficking.',
                },
              ].map((item, index) => (
                <Card key={index} className="bg-[#151B22] border-[#1A232C]">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-1.5 h-6 rounded-full bg-[#53D6FF]" />
                      <h3 className="font-serif text-xl font-semibold text-[#F6FAFC]">
                        {item.title}
                      </h3>
                    </div>
                    <p className="text-[#B8C4CF] leading-relaxed pl-5">{item.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Survivor-Centered Philosophy ── */}
      <section className="py-24 bg-transparent">
        <div className="container-wide section-padding">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <span className="inline-block text-[#53D6FF] font-medium mb-4 tracking-wide uppercase text-sm">
              Our Approach
            </span>
            <h2 className="font-serif text-4xl font-bold text-[#F6FAFC] mb-6">
              Survivor-Centered Philosophy
            </h2>
            <p className="text-lg text-[#B8C4CF]">
              Everything we do is guided by the belief that survivors are the experts of their own
              experiences.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {[
              {
                title: 'Trauma-Informed Care',
                description:
                  'We recognize the widespread impact of trauma and integrate this understanding into all our policies and practices.',
              },
              {
                title: 'Survivor Leadership',
                description:
                  'Survivors guide our programming, ensuring services meet real needs and honor lived experiences.',
              },
              {
                title: 'Safety & Autonomy',
                description:
                  "We prioritize physical and emotional safety while respecting each survivor's right to self-determination.",
              },
              {
                title: 'Cultural Humility',
                description:
                  'We recognize and respect diverse backgrounds, ensuring inclusive and culturally responsive services.',
              },
            ].map((item, index) => (
              <Card key={index} className="bg-[#151B22] border-[#1A232C]">
                <CardContent className="p-6">
                  <h3 className="font-serif text-xl font-semibold text-[#F6FAFC] mb-3">
                    {item.title}
                  </h3>
                  <p className="text-[#B8C4CF]/80">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Core Values ── */}
      <section className="py-24 bg-transparent">
        <div className="container-wide section-padding">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-block text-[#8DEBFF] font-medium mb-4 tracking-wide uppercase text-sm">
              What Drives Us
            </span>
            <h2 className="font-serif text-4xl font-bold text-[#F6FAFC] mb-6">Core Values</h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {CORE_VALUES.map((value, index) => (
              <Card key={index} className="bg-[#151B22] border-[#1A232C]">
                <CardContent className="p-6">
                  <h3 className="font-serif text-xl font-semibold text-[#F6FAFC] mb-3">
                    {value.title}
                  </h3>
                  <p className="text-[#B8C4CF]/80">{value.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Community Partners ── */}
      <section id="partners" className="py-24 bg-transparent">
        <div className="container-wide section-padding">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-block text-[#53D6FF] font-medium mb-4 tracking-wide uppercase text-sm">
              Collaboration
            </span>
            <h2 className="font-serif text-4xl font-bold text-[#F6FAFC] mb-6">
              Community Partners
            </h2>
            <p className="text-lg text-[#B8C4CF]">
              We work alongside these organizations to provide comprehensive, coordinated support.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {PARTNERS.map((partner, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-4 bg-[#151B22]/60 rounded-lg border border-[#1A232C]/60"
              >
                <div className="w-2 h-2 rounded-full bg-[#53D6FF] flex-shrink-0" />
                <span className="text-[#B8C4CF]">{partner}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 bg-gradient-to-br from-[#000000] via-[#05070A] to-[#05070A]">
        <div className="container-wide section-padding">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="font-serif text-4xl font-bold text-[#F6FAFC] mb-4">
              Stand With Survivors
            </h2>
            <p className="text-xl text-[#B8C4CF] mb-10 leading-relaxed">
              Whether you or someone you know needs support, or you&apos;re ready to be part of
              the solution — we&apos;re here.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                asChild
                size="lg"
                className="bg-[#53D6FF] hover:bg-[#82E8FF] text-[#061016] px-8 py-6 text-base shadow-forge hover:shadow-[0_12px_40px_rgba(83, 214, 255,0.25)] transition-all duration-300"
              >
                <Link href="/get-help">
                  Get Help Now <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-[#27313B] text-[#8DEBFF] hover:bg-[#1A232C]/15 px-8 py-6 text-base transition-all duration-300"
              >
                <a href={ZEFFY_DONATE_URL} target="_blank" rel="noopener noreferrer">
                  Support Our Mission <Heart className="ml-2 h-5 w-5" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
