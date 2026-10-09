'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { SubscribeModal } from '@/src/components/subscribe-modal';
import { NAV_LINKS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Menu, X, Mail } from 'lucide-react';
import Image from 'next/image';

const MOBILE_NAV_ID = 'site-mobile-nav';

function uncheckMobileNav() {
  const input = document.getElementById(MOBILE_NAV_ID);
  if (input instanceof HTMLInputElement) input.checked = false;
}

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  // Hide navbar on admin routes - admin has its own sidebar navigation
  const isAdminRoute =
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/unauthorized');

  const glassHeader = isScrolled || pathname !== '/';

  const closeMenu = useCallback(() => {
    uncheckMobileNav();
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;
    closeMenu();
  }, [pathname, closeMenu]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (media.matches) closeMenu();
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [closeMenu]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscribe') !== '1') return;
    closeMenu();
    setIsSubscribeOpen(true);
    params.delete('subscribe');
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', next);
  }, [closeMenu]);

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
  }, [isOpen, closeMenu]);

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
      {/* Checkbox lives outside <header> so the sheet can be a sibling and
          :checked ~ .mobile-nav-sheet opens without JS or :has(). */}
      <input
        id={MOBILE_NAV_ID}
        type="checkbox"
        className="site-mobile-nav-input"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => setIsOpen(event.target.checked)}
      />
      <header className="site-header fixed top-0 left-0 right-0 z-[60]" role="banner">
        {/* Blur lives on this sibling layer, never on <header>, and never on
            the menu sheet. Inner pages always use the glass bar; Home does
            not until scroll. A fixed sheet inside the header was clipped to
            that 80px bar on every route except transparent Home. */}
        <div
          aria-hidden
          className={cn(
            'header-glass pointer-events-none absolute inset-0 border-b',
            isOpen ? 'header-glass-solid' : glassHeader ? 'header-glass-on' : 'header-glass-off'
          )}
        />
      <nav
        className="relative container-wide section-padding"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="flex h-20 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 group shrink-0"
            aria-label="Forged in the Fire - Home"
            onClick={closeMenu}
          >
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

          <div className="hidden lg:flex items-center gap-0.5">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
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

          <label
            htmlFor={MOBILE_NAV_ID}
            className="mobile-nav-toggle relative z-10 lg:hidden cursor-pointer touch-manipulation p-2 text-[#B8C4CF] hover:text-[#53D6FF] transition-colors [&_svg]:pointer-events-none"
            aria-expanded={isOpen}
            aria-controls="mobile-menu"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            <Menu className="mobile-nav-icon-open h-6 w-6" aria-hidden="true" />
            <X className="mobile-nav-icon-close h-6 w-6" aria-hidden="true" />
          </label>
        </div>
      </nav>
    </header>

      <div
        id="mobile-menu"
        className="mobile-nav-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        aria-hidden={!isOpen}
      >
        <nav className="flex h-full min-h-0 flex-col" aria-label="Mobile navigation">
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2">
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
                  tabIndex={isOpen ? 0 : -1}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="shrink-0 border-t border-[#1A232C] bg-[#05070A] px-5 pt-3 pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))]">
            <div className="flex flex-col gap-2">
              <Button asChild variant="outline" size="lg" className="w-full min-h-11">
                <Link href="/get-help" onClick={closeMenu} tabIndex={isOpen ? 0 : -1}>
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
                className="w-full min-h-11"
                tabIndex={isOpen ? 0 : -1}
              >
                <Mail className="mr-2 h-4 w-4" />
                Subscribe to Updates
              </Button>
              <Button asChild variant="default" size="lg" className="w-full min-h-11">
                <Link href="/donate" onClick={closeMenu} tabIndex={isOpen ? 0 : -1}>
                  Donate Today
                </Link>
              </Button>
            </div>

            <div className="mt-3 rounded-lg border border-[#27313B]/30 bg-[#11161C] px-3 py-2.5">
              <p className="mb-1 text-sm font-medium text-[#B8C4CF]">
                National Human Trafficking Hotline
              </p>
              <a
                href="tel:1-888-373-7888"
                className="text-lg font-bold text-[#8DEBFF] hover:text-[#A9B8C6]"
                tabIndex={isOpen ? 0 : -1}
              >
                1-888-373-7888
              </a>
              <p className="mt-1 text-xs text-[#A9B8C6]">Text &quot;BEFREE&quot; to 233733</p>
            </div>
          </div>
        </nav>
      </div>

    <SubscribeModal isOpen={isSubscribeOpen} onClose={() => setIsSubscribeOpen(false)} />
    </>
  );
}
