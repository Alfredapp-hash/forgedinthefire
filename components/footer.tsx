'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { FOOTER_LINKS, SOCIAL_LINKS, ORG, GEO, HOTLINES } from '@/lib/constants';
import {
  Heart,
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  Youtube,
  Mail,
  Phone,
  MapPin,
  MessageSquare,
} from 'lucide-react';

const socialIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Facebook,
  Instagram,
  Twitter,
  LinkedIn: Linkedin,
  Youtube,
};

const hotline = HOTLINES[0];
const dial = (value: string) => value.replace(/\D/g, '');

/**
 * Quick Exit is a fixed safety control at bottom-4 right-4, 48px tall, so it owns
 * the bottom 64px of the viewport at every width — and the footer is what sits
 * under it once the page is scrolled to the end. Reserving the clearance here (in
 * the footer) rather than moving the button keeps the escape affordance exactly
 * where survivors expect it, and it holds at any viewport size because it is
 * measured from the same edge the button is pinned to. 5rem = the button's 64px
 * footprint plus 16px of breathing room; the safe-area inset covers the iOS
 * home-indicator band, which Quick Exit's own bottom-4 does not clear.
 */
const QUICK_EXIT_CLEARANCE = 'calc(5rem + env(safe-area-inset-bottom, 0px))';

const linkClass =
  'inline-block py-1 text-sm text-[#B8C4CF] transition-colors duration-200 hover:text-[#53D6FF]';

