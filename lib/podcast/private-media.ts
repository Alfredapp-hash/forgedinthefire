import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'
import { parseStorageObject } from '@/lib/podcast/safety/audio-hash'
import {
  PRIVATE_MEDIA_BUCKET,
  PUBLIC_MEDIA_BUCKET,
  mediaPlacement,
  parsePrivateMediaRef,
  privateMediaRef,
  type MediaPlacement,
} from '@/lib/podcast/enterprise'

const SIGNED_URL_SECONDS = 4 * 60 * 60

export type PlacementPlan = {
  audioUrl: string | null
  videoUrl: string | null
  /** Public objects to delete only after the episode row saves. */
  deleteAfterSave: { bucket: string; path: string }[]
  /** Private or public copies to delete if the episode row does not save. */
  deleteOnFailure: { bucket: string; path: string }[]
  /** Approval was pinned to the old audio URL; point it at the new ref. */
  rebindApprovalFrom: string | null
  error?: string
}

function extOf(path: string) {
  const base = path.split('/').pop() || 'bin'
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin' : 'bin'
}

async function copyObject(sourceBucket: string, sourcePath: string, destBucket: string, destPath: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Database not configured')
  const res = await fetch(`${url.replace(/\/$/, '')}/storage/v1/object/copy`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      apikey: key,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      bucketId: sourceBucket,
      sourceKey: sourcePath,
      destinationBucket: destBucket,
      destinationKey: destPath,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text.slice(0, 180) || `Storage copy failed (${res.status})`)
  }
}

async function moveOne(episodeId: string, kind: 'audio' | 'video', url: string, placement: MediaPlacement) {
  if (placement === 'keep') return { url, copied: null as null, source: null as null }
  if (placement === 'reject') {
    throw new Error(
      'A private episode cannot keep a public file link. Upload the file in the studio so it can be stored privately.',
    )
  }
  const supabase = createServiceClient()
  if (placement === 'to-private') {
    const source = parseStorageObject(url)
    if (!source || source.bucket !== PUBLIC_MEDIA_BUCKET) {
      throw new Error('A private episode cannot keep a public file link.')
    }
    const destPath = `episodes/${episodeId}/${kind}-${Date.now()}.${extOf(source.path)}`
    await copyObject(source.bucket, source.path, PRIVATE_MEDIA_BUCKET, destPath)
    return {
      url: privateMediaRef(destPath),
      copied: { bucket: PRIVATE_MEDIA_BUCKET, path: destPath },
      source: { bucket: source.bucket, path: source.path },
    }
  }
  const path = parsePrivateMediaRef(url)
  if (!path) throw new Error('Could not read the private file.')
  const destPath = `episodes/${episodeId}/${kind}-${Date.now()}.${extOf(path)}`
  await copyObject(PRIVATE_MEDIA_BUCKET, path, PUBLIC_MEDIA_BUCKET, destPath)
  const { data } = supabase.storage.from(PUBLIC_MEDIA_BUCKET).getPublicUrl(destPath)
  return {
    url: data.publicUrl,
    copied: { bucket: PUBLIC_MEDIA_BUCKET, path: destPath },
    source: { bucket: PRIVATE_MEDIA_BUCKET, path },
  }
}

/**
 * Copy episode files so private episodes never keep a public object URL.
 * Callers delete `deleteAfterSave` only after the row update succeeds, and
 * `deleteOnFailure` when it does not.
 */
export async function planEpisodeMedia(opts: {
  episodeId: string
  visibility: string | null | undefined
  audioUrl: string | null
  videoUrl: string | null
  approvedAudioUrl?: string | null
}): Promise<PlacementPlan> {
  const plan: PlacementPlan = {
    audioUrl: opts.audioUrl,
    videoUrl: opts.videoUrl,
    deleteAfterSave: [],
    deleteOnFailure: [],
    rebindApprovalFrom: null,
  }
  try {
    const audioPlace = mediaPlacement(opts.visibility, opts.audioUrl)
    if (opts.audioUrl && audioPlace !== 'keep') {
      const moved = await moveOne(opts.episodeId, 'audio', opts.audioUrl, audioPlace)
      plan.audioUrl = moved.url
      if (moved.copied) plan.deleteOnFailure.push(moved.copied)
      if (moved.source) plan.deleteAfterSave.push(moved.source)
      if (audioPlace === 'to-private' && opts.approvedAudioUrl && opts.approvedAudioUrl === opts.audioUrl) {
        plan.rebindApprovalFrom = opts.audioUrl
      }
    }
    const videoPlace = mediaPlacement(opts.visibility, opts.videoUrl)
    if (opts.videoUrl && videoPlace !== 'keep') {
      const moved = await moveOne(opts.episodeId, 'video', opts.videoUrl, videoPlace)
      plan.videoUrl = moved.url
      if (moved.copied) plan.deleteOnFailure.push(moved.copied)
      if (moved.source) plan.deleteAfterSave.push(moved.source)
    }
  } catch (err) {
    plan.error = err instanceof Error ? err.message : 'Could not move the episode file'
  }
  return plan
}

export async function removeStoredObjects(objects: { bucket: string; path: string }[]) {
  if (!objects.length) return
  const supabase = createServiceClient()
  const byBucket = new Map<string, string[]>()
  for (const obj of objects) {
    const list = byBucket.get(obj.bucket) || []
    list.push(obj.path)
    byBucket.set(obj.bucket, list)
  }
  for (const [bucket, paths] of byBucket) {
    const { error } = await supabase.storage.from(bucket).remove(paths)
    if (error) console.error('[podcast-private] remove failed', bucket, error.message)
  }
}

/** Short-lived URL for a private:// ref. Null when the ref is not ours. */
export async function signedPrivateUrl(url: string | null | undefined) {
  const path = parsePrivateMediaRef(url)
  if (!path) return null
  const supabase = createServiceClient()
  const { data, error } = await supabase.storage.from(PRIVATE_MEDIA_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
