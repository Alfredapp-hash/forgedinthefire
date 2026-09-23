/**
 * Offline voice disguise: pitch shift with independent formant (vocal-tract) shift, or
 * robotisation. Written from first principles for this project — a short-time Fourier
 * phase vocoder:
 *
 *   1. STFT (Hann, 2048 / hop 512 at 44.1–48 kHz).
 *   2. Per frame: magnitude + "true" bin frequency from the phase advance.
 *   3. Spectral envelope = moving average of log-magnitude (~400 Hz wide). Dividing it out
 *      leaves the harmonic "fine structure" (the pitch).
 *   4. Move the fine structure by the pitch ratio, re-apply the envelope stretched by the
 *      formant ratio, and accumulate synthesis phase from the shifted frequencies.
 *   5. Inverse FFT, window, overlap-add.
 *
 * Shifting pitch and formants by *different* amounts is what makes a voice sound like a
 * different person rather than the same person sped up — and it is harder (not impossible)
 * to undo than a plain pitch shift. No third-party DSP code is used.
 */

export const DISGUISE_WARNING = 'Simple pitch shifting can sometimes be reversed. Review with an advocate before publishing.'

export type DisguiseSettings = {
  /** Semitones, e.g. −3. */
  pitch: number
  /** Formant ratio: <1 = larger/deeper vocal tract, >1 = smaller/brighter. */
  formant: number
  /** Robot: flatten intonation to a fixed buzz (strongest disguise, least natural). */
  robot?: boolean
}

export type DisguisePresetId = 'lower' | 'higher' | 'masked' | 'robot'

export const DISGUISE_PRESETS: Record<DisguisePresetId, { label: string; hint: string; settings: DisguiseSettings }> = {
  lower: { label: 'Lower voice', hint: 'Pitch down 3 semitones, deeper vocal tract. Natural-sounding.', settings: { pitch: -3, formant: 0.88 } },
  higher: { label: 'Higher voice', hint: 'Pitch up 3 semitones, smaller vocal tract.', settings: { pitch: 3, formant: 1.12 } },
  masked: { label: 'Masked', hint: 'Pitch down 4, formants up — sounds like a different speaker. Harder to reverse.', settings: { pitch: -4, formant: 1.14 } },
  robot: { label: 'Robotised', hint: 'Flat, mechanical voice. Strongest disguise; words stay clear.', settings: { pitch: 0, formant: 0.92, robot: true } },
}

// ── FFT (iterative radix-2, in place) ────────────────────────────────────────

class FFT {
  readonly n: number
  private rev: Uint32Array
  private cos: Float64Array
  private sin: Float64Array
  constructor(n: number) {
    this.n = n
    const bits = Math.log2(n)
    this.rev = new Uint32Array(n)
    for (let i = 0; i < n; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
      this.rev[i] = r
    }
    this.cos = new Float64Array(n / 2)
    this.sin = new Float64Array(n / 2)
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / n)
      this.sin[i] = Math.sin((2 * Math.PI * i) / n)
    }
  }
  /** inverse=false: forward (e^{-i}); inverse=true: unscaled inverse. */
  transform(re: Float64Array, im: Float64Array, inverse: boolean) {
    const n = this.n
    for (let i = 0; i < n; i++) {
      const j = this.rev[i]
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t
        t = im[i]; im[i] = im[j]; im[j] = t
      }
    }
    const sign = inverse ? 1 : -1
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1
      const step = n / size
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step]
          const wi = sign * this.sin[k * step]
          const a = start + k
          const b = a + half
          const tr = re[b] * wr - im[b] * wi
          const ti = re[b] * wi + im[b] * wr
          re[b] = re[a] - tr
          im[b] = im[a] - ti
          re[a] += tr
          im[a] += ti
        }
      }
    }
  }
}

function frameSizeFor(rate: number) {
  return rate > 32000 ? 2048 : 1024
}

/**
 * Disguise a mono signal. Returns a new array of the same length.
 * `onProgress(0..1)` is called periodically; the loop yields to keep the page responsive.
 */
