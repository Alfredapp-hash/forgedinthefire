'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { SubscribeModal } from '@/src/components/subscribe-modal';
import { NAV_LINKS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Menu, X, ChevronDown, Mail } from 'lucide-react';
import Image from 'next/image';

const reducedMotionVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const defaultVariants = {
  hidden: { opacity: 0, y: -10 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const pathname = usePathname();

  // Hide navbar on admin routes - admin has its own sidebar navigation
  const isAdminRoute = pathname?.startsWith('/admin') || pathname?.startsWith('/login') || pathname?.startsWith('/unauthorized');
  if (isAdminRoute) return null;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-40 transition-all duration-300',
          isScrolled
            ? 'bg-[#181210]/95 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.4)] border-b border-[#3A2A24]'
            : 'bg-[#181210]/80 backdrop-blur-sm'
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
            <div className="relative w-9 h-[52px] flex items-center justify-center">
              <Image
                src="/forged-logo.png"
                alt="Forged in the Fire"
                fill
                className="object-contain transition-all duration-500 ease-out group-hover:scale-105"
                priority
                sizes="36px"
              />
            </div>
            <span className="font-serif text-lg font-semibold text-[#F6F0E8] hidden sm:block whitespace-nowrap tracking-tight">
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
                  'relative px-3 py-2 text-[13px] font-medium transition-colors duration-200 rounded-md tracking-wide',
                  isActive(link.href)
                    ? 'text-[#4C9AA3]'
                    : 'text-[#CDBDAF] hover:text-[#4C9AA3]',
                  'priority' in link && link.priority && 'text-[#4C9AA3] font-semibold'
                )}
                aria-current={isActive(link.href) ? 'page' : undefined}
              >
                {link.label}
                {isActive(link.href) && (
                  <motion.span
                    layoutId="activeNav"
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#4C9AA3] rounded-full"
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
            className="lg:hidden p-2 text-[#CDBDAF] hover:text-[#4C9AA3] transition-colors"
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

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="mobile-menu"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={defaultVariants}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 top-20 z-30 lg:hidden"
          >
            <div
              className="absolute inset-0 bg-[#181210]/98 backdrop-blur-lg"
              onClick={() => setIsOpen(false)}
            />
            <nav
              className="relative h-full overflow-y-auto px-4 py-8"
              role="navigation"
              aria-label="Mobile navigation"
            >
              <div className="flex flex-col gap-2">
                {NAV_LINKS.map((link, index) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Link
                      href={link.href}
                      className={cn(
                        'block px-4 py-4 text-lg font-medium rounded-lg transition-colors',
                        isActive(link.href)
                          ? 'bg-[#1E6B73]/20 text-[#4C9AA3]'
                          : 'text-[#CDBDAF] hover:bg-[#1E6B73]/10 hover:text-[#4C9AA3]'
                      )}
                      aria-current={isActive(link.href) ? 'page' : undefined}
                      onClick={() => setIsOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </motion.div>
                ))}
              </div>

              {/* Mobile CTA Section */}
              <div className="mt-8 pt-8 border-t border-[#3A2A24]">
                <div className="flex flex-col gap-3">
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
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
                    className="w-full"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Subscribe to Updates
                  </Button>
                  <Button
                    asChild
                    variant="default"
                    size="lg"
                    className="w-full"
                  >
                    <Link href="/donate" onClick={() => setIsOpen(false)}>
                      Donate Today
                    </Link>
                  </Button>
                </div>

                {/* Emergency Info */}
                <div className="mt-6 p-4 bg-[#3A2A24] rounded-lg border border-[#8B5E3C]/30">
                  <p className="text-sm text-[#CDBDAF] font-medium mb-2">
                    National Human Trafficking Hotline
                  </p>
                  <a
                    href="tel:1-888-373-7888"
                    className="text-lg font-bold text-[#C8A46B] hover:text-[#8B5E3C]"
                  >
                    1-888-373-7888
                  </a>
                  <p className="text-xs text-[#B8A89A] mt-1">
                    Text &quot;BEFREE&quot; to 233733
                  </p>
                </div>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
    
    {/* Subscribe Modal */}
    <SubscribeModal isOpen={isSubscribeOpen} onClose={() => setIsSubscribeOpen(false)} />
    </>
  );
}
