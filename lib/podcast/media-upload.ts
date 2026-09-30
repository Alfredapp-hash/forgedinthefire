export type UploadedAsset = {
  url: string
  mime_type?: string
  size_bytes?: number
}

/** Upload audio/cover to site media. Large audio uses a signed PUT to skip the function body limit. */
export async function uploadPodcastMedia(file: File, alt: string): Promise<UploadedAsset> {
  const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|webm)$/i.test(file.name)
  const useSigned = isAudio && file.size > 4.5 * 1024 * 1024

  if (useSigned) {
    const signRes = await fetch('/api/admin/media/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        mime_type: file.type || 'audio/mpeg',
        size_bytes: file.size,
      }),
    })
    const signed = await signRes.json()
    if (!signRes.ok) throw new Error(signed.error || 'Could not start upload')
    const put = await fetch(signed.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'audio/mpeg' },
      body: file,
    })
    if (!put.ok) throw new Error('Direct storage upload failed')
    const completeRes = await fetch('/api/admin/media/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: signed.path,
        filename: file.name,
        mime_type: file.type || 'audio/mpeg',
        size_bytes: file.size,
        alt,
        publicUrl: signed.publicUrl,
      }),
    })
    const asset = await completeRes.json()
    if (!completeRes.ok) throw new Error(asset.error || 'Upload finalize failed')
    return asset as UploadedAsset
  }

  const fd = new FormData()
  fd.append('file', file)
  fd.append('alt', alt)
  const res = await fetch('/api/admin/media', { method: 'POST', body: fd })
  const asset = await res.json()
  if (!res.ok) throw new Error(asset.error || 'Upload failed')
  return asset as UploadedAsset
}

export type SignedTusTarget = {
  /** Supabase Storage TUS endpoint (…/storage/v1/upload/resumable). */
  endpoint: string
  bucket: string
  apikey?: string | null
  chunkSize?: number
  /** Object path inside the bucket. */
  path: string
  /** Token from createSignedUploadUrl — sent as x-signature; scoped to this one path. */
  token: string
  /** Same authorization as a plain PUT URL (fallback when TUS is refused). */
  signedUrl?: string
}

/** Everything the booth needs to reach the TUS endpoint; the per-object part comes from the sign call. */
export type TusConfig = Omit<SignedTusTarget, 'path' | 'token' | 'signedUrl'>

export class UploadHttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function tusStatus(err: unknown) {
  return (err as { originalResponse?: { getStatus(): number } | null } | null)?.originalResponse?.getStatus() || 0
}

/**
 * Resumable upload of one object to a private bucket with a per-object signed
 * token (no service key, no user session). tus retries with backoff on its own
 * and resumes a half-sent object (also after reload, via the fingerprint).
 * If the TUS endpoint refuses the signature (older Storage), falls back to a
 * single PUT to the signed URL.
 */
export async function tusUploadSigned(
  body: Blob,
  target: SignedTusTarget,
  opts: {
    contentType: string
    onProgress?: (sent: number, total: number) => void
    signal?: AbortSignal
    retryDelays?: number[]
    /** Stable id so a reload resumes this exact object. Defaults to bucket+path+size. */
    fingerprint?: string
  },
): Promise<void> {
  const tus = await import('tus-js-client')
  const { SafeTusUrlStorage } = await import('@/lib/podcast/upload/guest-backup-store')
  const { TUS_RETRY_DELAYS, isRetryableStatus } = await import('@/lib/podcast/guest/backoff')
  const fingerprint = opts.fingerprint || `fitf:${target.bucket}/${target.path}:${body.size}`
  const headers: Record<string, string> = { 'x-signature': target.token, 'x-upsert': 'true' }
  if (target.apikey) headers.apikey = target.apikey

  const viaTus = () =>
    new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(body, {
        endpoint: target.endpoint,
        headers,
        chunkSize: target.chunkSize || 6 * 1024 * 1024,
        retryDelays: opts.retryDelays || TUS_RETRY_DELAYS,
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        storeFingerprintForResuming: true,
        urlStorage: new SafeTusUrlStorage(),
        fingerprint: async () => fingerprint,
        metadata: {
          bucketName: target.bucket,
          objectName: target.path,
          contentType: opts.contentType,
          cacheControl: '3600',
        },
        // 4xx other than timeout/conflict/lock/rate-limit will not get better by retrying.
        onShouldRetry: (err) => isRetryableStatus(tusStatus(err)),
        onProgress: (sent, total) => opts.onProgress?.(sent, total),
        onError: (err) => reject(new UploadHttpError(err.message || 'Upload failed', tusStatus(err))),
        onSuccess: () => resolve(),
      })
      opts.signal?.addEventListener('abort', () => {
        void upload.abort(false)
        reject(new UploadHttpError('Upload cancelled', 0))
      })
      void upload
        .findPreviousUploads()
        .then((previous) => {
          if (previous.length) upload.resumeFromPreviousUpload(previous[0])
          upload.start()
        })
        .catch(() => upload.start())
    })

  try {
    await viaTus()
  } catch (err) {
    const status = err instanceof UploadHttpError ? err.status : 0
    const tusRefused = status === 400 || status === 401 || status === 403 || status === 404 || status === 405
    if (!tusRefused || !target.signedUrl || opts.signal?.aborted) throw err
    const put = await fetch(target.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': opts.contentType, 'x-upsert': 'true' },
      body,
      referrerPolicy: 'no-referrer',
      signal: opts.signal,
    })
    if (!put.ok) throw new UploadHttpError('Direct storage upload failed', put.status)
    opts.onProgress?.(body.size, body.size)
  }
}

/**
 * Measure audio duration in seconds. Handles the common WebM/MediaRecorder case
 * where `audio.duration` is `Infinity` until you seek to the end, and guards
 * against NaN and a hung metadata load so the RSS enclosure duration is reliable.
 */
export function measureAudioDuration(url: string) {
  return new Promise<number | null>((resolve) => {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    let settled = false
    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      audio.onloadedmetadata = null
      audio.ontimeupdate = null
      audio.onerror = null
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), 15000)

    const valid = (d: number) => Number.isFinite(d) && d > 0 ? Math.round(d) : null

    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        finish(valid(audio.duration))
        return
      }
      // Infinite/unknown (streamed WebM): force the browser to compute it.
      audio.ontimeupdate = () => {
        audio.ontimeupdate = null
        audio.currentTime = 0
        finish(valid(audio.duration))
      }
      audio.currentTime = Number.MAX_SAFE_INTEGER
    }
    audio.onerror = () => finish(null)
    audio.src = url
  })
}
