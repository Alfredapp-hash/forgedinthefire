import { GuestPortal } from '@/components/podcast/guest-portal'
import { denyGuest, loadInviteByToken, sessionPayload } from '@/lib/podcast/guest-access'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Guest booth · Forged in the Fire',
  robots: { index: false, follow: false },
}

export default async function GuestJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const { row, episodeTitle, live } = await loadInviteByToken(token)
    const deny = denyGuest(row, live)
    if (deny || !row) {
      return <GuestPortal token={token} initialError={deny || 'Invite not found'} />
    }
    return <GuestPortal token={token} initialSession={sessionPayload(row, episodeTitle)} />
  } catch {
    return <GuestPortal token={token} initialError="Could not open this invite" />
  }
}
