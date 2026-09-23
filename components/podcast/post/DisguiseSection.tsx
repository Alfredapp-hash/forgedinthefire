'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Play, Square, X } from 'lucide-react'
import {
  DISGUISE_PRESETS,
  DISGUISE_WARNING,
  disguiseMono,
  type DisguisePresetId,
} from '@/lib/podcast/safety/voice-disguise'
import type { DisguiseRegion } from '@/lib/podcast/safety/render'
import { Btn, StepHeading, cardCls, clock, inputCls, labelCls, parseClock } from './ui'

type Props = {
  regions: (DisguiseRegion & { preset: DisguisePresetId })[]
  onChange: (next: (DisguiseRegion & { preset: DisguisePresetId })[]) => void
  duration: number
  getSource: () => Promise<AudioBuffer>
  disabled: boolean
  onError: (msg: string) => void
}

export function DisguiseSection({ regions, onChange, duration, getSource, disabled, onError }: Props) {
  const [preset, setPreset] = useState<DisguisePresetId>('lower')
  const [scope, setScope] = useState<'whole' | 'range'>('range')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)
  const srcRef = useRef<AudioBufferSourceNode | null>(null)

  useEffect(() => () => {
    srcRef.current?.stop()
    void ctxRef.current?.close()
  }, [])

  function add() {
    let s = 0
    let e = duration
    if (scope === 'range') {
      const a = parseClock(start)
      const b = parseClock(end)
      if (a == null || b == null || b <= a) return onError('Enter a start and end time like 4:10 and 18:45.')
      s = a
      e = b
    }
    if (!e || e <= s) return onError('The episode length is unknown — load the audio first.')
    onChange([...regions, { start: s, end: e, settings: DISGUISE_PRESETS[preset].settings, preset }].sort((x, y) => x.start - y.start))
    setStart('')
    setEnd('')
  }

  async function preview(id: string, from: number, presetId: DisguisePresetId) {
    if (previewing === id) {
      srcRef.current?.stop()
      setPreviewing(null)
      return
    }
    srcRef.current?.stop()
    setPreviewBusy(true)
    try {
      const buffer = await getSource()
      const rate = buffer.sampleRate
      const a = Math.floor(Math.max(0, from) * rate)
      const len = Math.min(buffer.length - a, Math.floor(8 * rate))
      if (len <= 0) throw new Error('Start is past the end of the audio.')
      const mono = new Float32Array(len)
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const d = buffer.getChannelData(c)
        for (let i = 0; i < len; i++) mono[i] += d[a + i] / buffer.numberOfChannels
      }
      const wet = await disguiseMono(mono, rate, DISGUISE_PRESETS[presetId].settings)
      const ctx = ctxRef.current ?? new AudioContext()
      ctxRef.current = ctx
      const out = ctx.createBuffer(1, len, rate)
      out.copyToChannel(wet, 0)
      const src = ctx.createBufferSource()
      src.buffer = out
      src.connect(ctx.destination)
      src.onended = () => setPreviewing((p) => (p === id ? null : p))
      srcRef.current = src
      src.start()
      setPreviewing(id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setPreviewBusy(false)
    }
  }

  const draftStart = scope === 'whole' ? 0 : parseClock(start) ?? 0

  return (
    <div className={cardCls}>
      <StepHeading
        n={3}
        title="Disguise a voice"
        hint="Changes the pitch and the shape of the voice so a speaker is harder to recognise. Apply it to the guest’s part of the conversation or to the whole episode. Processing happens in this browser (roughly 5–10 seconds per minute of audio)."
      />
      <p className="flex items-start gap-2 rounded-lg border border-[#FFB86B]/40 bg-[#FFB86B]/10 px-3 py-2 text-sm text-[#FFE0B8]" role="note">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>{DISGUISE_WARNING} For real anonymity, consider re-recording the words with a different voice actor.</span>
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className={labelCls}>Style</span>
          <select value={preset} onChange={(e) => setPreset(e.target.value as DisguisePresetId)} className={inputCls} disabled={disabled}>
            {(Object.keys(DISGUISE_PRESETS) as DisguisePresetId[]).map((id) => (
              <option key={id} value={id}>{DISGUISE_PRESETS[id].label} — {DISGUISE_PRESETS[id].hint}</option>
            ))}
          </select>
        </label>
        <div role="radiogroup" aria-label="Where to apply">
          <span className={labelCls}>Apply to</span>
          <div className="flex gap-2">
            {(['range', 'whole'] as const).map((s) => (
              <label key={s} className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm ${scope === s ? 'border-[#53D6FF] bg-[#1A232C] text-[#F6FAFC]' : 'border-[#27313B] text-[#B8C4CF]'}`}>
                <input type="radio" name="disguise-scope" className="sr-only" checked={scope === s} onChange={() => setScope(s)} />
                {s === 'range' ? 'A time range' : 'Whole episode'}
              </label>
            ))}
          </div>
        </div>
      </div>
      {scope === 'range' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label><span className={labelCls}>From</span><input value={start} onChange={(e) => setStart(e.target.value)} placeholder="4:10" className={inputCls} /></label>
          <label><span className={labelCls}>To</span><input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="18:45" className={inputCls} /></label>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Btn tone="accent" disabled={disabled || previewBusy} onClick={() => void preview('draft', draftStart, preset)}>
          {previewing === 'draft' ? <Square size={12} /> : <Play size={12} />} {previewBusy ? 'Preparing…' : previewing === 'draft' ? 'Stop' : 'Hear 8-second preview'}
        </Btn>
        <Btn tone="primary" disabled={disabled} onClick={add}>Add to plan</Btn>
      </div>
      {regions.length > 0 && (
        <ul className="space-y-1" aria-label="Voice disguise plan">
          {regions.map((r, i) => (
            <li key={`${r.start}-${i}`} className="flex flex-wrap items-center gap-2 text-sm text-[#B8C4CF]">
              <Btn onClick={() => void preview(`r${i}`, r.start, r.preset)} disabled={previewBusy}>
                {previewing === `r${i}` ? <Square size={12} /> : <Play size={12} />} Preview
              </Btn>
              <span>{DISGUISE_PRESETS[r.preset].label}: {r.start <= 0 && r.end >= duration - 0.5 ? 'whole episode' : `${clock(r.start)} – ${clock(r.end)}`}</span>
              <button type="button" onClick={() => onChange(regions.filter((_, j) => j !== i))} className="text-red-200" aria-label="Remove from plan">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
