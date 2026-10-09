import type { Metadata } from 'next'
import { GuestPortal } from '@/components/podcast/guest-portal'
import { denyGuest, loadInviteByToken, sessionPayload } from '@/lib/podcast/guest-access'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Guest booth · Forged in the Fire',
  // The invite token is in this URL: no Referer to anything this page loads or links to.
  referrer: 'no-referrer',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  // Never let a shared link preview expose the booth.
  openGraph: null,
  twitter: null,
  alternates: { canonical: null },
}

export default async function GuestJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const { row, episodeTitle, live } = await loadInviteByToken(token)
    const deny = denyGuest(row, live)
    if (deny || !row) {
      return <GuestPortal token={token} initialError={deny || 'This link is not valid'} />
    }
    return <GuestPortal token={token} initialSession={sessionPayload(row, episodeTitle)} />
  } catch {
    return <GuestPortal token={token} initialError="We could not open this invite right now. Please try again in a minute." />
  }
}
