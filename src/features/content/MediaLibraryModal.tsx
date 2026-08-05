'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import type { MediaAsset } from './types'

type Props = {
  onSelect: (url: string, alt?: string) => void
  onClose: () => void
}

export default function MediaLibraryModal({ onSelect, onClose }: Props) {
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState<MediaAsset | null>(null)
  const [altEdit, setAltEdit] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/admin/media')
      .then((r) => r.json())
      .then((data) => setAssets(Array.isArray(data) ? data.map((a: { id: string; url: string; alt?: string }) => ({ id: a.id, url: a.url, alt: a.alt ?? '' })) : []))
      .finally(() => setLoading(false))
  }, [])

  async function handleUpload(file: File) {
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('alt', file.name)
    try {
      const res = await fetch('/api/admin/media', { method: 'POST', body: form })
      const asset = await res.json()
      if (res.ok) {
        setAssets((prev) => [{ id: asset.id, url: asset.url, alt: asset.alt ?? '' }, ...prev])
        setSelected({ id: asset.id, url: asset.url, alt: asset.alt ?? '' })
        setAltEdit(asset.alt ?? '')
      } else {
        alert(asset.error || 'Upload failed')
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#151B22] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#27313B]">
          <div>
            <h2 className="font-bold text-[#F6FAFC]">Media Library</h2>
            <p className="text-xs text-[#A9B8C6]">Upload images for blog posts</p>
          </div>
          <button type="button" onClick={onClose} className="text-[#A9B8C6] hover:text-[#F6FAFC] text-xl">✕</button>
        </div>

        <div className="p-4 border-b border-[#27313B]">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleUpload(f)
          }} />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 bg-[#53D6FF] text-[#061016] rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload Image'}
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <p className="text-sm text-[#A9B8C6]">Loading...</p>
            ) : assets.length === 0 ? (
              <p className="text-sm text-[#A9B8C6]">No media yet. Upload an image to get started.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => { setSelected(asset); setAltEdit(asset.alt) }}
                    className={`relative aspect-[4/3] rounded-xl overflow-hidden border-2 ${selected?.id === asset.id ? 'border-[#53D6FF]' : 'border-transparent hover:border-[#53D6FF]/40'}`}
                  >
                    <Image src={asset.url} alt={asset.alt} fill className="object-cover" unoptimized />
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected && (
            <div className="w-56 border-l border-[#27313B] p-4 flex flex-col gap-3">
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden">
                <Image src={selected.url} alt={selected.alt} fill className="object-cover" unoptimized />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#A9B8C6] mb-1">Alt Text</label>
                <input className="w-full border rounded-lg px-2 py-1.5 text-sm" value={altEdit} onChange={(e) => setAltEdit(e.target.value)} />
              </div>
              <button
                type="button"
                onClick={() => { onSelect(selected.url, altEdit); onClose() }}
                className="mt-auto py-2 bg-[#53D6FF] text-[#061016] rounded-lg text-sm font-semibold"
              >
                Insert
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
