'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BRAND,
  FORMAT_LABELS,
  FORMAT_PX,
  type CanvasFormat,
  type StudioCanvas,
  type StudioTemplate,
} from '@/lib/studio/types'
import { emptyCanvas, normalizeCanvas, renderStudioCanvas } from '@/lib/studio/canvas'

const FORMATS = Object.keys(FORMAT_PX) as CanvasFormat[]

type Props = {
  value?: unknown
  format?: string
  onChange: (canvas: StudioCanvas) => void
  templates?: StudioTemplate[]
}

export function StudioCanvasEditor({ value, format, onChange, templates = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<StudioCanvas>(() =>
    normalizeCanvas(value, (format as CanvasFormat) || '9:16'),
  )
  const [previewH, setPreviewH] = useState(420)

  const px = FORMAT_PX[state.format]
  const scale = useMemo(() => previewH / px.h, [previewH, px.h])

  useEffect(() => {
    setState(normalizeCanvas(value, (format as CanvasFormat) || state.format))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value), format])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return
    const w = Math.round(px.w * scale)
    const h = Math.round(px.h * scale)
    preview.width = w
    preview.height = h
    const ctx = preview.getContext('2d')
    if (!ctx) return
    void renderStudioCanvas(ctx, state, w, h)
  }, [state, px.w, px.h, scale])

  function commit(next: StudioCanvas) {
    setState(next)
    onChange(next)
  }

  async function exportPng() {
    const node = canvasRef.current
    if (!node) return
    node.width = px.w
    node.height = px.h
    const ctx = node.getContext('2d')
    if (!ctx) return
    await renderStudioCanvas(ctx, state, px.w, px.h)
    node.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fitf-${state.format.replace(':', 'x')}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)_280px]">
      <aside className="space-y-4 hidden md:block">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#8DEBFF]">Brand kit</p>
        <div className="flex gap-2">
          {[BRAND.ink, BRAND.panel, BRAND.ice, BRAND.glow, BRAND.paper].map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              className="h-7 w-7 rounded-full border border-[#27313B]"
              style={{ background: color }}
              onClick={() => commit({
                ...state,
                background: { ...state.background, color, kind: 'color' },
              })}
            />
          ))}
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#A9B8C6] mb-2">Format</p>
          <div className="space-y-1">
            {FORMATS.map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => commit({ ...state, format: fmt })}
                className={`w-full text-left text-xs px-3 py-2 rounded-lg border ${
                  state.format === fmt
                    ? 'border-[#53D6FF] text-[#8DEBFF] bg-[#53D6FF]/10'
                    : 'border-[#27313B] text-[#B8C4CF]'
                }`}
              >
                {FORMAT_LABELS[fmt]}
              </button>
            ))}
          </div>
        </div>
        {templates.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#A9B8C6] mb-2">Templates</p>
            <div className="space-y-1">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => commit(normalizeCanvas(tpl.canvas, (tpl.format as CanvasFormat) || state.format))}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border border-[#27313B] text-[#F6FAFC] hover:border-[#53D6FF]"
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <div className="flex flex-col items-center">
        <div
          className="relative rounded-[2px] p-4"
          style={{
            background: 'linear-gradient(180deg,#0C141C,#05070A)',
            boxShadow: 'inset 0 0 0 1px rgba(83,214,255,0.18)',
          }}
        >
          <span className="absolute top-1 left-1 h-3 w-3 border-l border-t border-[#53D6FF]" />
          <span className="absolute top-1 right-1 h-3 w-3 border-r border-t border-[#53D6FF]" />
          <span className="absolute bottom-1 left-1 h-3 w-3 border-l border-b border-[#53D6FF]" />
          <span className="absolute bottom-1 right-1 h-3 w-3 border-r border-b border-[#53D6FF]" />
          <canvas ref={previewRef} className="max-w-full h-auto block bg-[#05070A]" />
        </div>
        <canvas ref={canvasRef} className="hidden" />
        <div className="flex items-center gap-3 mt-4">
          <label className="text-xs text-[#A9B8C6]">
            Preview
            <input
              type="range"
              min={280}
              max={640}
              value={previewH}
              onChange={(e) => setPreviewH(Number(e.target.value))}
              className="ml-2 align-middle"
            />
          </label>
          <button
            type="button"
            onClick={() => void exportPng()}
            className="px-3 py-1.5 rounded-lg bg-[#53D6FF] text-[#061016] text-sm font-medium"
          >
            Export PNG
          </button>
          <button
            type="button"
            onClick={() => commit(emptyCanvas(state.format))}
            className="px-3 py-1.5 rounded-lg border border-[#27313B] text-sm text-[#B8C4CF]"
          >
            Reset
          </button>
        </div>
      </div>

      <aside className="space-y-3">
        <Field label="Headline">
          <textarea
            value={state.headline.text}
            onChange={(e) => commit({ ...state, headline: { ...state.headline, text: e.target.value } })}
            rows={3}
            className={fieldClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Headline color">
            <input
              type="color"
              value={state.headline.color}
              onChange={(e) => commit({ ...state, headline: { ...state.headline, color: e.target.value } })}
              className="h-9 w-full bg-transparent"
            />
          </Field>
          <Field label="Size">
            <input
              type="number"
              value={state.headline.size}
              onChange={(e) => commit({ ...state, headline: { ...state.headline, size: Number(e.target.value) } })}
              className={fieldClass}
            />
          </Field>
        </div>
        <Field label="Body">
          <textarea
            value={state.body.text}
            onChange={(e) => commit({ ...state, body: { ...state.body, text: e.target.value } })}
            rows={3}
            className={fieldClass}
          />
        </Field>
        <Field label="Background">
          <div className="flex gap-2">
            <input
              type="color"
              value={state.background.color}
              onChange={(e) => commit({
                ...state,
                background: { ...state.background, color: e.target.value },
              })}
            />
            <input
              type="color"
              value={state.background.color2 || BRAND.panel}
              onChange={(e) => commit({
                ...state,
                background: { kind: 'gradient', color: state.background.color, color2: e.target.value },
              })}
            />
          </div>
        </Field>
        <Field label="Optional image URL (soft overlay, never graphic)">
          <input
            value={state.image?.url || ''}
            onChange={(e) => commit({
              ...state,
              image: e.target.value ? { url: e.target.value, opacity: state.image?.opacity ?? 0.28 } : undefined,
            })}
            className={fieldClass}
            placeholder="https://…"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-[#B8C4CF]">
          <input
            type="checkbox"
            checked={state.logo.visible}
            onChange={(e) => commit({ ...state, logo: { visible: e.target.checked } })}
          />
          Show lockup
        </label>
        <label className="flex items-center gap-2 text-sm text-[#B8C4CF]">
          <input
            type="checkbox"
            checked={state.cta.visible}
            onChange={(e) => commit({ ...state, cta: { ...state.cta, visible: e.target.checked } })}
          />
          CTA bar
        </label>
        {state.cta.visible && (
          <input
            value={state.cta.text}
            onChange={(e) => commit({ ...state, cta: { ...state.cta, text: e.target.value } })}
            className={fieldClass}
          />
        )}
      </aside>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-[0.16em] text-[#A9B8C6] mb-1">{label}</span>
      {children}
    </label>
  )
}

const fieldClass =
  'w-full rounded-lg border border-[#27313B] bg-[#05070A] px-3 py-2 text-sm text-[#F6FAFC] focus:outline-none focus:border-[#53D6FF]'
