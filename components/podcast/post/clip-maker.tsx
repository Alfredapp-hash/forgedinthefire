'use client'

/**
 * Share clips / audiograms — the "Share clips" block at the end of the Publish area.
 * Pick 15–90 s (drag on the waveform, type times, or tap a sentence), choose a shape + style,
 * preview, render in the browser (Worker + WebCodecs, MP4 or WebM), download, and save to the
 * episode so the public page can show it. Protected names never reach a clip: anything bleeped
 * or still awaiting a decision is tone-bleeped in the clip audio and captioned "[removed]".
 *
 * Chrome is the studio-ui kit (Panel / Button / SegmentedControl / Input / Slider / Chip); the
 * clip pipeline itself lives in lib/podcast/clips.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Film, Play, Save, Square, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, Chip, Input, Panel, SegmentedControl, Slider } from '@/components/studio-ui'
import { decodeUrl } from '@/lib/podcast/audio'
import { buildClipCaptions, loadCover, paintPreview, renderClip, sliceClipAudio } from '@/lib/podcast/clips/render'
import { clampClipRange, redactionsInClip, transcriptSentences, validateClipRange } from '@/lib/podcast/clips/captions'
import { deleteEpisodeClip, listEpisodeClips, saveEpisodeClip } from '@/lib/podcast/clips/client'
import { clipLayout } from '@/lib/podcast/clips/layout'
import {
  CLIP_ASPECT_LABEL,
  CLIP_ASPECTS,
  CLIP_MAX_SEC,
  CLIP_MIN_SEC,
  type ClipAspect,
  type ClipProgress,
  type ClipRange,
  type ClipRenderResult,
  type ClipSpec,
  type ClipStyle,
  type EpisodeClip,
  type RedactedRange,
} from '@/lib/podcast/clips/types'
import { computePeaks, overviewPeaks, type Peaks } from '@/lib/podcast/clips/waveform'
import { loadSafetyRecord } from '@/lib/podcast/safety/client'
import { findProtectedHits } from '@/lib/podcast/safety/protected-words'
import type { SafetyRecord } from '@/lib/podcast/safety/record'
import { BLEEP_PAD_S } from '@/lib/podcast/safety/render'
import type { EpisodeSafetyFields } from '@/lib/studio/release'
import { cleanWords, type TranscriptWord } from '@/lib/studio/transcript'
import type { PodcastEpisode } from '@/lib/studio/types'

export type ClipSafety = { available: boolean; record: SafetyRecord | null }

type Props = {
  episode: PodcastEpisode & EpisodeSafetyFields
  showTitle: string
  coverUrl: string
  /**
   * The Clean-up & safety plan (protected terms + decisions). Pass it when the editor already
   * holds it; leave undefined and the block loads it itself. `null` = still loading.
   */
  safety?: ClipSafety | null
  disabled?: boolean
}

type Rendered = ClipRenderResult & { videoUrl: string; posterUrl: string; range: ClipRange; aspect: ClipAspect }

const STYLE_OPTIONS: { value: ClipStyle; label: string }[] = [
  { value: 'waveform', label: 'Scrolling waveform' },
  { value: 'bars', label: 'Bouncing bars' },
]
const ASPECT_OPTIONS = CLIP_ASPECTS.map((a) => ({ value: a, label: a }))

/** Every stretch a name may be heard: accepted and still-undecided hits (padded), plus manual bleeps. */
function redactionsFor(words: TranscriptWord[], record: SafetyRecord | null): RedactedRange[] {
  if (!record) return []
  const out: RedactedRange[] = []
  if (words.length && record.protected_terms.length) {
    for (const hit of findProtectedHits(words, record.protected_terms)) {
      if (record.term_decisions[hit.id] === 'reject') continue
      const pad = record.plan.pad ?? BLEEP_PAD_S
      out.push({ start: Math.max(0, hit.start - pad), end: hit.end + pad })
    }
  }
  for (const b of record.plan.manual) out.push({ start: b.start, end: b.end })
  return out.sort((a, b) => a.start - b.start)
}

