'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Radio, Volume2 } from 'lucide-react'
import type Hls from 'hls.js'
import { fetchPublicLive } from '@/lib/podcast/live/client'
import { playWhep, type WhepSession } from '@/lib/podcast/live/whep-client'
import {
  LIVE_HEARTBEAT_STALE_MS,
  type LivePublicPayload,
  type LiveSessionPublic,
} from '@/lib/podcast/live/types'

type Props = { initial?: LivePublicPayload | null }

type PlayState = 'idle' | 'loading' | 'playing' | 'waiting' | 'error'

function formatStart(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function countdown(ms: number) {
  if (ms <= 0) return null
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':')
}

export function LivePlayer({ initial = null }: Props) {
  const [data, setData] = useState<LivePublicPayload | null>(initial)
  const [skew, setSkew] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    try {
      const next = await fetchPublicLive()
      setData(next)
      setSkew(new Date(next.now).getTime() - Date.now())
    } catch {
      /* keep last known state */
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 15_000)
    return () => window.clearInterval(id)
  }, [refresh])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const live = data?.live || null
  const next = data?.next || null

  if (live) return <LiveStage session={live} serverNow={now + skew} />

  return (
    <div className="rounded-2xl border border-[#27313B] bg-[#11161C] p-8 md:p-12 text-center space-y-4">
      {next?.scheduled_for ? (
        <>
          <p className="text-xs uppercase tracking-[0.22em] text-[#8DEBFF]">Next live show</p>
          <h2 className="font-serif text-3xl text-[#F6FAFC]">{next.title}</h2>
          {next.description && <p className="text-[#B8C4CF] max-w-xl mx-auto">{next.description}</p>}
          <p className="text-[#B8C4CF]">Starting at {formatStart(next.scheduled_for)}</p>
          <p className="font-mono text-4xl text-[#53D6FF]" aria-live="polite">
            {countdown(new Date(next.scheduled_for).getTime() - (now + skew)) || 'Starting any moment'}
          </p>
          <p className="text-xs text-[#7C8B97]">This page updates on its own when the show begins.</p>
        </>
      ) : (
        <>
          <p className="text-xs uppercase tracking-[0.22em] text-[#8DEBFF]">Live</p>
          <h2 className="font-serif text-3xl text-[#F6FAFC]">No live show right now</h2>
          <p className="text-[#B8C4CF]">
            Catch up on recorded conversations while you wait.
          </p>
        </>
      )}
      <Link
        href="/podcast"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#27313B] text-sm text-[#8DEBFF] hover:border-[#53D6FF]"
      >
        Browse episodes
      </Link>
    </div>
  )
}

function LiveStage({ session, serverNow }: { session: LiveSessionPublic; serverNow: number }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [state, setState] = useState<PlayState>('idle')
  const [muted, setMuted] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const hls = session.playback_hls_url
  const whep = session.playback_whep_url
  const stale =
    session.last_heartbeat_at != null &&
    serverNow - new Date(session.last_heartbeat_at).getTime() > LIVE_HEARTBEAT_STALE_MS

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    let hlsInstance: Hls | null = null
    let whepSession: WhepSession | null = null
    let retry: number | null = null

    const startHls = async (src: string) => {
      setState('loading')
      const { default: HlsCtor } = await import('hls.js')
      if (cancelled) return
      if (HlsCtor.isSupported()) {
        const instance = new HlsCtor({ lowLatencyMode: true, liveSyncDurationCount: 3, backBufferLength: 30 })
        hlsInstance = instance
        instance.on(HlsCtor.Events.MANIFEST_PARSED, () => {
          setState('playing')
          void video.play().catch(() => {})
        })
        instance.on(HlsCtor.Events.ERROR, (_evt, err) => {
          if (!err.fatal) return
          if (err.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
            instance.recoverMediaError()
            return
          }
          // Manifest 404s are normal for a few seconds after the host goes live.
          setState('waiting')
          instance.destroy()
          hlsInstance = null
          retry = window.setTimeout(() => void startHls(src), 5000)
        })
        instance.loadSource(src)
        instance.attachMedia(video)
        return
      }
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari / iOS native HLS.
        video.src = src
        video.onloadedmetadata = () => {
          setState('playing')
          void video.play().catch(() => {})
        }
        video.onerror = () => {
          setState('waiting')
          retry = window.setTimeout(() => {
            video.removeAttribute('src')
            video.load()
            void startHls(src)
          }, 5000)
        }
        return
      }
      setState('error')
      setMessage('This browser cannot play the live stream.')
    }

    const startWhep = async (src: string) => {
      setState('loading')
      try {
        whepSession = await playWhep(src, (s) => {
          if (s === 'failed' || s === 'disconnected') {
            setState('waiting')
            void whepSession?.close()
            whepSession = null
            if (!cancelled) retry = window.setTimeout(() => void startWhep(src), 4000)
          }
        })
        if (cancelled) {
          void whepSession.close()
          return
        }
        video.srcObject = whepSession.stream
        setState('playing')
        void video.play().catch(() => {})
      } catch {
        if (cancelled) return
        setState('waiting')
        retry = window.setTimeout(() => void startWhep(src), 5000)
      }
    }

    setMessage(null)
    if (hls) void startHls(hls)
    else if (whep) void startWhep(whep)
    else {
      setState('error')
      setMessage('The show is live, but playback is still being set up. Please check back shortly.')
    }

    return () => {
      cancelled = true
      if (retry != null) window.clearTimeout(retry)
      hlsInstance?.destroy()
      void whepSession?.close()
      video.pause()
      video.removeAttribute('src')
      video.srcObject = null
    }
  }, [hls, whep])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-[#FF3B5C] px-3 py-1 text-xs font-bold uppercase tracking-widest text-white">
          <Radio className="w-3.5 h-3.5" aria-hidden />
          Live now
        </span>
        <h2 className="font-serif text-2xl text-[#F6FAFC]">{session.title}</h2>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-[#27313B] bg-black aspect-video">
        <video
          ref={videoRef}
          className="h-full w-full"
          playsInline
          autoPlay
          muted={muted}
          controls={state === 'playing'}
          aria-label={`Live video: ${session.title}`}
        />
        {state !== 'playing' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="text-sm text-[#B8C4CF]">
              {message ||
                (state === 'waiting' || stale
                  ? 'Connecting to the live show… this can take a few seconds.'
                  : 'Loading the live show…')}
            </p>
          </div>
        )}
        {state === 'playing' && muted && (
          <button
            type="button"
            onClick={() => {
              setMuted(false)
              if (videoRef.current) {
                videoRef.current.muted = false
                void videoRef.current.play().catch(() => {})
              }
            }}
            className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-lg bg-black/70 px-3 py-2 text-sm text-white"
          >
            <Volume2 className="w-4 h-4" aria-hidden />
            Tap for sound
          </button>
        )}
      </div>
      {session.description && <p className="text-[#B8C4CF] leading-relaxed">{session.description}</p>}
      {stale && (
        <p className="text-xs text-[#FFB86B]">
          The broadcast may be reconnecting. Keep this page open; it will pick back up on its own.
        </p>
      )}
    </div>
  )
}
