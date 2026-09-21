'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import {
  applyGainAndFades,
  decodeUrl,
  encodeMp3,
  encodeWav,
  formatClock,
} from '@/lib/podcast/audio'
import {
  EFFECT_META,
  applyEffect,
  bufferFromBlob,
  cloneBuffer,
  type EffectId,
} from '@/lib/podcast/effects'
import {
  TRACK_COLORS,
  appendBuffers,
  cloneAudioBuffer,
  createEmptyTrack,
  dbFromLinear,
  defaultSessionTracks,
  mixdownTracks,
  peakMeter,
  sessionDuration,
  splitBuffer,
  type StudioTrack,
} from '@/lib/podcast/multitrack'
import {
  CopyPlus,
  Mic2,
  Minus,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react'

type RegionApi = {
  start: number
  end: number
  setOptions: (opts: { start?: number; end?: number }) => void
}

type Props = {
  audioUrl?: string | null
  title: string
  onExported: (file: File, durationSeconds: number) => Promise<void>
  onPublished?: () => Promise<void>
}

type Snapshot = {
  tracks: StudioTrack[]
  selectedId: string | null
}

function snapshotTracks(tracks: StudioTrack[]): StudioTrack[] {
  return tracks.map((t) => ({
    ...t,
    buffer: t.buffer ? cloneAudioBuffer(t.buffer) : null,
    // URLs stay shared; buffers are what matter for undo
  }))
}

export function PodcastAudioEditor({ audioUrl, title, onExported, onPublished }: Props) {
  const [tracks, setTracks] = useState<StudioTrack[]>(() => defaultSessionTracks())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [masterUrl, setMasterUrl] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [recording, setRecording] = useState(false)
  const [range, setRange] = useState({ start: 0, end: 0, total: 0 })
  const [masterGain, setMasterGain] = useState(1)
  const [masterFadeIn, setMasterFadeIn] = useState(0.15)
  const [masterFadeOut, setMasterFadeOut] = useState(0.4)
  const [zoom, setZoom] = useState(48)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [applied, setApplied] = useState<EffectId[]>([])
  const [meter, setMeter] = useState<{ peak: number; rms: number } | null>(null)
  const [loop, setLoop] = useState(false)
  const [metronome, setMetronome] = useState(false)
  const [bpm, setBpm] = useState(90)

  const masterHostRef = useRef<HTMLDivElement>(null)
  const waveRef = useRef<WaveSurfer | null>(null)
  const regionRef = useRef<RegionApi | null>(null)
  const trackWaveRefs = useRef<Record<string, WaveSurfer | null>>({})
  const trackHostRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const historyRef = useRef<Snapshot[]>([])
  const [historyLen, setHistoryLen] = useState(0)
  const metroRef = useRef<number | null>(null)
  const metroCtxRef = useRef<AudioContext | null>(null)
  const seededRef = useRef(false)

  const selected = useMemo(
    () => tracks.find((t) => t.id === selectedId) || tracks[0] || null,
    [tracks, selectedId],
  )

  const hasAudio = tracks.some((t) => Boolean(t.buffer))

  const pushHistory = useCallback(() => {
    historyRef.current.push({
      tracks: snapshotTracks(tracks),
      selectedId,
    })
    if (historyRef.current.length > 20) historyRef.current.shift()
    setHistoryLen(historyRef.current.length)
  }, [tracks, selectedId])

  const revokeUrl = (url: string | null) => {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
  }

  const bufferToUrl = (buffer: AudioBuffer) => URL.createObjectURL(encodeWav(buffer))

  const updateTrack = useCallback((id: string, patch: Partial<StudioTrack>) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  const assignBufferToTrack = useCallback(
    (id: string, buffer: AudioBuffer, label?: string) => {
      const url = bufferToUrl(buffer)
      setTracks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t
          revokeUrl(t.url)
          return { ...t, buffer: cloneAudioBuffer(buffer), url }
        }),
      )
      setSelectedId(id)
      if (label) setOk(label)
    },
    [],
  )

  const rebuildMasterPreview = useCallback(async () => {
    if (!tracks.some((t) => t.buffer)) {
      setMasterUrl((prev) => {
        revokeUrl(prev)
        return null
      })
      setMeter(null)
      setReady(false)
      return
    }
    setBusy('Mixing preview…')
    try {
      const mixed = mixdownTracks(tracks)
      const shaped = applyGainAndFades(mixed, masterGain, masterFadeIn, masterFadeOut)
      setMeter(peakMeter(shaped))
      const url = bufferToUrl(shaped)
      setMasterUrl((prev) => {
        revokeUrl(prev)
        return url
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mix failed')
    } finally {
      setBusy(null)
    }
  }, [tracks, masterGain, masterFadeIn, masterFadeOut])

  // Seed first vocal track from existing episode audio once
  useEffect(() => {
    if (!audioUrl || seededRef.current) return
    seededRef.current = true
    void (async () => {
      setBusy('Loading episode audio…')
      try {
        const url = `/api/admin/media/file?url=${encodeURIComponent(audioUrl)}`
        const buffer = await decodeUrl(url)
        const url = bufferToUrl(buffer)
        let vocalId: string | null = null
        setTracks((prev) => {
          const vocal = prev.find((t) => t.role === 'vocal') || prev[0]
          if (!vocal) return prev
          vocalId = vocal.id
          revokeUrl(vocal.url)
          return prev.map((t) =>
            t.id === vocal.id
              ? {
                  ...t,
                  buffer: cloneAudioBuffer(buffer),
                  url,
                  armed: true,
                }
              : { ...t, armed: false },
          )
        })
        if (vocalId) setSelectedId(vocalId)
        setOk('Episode audio loaded on Vocal track')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load audio')
      } finally {
        setBusy(null)
      }
    })()
  }, [audioUrl])

  const trackWaveKey = tracks.map((t) => `${t.id}:${t.url || ''}:${t.color}:${t.offset}`).join('|')

  // Per-track mini waveforms
  useEffect(() => {
    for (const track of tracks) {
      const host = trackHostRefs.current[track.id]
      if (!host) continue
      const existing = trackWaveRefs.current[track.id]
      if (!track.url) {
        existing?.destroy()
        trackWaveRefs.current[track.id] = null
        host.innerHTML = ''
        continue
      }
      existing?.destroy()
      const trackId = track.id
      const trackOffset = track.offset
      const ws = WaveSurfer.create({
        container: host,
        height: 56,
        waveColor: track.color + '99',
        progressColor: track.color,
        cursorColor: '#8DEBFF',
        cursorWidth: 1,
        barWidth: 2,
        barGap: 1,
        barRadius: 1,
        minPxPerSec: zoom,
        url: track.url,
        interact: true,
      })
      trackWaveRefs.current[trackId] = ws
      ws.on('interaction', () => {
        setSelectedId(trackId)
        const t = ws.getCurrentTime() + trackOffset
        const master = waveRef.current
        if (master) master.setTime(Math.min(master.getDuration() || t, t))
      })
    }
  }, [trackWaveKey, zoom, tracks])

  // Master waveform + export region
  useEffect(() => {
    if (!masterHostRef.current || !masterUrl) {
      waveRef.current?.destroy()
      waveRef.current = null
      regionRef.current = null
      setReady(false)
      return
    }
    waveRef.current?.destroy()
    const ws = WaveSurfer.create({
      container: masterHostRef.current,
      height: 120,
      waveColor: '#3A4654',
      progressColor: '#53D6FF',
      cursorColor: '#8DEBFF',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      minPxPerSec: zoom,
      url: masterUrl,
      interact: true,
    })
    const regions = ws.registerPlugin(RegionsPlugin.create())
    waveRef.current = ws

    const sync = (region: RegionApi) => {
      regionRef.current = region
      setRange((prev) => ({ ...prev, start: region.start, end: region.end }))
    }

    ws.on('ready', () => {
      const total = ws.getDuration()
      const region =
        regions.getRegions()[0] ||
        regions.addRegion({
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
    ws.on('play', () => setPlaying(true))
    ws.on('pause', () => setPlaying(false))
    ws.on('finish', () => {
      setPlaying(false)
      if (loop) {
        const r = regionRef.current
        if (r) {
          ws.setTime(r.start)
          void ws.play()
        }
      }
    })
    regions.on('region-updated', (region: RegionApi) => sync(region))
    regions.on('region-created', (region: RegionApi) => sync(region))

    return () => {
      ws.destroy()
      if (waveRef.current === ws) waveRef.current = null
    }
  }, [masterUrl, loop])

  useEffect(() => {
    waveRef.current?.zoom(zoom)
    Object.values(trackWaveRefs.current).forEach((ws) => ws?.zoom(zoom))
  }, [zoom])

  // Debounced remaster when tracks / master bus change
  useEffect(() => {
    const t = window.setTimeout(() => void rebuildMasterPreview(), 280)
    return () => window.clearTimeout(t)
  }, [rebuildMasterPreview])

  useEffect(() => {
    return () => {
      Object.values(trackWaveRefs.current).forEach((ws) => ws?.destroy())
      waveRef.current?.destroy()
      tracks.forEach((t) => revokeUrl(t.url))
      revokeUrl(masterUrl)
      stopMetronome()
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopMetronome() {
    if (metroRef.current != null) {
      window.clearInterval(metroRef.current)
      metroRef.current = null
    }
    void metroCtxRef.current?.close()
    metroCtxRef.current = null
  }

  function clickMetronome() {
    const ctx = metroCtxRef.current || new AudioContext()
    metroCtxRef.current = ctx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.0001
    osc.connect(gain)
    gain.connect(ctx.destination)
    const now = ctx.currentTime
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
    osc.start(now)
    osc.stop(now + 0.06)
  }

  useEffect(() => {
    stopMetronome()
    if (!metronome) return
    const ms = Math.max(200, Math.round(60000 / bpm))
    clickMetronome()
    metroRef.current = window.setInterval(clickMetronome, ms)
    return () => stopMetronome()
  }, [metronome, bpm])

  function setBound(which: 'start' | 'end') {
    const ws = waveRef.current
    const region = regionRef.current
    if (!ws || !region) return
    const t = ws.getCurrentTime()
    if (which === 'start') region.setOptions({ start: Math.min(t, region.end - 0.05) })
    else region.setOptions({ end: Math.max(t, region.start + 0.05) })
  }

  function nudge(seconds: number) {
    const ws = waveRef.current
    if (!ws) return
    ws.setTime(Math.max(0, Math.min(ws.getDuration(), ws.getCurrentTime() + seconds)))
  }

  async function undo() {
    const prev = historyRef.current.pop()
    setHistoryLen(historyRef.current.length)
    if (!prev) return
    tracks.forEach((t) => revokeUrl(t.url))
    setTracks(
      prev.tracks.map((t) => ({
        ...t,
        url: t.buffer ? bufferToUrl(t.buffer) : null,
      })),
    )
    setSelectedId(prev.selectedId)
    setApplied([])
    setOk('Undid last change')
  }

  async function runEffect(id: EffectId) {
    if (!selected?.buffer) {
      setError('Select a track with audio first')
      return
    }
    pushHistory()
    setBusy(`Applying ${id.replace('_', ' ')} on ${selected.name}…`)
    setError(null)
    try {
      const next = await applyEffect(cloneBuffer(selected.buffer), id)
      assignBufferToTrack(selected.id, next)
      setApplied((prev) => [...prev, id])
      setOk(`${EFFECT_META.find((e) => e.id === id)?.label || id} → ${selected.name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Effect failed')
    } finally {
      setBusy(null)
    }
  }

  async function toggleRecord() {
    if (recording) {
      recorderRef.current?.stop()
      return
    }
    const target =
      tracks.find((t) => t.armed) || selected || tracks.find((t) => t.role === 'vocal') || tracks[0]
    if (!target) {
      setError('Add a track before recording')
      return
    }
    setSelectedId(target.id)
    setError(null)
    setOk(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        recorderRef.current = null
        setRecording(false)
        const type = recorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        if (blob.size < 64) {
          setError('Recording was empty')
          return
        }
        setBusy('Decoding recording…')
        try {
          pushHistory()
          const buffer = await bufferFromBlob(blob)
          const mode = (document.getElementById('rec-mode') as HTMLSelectElement | null)?.value || 'replace'
          if (mode === 'append' && target.buffer) {
            assignBufferToTrack(target.id, appendBuffers(target.buffer, buffer), `Appended to ${target.name}`)
          } else if (mode === 'overdub' && target.buffer) {
            // Mix new take onto existing clip at offset 0 as a layered buffer via temporary mix
            const layered = mixdownTracks([
              { ...target, offset: 0, muted: false, solo: false },
              {
                ...createEmptyTrack({ name: 'take', role: 'vocal' }),
                buffer,
                offset: target.offset,
                volume: 1,
                muted: false,
                solo: false,
              },
            ])
            assignBufferToTrack(target.id, layered, `Overdubbed ${target.name}`)
          } else {
            assignBufferToTrack(target.id, buffer, `Recorded onto ${target.name}`)
          }
          setApplied([])
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not decode recording')
        } finally {
          setBusy(null)
        }
      }
      recorderRef.current = recorder
      recorder.start(250)
      setRecording(true)
      setOk(`Recording into “${target.name}”…`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access was blocked')
    }
  }

  async function onUploadPick(file: File | null) {
    if (!file) return
    const target = selected || tracks[0]
    if (!target) return
    setBusy('Loading file…')
    setError(null)
    try {
      pushHistory()
      const buffer = await bufferFromBlob(file)
      assignBufferToTrack(target.id, buffer, `Loaded ${file.name} → ${target.name}`)
      setApplied([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load file')
    } finally {
      setBusy(null)
    }
  }

  function addTrack(role: StudioTrack['role'] = 'custom') {
    pushHistory()
    const names: Record<string, string> = {
      vocal: 'Vocal',
      guest: 'Guest',
      music: 'Music',
      bed: 'Bed',
      sfx: 'SFX',
      custom: `Track ${tracks.length + 1}`,
      master: 'Master',
    }
    const track = createEmptyTrack({
      name: names[role] || `Track ${tracks.length + 1}`,
      role,
      color: TRACK_COLORS[tracks.length % TRACK_COLORS.length],
    })
    setTracks((prev) => [...prev, track])
    setSelectedId(track.id)
    setOk(`Added ${track.name}`)
  }

  function removeTrack(id: string) {
    if (tracks.length <= 1) {
      setError('Keep at least one track')
      return
    }
    pushHistory()
    setTracks((prev) => {
      const doomed = prev.find((t) => t.id === id)
      revokeUrl(doomed?.url || null)
      trackWaveRefs.current[id]?.destroy()
      delete trackWaveRefs.current[id]
      const next = prev.filter((t) => t.id !== id)
      if (selectedId === id) setSelectedId(next[0]?.id || null)
      return next
    })
  }

  function duplicateTrack(id: string) {
    const src = tracks.find((t) => t.id === id)
    if (!src) return
    pushHistory()
    const copy = createEmptyTrack({
      name: `${src.name} copy`,
      role: src.role,
      color: src.color,
      volume: src.volume,
      pan: src.pan,
      offset: src.offset,
      fadeIn: src.fadeIn,
      fadeOut: src.fadeOut,
    })
    if (src.buffer) {
      copy.buffer = cloneAudioBuffer(src.buffer)
      copy.url = bufferToUrl(src.buffer)
    }
    setTracks((prev) => {
      const idx = prev.findIndex((t) => t.id === id)
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
    setSelectedId(copy.id)
  }

  function clearTrack(id: string) {
    pushHistory()
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        revokeUrl(t.url)
        return { ...t, buffer: null, url: null }
      }),
    )
  }

  function armOnly(id: string) {
    setTracks((prev) => prev.map((t) => ({ ...t, armed: t.id === id })))
    setSelectedId(id)
  }

  function splitSelectedAtPlayhead() {
    if (!selected?.buffer) return
    const ws = trackWaveRefs.current[selected.id]
    const at = ws?.getCurrentTime() ?? 0
    if (at <= 0.05 || at >= selected.buffer.duration - 0.05) {
      setError('Move the playhead inside the clip to split')
      return
    }
    pushHistory()
    const [a, b] = splitBuffer(selected.buffer, at)
    const left = createEmptyTrack({
      name: `${selected.name} A`,
      role: selected.role,
      color: selected.color,
      volume: selected.volume,
      pan: selected.pan,
      offset: selected.offset,
      fadeIn: selected.fadeIn,
      fadeOut: 0.05,
    })
    left.buffer = a
    left.url = bufferToUrl(a)
    const right = createEmptyTrack({
      name: `${selected.name} B`,
      role: selected.role,
      color: selected.color,
      volume: selected.volume,
      pan: selected.pan,
      offset: selected.offset + a.duration,
      fadeIn: 0.05,
      fadeOut: selected.fadeOut,
    })
    right.buffer = b
    right.url = bufferToUrl(b)
    setTracks((prev) => {
      const idx = prev.findIndex((t) => t.id === selected.id)
      const doomed = prev[idx]
      revokeUrl(doomed?.url || null)
      const next = [...prev]
      next.splice(idx, 1, left, right)
      return next
    })
    setSelectedId(left.id)
    setOk('Split into two tracks')
  }

  function bounceSelectedToStem() {
    if (!selected?.buffer) return
    pushHistory()
    const bounced = applyGainAndFades(
      cloneAudioBuffer(selected.buffer),
      selected.volume,
      selected.fadeIn,
      selected.fadeOut,
    )
    const stem = createEmptyTrack({
      name: `${selected.name} bounce`,
      role: 'custom',
      color: TRACK_COLORS[(tracks.length + 1) % TRACK_COLORS.length],
      offset: selected.offset,
    })
    stem.buffer = bounced
    stem.url = bufferToUrl(bounced)
    setTracks((prev) => [...prev, stem])
    setSelectedId(stem.id)
    setOk('Bounced track to new stem')
  }

  async function applyMasterBus(ids: EffectId[]) {
    if (!hasAudio) return
    pushHistory()
    setBusy('Processing master bus…')
    try {
      let mixed = mixdownTracks(tracks)
      mixed = applyGainAndFades(mixed, masterGain, masterFadeIn, masterFadeOut)
      for (const id of ids) mixed = await applyEffect(mixed, id)
      // Replace session with a single master stem (keeps empty scaffolding tracks)
      const master = createEmptyTrack({
        name: 'Master mix',
        role: 'master',
        color: '#53D6FF',
        armed: true,
      })
      master.buffer = mixed
      master.url = bufferToUrl(mixed)
      tracks.forEach((t) => revokeUrl(t.url))
      setTracks([
        master,
        createEmptyTrack({ name: 'Vocal (new take)', role: 'vocal', color: '#7CFFB2' }),
        createEmptyTrack({ name: 'Music bed', role: 'bed', color: '#FFB86B', volume: 0.35 }),
      ])
      setSelectedId(master.id)
      setOk('Master bus bounced — ready to export')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Master bus failed')
    } finally {
      setBusy(null)
    }
  }

  async function exportAudio(kind: 'wav' | 'mp3', thenPublish = false) {
    if (!hasAudio) {
      setError('Nothing to export — record or import onto a track first')
      return
    }
    setBusy(thenPublish ? 'Mixing, saving & preparing publish…' : kind === 'wav' ? 'Mixing WAV…' : 'Mixing MP3…')
    setError(null)
    setOk(null)
    try {
      const mixedRaw =
        regionRef.current != null
          ? mixdownTracks(tracks, {
              startSec: regionRef.current.start,
              endSec: regionRef.current.end,
            })
          : mixdownTracks(tracks)
      let mixed = applyGainAndFades(mixedRaw, masterGain, masterFadeIn, masterFadeOut)
      // Final polish: gentle limit on master
      mixed = await applyEffect(mixed, 'limit')
      const blob = kind === 'wav' ? encodeWav(mixed) : await encodeMp3(mixed)
      const ext = kind === 'wav' ? 'wav' : 'mp3'
      const file = new File(
        [blob],
        `${title.replace(/[^\w]+/g, '-').slice(0, 48) || 'episode'}-mix.${ext}`,
        { type: blob.type },
      )
      await onExported(file, mixed.duration)
      setOk(thenPublish ? 'Mix saved to site host' : `Saved ${ext.toUpperCase()} mix to episode`)
      if (thenPublish && onPublished) await onPublished()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  const durationLabel = formatClock(sessionDuration(tracks))
  const peakDb = meter ? dbFromLinear(meter.peak) : null
  const rmsDb = meter ? dbFromLinear(meter.rms) : null

  return (
    <div className="rounded-2xl border border-[#27313B] bg-[#0C141C] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#27313B] flex flex-wrap items-center justify-between gap-3 bg-[#11161C]">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#8DEBFF]">Multi-track vocal studio</p>
          <p className="text-sm text-[#B8C4CF]">
            Tracks · mute/solo/arm · pan · effects · mixdown · host & publish to Apple / Spotify / Amazon RSS
          </p>
        </div>
        <div className="text-right text-xs font-mono text-[#A9B8C6] space-y-0.5">
          <p>
            {recording ? '● REC' : busy || (ready ? `Session ${durationLabel}` : 'Idle')}
          </p>
          {peakDb != null && Number.isFinite(peakDb) && (
            <p>
              Peak {peakDb.toFixed(1)} dB · RMS {rmsDb != null && Number.isFinite(rmsDb) ? rmsDb.toFixed(1) : '—'} dB
            </p>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Transport */}
        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" className={recording ? danger : primary} onClick={() => void toggleRecord()}>
            {recording ? (
              <>
                <Square size={14} /> Stop
              </>
            ) : (
              <>
                <Mic2 size={14} /> Record armed
              </>
            )}
          </button>
          <select id="rec-mode" className={select} defaultValue="replace" title="How new takes land on the armed track">
            <option value="replace">Replace clip</option>
            <option value="append">Append</option>
            <option value="overdub">Overdub mix</option>
          </select>
          <button type="button" className={btn} disabled={!ready} onClick={() => waveRef.current?.playPause()}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? 'Pause' : 'Play mix'}
          </button>
          <button type="button" className={btn} disabled={!ready} onClick={() => nudge(-5)}>
            <SkipBack size={14} /> 5s
          </button>
          <button type="button" className={btn} disabled={!ready} onClick={() => nudge(5)}>
            5s <SkipForward size={14} />
          </button>
          <button type="button" className={btn} disabled={!ready} onClick={() => setBound('start')}>
            In
          </button>
          <button type="button" className={btn} disabled={!ready} onClick={() => setBound('end')}>
            Out
          </button>
          <button type="button" className={btn} disabled={historyLen === 0} onClick={() => void undo()}>
            <Undo2 size={14} /> Undo
          </button>
          <label className={btn + ' cursor-pointer'}>
            Import → selected
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.webm"
              className="hidden"
              onChange={(e) => void onUploadPick(e.target.files?.[0] || null)}
            />
          </label>
          <button
            type="button"
            className={loop ? primary : btn}
            onClick={() => setLoop((v) => !v)}
          >
            Loop region
          </button>
          <button
            type="button"
            className={metronome ? primary : btn}
            onClick={() => setMetronome((v) => !v)}
          >
            Metronome
          </button>
          {metronome && (
            <label className="text-xs text-[#A9B8C6] flex items-center gap-2">
              BPM
              <input
                type="number"
                min={40}
                max={200}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value) || 90)}
                className="w-16 rounded border border-[#27313B] bg-[#151B22] px-2 py-1 text-[#F6FAFC]"
              />
            </label>
          )}
        </div>

        {/* Track list */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF]">Tracks</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={btn} onClick={() => addTrack('vocal')}>
                <Plus size={14} /> Vocal
              </button>
              <button type="button" className={btn} onClick={() => addTrack('guest')}>
                <Plus size={14} /> Guest
              </button>
              <button type="button" className={btn} onClick={() => addTrack('bed')}>
                <Plus size={14} /> Bed
              </button>
              <button type="button" className={btn} onClick={() => addTrack('sfx')}>
                <Plus size={14} /> SFX
              </button>
              <button type="button" className={btn} onClick={() => addTrack('custom')}>
                <Plus size={14} /> Track
              </button>
            </div>
          </div>

          {tracks.map((track) => {
            const active = selected?.id === track.id
            return (
              <div
                key={track.id}
                className={`rounded-xl border p-2.5 space-y-2 ${
                  active ? 'border-[#53D6FF]/60 bg-[#121A22]' : 'border-[#1A232C] bg-[#0A1016]'
                }`}
                onClick={() => setSelectedId(track.id)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ background: track.color }}
                    title={track.role}
                  />
                  <input
                    value={track.name}
                    onChange={(e) => updateTrack(track.id, { name: e.target.value })}
                    className="min-w-[7rem] flex-1 rounded border border-[#27313B] bg-[#151B22] px-2 py-1 text-sm text-[#F6FAFC]"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    className={track.muted ? danger : chip}
                    title="Mute"
                    onClick={(e) => {
                      e.stopPropagation()
                      updateTrack(track.id, { muted: !track.muted })
                    }}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    className={track.solo ? primary : chip}
                    title="Solo"
                    onClick={(e) => {
                      e.stopPropagation()
                      updateTrack(track.id, { solo: !track.solo })
                    }}
                  >
                    S
                  </button>
                  <button
                    type="button"
                    className={track.armed ? danger : chip}
                    title="Arm for record"
                    onClick={(e) => {
                      e.stopPropagation()
                      armOnly(track.id)
                    }}
                  >
                    R
                  </button>
                  <button
                    type="button"
                    className={chip}
                    title="Duplicate"
                    onClick={(e) => {
                      e.stopPropagation()
                      duplicateTrack(track.id)
                    }}
                  >
                    <CopyPlus size={12} />
                  </button>
                  <button
                    type="button"
                    className={chip}
                    title="Clear audio"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearTrack(track.id)
                    }}
                  >
                    <Minus size={12} />
                  </button>
                  <button
                    type="button"
                    className={chip}
                    title="Remove track"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeTrack(track.id)
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                <div
                  ref={(el) => {
                    trackHostRefs.current[track.id] = el
                  }}
                  className="rounded-lg bg-[#05070A] min-h-[56px] border border-[#1A232C]"
                />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-[#A9B8C6]">
                  <label>
                    Vol {track.volume.toFixed(2)}
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.02}
                      value={track.volume}
                      onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })}
                      className="w-full accent-[#53D6FF]"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </label>
                  <label>
                    Pan {track.pan.toFixed(2)}
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={track.pan}
                      onChange={(e) => updateTrack(track.id, { pan: Number(e.target.value) })}
                      className="w-full accent-[#53D6FF]"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </label>
                  <label>
                    Offset {track.offset.toFixed(2)}s
                    <input
                      type="range"
                      min={0}
                      max={30}
                      step={0.05}
                      value={track.offset}
                      onChange={(e) => updateTrack(track.id, { offset: Number(e.target.value) })}
                      className="w-full accent-[#53D6FF]"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </label>
                  <label>
                    Fade {track.fadeIn.toFixed(1)}/{track.fadeOut.toFixed(1)}s
                    <div className="flex gap-1">
                      <input
                        type="range"
                        min={0}
                        max={4}
                        step={0.05}
                        value={track.fadeIn}
                        onChange={(e) => updateTrack(track.id, { fadeIn: Number(e.target.value) })}
                        className="w-1/2 accent-[#53D6FF]"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <input
                        type="range"
                        min={0}
                        max={4}
                        step={0.05}
                        value={track.fadeOut}
                        onChange={(e) => updateTrack(track.id, { fadeOut: Number(e.target.value) })}
                        className="w-1/2 accent-[#53D6FF]"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </label>
                </div>
              </div>
            )
          })}
        </div>

        {/* Master bus waveform */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF] mb-2">
            Master mix · export region {ready ? `${formatClock(range.start)} – ${formatClock(range.end)}` : ''}
          </p>
          <div
            ref={masterHostRef}
            className="rounded-xl bg-[#05070A] px-2 py-3 min-h-[128px] border border-[#1A232C] relative"
          >
            {!masterUrl && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-[#A9B8C6] pointer-events-none">
                Record or import onto tracks — the master mix appears here
              </p>
            )}
          </div>
          <div className="mt-3 grid sm:grid-cols-4 gap-3 text-xs text-[#A9B8C6]">
            <label>
              Zoom {zoom}px/s
              <input
                type="range"
                min={20}
                max={200}
                step={5}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-[#53D6FF]"
              />
            </label>
            <label>
              Master vol {masterGain.toFixed(2)}
              <input
                type="range"
                min={0.2}
                max={2}
                step={0.05}
                value={masterGain}
                onChange={(e) => setMasterGain(Number(e.target.value))}
                className="w-full accent-[#53D6FF]"
              />
            </label>
            <label>
              Master fade in {masterFadeIn.toFixed(1)}s
              <input
                type="range"
                min={0}
                max={4}
                step={0.1}
                value={masterFadeIn}
                onChange={(e) => setMasterFadeIn(Number(e.target.value))}
                className="w-full accent-[#53D6FF]"
              />
            </label>
            <label>
              Master fade out {masterFadeOut.toFixed(1)}s
              <input
                type="range"
                min={0}
                max={4}
                step={0.1}
                value={masterFadeOut}
                onChange={(e) => setMasterFadeOut(Number(e.target.value))}
                className="w-full accent-[#53D6FF]"
              />
            </label>
          </div>
        </div>

        {/* Effects + clip tools */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#8DEBFF] mb-2">
            Effects rack {selected ? `· ${selected.name}` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {EFFECT_META.map((fx) => (
              <button
                key={fx.id}
                type="button"
                title={fx.hint}
                disabled={!selected?.buffer || Boolean(busy)}
                onClick={() => void runEffect(fx.id)}
                className="px-3 py-2 rounded-lg border border-[#27313B] bg-[#151B22] text-sm text-[#F6FAFC] hover:border-[#53D6FF]/50 disabled:opacity-40"
              >
                {fx.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" className={btn} disabled={!selected?.buffer} onClick={splitSelectedAtPlayhead}>
              Split at playhead
            </button>
            <button type="button" className={btn} disabled={!selected?.buffer} onClick={bounceSelectedToStem}>
              Bounce track → stem
            </button>
            <button
              type="button"
              className={btn}
              disabled={!hasAudio || Boolean(busy)}
              onClick={() => void applyMasterBus(['normalize', 'compress', 'limit'])}
            >
              Vocal polish → bounce master
            </button>
            <button
              type="button"
              className={btn}
              disabled={!hasAudio || Boolean(busy)}
              onClick={() => void applyMasterBus(['normalize', 'limit'])}
            >
              Normalize + limit master
            </button>
          </div>
          {applied.length > 0 && (
            <p className="mt-2 text-xs text-[#A9B8C6]">
              Chain: {applied.map((id) => EFFECT_META.find((e) => e.id === id)?.label || id).join(' → ')}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1 border-t border-[#27313B]">
          <button
            type="button"
            className={primary}
            disabled={!hasAudio || Boolean(busy)}
            onClick={() => void exportAudio('mp3')}
          >
            {busy?.includes('MP3') ? busy : 'Save mix MP3 (hosted)'}
          </button>
          <button
            type="button"
            className={btn}
            disabled={!hasAudio || Boolean(busy)}
            onClick={() => void exportAudio('wav')}
          >
            {busy?.includes('WAV') ? busy : 'Save mix WAV'}
          </button>
          {onPublished && (
            <button
              type="button"
              className={primary}
              disabled={!hasAudio || Boolean(busy)}
              onClick={() => void exportAudio('mp3', true)}
            >
              Save mix + publish to site / RSS
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}
        {ok && <p className="text-sm text-[#8DEBFF]">{ok}</p>}
        <p className="text-[11px] text-[#A9B8C6]">
          Multi-track mix is hosted on your site (Supabase media). Public feed{' '}
          <code className="text-[#8DEBFF]">/podcast/rss.xml</code> powers Apple Podcasts, Spotify for
          Podcasters, and Amazon Music — submit that URL once; new published mixes appear automatically.
        </p>
      </div>
    </div>
  )
}

const btn =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF] disabled:opacity-40'
const chip =
  'inline-flex items-center justify-center h-7 min-w-[1.75rem] px-1.5 rounded border border-[#27313B] text-xs text-[#B8C4CF]'
const primary =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium disabled:opacity-40'
const danger =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/90 text-white text-sm font-medium'
const select =
  'rounded-lg border border-[#27313B] bg-[#151B22] px-2 py-1.5 text-sm text-[#B8C4CF]'
