'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Play, Square, X } from 'lucide-react'
import { SegmentedControl, Select } from '@/components/studio-ui'
import {
  DISGUISE_PRESETS,
  DISGUISE_WARNING,
  disguiseMono,
  type DisguisePresetId,
} from '@/lib/podcast/safety/voice-disguise'
import type { DisguiseRegion } from '@/lib/podcast/safety/render'
import { Btn, Note, clock, inputCls, labelCls, parseClock } from './ui'

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
    <div className="space-y-3">
      <Note tone="block" role="note">
        <AlertTriangle size={14} className="mr-1 inline-block align-[-2px]" aria-hidden />
        {DISGUISE_WARNING} For real anonymity, consider re-recording the words with a different voice actor.
      </Note>
      <div className="grid gap-3 md:grid-cols-2">
        <Select label="Style" value={preset} onChange={(e) => setPreset(e.target.value as DisguisePresetId)} disabled={disabled} hint={DISGUISE_PRESETS[preset].hint}>
          {(Object.keys(DISGUISE_PRESETS) as DisguisePresetId[]).map((id) => (
            <option key={id} value={id}>{DISGUISE_PRESETS[id].label}</option>
          ))}
        </Select>
        <div>
          <span className={labelCls}>Apply to</span>
          <SegmentedControl
            aria-label="Where to apply"
            value={scope}
            onValueChange={setScope}
            options={[
              { value: 'range', label: 'A time range' },
              { value: 'whole', label: 'Whole episode' },
            ]}
          />
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
          {previewing === 'draft' ? <Square size={12} /> : <Play size={12} />} {previewBusy ? 'Preparing…' : previewing === 'draft' ? 'Stop' : 'Hear an 8-second preview'}
        </Btn>
        <Btn tone="primary" disabled={disabled} onClick={add}>Add to plan</Btn>
      </div>
      {regions.length > 0 && (
        <ul className="space-y-1" aria-label="Voice disguise plan">
          {regions.map((r, i) => (
            <li key={`${r.start}-${i}`} className="studio-type-body flex flex-wrap items-center gap-2 text-[13px] text-silver-body">
              <Btn onClick={() => void preview(`r${i}`, r.start, r.preset)} disabled={previewBusy}>
                {previewing === `r${i}` ? <Square size={12} /> : <Play size={12} />} Preview
              </Btn>
              <span>{DISGUISE_PRESETS[r.preset].label}: {r.start <= 0 && r.end >= duration - 0.5 ? 'whole episode' : `${clock(r.start)} – ${clock(r.end)}`}</span>
              <button type="button" onClick={() => onChange(regions.filter((_, j) => j !== i))} className="text-silver hover:text-heart" aria-label="Remove from plan">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
