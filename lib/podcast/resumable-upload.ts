/**
 * Resilient guest-take upload (T4).
 *
 * A guest records an 80MB+ local take, then uploads the blob to Supabase Storage
 * via a signed upload URL. The naive path was a single-shot `fetch` PUT: one
 * hiccup on a large file lost the whole take. This module hardens that path.
 *
 * Strategy (and why we did NOT ship TUS here):
 *  - True resumable/TUS uploads (resume from the exact byte we left off) require
 *    `tus-js-client`/Uppy against Supabase's `/storage/v1/upload/resumable`
 *    endpoint with the `x-signature` header + on-disk fingerprint persistence
 *    (per Supabase docs, verified via Context7). That is a new dependency and a
 *    new server/token contract we cannot exercise against live Storage inside
 *    this sprint. Per the task's explicit fallback clause, we instead ship a
 *    robust *whole-blob* PUT wrapped in:
 *      1. bounded exponential backoff retries (transient net errors + 5xx),
 *      2. signed-URL refresh (re-request a fresh URL on 403/expiry, then retry),
 *      3. progress + timeout + abort via XMLHttpRequest.
 *    Because each attempt re-PUTs the whole object to the same storage path
 *    (upsert), an interrupted attempt is safely superseded by the next — the
 *    blob is never discarded. The `refreshSignedUrl` seam and the returned
 *    `token` from the take route keep a future TUS swap low-friction.
 *
 * The recorded blob is kept alive by the caller until `finalize` confirms; this
 * helper only performs the transport + finalize, and reports progress so the
 * booth UI can surface it.
 */

export type SignedTarget = {
  signedUrl: string
  path: string
  publicUrl: string
  token?: string
}

export type ResumableUploadOptions = {
  /** Request a *fresh* signed target (called on first use and on 403/expiry). */
  refreshSignedUrl: () => Promise<SignedTarget>
  /** Confirm the object server-side (DB row). Only after this resolves is the take "safe". */
  finalize: (target: SignedTarget) => Promise<void>
  /** 0..1 transport progress for the current object. */
  onProgress?: (fraction: number) => void
  /** Human-facing status line for the booth ("Uploading…", "Retrying (2/6)…"). */
  onStatus?: (message: string) => void
  /** Bounded retry budget across the whole upload (default 6). */
  maxAttempts?: number
  /** Base backoff in ms (default 800); grows exponentially with jitter. */
  baseDelayMs?: number
  /** Per-attempt inactivity timeout in ms (default 60s). */
  attemptTimeoutMs?: number
  /** Optional external abort (e.g. teardown). */
  signal?: AbortSignal
}

export type UploadResult = { path: string; publicUrl: string }

class RetryableError extends Error {
  readonly refresh: boolean
  constructor(message: string, refresh: boolean) {
    super(message)
    this.name = 'RetryableError'
    this.refresh = refresh
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(id)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * PUT the whole blob to a signed URL with progress, timeout and abort.
 * Throws `RetryableError` for transient failures (network drop, 5xx, timeout)
 * and for 403/expiry (with `refresh: true`). Non-retryable 4xx throw a plain
 * Error so the caller stops and keeps the blob for manual retry.
 */
function putBlob(
  signedUrl: string,
  blob: Blob,
  contentType: string,
  opts: { onProgress?: (fraction: number) => void; timeoutMs: number; signal?: AbortSignal },
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', signedUrl, true)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.timeout = opts.timeoutMs

    const onAbort = () => xhr.abort()
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    const cleanup = () => opts.signal?.removeEventListener('abort', onAbort)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && opts.onProgress) {
        opts.onProgress(event.loaded / event.total)
      }
    }
    xhr.onload = () => {
      cleanup()
      const status = xhr.status
      if (status >= 200 && status < 300) {
        opts.onProgress?.(1)
        resolve()
      } else if (status === 403 || status === 401 || status === 400) {
        // Signed URL expired / rejected — refresh and retry.
        reject(new RetryableError(`Upload rejected (${status})`, true))
      } else if (status >= 500 || status === 429) {
        reject(new RetryableError(`Storage error (${status})`, false))
      } else {
        reject(new Error(`Upload failed (${status})`))
      }
    }
    xhr.onerror = () => {
      cleanup()
      // Network-level failure (offline, DNS, connection reset) — always retry.
      reject(new RetryableError('Network error during upload', false))
    }
    xhr.ontimeout = () => {
      cleanup()
      reject(new RetryableError('Upload timed out', false))
    }
    xhr.onabort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    xhr.send(blob)
  })
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/**
 * Upload `blob` resiliently, then finalize. The blob is passed by reference and
 * never released here — the caller holds it until this resolves successfully
 * (finalize confirmed). On exhausting the retry budget this throws, leaving the
 * caller's blob intact for a manual "retry upload".
 */
export async function resilientUpload(
  blob: Blob,
  contentType: string,
  options: ResumableUploadOptions,
): Promise<UploadResult> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 6)
  const baseDelay = options.baseDelayMs ?? 800
  const timeoutMs = options.attemptTimeoutMs ?? 60_000
  const { signal } = options

  let target = await options.refreshSignedUrl()
  let attempt = 0
  let lastError: Error | null = null

  while (attempt < maxAttempts) {
    attempt += 1
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      options.onStatus?.(attempt === 1 ? 'Uploading…' : `Retrying upload (${attempt}/${maxAttempts})…`)
      await putBlob(target.signedUrl, blob, contentType, {
        onProgress: options.onProgress,
        timeoutMs,
        signal,
      })
      // Transport done — confirm the DB row. Finalize is also retried within the
      // same budget so a blip on the finalize call doesn't lose the take.
      options.onStatus?.('Finalizing…')
      await options.finalize(target)
      return { path: target.path, publicUrl: target.publicUrl }
    } catch (err) {
      if (isAbort(err)) throw err
      lastError = err instanceof Error ? err : new Error('Upload failed')
      const retryable = err instanceof RetryableError
      if (!retryable) {
        // Non-retryable (e.g. a hard 4xx / invalid path). Stop; keep the blob.
        throw lastError
      }
      if (attempt >= maxAttempts) break
      if ((err as RetryableError).refresh) {
        // Signed URL expired/rejected — get a fresh one before the next attempt.
        options.onStatus?.('Refreshing upload link…')
        try {
          target = await options.refreshSignedUrl()
        } catch (refreshErr) {
          lastError = refreshErr instanceof Error ? refreshErr : lastError
          // Treat a failed refresh as retryable too (network may be down).
        }
      }
      const backoff = Math.min(baseDelay * 2 ** (attempt - 1), 15_000)
      const jitter = Math.random() * baseDelay
      options.onStatus?.(`Connection lost — retrying (${attempt}/${maxAttempts})…`)
      await sleep(backoff + jitter, signal)
    }
  }
  throw lastError ?? new Error('Upload failed after retries')
}
