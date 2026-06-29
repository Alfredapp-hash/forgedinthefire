'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FOOTER_LINKS, SOCIAL_LINKS, ORG, HOTLINES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Heart, Facebook, Instagram, Twitter, Linkedin, Youtube, Mail, Phone, MapPin } from 'lucide-react';
import Image from 'next/image';

const socialIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Facebook,
  Instagram,
  Twitter,
  LinkedIn: Linkedin,
  Youtube,
};

export function Footer() {
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();

  // Hide footer on admin routes - admin has its own layout
  const isAdminRoute = pathname?.startsWith('/admin') || pathname?.startsWith('/login') || pathname?.startsWith('/unauthorized');
  if (isAdminRoute) return null;

  return (
    <footer className="bg-[#181210] border-t border-[#3A2A24]" role="contentinfo">
      {/* Emergency Banner */}
      <div className="bg-[#3A2A24] border-b border-[#8B5E3C]/30">
        <div className="container-wide section-padding py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div>
              <p className="text-sm text-[#CDBDAF]">
                <span className="font-semibold text-[#C8A46B]">Need immediate help?</span>{' '}
                Contact the National Human Trafficking Hotline
              </p>
            </div>
            <div className="flex items-center gap-4">
              <a
                href={`tel:${HOTLINES[0].phone.replace(/\D/g, '')}`}
                className="text-lg font-bold text-[#C8A46B] hover:text-[#8B5E3C] transition-colors"
              >
                {HOTLINES[0].phone}
              </a>
              <span className="text-[#8B5E3C]/60 text-sm">|</span>
              <span className="text-sm text-[#B8A89A]">
                Text &quot;BEFREE&quot; to {HOTLINES[0].sms}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="container-wide section-padding py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-8">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-6 group">
              <div className="relative w-8 h-12 overflow-hidden">
                <Image
                  src="/forged-logo.png"
                  alt="Forged in the Fire"
                  fill
                  className="object-contain transition-all duration-300 ease-out group-hover:scale-105"
                  sizes="32px"
                />
              </div>
              <span className="font-serif text-xl font-semibold text-[#F6F0E8]">
                {ORG.name}
              </span>
            </Link>
            <p className="text-[#CDBDAF] mb-6 max-w-sm leading-relaxed">
              {ORG.description}
            </p>
            
            {/* Contact Info */}
            <div className="space-y-3">
              <a
                href={`mailto:${ORG.email}`}
                className="flex items-center gap-3 text-[#CDBDAF] hover:text-[#4C9AA3] transition-colors"
              >
                <Mail className="h-4 w-4" />
                <span className="text-sm">{ORG.email}</span>
              </a>
              <a
                href={`tel:${ORG.phone.replace(/\D/g, '')}`}
                className="flex items-center gap-3 text-[#CDBDAF] hover:text-[#4C9AA3] transition-colors"
              >
                <Phone className="h-4 w-4" />
                <span className="text-sm">{ORG.phone}</span>
              </a>
              <div className="flex items-start gap-3 text-[#B8A89A]">
                <MapPin className="h-4 w-4 mt-0.5" />
                <span className="text-sm">{ORG.address}</span>
              </div>
            </div>

            {/* Social Links */}
            <div className="flex gap-4 mt-6">
              {SOCIAL_LINKS.map((social) => {
                const Icon = socialIcons[social.icon];
                return (
                  <a
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-[#B8A89A] hover:text-[#4C9AA3] hover:bg-[#1E6B73]/20 rounded-full transition-all"
                    aria-label={`Follow us on ${social.name}`}
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Services Links */}
          <div>
            <h3 className="font-serif text-lg font-semibold text-[#F6F0E8] mb-4">
              Services
            </h3>
            <ul className="space-y-3">
              {FOOTER_LINKS.services.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#CDBDAF] hover:text-[#4C9AA3] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Organization Links */}
          <div>
            <h3 className="font-serif text-lg font-semibold text-[#F6F0E8] mb-4">
              Organization
            </h3>
            <ul className="space-y-3">
              {FOOTER_LINKS.organization.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#CDBDAF] hover:text-[#4C9AA3] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h3 className="font-serif text-lg font-semibold text-[#F6F0E8] mb-4">
              Resources
            </h3>
            <ul className="space-y-3">
              {FOOTER_LINKS.resources.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#CDBDAF] hover:text-[#4C9AA3] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-[#3A2A24]">
        <div className="container-wide section-padding py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-[#B8A89A]">
              {FOOTER_LINKS.legal.map((link, index) => (
                <span key={link.href} className="flex items-center gap-4">
                  <Link
                    href={link.href}
                    className="hover:text-[#4C9AA3] transition-colors"
                  >
                    {link.label}
                  </Link>
                  {index < FOOTER_LINKS.legal.length - 1 && (
                    <span className="hidden sm:inline text-[#8B5E3C]/40">|</span>
                  )}
                </span>
              ))}
            </div>
            <div className="text-sm text-[#B8A89A] text-center md:text-right">
              <p className="mb-1">Serving Lorain County and Northeast Ohio</p>
              <p>
                &copy; {currentYear} {ORG.name}. All rights reserved.
                <span className="inline-flex items-center gap-1 ml-2">
                  Made with <Heart className="h-3 w-3 text-[#1E6B73] fill-[#1E6B73]" /> for survivors
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
