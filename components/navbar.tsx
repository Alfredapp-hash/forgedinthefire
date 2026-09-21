'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { SubscribeModal } from '@/src/components/subscribe-modal';
import { NAV_LINKS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Menu, X, Mail } from 'lucide-react';
import Image from 'next/image';

const reducedMotionVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const pathname = usePathname();

  // Hide navbar on admin routes - admin has its own sidebar navigation
  const isAdminRoute = pathname?.startsWith('/admin') || pathname?.startsWith('/login') || pathname?.startsWith('/unauthorized');

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsOpen(false);
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
      if (event.key === 'Escape') setIsOpen(false);
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
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-40 transition-[background-color,backdrop-filter,border-color] duration-300',
          // Transparent over the hero on "/" until scroll; everywhere else a
          // near-invisible pane of blurred obsidian with a faint cyan hairline.
          isOpen || isScrolled || pathname !== '/'
            ? 'bg-[rgba(5,7,10,0.45)] backdrop-blur-[18px] border-b border-[rgba(83,214,255,0.08)]'
            : 'bg-transparent'
        )}
        role="banner"
      >
      <nav
        className="container-wide section-padding"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="flex h-20 items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2.5 group shrink-0"
            aria-label="Forged in the Fire - Home"
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

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden p-2 text-[#B8C4CF] hover:text-[#53D6FF] transition-colors"
            aria-expanded={isOpen}
            aria-controls="mobile-menu"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            {isOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      </nav>

    </header>

      {portalReady
        ? createPortal(
            <AnimatePresence>
              {isOpen ? (
                <motion.div
                  id="mobile-menu"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Site menu"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={reducedMotionVariants}
                  transition={{ duration: 0.18 }}
                  className="fixed inset-x-0 bottom-0 top-20 z-[35] lg:hidden"
                >
                  <div className="absolute inset-0 bg-[#05070A]" />
                  <nav
                    className="relative h-full overflow-y-auto overscroll-contain px-5 pb-28 pt-2"
                    role="navigation"
                    aria-label="Mobile navigation"
                  >
                    <ul className="flex flex-col">
                      {NAV_LINKS.map((link) => (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            className={cn(
                              'flex min-h-12 items-center border-b border-[#1A232C] px-1 text-lg font-medium transition-colors',
                              isActive(link.href)
                                ? 'text-[#53D6FF]'
                                : 'text-[#F6FAFC] hover:text-[#53D6FF]'
                            )}
                            aria-current={isActive(link.href) ? 'page' : undefined}
                            onClick={() => setIsOpen(false)}
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-8 flex flex-col gap-3">
                      <Button asChild variant="outline" size="lg" className="w-full min-h-12">
                        <Link href="/get-help" onClick={() => setIsOpen(false)}>
                          Get Help Now
                        </Link>
                      </Button>
                      <Button
                        onClick={() => {
                          setIsOpen(false);
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
                        <Link href="/donate" onClick={() => setIsOpen(false)}>
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
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body
          )
        : null}
    
    {/* Subscribe Modal */}
    <SubscribeModal isOpen={isSubscribeOpen} onClose={() => setIsSubscribeOpen(false)} />
    </>
  );
}
