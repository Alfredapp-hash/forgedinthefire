import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format phone number for display
 */
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

/**
 * Format currency for donations
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * Generate SEO-friendly slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

/**
 * Debounce function for performance
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Check if code is running on server
 */
export const isServer = typeof window === 'undefined';

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (isServer) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Smooth scroll to element
 */
export function scrollToElement(elementId: string, offset = 80) {
  const element = document.getElementById(elementId);
  if (element) {
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
}

/**
 * Quick exit functionality - clears history and redirects
 */
export function quickEscape(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // Storage can be unavailable in private mode; leaving is still the priority.
  }

  // Overwrite the visible URL first so the address bar never shows this site
  // during the hand-off.
  try {
    window.history.replaceState({}, '', '/');
  } catch {
    // Non-fatal.
  }

  // location.replace (not .href) drops the current page from the session
  // history, so Back does not return here. A history.go() rewind must NOT be
  // used alongside this — it races the navigation and can strand the user on
  // the site, which defeats the safety feature entirely.
  window.location.replace('https://weather.com');
}

/**
 * Generate unique ID for accessibility
 */
export function generateId(prefix = 'fitf'): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Get initials from name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options,
  };
  return new Intl.DateTimeFormat('en-US', defaultOptions).format(d);
}

/**
 * Read time estimation
 */
export function estimateReadTime(content: string): number {
  const wordsPerMinute = 200;
  const words = content.trim().split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}

/**
 * Meta tag generation helpers
 */
export function generateMetaTags(options: {
  title: string;
  description: string;
  image?: string;
  url?: string;
  type?: string;
}) {
  const { title, description, image, url, type = 'website' } = options;
  
  return {
    title: `${title} | Forged in the Fire`,
    description,
    openGraph: {
      title: `${title} | Forged in the Fire`,
      description,
      type,
      url,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Forged in the Fire`,
      description,
      images: image ? [image] : undefined,
    },
  };
}
