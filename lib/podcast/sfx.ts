/** Procedural podcast SFX — generated in-browser, no sample files, no license issues. */

export type SfxId =
  | 'ding'
  | 'chime'
  | 'notify'
  | 'click'
  | 'whoosh'
  | 'sweep'
  | 'stinger'
  | 'riser'
  | 'heartbeat'
  | 'breath'

export const SFX_META: { id: SfxId; label: string; hint: string }[] = [
  { id: 'ding', label: 'Ding', hint: 'Single bell for chapter hits' },
  { id: 'chime', label: 'Chime', hint: 'Three-note open' },
  { id: 'notify', label: 'Notify', hint: 'Two-tone alert' },
  { id: 'click', label: 'Click', hint: 'Dry tick / edit mark' },
  { id: 'whoosh', label: 'Whoosh', hint: 'Transition sweep up' },
  { id: 'sweep', label: 'Sweep', hint: 'Transition sweep down' },
  { id: 'stinger', label: 'Stinger', hint: 'Short C-major hit' },
  { id: 'riser', label: 'Riser', hint: 'Tension lift into a break' },
  { id: 'heartbeat', label: 'Heartbeat', hint: 'Two-beat pulse' },
  { id: 'breath', label: 'Room air', hint: 'Soft noise bed, 2 seconds' },
]

/** Keyed by id AND sample rate — a 44.1k render must never be served to a 48k session. */
const cache = new Map<string, AudioBuffer>()

/** Renders at the requested rate (default: 48 kHz session rate). */
export async function renderSfx(id: SfxId, sampleRate = 48000): Promise<AudioBuffer> {
  const key = `${id}@${sampleRate}`
  const hit = cache.get(key)
  if (hit) return hit
  const buffer = await buildSfx(id, sampleRate)
  cache.set(key, buffer)
  return buffer
}

export async function previewSfx(id: SfxId) {
  const buffer = await renderSfx(id)
  const ctx = new AudioContext()
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(ctx.destination)
  src.start(0)
  await new Promise<void>((resolve) => {
    src.onended = () => resolve()
  })
  void ctx.close()
}

async function buildSfx(id: SfxId, sampleRate: number): Promise<AudioBuffer> {
  switch (id) {
    case 'ding':
      return toneBurst(sampleRate, 1.1, [
        { freq: 880, gain: 0.45, decay: 1.0 },
        { freq: 1760, gain: 0.18, decay: 0.7 },
      ])
    case 'chime':
      return toneBurst(sampleRate, 1.6, [
        { freq: 523.25, gain: 0.32, decay: 1.4, delay: 0 },
        { freq: 659.25, gain: 0.28, decay: 1.3, delay: 0.12 },
        { freq: 783.99, gain: 0.24, decay: 1.2, delay: 0.24 },
      ])
    case 'notify':
      return toneBurst(sampleRate, 0.7, [
        { freq: 880, gain: 0.35, decay: 0.22, delay: 0 },
        { freq: 1174, gain: 0.32, decay: 0.35, delay: 0.16 },
      ])
    case 'click':
      return noiseBurst(sampleRate, 0.04, 0.55, 1800, 0.9)
    case 'whoosh':
      return sweptNoise(sampleRate, 0.7, 220, 4200, 0.45)
    case 'sweep':
      return sweptNoise(sampleRate, 0.7, 3800, 180, 0.4)
    case 'stinger':
      return toneBurst(sampleRate, 1.15, [
        { freq: 130.81, gain: 0.28, decay: 0.9 },
        { freq: 261.63, gain: 0.34, decay: 0.85 },
        { freq: 329.63, gain: 0.22, decay: 0.7 },
        { freq: 392.0, gain: 0.18, decay: 0.65 },
      ])
    case 'riser':
      return riser(sampleRate, 1.6)
    case 'heartbeat':
      return heartbeat(sampleRate)
    case 'breath':
      return sweptNoise(sampleRate, 2.0, 400, 900, 0.08)
    default:
      return noiseBurst(sampleRate, 0.1, 0.2, 1000, 0.5)
  }
}

type PartialTone = { freq: number; gain: number; decay: number; delay?: number }

async function toneBurst(sampleRate: number, duration: number, partials: PartialTone[]) {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate)
  const now = 0.01
  for (const p of partials) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = p.freq
    const t0 = now + (p.delay || 0)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, p.gain), t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + p.decay)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + p.decay + 0.02)
  }
  return ctx.startRendering()
}

async function noiseBurst(
  sampleRate: number,
  duration: number,
  gain: number,
  hp: number,
  decayPow: number,
) {
  const ctx = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate)
  const src = ctx.createBufferSource()
  src.buffer = white(ctx, duration)
  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = hp
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, 0)
  g.gain.exponentialRampToValueAtTime(0.0001, duration * decayPow)
  src.connect(filter)
  filter.connect(g)
  g.connect(ctx.destination)
  src.start(0)
  return ctx.startRendering()
}

async function sweptNoise(
  sampleRate: number,
  duration: number,
  fromHz: number,
  toHz: number,
  gain: number,
) {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate)
  const src = ctx.createBufferSource()
  src.buffer = white(ctx, duration)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 2.2
  filter.frequency.setValueAtTime(fromHz, 0)
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, toHz), duration)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, 0)
  g.gain.linearRampToValueAtTime(gain, duration * 0.35)
  g.gain.exponentialRampToValueAtTime(0.0001, duration)
  src.connect(filter)
  filter.connect(g)
  g.connect(ctx.destination)
  src.start(0)
  return ctx.startRendering()
}

async function riser(sampleRate: number, duration: number) {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate)
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(70, 0)
  osc.frequency.exponentialRampToValueAtTime(640, duration)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(400, 0)
  filter.frequency.exponentialRampToValueAtTime(5000, duration)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, 0)
  g.gain.exponentialRampToValueAtTime(0.22, duration * 0.85)
  g.gain.exponentialRampToValueAtTime(0.0001, duration)
  osc.connect(filter)
  filter.connect(g)
  g.connect(ctx.destination)
  const noise = ctx.createBufferSource()
  noise.buffer = white(ctx, duration)
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.02, 0)
  ng.gain.linearRampToValueAtTime(0.12, duration)
  noise.connect(ng)
  ng.connect(ctx.destination)
  osc.start(0)
  osc.stop(duration)
  noise.start(0)
  return ctx.startRendering()
}

async function heartbeat(sampleRate: number) {
  const duration = 1.15
  const ctx = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate)
  thud(ctx, 0.05, 0.42)
  thud(ctx, 0.28, 0.28)
  return ctx.startRendering()
}

function thud(ctx: OfflineAudioContext, at: number, gain: number) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(70, at)
  osc.frequency.exponentialRampToValueAtTime(32, at + 0.16)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + 0.2)
}

function white(ctx: BaseAudioContext, duration: number) {
  const length = Math.max(1, Math.ceil(duration * ctx.sampleRate))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}
