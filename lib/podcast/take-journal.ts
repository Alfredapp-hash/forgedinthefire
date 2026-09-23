/**
 * CONTRACT STUB (Sprint 1) — Stream B (audio engine) implements; Stream A (editor) consumes.
 * Crash-safe take journal: audio is persisted in small chunks WHILE recording, so a
 * crash, refresh or tab close never loses more than a few seconds.
 * Keep these exported names/signatures stable.
 */

export type UnfinishedTake = {
  id: string
  episodeId: string
  personId: string
  label: string
  sampleRate: number
  channels: number
  /** Seconds of audio persisted so far. */
  durationSec: number
  /** Session-clock position where the take started (seconds). */
  startSec: number
  startedAt: number
  updatedAt: number
  /** Finished normally (finish() called) vs interrupted. */
  complete: boolean
}

export type TakeJournal = {
  id: string
  /** Append planar PCM frames (one Float32Array per channel). Cheap; batches internally. */
  append(frames: Float32Array[]): void
  /** Flush and mark complete. */
  finish(): Promise<void>
  /** Delete everything for this take. */
  abort(): Promise<void>
}

export async function openTakeJournal(_opts: {
  episodeId: string
  personId: string
  label: string
  sampleRate: number
  channels: number
  startSec: number
}): Promise<TakeJournal> {
  throw new Error('take-journal not implemented yet')
}

/** Interrupted (incomplete) takes for an episode, newest first. */
export async function listUnfinishedTakes(_episodeId: string): Promise<UnfinishedTake[]> {
  return []
}

/** Rebuild an AudioBuffer from persisted chunks. */
export async function recoverTake(_id: string): Promise<AudioBuffer> {
  throw new Error('take-journal not implemented yet')
}

export async function deleteTake(_id: string): Promise<void> {}

/** Ask the browser not to evict studio storage. Returns true if persisted. */
export async function requestPersistentStorage(): Promise<boolean> {
  return false
}
