/**
 * Voice isolation / cleanup for the production room.
 *
 * Primary: RNNoise (Xiph, via @shiguredo/rnnoise-wasm, Apache-2.0) — the same
 * family Jitsi uses. Fallback: Boll-style spectral subtraction + rumble cut.
 * Capture still uses Chrome/WebRTC AEC + NS + optional voiceIsolation.
 */

const RNN_RATE = 48000
const PCM_SCALE = 32768

function mixMono(buffer: AudioBuffer) {
  const n = buffer.length
  const out = new Float32Array(n)
  const chs = buffer.numberOfChannels
  for (let ch = 0; ch < chs; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < n; i++) out[i] += data[i] / chs
  }
  return out
}

function resample(data: Float32Array, fromRate: number, toRate: number) {
  if (fromRate === toRate) return data
  const ratio = toRate / fromRate
  const length = Math.max(1, Math.round(data.length * ratio))
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const src = i / ratio
    const i0 = Math.min(data.length - 1, Math.floor(src))
    const i1 = Math.min(data.length - 1, i0 + 1)
    const frac = src - i0
    out[i] = data[i0] * (1 - frac) + data[i1] * frac
  }
  return out
}

function toBuffer(data: Float32Array, sampleRate: number, channels: number): AudioBuffer {
  const buffer = new AudioBuffer({ length: data.length, numberOfChannels: channels, sampleRate })
  for (let ch = 0; ch < channels; ch++) {
    buffer.getChannelData(ch).set(data)
  }
  return buffer
}

let rnnoisePromise: Promise<import('@shiguredo/rnnoise-wasm').Rnnoise> | null = null

async function loadRnnoise() {
  if (typeof window === 'undefined') return null
  if (!rnnoisePromise) {
    rnnoisePromise = import('@shiguredo/rnnoise-wasm')
      .then((mod) => mod.Rnnoise.load())
      .catch((err) => {
        rnnoisePromise = null
        throw err
      })
  }
  try {
    return await rnnoisePromise
  } catch {
    return null
  }
}

async function rnnoiseIsolate(buffer: AudioBuffer): Promise<AudioBuffer | null> {
  const rnn = await loadRnnoise()
  if (!rnn) return null
  const frameSize = rnn.frameSize
  const mono = mixMono(buffer)
  const at48 = resample(mono, buffer.sampleRate, RNN_RATE)
  const padded = Math.ceil(at48.length / frameSize) * frameSize
  const work = new Float32Array(padded)
  work.set(at48)
  const state = rnn.createDenoiseState()
  try {
    for (let i = 0; i < padded; i += frameSize) {
      const frame = work.subarray(i, i + frameSize)
      for (let s = 0; s < frame.length; s++) frame[s] *= PCM_SCALE
      state.processFrame(frame)
      for (let s = 0; s < frame.length; s++) frame[s] /= PCM_SCALE
    }
  } finally {
    state.destroy()
  }
  const restored = resample(work.subarray(0, at48.length), RNN_RATE, buffer.sampleRate)
  const length = Math.min(restored.length, buffer.length)
  const out = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  })
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const dst = out.getChannelData(ch)
    dst.set(restored.subarray(0, length))
    for (let i = length; i < dst.length; i++) dst[i] = buffer.getChannelData(ch)[i]
  }
  return out
}

/** In-place radix-2 FFT. n must be a power of two. */
function fft(real: Float32Array, imag: Float32Array, inverse: boolean) {
  const n = real.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = real[i]
      real[i] = real[j]
      real[j] = tr
      const ti = imag[i]
      imag[i] = imag[j]
      imag[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 1 : -1) * (2 * Math.PI)) / len
    const wlenR = Math.cos(ang)
    const wlenI = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wr = 1
      let wi = 0
      for (let j = 0; j < len / 2; j++) {
        const uR = real[i + j]
        const uI = imag[i + j]
        const vR = real[i + j + len / 2] * wr - imag[i + j + len / 2] * wi
        const vI = real[i + j + len / 2] * wi + imag[i + j + len / 2] * wr
        real[i + j] = uR + vR
        imag[i + j] = uI + vI
        real[i + j + len / 2] = uR - vR
        imag[i + j + len / 2] = uI - vI
        const nwr = wr * wlenR - wi * wlenI
        wi = wr * wlenI + wi * wlenR
        wr = nwr
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      real[i] /= n
      imag[i] /= n
    }
  }
}

