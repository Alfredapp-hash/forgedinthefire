'use client'

import { LiveControlRoom } from '@/components/podcast/live-control-room'

const EPISODES = [
  { id: 'ep-e2e-1', title: 'E2E Episode One' },
  { id: 'ep-e2e-2', title: 'E2E Episode Two' },
]

export function LiveHarness() {
  return (
    <main className="mx-auto max-w-7xl p-4" data-testid="dev-live">
      <LiveControlRoom episodes={EPISODES} />
    </main>
  )
}
