import { devOnly } from '../dev-only'
import { LiveHarness } from './LiveHarness'

export const dynamic = 'force-dynamic'

/** Dev-only harness: the live control room with fake episodes and no provider. */
export default function DevLivePage() {
  devOnly()
  return <LiveHarness />
}
