/**
 * Local safety recording of the live Program while on air.
 *   audio: Program mix (what viewers hear) → becomes the episode draft audio
 *   video: canvas Program + mix → offered as a local download (too big to upload by default)
 *
 * Chunks are held in memory. At the default 2.5 Mbps video an hour is roughly
 * 1.1 GB of RAM — turn video off on low-memory machines (audio is ~0.5 MB/min).
 */

import { recorderMime } from '@/lib/podcast/capture'

export type LiveRecording = {
  audio: Blob | null
  video: Blob | null
  durationSec: number
  startedAt: number
}

function videoMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const mime of [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
  ]) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return ''
}

function record(stream: MediaStream, mime: string, options: MediaRecorderOptions) {
  const recorder = new MediaRecorder(stream, mime ? { ...options, mimeType: mime } : options)
  const chunks: Blob[] = []
  const done = new Promise<Blob>((resolve) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mime }))
    recorder.onerror = () => resolve(new Blob(chunks, { type: recorder.mimeType || mime }))
  })
  recorder.start(1000)
  return { recorder, done }
}

export class LiveRecorder {
  private audio: ReturnType<typeof record> | null = null
  private video: ReturnType<typeof record> | null = null
  private startedAt = 0

  get active() {
    return Boolean(this.audio || this.video)
  }

  start(programVideo: MediaStream, programAudio: MediaStream, withVideo: boolean) {
    if (this.active) return
    this.startedAt = Date.now()
    const audioTracks = programAudio.getAudioTracks()
    if (audioTracks.length) {
      this.audio = record(new MediaStream(audioTracks), recorderMime(), { audioBitsPerSecond: 128_000 })
    }
    if (withVideo) {
      const tracks = [...programVideo.getVideoTracks(), ...audioTracks]
      if (tracks.length) {
        this.video = record(new MediaStream(tracks), videoMime(), {
          videoBitsPerSecond: 2_500_000,
          audioBitsPerSecond: 128_000,
        })
      }
    }
  }

  async stop(): Promise<LiveRecording> {
    const audio = this.audio
    const video = this.video
    this.audio = null
    this.video = null
    for (const r of [audio, video]) {
      if (r && r.recorder.state !== 'inactive') r.recorder.stop()
    }
    const [a, v] = await Promise.all([audio?.done ?? null, video?.done ?? null])
    return {
      audio: a && a.size ? a : null,
      video: v && v.size ? v : null,
      durationSec: this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0,
      startedAt: this.startedAt,
    }
  }
}

export function extensionFor(blob: Blob) {
  if (blob.type.includes('mp4')) return blob.type.startsWith('audio') ? 'm4a' : 'mp4'
  return 'webm'
}
