'use client'

/** Browser-side measure / normalize of the hosted episode file for the release checklist. */
import { decodeUrl, encodeMp3 } from '@/lib/podcast/audio'
import { applyGainWithLimiter, integratedLoudness, targetLufs, type LoudnessResult } from '@/lib/studio/loudness'

function channelData(buffer: AudioBuffer) {
  const count = Math.min(2, buffer.numberOfChannels)
  return {
    sampleRate: buffer.sampleRate,
    channels: Array.from({ length: count }, (_, i) => buffer.getChannelData(i)),
  }
}

export async function measureHostedLoudness(url: string): Promise<LoudnessResult & { duration: number }> {
  const buffer = await decodeUrl(url)
  const result = integratedLoudness(channelData(buffer))
  return { ...result, duration: buffer.duration }
}

/**
 * Decode → gain to −16 LUFS (stereo) / −19 LUFS (mono) with a −1.5 dBFS look-ahead
 * limiter → MP3. A second pass tops up if the limiter held the level back.
 */
export async function normalizeHostedAudio(
  url: string,
  baseName: string,
  onStep?: (step: string) => void,
): Promise<{ file: File; loudness: LoudnessResult; duration: number }> {
  onStep?.('Loading audio…')
  const buffer = await decodeUrl(url)
  const data = channelData(buffer)
  const target = targetLufs(data.channels.length)
  onStep?.('Measuring…')
  let loud = integratedLoudness(data)
  if (!Number.isFinite(loud.lufs)) throw new Error('This file is silent — nothing to normalize.')
  for (let pass = 0; pass < 2 && Math.abs(loud.lufs - target) > 0.5; pass++) {
    onStep?.(pass === 0 ? 'Levelling…' : 'Fine-tuning…')
    applyGainWithLimiter(data, target - loud.lufs, -1.5)
    loud = integratedLoudness(data)
  }
  onStep?.('Encoding MP3…')
  const mp3 = await encodeMp3(buffer)
  const safe = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'episode'
  const file = new File([mp3], `${safe}-${Math.round(target)}lufs.mp3`, { type: 'audio/mpeg' })
  return { file, loudness: loud, duration: buffer.duration }
}

/** Natural pixel size of an image URL (for the artwork check). */
export function measureImage(url: string) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = url
  })
}
