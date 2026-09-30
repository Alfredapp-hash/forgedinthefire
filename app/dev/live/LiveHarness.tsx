'use client'

import { useEffect, useState, type ComponentType } from 'react'

const EPISODES = [
  { id: 'ep-e2e-1', title: 'E2E Episode One' },
  { id: 'ep-e2e-2', title: 'E2E Episode Two' },
]

type LiveControlRoomProps = { episodes: { id: string; title: string }[] }
type LiveModule = { LiveControlRoom?: ComponentType<LiveControlRoomProps> }

/**
 * The live stream is porting `components/podcast/live-control-room.tsx` into this branch.
 * Until it lands the module does not exist, so the import must stay opaque to both tsc and
 * webpack's static analysis: a template literal built from a function call keeps it a
 * context import that resolves at runtime and simply rejects while the file is absent.
 */
const liveModuleName = () => 'live-control-room'

async function loadLiveControlRoom(): Promise<ComponentType<LiveControlRoomProps> | null> {
  try {
    const mod = (await import(`@/components/podcast/${liveModuleName()}`)) as LiveModule
    return mod.LiveControlRoom ?? null
  } catch {
    return null
  }
}

export function LiveHarness() {
  const [state, setState] = useState<'loading' | 'missing' | 'ready'>('loading')
  const [Room, setRoom] = useState<ComponentType<LiveControlRoomProps> | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadLiveControlRoom().then((cmp) => {
      if (cancelled) return
      setRoom(() => cmp)
      setState(cmp ? 'ready' : 'missing')
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="mx-auto max-w-7xl p-4 text-white" data-testid="dev-live" data-state={state}>
      {state === 'loading' && <p className="studio-type-body text-silver">Loading live control room…</p>}
      {state === 'missing' && (
        <section role="status" className="rounded-panel border border-divider bg-surface p-6">
          <p className="studio-type-label text-ice">Live control room</p>
          <h1 className="mt-1 text-xl font-medium">Not on this branch yet</h1>
          <p className="studio-type-body mt-2 text-silver-body">
            <code>components/podcast/live-control-room.tsx</code> has not been ported. This harness
            will render it automatically once it exists; the live e2e specs stay <code>fixme</code>{' '}
            until then.
          </p>
        </section>
      )}
      {state === 'ready' && Room && <Room episodes={EPISODES} />}
    </main>
  )
}
