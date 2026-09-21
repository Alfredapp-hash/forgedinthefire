'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { SubscribeModal } from '@/src/components/subscribe-modal';
import { NAV_LINKS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Menu, X, Mail } from 'lucide-react';
import Image from 'next/image';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  // Hide navbar on admin routes - admin has its own sidebar navigation
  const isAdminRoute = pathname?.startsWith('/admin') || pathname?.startsWith('/login') || pathname?.startsWith('/unauthorized');

  const glassHeader = isOpen || isScrolled || pathname !== '/';

  const closeMenu = () => {
    if (menuRef.current) menuRef.current.open = false;
    setIsOpen(false);
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on client-side route change, not on the initial mount
  // (so a disclosure opened before hydration is not immediately slammed shut).
  useEffect(() => {
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;
    closeMenu();
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (!isOpen) return;
    const { body, documentElement } = document;
    const previousBody = body.style.overflow;
    const previousHtml = documentElement.style.overflow;
    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previousBody;
      documentElement.style.overflow = previousHtml;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  // Hooks must run unconditionally, so bail out only at render time.
  if (isAdminRoute) return null;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40" role="banner">
        {/* Glass fill is a sibling layer, not a filter on <header> itself.
            backdrop-filter on the header used to turn it into a containing
            block, which clipped the mobile sheet to the 80px bar on every
            page except a transparent Home. */}
        <div
          aria-hidden
          className={cn(
            'header-glass pointer-events-none absolute inset-0 border-b',
            isOpen || glassHeader ? 'header-glass-on' : 'header-glass-off'
          )}
        />
      <nav
        className="relative container-wide section-padding"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="flex h-20 items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2.5 group shrink-0"
            aria-label="Forged in the Fire - Home"
            onClick={closeMenu}
          >
            {/* The brand lockup is a square with baked-in type, so the navbar
                uses only the anvil-and-flame mark; the wordmark beside it is
                live text. Explicit intrinsic size prevents layout shift. */}
            <Image
              src="/brand/fitf-mark.png"
              alt="Forged in the Fire"
              width={36}
              height={54}
              className="h-[54px] w-9 shrink-0 object-contain transition-opacity duration-500 ease-out group-hover:opacity-90"
              priority
              sizes="36px"
              quality={95}
            />
            <span className="font-serif text-lg font-semibold text-[#F6FAFC] hidden sm:block whitespace-nowrap tracking-tight">
              Forged in the Fire
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-0.5">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  // px-2 until xl: at 1024–1082px the nine links plus both CTAs
                  // exceeded the row and flex-shrink squeezed the labels into
                  // each other. Narrower padding keeps them on their own tracks.
                  'relative shrink-0 whitespace-nowrap rounded-md px-1.5 py-2 text-[13px] font-medium tracking-wide transition-colors duration-200 xl:px-3',
                  isActive(link.href)
                    ? 'text-[#53D6FF]'
                    : 'text-[#B8C4CF] hover:text-[#53D6FF]',
                  'priority' in link && link.priority && 'text-[#53D6FF] font-semibold'
                )}
                aria-current={isActive(link.href) ? 'page' : undefined}
              >
                {link.label}
                {isActive(link.href) && (
                  <motion.span
                    layoutId="activeNav"
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#53D6FF] rounded-full"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            ))}
          </div>

          {/* Desktop CTA Buttons */}
          <div className="hidden lg:flex items-center gap-3">
            <Button
              onClick={() => setIsSubscribeOpen(true)}
              variant="outline"
              size="sm"
            >
              <Mail className="w-4 h-4 mr-2" />
              Subscribe
            </Button>
            <Button
              asChild
              variant="default"
              size="sm"
            >
              <Link href="/donate">Donate</Link>
            </Button>
          </div>

          {/* Native disclosure so the sheet opens even if client JS is late. */}
          <details
            ref={menuRef}
            className="mobile-nav-toggle relative z-10 lg:hidden"
            onToggle={(event) => setIsOpen(event.currentTarget.open)}
          >
            <summary
              className="flex cursor-pointer list-none p-2 text-[#B8C4CF] hover:text-[#53D6FF] transition-colors [&::-webkit-details-marker]:hidden [&_svg]:pointer-events-none"
              aria-label="Site menu"
            >
              <Menu className="mobile-nav-icon-open h-6 w-6" aria-hidden="true" />
              <X className="mobile-nav-icon-close h-6 w-6" aria-hidden="true" />
            </summary>
            <div
              id="mobile-menu"
              className="mobile-nav-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Site menu"
            >
              <nav className="flex min-h-full flex-col px-5 pb-28 pt-2" aria-label="Mobile navigation">
                <ul className="flex flex-col">
                  {NAV_LINKS.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className={cn(
                          'flex min-h-11 items-center border-b border-[#1A232C] px-1 text-base font-medium transition-colors',
                          isActive(link.href)
                            ? 'text-[#53D6FF]'
                            : 'text-[#F6FAFC] hover:text-[#53D6FF]',
                          'priority' in link && link.priority && 'font-semibold'
                        )}
                        aria-current={isActive(link.href) ? 'page' : undefined}
                        onClick={closeMenu}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>

                <div className="mt-8 flex flex-col gap-3">
                  <Button asChild variant="outline" size="lg" className="w-full min-h-12">
                    <Link href="/get-help" onClick={closeMenu}>
                      Get Help Now
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      setIsSubscribeOpen(true);
                    }}
                    variant="outline"
                    size="lg"
                    className="w-full min-h-12"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Subscribe to Updates
                  </Button>
                  <Button asChild variant="default" size="lg" className="w-full min-h-12">
                    <Link href="/donate" onClick={closeMenu}>
                      Donate Today
                    </Link>
                  </Button>
                </div>

                <div className="mt-8 rounded-lg border border-[#27313B]/30 bg-[#11161C] p-4">
                  <p className="mb-2 text-sm font-medium text-[#B8C4CF]">
                    National Human Trafficking Hotline
                  </p>
                  <a
                    href="tel:1-888-373-7888"
                    className="text-lg font-bold text-[#8DEBFF] hover:text-[#A9B8C6]"
                  >
                    1-888-373-7888
                  </a>
                  <p className="mt-1 text-xs text-[#A9B8C6]">Text &quot;BEFREE&quot; to 233733</p>
                </div>
              </nav>
            </div>
          </details>
        </div>
      </nav>
    </header>

    <SubscribeModal isOpen={isSubscribeOpen} onClose={() => setIsSubscribeOpen(false)} />
    </>
  );
}
