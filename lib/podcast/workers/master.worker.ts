/**
 * Off-main-thread master render: mix plan → gain/fades → loudness match → true-peak limiter.
 * Input plan channels arrive as (transferred) Float32Arrays; the stereo result is
 * transferred back, so nothing is copied on the way out.
 */
import { renderMixPlan, type MixPlan } from '../engine/mix-core'
import { processMaster, type MasterCoreOptions } from '../engine/master-core'

export type MasterWorkerRequest = { id: number; plan: MixPlan; opts: MasterCoreOptions }
export type MasterWorkerResponse =
  | { id: number; ok: true; left: Float32Array; right: Float32Array; lufs: number; truePeakDb: number }
  | { id: number; ok: false; error: string }

type WorkerScope = {
  onmessage: ((event: MessageEvent<MasterWorkerRequest>) => void) | null
  postMessage: (message: MasterWorkerResponse, transfer?: Transferable[]) => void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event) => {
  const { id, plan, opts } = event.data
  try {
    const { left, right } = renderMixPlan(plan)
    const { lufs, truePeakDb } = processMaster([left, right], plan.sampleRate, opts)
    scope.postMessage({ id, ok: true, left, right, lufs, truePeakDb }, [left.buffer, right.buffer])
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