export async function disguiseMono(
  input: Float32Array,
  rate: number,
  settings: DisguiseSettings,
  onProgress?: (fraction: number) => void,
): Promise<Float32Array<ArrayBuffer>> {
  const N = frameSizeFor(rate)
  const hop = N / 4
  const bins = N / 2 + 1
  const fft = new FFT(N)
  const win = new Float64Array(N)
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)
  // Hann² overlap-add at 75% overlap sums to 1.5.
  const olaNorm = 1 / 1.5

  const pitchRatio = Math.pow(2, settings.pitch / 12)
  const formantRatio = settings.formant
  const expected = (2 * Math.PI * hop) / N
  const envHalf = Math.max(2, Math.round((200 / rate) * N)) // ±200 Hz smoothing

  // Pad so the first/last samples get full overlap.
  const padded = new Float32Array(input.length + 2 * N)
  padded.set(input, N)
  const output = new Float64Array(padded.length + N)

  const re = new Float64Array(N)
  const im = new Float64Array(N)
  const mag = new Float64Array(bins)
  const freq = new Float64Array(bins)
  const lastPhase = new Float64Array(bins)
  const sumPhase = new Float64Array(bins)
  const logMag = new Float64Array(bins)
  const prefix = new Float64Array(bins + 1)
  const env = new Float64Array(bins)
  const outMag = new Float64Array(bins)
  const outFreq = new Float64Array(bins)

  const frames = Math.floor((padded.length - N) / hop) + 1
  let lastYield = performance.now()

  for (let f = 0; f < frames; f++) {
    const pos = f * hop
    for (let i = 0; i < N; i++) {
      re[i] = padded[pos + i] * win[i]
      im[i] = 0
    }
    fft.transform(re, im, false)

    // Analysis: magnitude and true frequency (in bins).
    for (let k = 0; k < bins; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k])
      const ph = Math.atan2(im[k], re[k])
      let delta = ph - lastPhase[k] - k * expected
      lastPhase[k] = ph
      delta -= 2 * Math.PI * Math.round(delta / (2 * Math.PI))
      mag[k] = m
      freq[k] = k + (delta * N) / (2 * Math.PI * hop)
      logMag[k] = Math.log(m + 1e-9)
    }

    // Spectral envelope via moving average of log-magnitude.
    prefix[0] = 0
    for (let k = 0; k < bins; k++) prefix[k + 1] = prefix[k] + logMag[k]
    for (let k = 0; k < bins; k++) {
      const a = Math.max(0, k - envHalf)
      const b = Math.min(bins - 1, k + envHalf)
      env[k] = Math.exp((prefix[b + 1] - prefix[a]) / (b - a + 1))
    }

    // Shift fine structure by pitchRatio.
    outMag.fill(0)
    outFreq.fill(0)
    for (let k = 0; k < bins; k++) {
      const j = Math.round(k * pitchRatio)
      if (j <= 0 || j >= bins) continue
      const fine = mag[k] / (env[k] + 1e-9)
      if (fine > outMag[j]) outFreq[j] = freq[k] * pitchRatio
      outMag[j] += fine
    }
    // Re-apply the envelope, stretched by the formant ratio.
    for (let j = 0; j < bins; j++) {
      const src = j / formantRatio
      const i0 = Math.floor(src)
      const t = src - i0
      const e = i0 + 1 < bins ? env[i0] * (1 - t) + env[i0 + 1] * t : i0 < bins ? env[i0] : 0
      outMag[j] *= e
    }

    // Synthesis phase.
    for (let k = 0; k < bins; k++) {
      let ph: number
      if (settings.robot) {
        ph = 0
      } else {
        sumPhase[k] += (outFreq[k] || k) * expected
        ph = sumPhase[k]
      }
      re[k] = outMag[k] * Math.cos(ph)
      im[k] = outMag[k] * Math.sin(ph)
    }
    for (let k = 1; k < N / 2; k++) {
      re[N - k] = re[k]
      im[N - k] = -im[k]
    }
    fft.transform(re, im, true)
    for (let i = 0; i < N; i++) output[pos + i] += (re[i] / N) * win[i] * olaNorm

    if (f % 256 === 0 && performance.now() - lastYield > 30) {
      onProgress?.(f / frames)
      await new Promise((r) => setTimeout(r, 0))
      lastYield = performance.now()
    }
  }
  onProgress?.(1)

  // Match loudness of the original (RMS) so disguise does not jump in level.
  const out = new Float32Array(input.length)
  let inE = 0
  let outE = 0
  for (let i = 0; i < input.length; i++) {
    const v = output[i + N]
    out[i] = v
    inE += input[i] * input[i]
    outE += v * v
  }
  const g = outE > 0 ? Math.min(4, Math.sqrt(inE / outE)) : 1
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i] * g))
  return out
}

/**
 * Disguise [startSec, endSec) of a buffer in place (all channels get the same processed
 * mono signal). 30 ms equal-power crossfades at the range edges.
 */
export async function disguiseRange(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
  settings: DisguiseSettings,
  onProgress?: (fraction: number) => void,
) {
  const rate = buffer.sampleRate
  const a = Math.max(0, Math.floor(startSec * rate))
  const b = Math.min(buffer.length, Math.ceil(endSec * rate))
  if (b - a < rate * 0.05) return
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  const mono = new Float32Array(b - a)
  for (const ch of chans) for (let i = 0; i < mono.length; i++) mono[i] += ch[a + i] / chans.length
  const wet = await disguiseMono(mono, rate, settings, onProgress)
  const fade = Math.min(Math.floor(0.03 * rate), Math.floor(mono.length / 2))
  for (const ch of chans) {
    for (let i = 0; i < wet.length; i++) {
      let m = 1
      if (i < fade) m = Math.sin((Math.PI / 2) * (i / fade))
      else if (i >= wet.length - fade) m = Math.sin((Math.PI / 2) * ((wet.length - i) / fade))
      const dry = ch[a + i]
      ch[a + i] = wet[i] * m + dry * Math.sqrt(Math.max(0, 1 - m * m))
    }
  }
}
