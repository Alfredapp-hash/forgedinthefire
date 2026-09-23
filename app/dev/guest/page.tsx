import { notFound } from 'next/navigation'
import { GuestHarness } from './GuestHarness'

export const dynamic = 'force-dynamic'

/**
 * Dev-only harness: the guest booth with a fake token.
 * ?mode=fetch skips initialSession so the portal loads the invite over /api (mock it in Playwright).
 */
export default async function DevGuestPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  const sp = await searchParams
  return <GuestHarness fetchSession={sp.mode === 'fetch'} />
}
