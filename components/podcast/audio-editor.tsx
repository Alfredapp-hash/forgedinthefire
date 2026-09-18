'use client'

import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import {
  applyGainAndFades,
  decodeUrl,
  encodeMp3,
  encodeWav,
  formatClock,
  sliceBuffer,
} from '@/lib/podcast/audio'

type RegionApi = {
  start: number
  end: number
  setOptions: (opts: { start?: number; end?: number }) => void
}

type Props = {
  audioUrl: string
  title: string
  onExported: (file: File, durationSeconds: number) => Promise<void>
}

export function PodcastAudioEditor({ audioUrl, title, onExported }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const waveRef = useRef<WaveSurfer | null>(null)
  const regionRef = useRef<RegionApi | null>(null)
  const [ready, setReady] = useState(false)
  const [range, setRange] = useState({ start: 0, end: 0, total: 0 })
  const [gain, setGain] = useState(1)
  const [fadeIn, setFadeIn] = useState(0.4)
  const [fadeOut, setFadeOut] = useState(0.6)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sourceUrl = `/api/admin/media/file?url=${encodeURIComponent(audioUrl)}`

  useEffect(() => {
    if (!hostRef.current) return
    const ws = WaveSurfer.create({
      container: hostRef.current,
      height: 128,
      waveColor: '#27313B',
      progressColor: '#53D6FF',
      cursorColor: '#8DEBFF',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      url: sourceUrl,
    })
    const regions = ws.registerPlugin(RegionsPlugin.create())
    waveRef.current = ws

    const sync = (region: RegionApi) => {
      regionRef.current = region
      setRange((prev) => ({ ...prev, start: region.start, end: region.end }))
    }

    ws.on('ready', () => {
      const total = ws.getDuration()
      const existing = regions.getRegions()[0]
      const region = existing || regions.addRegion({
        start: 0,
        end: total,
        color: 'rgba(83, 214, 255, 0.18)',
        drag: true,
        resize: true,
      })
      sync(region as RegionApi)
      setRange({ start: region.start, end: region.end, total })
      setReady(true)
    })
    regions.on('region-updated', (region) => sync(region as RegionApi))
    regions.on('region-created', (region) => sync(region as RegionApi))

    return () => {
      ws.destroy()
      waveRef.current = null
      regionRef.current = null
      setReady(false)
    }
  }, [sourceUrl])

  function setBound(which: 'start' | 'end') {
    const ws = waveRef.current
    const region = regionRef.current
    if (!ws || !region) return
    const t = ws.getCurrentTime()
    if (which === 'start') region.setOptions({ start: Math.min(t, region.end - 0.05) })
    else region.setOptions({ end: Math.max(t, region.start + 0.05) })
  }

  async function exportAudio(kind: 'wav' | 'mp3') {
    setBusy(kind === 'wav' ? 'Exporting WAV…' : 'Exporting MP3…')
    setError(null)
    try {
      const decoded = await decodeUrl(sourceUrl)
      const start = regionRef.current?.start ?? 0
      const end = regionRef.current?.end ?? decoded.duration
      const sliced = applyGainAndFades(sliceBuffer(decoded, start, end), gain, fadeIn, fadeOut)
      const blob = kind === 'wav' ? encodeWav(sliced) : await encodeMp3(sliced)
      const ext = kind === 'wav' ? 'wav' : 'mp3'
      const file = new File([blob], `${title.replace(/[^\w]+/g, '-').slice(0, 48) || 'episode'}.${ext}`, {
        type: blob.type,
      })
      await onExported(file, sliced.duration)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-2xl border border-[#27313B] bg-[#0C141C] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#8DEBFF]">Audio bench</p>
          <p className="text-sm text-[#B8C4CF]">
            Drag the ice region to trim. This is a real decode → slice → fade → encode loop, not a fake waveform.
          </p>
        </div>
        <span className="text-xs text-[#A9B8C6]">
          {ready ? `${formatClock(range.start)} – ${formatClock(range.end)} / ${formatClock(range.total)}` : 'Loading waveform…'}
        </span>
      </div>
      <div ref={hostRef} className="rounded-lg bg-[#05070A] px-2 py-3" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => waveRef.current?.playPause()} disabled={!ready}>
          Play / pause
        </button>
        <button type="button" className={btn} onClick={() => setBound('start')} disabled={!ready}>
          Start at playhead
        </button>
        <button type="button" className={btn} onClick={() => setBound('end')} disabled={!ready}>
          End at playhead
        </button>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 text-xs text-[#A9B8C6]">
        <label>
          Volume {gain.toFixed(2)}
          <input type="range" min={0.2} max={2} step={0.05} value={gain} onChange={(e) => setGain(Number(e.target.value))} className="w-full" />
        </label>
        <label>
          Fade in {fadeIn.toFixed(1)}s
          <input type="range" min={0} max={4} step={0.1} value={fadeIn} onChange={(e) => setFadeIn(Number(e.target.value))} className="w-full" />
        </label>
        <label>
          Fade out {fadeOut.toFixed(1)}s
          <input type="range" min={0} max={4} step={0.1} value={fadeOut} onChange={(e) => setFadeOut(Number(e.target.value))} className="w-full" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={!ready || Boolean(busy)} onClick={() => void exportAudio('wav')}>
          {busy === 'Exporting WAV…' ? busy : 'Export WAV + save'}
        </button>
        <button type="button" className={primary} disabled={!ready || Boolean(busy)} onClick={() => void exportAudio('mp3')}>
          {busy === 'Exporting MP3…' ? busy : 'Export MP3 + save'}
        </button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <p className="text-[11px] text-[#A9B8C6]">
        Waveform: wavesurfer.js (BSD-3-Clause). Encode: Web Audio WAV + lamejs MP3. Original file stays until you save an export.
      </p>
    </div>
  )
}

const btn = 'px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF] disabled:opacity-40'
const primary = 'px-3 py-2 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium disabled:opacity-40'
