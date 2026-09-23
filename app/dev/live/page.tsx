import { notFound } from 'next/navigation'
import { LiveHarness } from './LiveHarness'

export const dynamic = 'force-dynamic'

/** Dev-only harness: the live control room with fake episodes and no provider. */
export default function DevLivePage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <LiveHarness />
}