export function Footer() {
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();

  // Hide footer on admin routes - admin has its own layout
  const isAdminRoute =
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/unauthorized');
  if (isAdminRoute) return null;

  return (
    <footer className="bg-[#05070A]" role="contentinfo">
      <div className="forge-divider" aria-hidden="true" />

      {/* Crisis line — safety-critical, so it keeps the raised surface and the
          brightest type in the footer. Both affordances are real links now. */}
      <div className="bg-[#11161C]">
        <div className="container-wide section-padding py-2">
          <div className="flex flex-col items-center gap-1 text-center sm:flex-row sm:justify-between sm:gap-6 sm:text-left">
            <p className="text-sm leading-snug text-[#B8C4CF]">
              <span className="font-semibold text-[#8DEBFF]">Need immediate help?</span>{' '}
              {hotline.name} &mdash; free and confidential, {hotline.available}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-1 sm:shrink-0 sm:justify-end">
              <a
                href={`tel:${dial(hotline.phone)}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-lg font-bold tracking-tight text-[#8DEBFF] transition-colors duration-200 hover:text-[#F6FAFC]"
              >
                <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{hotline.phone}</span>
              </a>
              <span aria-hidden="true" className="hidden h-4 w-px bg-[#27313B] sm:block" />
              <a
                href={`sms:${hotline.sms}?&body=${hotline.text}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-[#B8C4CF] transition-colors duration-200 hover:text-[#F6FAFC]"
              >
                <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Text {hotline.text} to {hotline.sms}
                </span>
              </a>
            </div>
          </div>
        </div>
        <div className="forge-divider" aria-hidden="true" />
      </div>

      {/* Main band */}
      <div className="container-wide section-padding py-12 lg:py-14">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-12">
          {/* Brand. The mark carries the artwork and the wordmark is live text —
              the full lockup bakes in its own tagline and a near-black backdrop
              that reads as a dark rectangle against the obsidian footer. */}
          <div className="col-span-2 lg:col-span-3 xl:col-span-4">
            <Link href="/" className="group inline-flex items-center gap-3">
              <Image
                src="/brand/fitf-mark.png"
                alt=""
                aria-hidden="true"
                width={40}
                height={60}
                className="h-[60px] w-10 shrink-0 object-contain transition-opacity duration-300 ease-out group-hover:opacity-90"
                sizes="40px"
                quality={95}
              />
              <span className="font-serif text-xl font-semibold tracking-tight text-[#F6FAFC] transition-colors duration-200 group-hover:text-[#8DEBFF]">
                {ORG.name}
              </span>
            </Link>
            <p className="mt-3 text-balance text-xs font-medium uppercase tracking-[0.12em] text-[#A9B8C6]">
              Serving {GEO.serviceArea}
            </p>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-[#B8C4CF]">
              {ORG.description}
            </p>

            <ul className="-ml-2.5 mt-6 flex flex-wrap items-center">
              {SOCIAL_LINKS.map((social) => {
                const Icon = socialIcons[social.icon];
                return (
                  <li key={social.name}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#8DEBFF] transition-colors duration-200 hover:bg-[rgba(83,214,255,0.1)] hover:text-[#F6FAFC]"
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      <span className="sr-only">
                        {ORG.name} on {social.name} (opens in a new tab)
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Services runs two sub-columns so all three link groups end on the
              same baseline instead of leaving a ragged edge. */}
          <div className="col-span-2 lg:col-span-5 xl:col-span-4">
            <h2
              id="footer-services-heading"
              className="font-serif text-base font-semibold tracking-wide text-[#F6FAFC]"
            >
              Services
            </h2>
            <nav aria-labelledby="footer-services-heading" className="mt-4">
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                {FOOTER_LINKS.services.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="lg:col-span-2">
            <h2
              id="footer-organization-heading"
              className="font-serif text-base font-semibold tracking-wide text-[#F6FAFC]"
            >
              Organization
            </h2>
            <nav aria-labelledby="footer-organization-heading" className="mt-4">
              <ul className="space-y-1">
                {FOOTER_LINKS.organization.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="lg:col-span-2">
            <h2
              id="footer-resources-heading"
              className="font-serif text-base font-semibold tracking-wide text-[#F6FAFC]"
            >
              Resources
            </h2>
            <nav aria-labelledby="footer-resources-heading" className="mt-4">
              <ul className="space-y-1">
                {FOOTER_LINKS.resources.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </div>

      <div className="forge-divider" aria-hidden="true" />

      {/* Contact runs as a full-width strip rather than a fourth column: it fills
          the space that used to sit empty beside the brand block, and it gives the
          phone and email 44px targets on mobile. */}
      <div className="container-wide section-padding py-3">
        <ul className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
          <li>
            <a
              href={`mailto:${ORG.email}`}
              className="group inline-flex min-h-11 items-center gap-2.5 text-sm text-[#B8C4CF] transition-colors duration-200 hover:text-[#F6FAFC]"
            >
              <Mail
                className="h-4 w-4 shrink-0 text-[#8DEBFF] transition-colors duration-200 group-hover:text-[#F6FAFC]"
                aria-hidden="true"
              />
              <span>{ORG.email}</span>
            </a>
          </li>
          <li>
            <a
              href={`tel:${dial(ORG.phone)}`}
              className="group inline-flex min-h-11 items-center gap-2.5 text-sm text-[#B8C4CF] transition-colors duration-200 hover:text-[#F6FAFC]"
            >
              <Phone
                className="h-4 w-4 shrink-0 text-[#8DEBFF] transition-colors duration-200 group-hover:text-[#F6FAFC]"
                aria-hidden="true"
              />
              <span>{ORG.phone}</span>
            </a>
          </li>
          <li className="flex min-h-11 items-center gap-2.5 text-sm text-[#B8C4CF]">
            <MapPin className="h-4 w-4 shrink-0 text-[#8DEBFF]" aria-hidden="true" />
            <address className="not-italic">{ORG.address}</address>
          </li>
        </ul>
      </div>

      <div className="forge-divider" aria-hidden="true" />

      {/* Bottom bar. paddingBottom is the Quick Exit clearance — see the constant. */}
      <div
        className="container-wide section-padding pt-3"
        style={{ paddingBottom: QUICK_EXIT_CLEARANCE }}
      >
        {/* Side by side only from lg: below that the two groups need the full
            width to each stay on a single line. */}
        <div className="flex flex-col items-center gap-2 lg:flex-row lg:justify-between lg:gap-6">
          <nav aria-label="Legal and site information" className="-mx-1.5 sm:-mx-2">
            <ul className="flex flex-wrap items-center justify-center">
              {FOOTER_LINKS.legal.map((link, index) => (
                <li key={link.href} className="flex items-center">
                  <Link
                    href={link.href}
                    className="inline-flex min-h-11 items-center px-1.5 text-sm text-[#A9B8C6] transition-colors duration-200 hover:text-[#53D6FF] sm:px-2"
                  >
                    {link.label}
                  </Link>
                  {/* Hidden on the narrowest widths, where the row wraps and a
                      separator would be left stranded at the end of a line. */}
                  {index < FOOTER_LINKS.legal.length - 1 && (
                    <span aria-hidden="true" className="hidden h-3 w-px bg-[#27313B] sm:block" />
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-[#A9B8C6] lg:justify-end lg:text-right">
            <span>
              &copy; {currentYear} {ORG.name}. All rights reserved.
            </span>
            <span aria-hidden="true" className="hidden h-3 w-px bg-[#27313B] sm:inline-block" />
            <span className="font-medium text-[#F6FAFC]">
              501(c)(3) · EIN {ORG.ein}
            </span>
            <span aria-hidden="true" className="hidden h-3 w-px bg-[#27313B] sm:inline-block" />
            <span className="inline-flex items-center gap-1.5">
              Made with
              <Heart className="h-3.5 w-3.5 fill-heart text-heart" aria-hidden="true" />
              <span className="sr-only">love</span>
              for survivors
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
