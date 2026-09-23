'use client'

import { GuestPortal } from '@/components/podcast/guest-portal'
import type { GuestInvitePublic } from '@/lib/podcast/guest-types'

// Same shape as a real invite token (48 hex chars) so shape checks behave as in production.
const E2E_GUEST_TOKEN = '0123456789abcdef0123456789abcdef0123456789abcdef'

const FAKE_SESSION: GuestInvitePublic = {
  id: 'invite-e2e',
  episodeTitle: 'E2E Harness Episode',
  label: 'e2e',
  guestName: null,
  expiresAt: '2099-01-01T00:00:00.000Z',
  state: 'pending',
  recording: false,
  takeReady: false,
  takeUrl: null,
  cameraReady: false,
  cameraUrl: null,
}

export function GuestHarness({ fetchSession }: { fetchSession: boolean }) {
  return (
    <div data-testid="dev-guest">
      <GuestPortal token={E2E_GUEST_TOKEN} initialSession={fetchSession ? null : FAKE_SESSION} />
    </div>
  )
}
