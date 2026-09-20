'use client'

import type { ContentBlock } from './types'
import { BLOCK_BY_TYPE } from './blockRegistry'

type Props = {
  block: ContentBlock
  index: number
  onChange: (block: ContentBlock) => void
  onOpenMedia?: (field: string, callback: (url: string) => void) => void
}

const inputClass =
  'w-full border border-[#27313B] rounded-lg px-3 py-2 text-sm bg-[#05070A] text-[#F6FAFC] placeholder:text-[#A9B8C6] focus:outline-none focus:border-[#53D6FF]'
const labelClass = 'block text-xs font-semibold text-[#A9B8C6] mb-1'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  )
}

export default function BlockEditor({ block, index, onChange, onOpenMedia }: Props) {
  const meta = BLOCK_BY_TYPE[block.type]
  const update = (data: Record<string, unknown>) =>
    onChange({ ...block, data: { ...block.data, ...data } } as ContentBlock)

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-[#A9B8C6]">
        {meta?.icon} {meta?.label ?? block.type} · Block {index + 1}
      </p>

      {block.type === 'hero' && (
        <>
          <Field label="Title"><input className={inputClass} value={block.data.title} onChange={(e) => update({ title: e.target.value })} /></Field>
          <Field label="Subtitle"><input className={inputClass} value={block.data.subtitle ?? ''} onChange={(e) => update({ subtitle: e.target.value })} /></Field>
          <Field label="Background Image URL">
            <div className="flex gap-2">
              <input className={inputClass} value={block.data.image ?? ''} onChange={(e) => update({ image: e.target.value })} />
              {onOpenMedia && (
                <button type="button" className="text-xs px-2 py-1 border rounded-lg shrink-0" onClick={() => onOpenMedia('image', (url) => update({ image: url }))}>Browse</button>
              )}
            </div>
          </Field>
        </>
      )}

      {block.type === 'intro' && (
        <Field label="Introduction"><textarea className={inputClass} rows={3} value={block.data.text} onChange={(e) => update({ text: e.target.value })} /></Field>
      )}

      {block.type === 'heading' && (
        <>
          <Field label="Heading Text"><input className={inputClass} value={block.data.text} onChange={(e) => update({ text: e.target.value })} /></Field>
          <Field label="Level">
            <select className={inputClass} value={block.data.level} onChange={(e) => update({ level: Number(e.target.value) as 2 | 3 | 4 })}>
              <option value={2}>H2</option><option value={3}>H3</option><option value={4}>H4</option>
            </select>
          </Field>
        </>
      )}

      {block.type === 'text' && (
        <Field label="Content"><textarea className={inputClass} rows={6} value={block.data.content} onChange={(e) => update({ content: e.target.value })} /></Field>
      )}

      {block.type === 'quickAnswer' && (
        <>
          <Field label="Question"><input className={inputClass} value={block.data.question} onChange={(e) => update({ question: e.target.value })} /></Field>
          <Field label="Answer"><textarea className={inputClass} rows={3} value={block.data.answer} onChange={(e) => update({ answer: e.target.value })} /></Field>
        </>
      )}

      {block.type === 'checklist' && (
        <>
          <Field label="Title"><input className={inputClass} value={block.data.title ?? ''} onChange={(e) => update({ title: e.target.value })} /></Field>
          {block.data.items.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input className={inputClass} value={item.text} onChange={(e) => {
                const items = [...block.data.items]
                items[i] = { ...items[i], text: e.target.value }
                update({ items })
              }} />
              <button type="button" className="text-[#8DEBFF] text-xs" onClick={() => update({ items: block.data.items.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
          <button type="button" className="text-xs text-[#53D6FF]" onClick={() => update({ items: [...block.data.items, { text: '' }] })}>+ Add item</button>
        </>
      )}

      {block.type === 'faq' && (
        <>
          {block.data.items.map((item, i) => (
            <div key={i} className="border border-[#27313B] rounded-lg p-3 space-y-2">
              <Field label="Question"><input className={inputClass} value={item.question} onChange={(e) => {
                const items = [...block.data.items]; items[i] = { ...items[i], question: e.target.value }; update({ items })
              }} /></Field>
              <Field label="Answer"><textarea className={inputClass} rows={2} value={item.answer} onChange={(e) => {
                const items = [...block.data.items]; items[i] = { ...items[i], answer: e.target.value }; update({ items })
              }} /></Field>
            </div>
          ))}
          <button type="button" className="text-xs text-[#53D6FF]" onClick={() => update({ items: [...block.data.items, { question: '', answer: '' }] })}>+ Add FAQ</button>
        </>
      )}

      {block.type === 'quote' && (
        <>
          <Field label="Quote"><textarea className={inputClass} rows={3} value={block.data.text} onChange={(e) => update({ text: e.target.value })} /></Field>
          <Field label="Author"><input className={inputClass} value={block.data.author ?? ''} onChange={(e) => update({ author: e.target.value })} /></Field>
          <Field label="Role"><input className={inputClass} value={block.data.role ?? ''} onChange={(e) => update({ role: e.target.value })} /></Field>
        </>
      )}

      {block.type === 'testimonial' && (
        <>
          <Field label="Testimonial"><textarea className={inputClass} rows={3} value={block.data.text} onChange={(e) => update({ text: e.target.value })} /></Field>
          <Field label="Author"><input className={inputClass} value={block.data.author} onChange={(e) => update({ author: e.target.value })} /></Field>
          <Field label="Role"><input className={inputClass} value={block.data.role ?? ''} onChange={(e) => update({ role: e.target.value })} /></Field>
        </>
      )}

      {block.type === 'teamMember' && (
        <>
          <Field label="Name"><input className={inputClass} value={block.data.name} onChange={(e) => update({ name: e.target.value })} /></Field>
          <Field label="Role"><input className={inputClass} value={block.data.role} onChange={(e) => update({ role: e.target.value })} /></Field>
          <Field label="Bio"><textarea className={inputClass} rows={2} value={block.data.bio ?? ''} onChange={(e) => update({ bio: e.target.value })} /></Field>
        </>
      )}

      {block.type === 'imageText' && (
        <>
          <Field label="Image URL">
            <div className="flex gap-2">
              <input className={inputClass} value={block.data.image} onChange={(e) => update({ image: e.target.value })} />
              {onOpenMedia && <button type="button" className="text-xs px-2 py-1 border rounded-lg" onClick={() => onOpenMedia('image', (url) => update({ image: url }))}>Browse</button>}
            </div>
          </Field>
          <Field label="Alt Text"><input className={inputClass} value={block.data.imageAlt} onChange={(e) => update({ imageAlt: e.target.value })} /></Field>
          <Field label="Position">
            <select className={inputClass} value={block.data.imagePosition} onChange={(e) => update({ imagePosition: e.target.value as 'left' | 'right' })}>
              <option value="left">Image Left</option><option value="right">Image Right</option>
            </select>
          </Field>
          <Field label="Title"><input className={inputClass} value={block.data.title ?? ''} onChange={(e) => update({ title: e.target.value })} /></Field>
          <Field label="Content"><textarea className={inputClass} rows={4} value={block.data.content} onChange={(e) => update({ content: e.target.value })} /></Field>
        </>
      )}

      {block.type === 'cta' && (
        <>
          <Field label="Button Text"><input className={inputClass} value={block.data.text} onChange={(e) => update({ text: e.target.value })} /></Field>
          <Field label="URL"><input className={inputClass} value={block.data.url} onChange={(e) => update({ url: e.target.value })} /></Field>
          <Field label="Style">
            <select className={inputClass} value={block.data.style ?? 'primary'} onChange={(e) => update({ style: e.target.value as 'primary' | 'secondary' | 'outline' })}>
              <option value="primary">Primary</option><option value="secondary">Secondary</option><option value="outline">Outline</option>
            </select>
          </Field>
        </>
      )}

      {block.type === 'gallery' && (
        <>
          {block.data.images.map((img, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input className={inputClass} placeholder="Image URL" value={img.src} onChange={(e) => {
                const images = [...block.data.images]; images[i] = { ...images[i], src: e.target.value }; update({ images })
              }} />
              <input className={inputClass} placeholder="Alt" value={img.alt} onChange={(e) => {
                const images = [...block.data.images]; images[i] = { ...images[i], alt: e.target.value }; update({ images })
              }} />
            </div>
          ))}
          <button type="button" className="text-xs text-[#53D6FF]" onClick={() => update({ images: [...block.data.images, { src: '', alt: '' }] })}>+ Add image</button>
        </>
      )}

      {block.type === 'video' && (
        <>
          <Field label="Video URL"><input className={inputClass} value={block.data.url} onChange={(e) => update({ url: e.target.value })} placeholder="YouTube or Vimeo URL" /></Field>
          <Field label="Title"><input className={inputClass} value={block.data.title ?? ''} onChange={(e) => update({ title: e.target.value })} /></Field>
        </>
      )}

      {block.type === 'stats' && (
        <>
          {block.data.items.map((item, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <input className={inputClass} placeholder="Value" value={item.value} onChange={(e) => {
                const items = [...block.data.items]; items[i] = { ...items[i], value: e.target.value }; update({ items })
              }} />
              <input className={inputClass} placeholder="Label" value={item.label} onChange={(e) => {
                const items = [...block.data.items]; items[i] = { ...items[i], label: e.target.value }; update({ items })
              }} />
            </div>
          ))}
          <button type="button" className="text-xs text-[#53D6FF]" onClick={() => update({ items: [...block.data.items, { value: '', label: '' }] })}>+ Add stat</button>
        </>
      )}

      {block.type === 'beforeAfter' && (
        <>
          <Field label="Before Image URL"><input className={inputClass} value={block.data.beforeImage} onChange={(e) => update({ beforeImage: e.target.value })} /></Field>
          <Field label="After Image URL"><input className={inputClass} value={block.data.afterImage} onChange={(e) => update({ afterImage: e.target.value })} /></Field>
          <Field label="Caption"><input className={inputClass} value={block.data.caption ?? ''} onChange={(e) => update({ caption: e.target.value })} /></Field>
        </>
      )}

      {block.type === 'contactForm' && (
        <>
          <Field label="Heading"><input className={inputClass} value={block.data.heading} onChange={(e) => update({ heading: e.target.value })} /></Field>
          <Field label="Form Type">
            <select className={inputClass} value={block.data.formType} onChange={(e) => update({ formType: e.target.value as 'contact' | 'volunteer' | 'donate' })}>
              <option value="contact">Contact</option><option value="volunteer">Volunteer</option><option value="donate">Donate</option>
            </select>
          </Field>
        </>
      )}

      {block.type === 'relatedResources' && (
        <>
          <Field label="Section Title"><input className={inputClass} value={block.data.title ?? ''} onChange={(e) => update({ title: e.target.value })} /></Field>
          {block.data.items.map((item, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <input className={inputClass} placeholder="Title" value={item.title} onChange={(e) => {
                const items = [...block.data.items]; items[i] = { ...items[i], title: e.target.value }; update({ items })
              }} />
              <input className={inputClass} placeholder="URL" value={item.url} onChange={(e) => {
                const items = [...block.data.items]; items[i] = { ...items[i], url: e.target.value }; update({ items })
              }} />
            </div>
          ))}
          <button type="button" className="text-xs text-[#53D6FF]" onClick={() => update({ items: [...block.data.items, { title: '', url: '' }] })}>+ Add resource</button>
        </>
      )}

      {block.type === 'map' && (
        <>
          <Field label="Heading"><input className={inputClass} value={block.data.heading ?? ''} onChange={(e) => update({ heading: e.target.value })} /></Field>
          <Field label="Address"><input className={inputClass} value={block.data.address} onChange={(e) => update({ address: e.target.value })} /></Field>
        </>
      )}

      {block.type === 'divider' && (
        <Field label="Style">
          <select className={inputClass} value={block.data.style ?? 'line'} onChange={(e) => update({ style: e.target.value as 'line' | 'dots' | 'space' })}>
            <option value="line">Line</option><option value="dots">Dots</option><option value="space">Space</option>
          </select>
        </Field>
      )}
    </div>
  )
}
