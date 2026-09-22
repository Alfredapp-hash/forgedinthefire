export type UploadedAsset = {
  url: string
  mime_type?: string
  size_bytes?: number
}

/** Upload audio/cover to site media. Large audio uses a signed PUT to skip the function body limit. */
export async function uploadPodcastMedia(file: File, alt: string): Promise<UploadedAsset> {
  const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|webm)$/i.test(file.name)
  const useSigned = isAudio && file.size > 4.5 * 1024 * 1024

  if (useSigned) {
    const signRes = await fetch('/api/admin/media/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        mime_type: file.type || 'audio/mpeg',
        size_bytes: file.size,
      }),
    })
    const signed = await signRes.json()
    if (!signRes.ok) throw new Error(signed.error || 'Could not start upload')
    const put = await fetch(signed.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'audio/mpeg' },
      body: file,
    })
    if (!put.ok) throw new Error('Direct storage upload failed')
    const completeRes = await fetch('/api/admin/media/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: signed.path,
        filename: file.name,
        mime_type: file.type || 'audio/mpeg',
        size_bytes: file.size,
        alt,
        publicUrl: signed.publicUrl,
      }),
    })
    const asset = await completeRes.json()
    if (!completeRes.ok) throw new Error(asset.error || 'Upload finalize failed')
    return asset as UploadedAsset
  }

  const fd = new FormData()
  fd.append('file', file)
  fd.append('alt', alt)
  const res = await fetch('/api/admin/media', { method: 'POST', body: fd })
  const asset = await res.json()
  if (!res.ok) throw new Error(asset.error || 'Upload failed')
  return asset as UploadedAsset
}

export function measureAudioDuration(url: string) {
  return new Promise<number | null>((resolve) => {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => resolve(Math.round(audio.duration) || null)
    audio.onerror = () => resolve(null)
    audio.src = url
  })
}