function hann(n: number) {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
  return w
}

/** Boll 1979 spectral subtraction when RNNoise cannot load. */
function spectralIsolate(buffer: AudioBuffer): AudioBuffer {
  const nfft = 1024
  const hop = 256
  const window = hann(nfft)
  const mono = mixMono(buffer)
  const frames = Math.max(1, Math.floor((mono.length - nfft) / hop) + 1)
  const mags: Float32Array[] = []
  const phases: Float32Array[] = []
  const energy: number[] = []
  const re = new Float32Array(nfft)
  const im = new Float32Array(nfft)

  for (let f = 0; f < frames; f++) {
    const off = f * hop
    re.fill(0)
    im.fill(0)
    for (let i = 0; i < nfft; i++) re[i] = (mono[off + i] || 0) * window[i]
    fft(re, im, false)
    const mag = new Float32Array(nfft)
    const phase = new Float32Array(nfft)
    let e = 0
    for (let k = 0; k < nfft; k++) {
      mag[k] = Math.hypot(re[k], im[k])
      phase[k] = Math.atan2(im[k], re[k])
      e += mag[k] * mag[k]
    }
    mags.push(mag)
    phases.push(phase)
    energy.push(e)
  }

  const ranked = [...energy].sort((a, b) => a - b)
  const quietCut = ranked[Math.max(0, Math.floor(ranked.length * 0.15))] || 0
  const noise = new Float32Array(nfft)
  let noiseN = 0
  for (let f = 0; f < frames; f++) {
    if (energy[f] > quietCut && noiseN > 4) continue
    if (energy[f] <= quietCut) {
      for (let k = 0; k < nfft; k++) noise[k] += mags[f][k]
      noiseN++
    }
  }
  if (noiseN === 0) noiseN = 1
  for (let k = 0; k < nfft; k++) noise[k] /= noiseN

  const rumbleBin = Math.floor((80 * nfft) / buffer.sampleRate)
  const oversub = 1.15
  const floor = 0.08
  const out = new Float32Array(mono.length + nfft)
  const acc = new Float32Array(mono.length + nfft)

  for (let f = 0; f < frames; f++) {
    const mag = mags[f]
    const phase = phases[f]
    re.fill(0)
    im.fill(0)
    for (let k = 0; k < nfft; k++) {
      let g = 1
      if (k <= rumbleBin || k >= nfft - rumbleBin) g = 0
      else {
        const clean = mag[k] - oversub * noise[k]
        g = mag[k] > 1e-8 ? Math.max(floor, clean / mag[k]) : floor
      }
      const m = mag[k] * g
      re[k] = m * Math.cos(phase[k])
      im[k] = m * Math.sin(phase[k])
    }
    fft(re, im, true)
    const off = f * hop
    for (let i = 0; i < nfft; i++) {
      out[off + i] += re[i] * window[i]
      acc[off + i] += window[i] * window[i]
    }
  }

  const cleaned = new Float32Array(mono.length)
  for (let i = 0; i < mono.length; i++) cleaned[i] = acc[i] > 1e-6 ? out[i] / acc[i] : 0
  return toBuffer(cleaned, buffer.sampleRate, buffer.numberOfChannels)
}

export async function isolateVoice(buffer: AudioBuffer): Promise<AudioBuffer> {
  try {
    const rnn = await rnnoiseIsolate(buffer)
    if (rnn) return rnn
  } catch {
    /* fall through to spectral */
  }
  return spectralIsolate(buffer)
}