export function ClipMaker({ episode, showTitle, coverUrl, safety: safetyProp, disabled }: Props) {
  // ── Protected-name plan: use the editor's copy, else load it here. Fail closed on error. ──
  const [safetyOwn, setSafetyOwn] = useState<ClipSafety | null>(null)
  const [safetyError, setSafetyError] = useState<string | null>(null)
  const safety = safetyProp !== undefined ? safetyProp : safetyOwn
  useEffect(() => {
    if (safetyProp !== undefined) return
    let live = true
    loadSafetyRecord(episode.id)
      .then((r) => live && setSafetyOwn({ available: r.available, record: r.record }))
      .catch((err: unknown) => live && setSafetyError(err instanceof Error ? err.message : 'Could not load the protected-name plan'))
    return () => {
      live = false
    }
  }, [episode.id, safetyProp])
  const safetyReady = Boolean(safety) && !safetyError

  const words = useMemo(() => cleanWords(episode.transcript_words), [episode.transcript_words])
  const sentences = useMemo(() => transcriptSentences(words), [words])
  const redactions = useMemo(() => redactionsFor(words, safety?.record ?? null), [words, safety?.record])
  const terms = useMemo(() => safety?.record?.protected_terms ?? [], [safety?.record])
  const durationHint = episode.duration_seconds || 0

  const [audio, setAudio] = useState<AudioBuffer | null>(null)
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [overview, setOverview] = useState<Peaks | null>(null)
  const [range, setRange] = useState<ClipRange>({ startSec: 0, endSec: 30 })
  const [aspect, setAspect] = useState<ClipAspect>('9:16')
  const [style, setStyle] = useState<ClipStyle>('waveform')
  const [title, setTitle] = useState(episode.title)
  const [video, setVideo] = useState<File | null>(null)
  const [previewAt, setPreviewAt] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState<ClipProgress | null>(null)
  const [rendered, setRendered] = useState<Rendered | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [clips, setClips] = useState<{ available: boolean; clips: EpisodeClip[]; migration?: string } | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const coverRef = useRef<ImageBitmap | null>(null)
  const playRef = useRef<{ ctx: AudioContext; source: AudioBufferSourceNode; started: number; raf: number } | null>(null)

  const duration = audio?.duration || durationHint

  // ── Load audio once the section is used ────────────────────────────────────
  const loadAudio = useCallback(async () => {
    if (!episode.audio_url || audio || audioState === 'loading') return
    setAudioState('loading')
    try {
      const buf = await decodeUrl(episode.audio_url)
      setAudio(buf)
      setAudioState('idle')
      const channels = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c))
      setOverview(computePeaks(channels, buf.sampleRate, 0, buf.duration, 4))
      setRange((r) => clampClipRange(r, buf.duration))
    } catch {
      setAudioState('failed')
    }
  }, [episode.audio_url, audio, audioState])

  useEffect(() => {
    let live = true
    loadCover(coverUrl).then((bmp) => {
      if (!live) {
        bmp?.close()
        return
      }
      coverRef.current?.close()
      coverRef.current = bmp
    })
    return () => {
      live = false
    }
  }, [coverUrl])

  useEffect(() => {
    let live = true
    listEpisodeClips(episode.id)
      .then((r) => live && setClips(r))
      .catch(() => live && setClips({ available: false, clips: [] }))
    return () => {
      live = false
    }
  }, [episode.id])

  // ── Range helpers ──────────────────────────────────────────────────────────
  const setValidRange = useCallback(
    (next: ClipRange, anchor: 'start' | 'end' = 'start') => {
      setRange(clampClipRange(next, duration || Math.max(next.endSec, CLIP_MAX_SEC), anchor))
      setRendered(null)
    },
    [duration],
  )
  const check = validateClipRange(range, duration || null)
  const clipLen = range.endSec - range.startSec
  const inClip = useMemo(() => redactionsInClip(redactions, range), [redactions, range])

  // Clip audio for the preview player (bleeped exactly as the render will be).
  const clipAudio = useMemo(() => {
    if (!audio || !check.ok) return null
    return sliceClipAudio(audio, range.startSec, range.endSec, inClip)
  }, [audio, range.startSec, range.endSec, inClip, check.ok])
  const clipPeaks = useMemo(
    () => (clipAudio ? computePeaks(clipAudio.channels, clipAudio.sampleRate, 0, clipLen) : null),
    [clipAudio, clipLen],
  )
  const captions = useMemo(() => buildClipCaptions({ words, redactions, terms, range, aspect }), [words, redactions, terms, range, aspect])
  const spec = useMemo<ClipSpec>(
    () => ({ range, aspect, style, title, showTitle, words: captions.words }),
    [range, aspect, style, title, showTitle, captions.words],
  )

  // ── Preview painting ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas || !clipPeaks) return
    void paintPreview(canvas, spec, clipPeaks, coverRef.current, previewAt)
  }, [spec, clipPeaks, previewAt])

  const stopPreview = useCallback(() => {
    const p = playRef.current
    if (!p) return
    cancelAnimationFrame(p.raf)
    try {
      p.source.stop()
    } catch {
      /* ended */
    }
    void p.ctx.close().catch(() => {})
    playRef.current = null
    setPlaying(false)
  }, [])

  const playPreview = useCallback(async () => {
    if (!clipAudio) return
    stopPreview()
    const ctx = new AudioContext()
    const buffer = ctx.createBuffer(clipAudio.channels.length, clipAudio.channels[0].length, clipAudio.sampleRate)
    clipAudio.channels.forEach((ch, c) => buffer.copyToChannel(ch as Float32Array<ArrayBuffer>, c))
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    await ctx.resume().catch(() => {})
    const from = Math.min(previewAt, Math.max(0, clipLen - 0.1))
    const started = ctx.currentTime - from
    source.start(0, from)
    const tick = () => {
      const t = ctx.currentTime - started
      if (t >= clipLen) {
        stopPreview()
        setPreviewAt(0)
        return
      }
      setPreviewAt(t)
      if (playRef.current) playRef.current.raf = requestAnimationFrame(tick)
    }
    playRef.current = { ctx, source, started, raf: requestAnimationFrame(tick) }
    source.onended = () => {
      if (playRef.current?.source === source) stopPreview()
    }
    setPlaying(true)
  }, [clipAudio, clipLen, previewAt, stopPreview])

  useEffect(() => () => stopPreview(), [stopPreview])
  useEffect(() => {
    stopPreview()
    setPreviewAt(0)
  }, [range.startSec, range.endSec, stopPreview])

  // ── Render / cancel ────────────────────────────────────────────────────────
  async function doRender() {
    if (!audio || !check.ok || !safetyReady) return
    stopPreview()
    setError(null)
    setRendered(null)
    const controller = new AbortController()
    abortRef.current = controller
    setProgress({ stage: 'Starting…', fraction: null })
    try {
      const result = await renderClip({
        spec: { range: check.range, aspect, style, title, showTitle },
        words,
        redactions,
        terms,
        audio,
        coverUrl,
        video,
        signal: controller.signal,
        onProgress: setProgress,
      })
      setRendered({
        ...result,
        range: check.range,
        aspect,
        videoUrl: URL.createObjectURL(result.video),
        posterUrl: URL.createObjectURL(result.poster),
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') setError('Render cancelled.')
      else setError(err instanceof Error ? err.message : 'Could not render the clip')
    } finally {
      abortRef.current = null
      setProgress(null)
    }
  }

  useEffect(
    () => () => {
      if (rendered) {
        URL.revokeObjectURL(rendered.videoUrl)
        URL.revokeObjectURL(rendered.posterUrl)
      }
    },
    [rendered],
  )

  async function doSave() {
    if (!rendered) return
    setError(null)
    setSaving('Saving…')
    try {
      const clip = await saveEpisodeClip({
        episodeId: episode.id,
        title,
        range: rendered.range,
        aspect: rendered.aspect,
        video: rendered.video,
        ext: rendered.ext,
        poster: rendered.poster,
        onStage: setSaving,
      })
      setClips((c) => ({ available: true, clips: [clip, ...(c?.clips || [])] }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the clip')
    } finally {
      setSaving(null)
    }
  }

  async function doDelete(id: string) {
    if (!window.confirm('Remove this clip from the episode page? The file stays in media storage.')) return
    try {
      await deleteEpisodeClip(id)
      setClips((c) => (c ? { ...c, clips: c.clips.filter((x) => x.id !== id) } : c))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the clip')
    }
  }

  const fileBase = `${(episode.slug || 'episode').replace(/[^a-z0-9-]/gi, '-')}-clip-${Math.round(range.startSec)}-${Math.round(range.endSec)}`
  const busy = Boolean(progress) || Boolean(saving) || disabled
  const layout = clipLayout(aspect)

  if (!episode.audio_url) {
    return <p className="studio-type-body text-silver">Upload or export the episode audio first — clips are cut from the finished file.</p>
  }

  return (
    <div className="space-y-5" onFocusCapture={() => void loadAudio()} onPointerDownCapture={() => void loadAudio()}>
      {error && <Notice tone="error">{error}</Notice>}
      {audioState === 'failed' && <Notice tone="error">Could not load the episode audio for clipping.</Notice>}
      {safetyError && (
        <Notice tone="error">
          The protected-name plan could not be loaded ({safetyError}). Rendering is paused so no name can slip into a clip — reload the page or open Clean-up &amp; safety first.
        </Notice>
      )}

      {/* 1. Pick a range */}
      <div className="space-y-3">
        <StepHeading n={1} title={`Choose the moment (${CLIP_MIN_SEC}–${CLIP_MAX_SEC} seconds)`} />
        <RangePicker
          overview={overview}
          duration={duration}
          range={range}
          loading={audioState === 'loading' || (!audio && audioState === 'idle')}
          redactions={redactions}
          onChange={setValidRange}
          onRequestAudio={() => void loadAudio()}
        />
        <div className="flex flex-wrap items-end gap-3">
          <TimeField label="Start" value={range.startSec} onCommit={(v) => setValidRange({ startSec: v, endSec: v + clipLen }, 'start')} />
          <TimeField label="End" value={range.endSec} onCommit={(v) => setValidRange({ startSec: range.startSec, endSec: v }, 'end')} />
          <p className={cn('studio-type-timecode pb-3', check.ok ? 'text-silver' : 'text-heart')}>
            {clock(clipLen)} long{check.ok ? '' : ` · ${check.error}`}
          </p>
        </div>
        {sentences.length > 0 && (
          <details className="rounded-control border border-divider bg-obsidian shadow-inset-well">
            <summary className="studio-type-body cursor-pointer px-3 py-2 text-[12px] text-white">
              Or start from a sentence in the transcript ({sentences.length})
            </summary>
            <ul className="max-h-56 divide-y divide-divider overflow-y-auto">
              {sentences.map((s, i) => {
                const active = s.startSec >= range.startSec - 0.01 && s.endSec <= range.endSec + 0.01
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => setValidRange({ startSec: s.startSec, endSec: Math.max(s.endSec, s.startSec + CLIP_MIN_SEC) }, 'start')}
                      className={cn(
                        'studio-type-body w-full px-3 py-1.5 text-left text-[12px] transition-colors duration-150',
                        active ? 'bg-surface-raised text-white' : 'text-silver-body hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <span className="studio-type-timecode mr-2 text-ice">{clock(s.startSec)}</span>
                      {s.text.length > 140 ? `${s.text.slice(0, 140)}…` : s.text}
                    </button>
                  </li>
                )
              })}
            </ul>
          </details>
        )}
        {words.length === 0 && (
          <Notice tone="info">
            No word timings on this episode — the clip will have no captions. Run Transcribe in Clean-up &amp; safety first for word-by-word captions.
          </Notice>
        )}
        {inClip.length > 0 && (
          <Notice tone="protect">
            This range overlaps {inClip.length} protected mention{inClip.length === 1 ? '' : 's'}: {inClip.length === 1 ? 'it is' : 'they are'} bleeped in the clip audio and shown as “[removed]” in the captions.
          </Notice>
        )}
      </div>

      {/* 2. Shape + style */}
      <div className="space-y-3">
        <StepHeading n={2} title="Shape, style and title" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <span className="studio-type-label">Shape</span>
            <SegmentedControl aria-label="Clip shape" options={ASPECT_OPTIONS} value={aspect} onValueChange={(a) => !busy && setAspect(a)} />
            <p className="studio-type-body text-[12px] text-silver">{CLIP_ASPECT_LABEL[aspect]}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="studio-type-label">Style</span>
            <SegmentedControl aria-label="Animation style" options={STYLE_OPTIONS} value={style} onValueChange={(s) => !busy && setStyle(s)} />
            <label className="mt-2 block">
              <span className="studio-type-label">Picture (optional video)</span>
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                disabled={busy}
                onChange={(e) => {
                  setVideo(e.target.files?.[0] || null)
                  setRendered(null)
                }}
                className={cn(
                  'studio-type-body mt-1.5 block w-full text-[12px] text-silver-body',
                  'file:mr-2 file:rounded-control file:border file:border-divider file:bg-surface-raised file:px-2.5 file:py-1',
                  'file:text-[12px] file:text-white file:shadow-inset-top hover:file:border-forged/60',
                  'disabled:opacity-40',
                )}
              />
              <span className="studio-type-body mt-1 block text-[11px] text-silver-label">
                {video ? `${video.name} — frames are taken from the same times as the audio.` : 'Uses the episode artwork unless you add the Program video export.'}
              </span>
            </label>
          </div>
          <Input label="Title on the clip" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        </div>
      </div>

      {/* 3. Preview + render */}
      <div className="space-y-3">
        <StepHeading n={3} title="Preview and render" />
        <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
          <Panel elevation="flat" className="overflow-hidden bg-obsidian p-1">
            <canvas
              ref={previewRef}
              width={layout.width}
              height={layout.height}
              className="w-full rounded-[6px] bg-obsidian"
              style={{ aspectRatio: `${layout.width} / ${layout.height}`, maxHeight: 420 }}
              aria-label="Clip preview"
            />
          </Panel>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="compact" onClick={() => (playing ? stopPreview() : void playPreview())} disabled={!clipAudio || busy}>
                {playing ? <Square size={12} /> : <Play size={12} />} {playing ? 'Stop' : 'Play preview'}
              </Button>
              <span className="studio-type-timecode">
                {clock(previewAt)} / {clock(clipLen)}
              </span>
            </div>
            <Slider
              aria-label="Preview position"
              min={0}
              max={Math.max(0.1, clipLen)}
              step={0.05}
              value={Math.min(previewAt, clipLen)}
              onChange={(e) => {
                stopPreview()
                setPreviewAt(Number(e.target.value))
              }}
              disabled={!clipPeaks}
            />
            <p className="studio-type-body text-[12px] text-silver">
              {captions.groups.length ? `${captions.groups.length} caption${captions.groups.length === 1 ? '' : 's'} · ` : ''}
              {layout.width}×{layout.height} · 30 fps · MP4 (H.264) when the browser can write it, otherwise WebM.
            </p>

            {progress ? (
              <div className="space-y-2">
                <ProgressBar value={progress.fraction} label={progress.realtime ? `${progress.stage} (this browser records at 1× speed)` : progress.stage} />
                <Button size="compact" variant="danger" onClick={() => abortRef.current?.abort()}>
                  <X size={12} /> Cancel
                </Button>
              </div>
            ) : (
              <Button size="compact" variant="primary" onClick={() => void doRender()} disabled={!audio || !check.ok || busy || !safetyReady} loading={!safetyReady && !safetyError}>
                <Film size={12} /> Render clip
              </Button>
            )}

            {rendered && (
              <Panel elevation="flat" tactile className="space-y-3 bg-obsidian p-3">
                <video src={rendered.videoUrl} poster={rendered.posterUrl} controls playsInline className="max-h-72 w-full rounded-[6px] bg-black" />
                <p className="studio-type-body text-[12px] text-silver">
                  {rendered.ext.toUpperCase()} · {(rendered.video.size / 1024 / 1024).toFixed(1)} MB · {clock(rendered.duration)}
                  {rendered.redactedCount ? ` · ${rendered.redactedCount} bleeped` : ''}
                  {rendered.path === 'realtime' ? ' · recorded in real time' : rendered.path === 'worker' ? ' · rendered in the background' : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  <DownloadLink href={rendered.videoUrl} download={`${fileBase}.${rendered.ext}`} accent>
                    Video
                  </DownloadLink>
                  <DownloadLink href={rendered.posterUrl} download={`${fileBase}.png`}>
                    Poster
                  </DownloadLink>
                  <DownloadLink href={`data:application/x-subrip;charset=utf-8,${encodeURIComponent(rendered.srt)}`} download={`${fileBase}.srt`}>
                    Captions (SRT)
                  </DownloadLink>
                  <Button
                    size="compact"
                    variant="primary"
                    onClick={() => void doSave()}
                    disabled={busy || clips?.available === false}
                    loading={Boolean(saving)}
                    title={clips?.available === false ? 'Run the clips migration first' : undefined}
                  >
                    <Save size={12} /> {saving || 'Save to episode'}
                  </Button>
                </div>
                {clips?.available === false && clips.migration && (
                  <p className="studio-type-body text-[11px] text-ice">Saving needs the {clips.migration} migration; downloads still work.</p>
                )}
              </Panel>
            )}
          </div>
        </div>
      </div>

      {/* Saved clips */}
      {clips && clips.clips.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="studio-type-column">Saved clips</p>
            <Chip tone="accent">{clips.clips.length}</Chip>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {clips.clips.map((c) => (
              <li key={c.id}>
                <Panel elevation="flat" className="flex gap-2 bg-obsidian p-2">
                  {c.poster_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.poster_url} alt="" className="h-16 w-16 rounded-[6px] border border-divider object-cover" />
                  ) : (
                    <div className="h-16 w-16 rounded-[6px] bg-surface-raised" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="studio-type-body truncate text-[12px] text-white">{c.title || 'Clip'}</p>
                    <p className="studio-type-timecode mt-0.5">
                      {c.aspect} · {clock(c.start_sec)}–{clock(c.end_sec)}
                    </p>
                    <div className="mt-1.5 flex gap-1">
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="studio-type-button inline-flex h-control-dense items-center rounded-control px-2 text-[12px] text-ice hover:bg-white/5"
                      >
                        Open
                      </a>
                      <Button size="dense" variant="ghost" onClick={() => void doDelete(c.id)}>
                        <Trash2 size={11} /> Remove
                      </Button>
                    </div>
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
          <p className="studio-type-body text-[11px] text-silver-label">Saved clips appear on the public episode page once the episode is live.</p>
        </div>
      )}
    </div>
  )
}

// ── Small studio-styled pieces ────────────────────────────────────────────────

function StepHeading({ n, title }: { n: number; title: string }) {
  return (
    <p className="studio-type-body flex items-center gap-2 text-[13px] font-medium text-white">
      <span
        aria-hidden
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-forged/40 bg-forged/10 text-[11px] text-ice"
      >
        {n}
      </span>
      {title}
    </p>
  )
}

/**
 * Inline notices. Only the heart may carry warm colour on this site, so the safety notice
 * (protected mentions) borrows it; errors use the heart too; informational notes stay ice-blue.
 */
function Notice({ tone, children }: { tone: 'error' | 'info' | 'protect'; children: React.ReactNode }) {
  const cls =
    tone === 'error'
      ? 'border-heart/50 bg-heart/10 text-white'
      : tone === 'protect'
        ? 'border-heart/40 bg-heart/5 text-silver-body'
        : 'border-forged/30 bg-forged/5 text-silver-body'
  return (
    <p role={tone === 'error' ? 'alert' : undefined} className={cn('studio-type-body rounded-control border px-3 py-2 text-[12px]', cls)}>
      {children}
    </p>
  )
}

function ProgressBar({ value, label }: { value: number | null; label: string }) {
  const pct = value == null ? null : Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        className="h-1.5 w-full overflow-hidden rounded-full bg-obsidian shadow-inset-well"
      >
        <div
          className={cn('h-full rounded-full bg-forged transition-[width] duration-150 ease-calm', pct == null && 'w-1/3 animate-pulse')}
          style={pct == null ? undefined : { width: `${pct}%` }}
        />
      </div>
      <p className="studio-type-body text-[12px] text-silver" aria-live="polite">
        {label}
        {pct != null ? ` — ${pct}%` : ''}
      </p>
    </div>
  )
}

function DownloadLink({ href, download, accent, children }: { href: string; download: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      download={download}
      className={cn(
        'studio-type-button inline-flex h-control-compact items-center gap-1 rounded-control border px-3 text-[12px] shadow-inset-top transition-colors duration-150',
        accent ? 'border-forged/60 bg-forged/10 text-ice hover:bg-forged/20' : 'border-divider bg-surface-raised text-white hover:border-forged/60',
      )}
    >
      <Download size={12} /> {children}
    </a>
  )
}

// ── Range picker ──────────────────────────────────────────────────────────────

/** Canvas colours, matched to the studio tokens in app/globals.css. */
const INK = {
  well: '#05070A',
  idle: '#39454F',
  fill: '#53D6FF', // forged blue
  fillWash: 'rgba(83, 214, 255, 0.14)',
  protect: 'rgba(255, 91, 115, 0.35)', // heart — protected mentions
  handle: '#F6FAFC',
}

function RangePicker({
  overview,
  duration,
  range,
  loading,
  redactions,
  onChange,
  onRequestAudio,
}: {
  overview: Peaks | null
  duration: number
  range: ClipRange
  loading: boolean
  redactions: RedactedRange[]
  onChange: (r: ClipRange, anchor?: 'start' | 'end') => void
  onRequestAudio: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: 'new' | 'move' | 'start' | 'end'; anchor: number; offset: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const w = Math.max(200, Math.floor(wrap.clientWidth))
    const h = 96
    canvas.width = w * (window.devicePixelRatio || 1)
    canvas.height = h * (window.devicePixelRatio || 1)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0)
    ctx.fillStyle = INK.well
    ctx.fillRect(0, 0, w, h)
    const total = duration || 1
    const x = (sec: number) => (sec / total) * w
    if (overview) {
      const cols = overviewPeaks(overview, w)
      for (let i = 0; i < w; i++) {
        const v = Math.max(2, cols[i] * (h - 8))
        const sec = (i / w) * total
        const inside = sec >= range.startSec && sec <= range.endSec
        ctx.fillStyle = inside ? INK.fill : INK.idle
        ctx.fillRect(i, (h - v) / 2, 1, v)
      }
    } else {
      ctx.fillStyle = INK.idle
      ctx.fillRect(0, h / 2 - 1, w, 2)
    }
    for (const r of redactions) {
      ctx.fillStyle = INK.protect
      ctx.fillRect(x(r.start), 0, Math.max(2, x(r.end) - x(r.start)), h)
    }
    ctx.fillStyle = INK.fillWash
    ctx.fillRect(x(range.startSec), 0, x(range.endSec) - x(range.startSec), h)
    ctx.fillStyle = INK.handle
    ctx.fillRect(x(range.startSec) - 1, 0, 3, h)
    ctx.fillRect(x(range.endSec) - 1, 0, 3, h)
  }, [overview, duration, range, redactions])

  const secAt = (clientX: number) => {
    const el = canvasRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const total = duration || 1
    return Math.max(0, Math.min(total, ((clientX - rect.left) / rect.width) * total))
  }

  return (
    <div ref={wrapRef} className="rounded-control border border-divider bg-obsidian p-1 shadow-inset-well">
      <canvas
        ref={canvasRef}
        role="slider"
        aria-label="Clip range on the episode"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(range.startSec)}
        aria-valuetext={`${clock(range.startSec)} to ${clock(range.endSec)}`}
        tabIndex={0}
        className="block w-full cursor-crosshair touch-none rounded-[6px]"
        onKeyDown={(e) => {
          const step = e.shiftKey ? 5 : 1
          const len = range.endSec - range.startSec
          if (e.key === 'ArrowLeft') onChange({ startSec: range.startSec - step, endSec: range.startSec - step + len })
          else if (e.key === 'ArrowRight') onChange({ startSec: range.startSec + step, endSec: range.startSec + step + len })
          else return
          e.preventDefault()
        }}
        onPointerDown={(e) => {
          onRequestAudio()
          const sec = secAt(e.clientX)
          const total = duration || 1
          const grab = total * 0.012
          let mode: 'new' | 'move' | 'start' | 'end' = 'new'
          if (Math.abs(sec - range.startSec) <= grab) mode = 'start'
          else if (Math.abs(sec - range.endSec) <= grab) mode = 'end'
          else if (sec > range.startSec && sec < range.endSec) mode = 'move'
          drag.current = { mode, anchor: sec, offset: sec - range.startSec }
          e.currentTarget.setPointerCapture(e.pointerId)
          if (mode === 'new') onChange({ startSec: sec, endSec: sec + CLIP_MIN_SEC }, 'start')
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const sec = secAt(e.clientX)
          const len = range.endSec - range.startSec
          if (d.mode === 'new') {
            if (sec >= d.anchor) onChange({ startSec: d.anchor, endSec: sec }, 'start')
            else onChange({ startSec: sec, endSec: d.anchor }, 'end')
          } else if (d.mode === 'move') {
            const start = sec - d.offset
            onChange({ startSec: start, endSec: start + len }, 'start')
          } else if (d.mode === 'start') onChange({ startSec: sec, endSec: range.endSec }, 'end')
          else onChange({ startSec: range.startSec, endSec: sec }, 'start')
        }}
        onPointerUp={(e) => {
          drag.current = null
          e.currentTarget.releasePointerCapture(e.pointerId)
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
      />
      <p className="studio-type-body px-1 pt-1 text-[11px] text-silver-label">
        {loading ? 'Loading the waveform…' : 'Drag to choose a range, drag the edges to trim, drag the middle to move. Red marks protected mentions.'}
      </p>
    </div>
  )
}

function TimeField({ label, value, onCommit }: { label: string; value: number; onCommit: (sec: number) => void }) {
  const [text, setText] = useState(clock(value))
  useEffect(() => setText(clock(value)), [value])
  return (
    <Input
      label={label}
      wrapperClassName="w-28"
      className="studio-type-timecode !text-[13px] text-white"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const sec = parseClock(text)
        if (sec == null) setText(clock(value))
        else onCommit(sec)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      inputMode="numeric"
    />
  )
}

// ── Time helpers (shared shape with the Clean-up panel's ui.tsx) ──────────────

export function clock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const t = Math.floor(sec)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  const tenth = Math.floor((sec - t) * 10)
  const base = h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  return `${base}.${tenth}`
}

export function parseClock(value: string): number | null {
  const parts = value.trim().split(':').map(Number)
  if (!value.trim() || parts.some((n) => Number.isNaN(n) || n < 0)) return null
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}
