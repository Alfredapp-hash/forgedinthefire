import { notFound } from 'next/navigation'

/**
 * Every /dev/* harness page calls this first. In a production build the route is a hard 404
 * (Next's not-found boundary); in dev it is a no-op. e2e/prod-guard.spec.ts covers both the
 * function and that each page.tsx under app/dev calls it.
 */
export function devOnly() {
  if (process.env.NODE_ENV === 'production') notFound()
}
