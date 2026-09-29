/** Pure-JS dynamics on Float32Array channels: noise gate and split-band de-esser. */

export type GateOptions = {
  /** Open threshold, linear (default 0.02 ≈ −34 dBFS). */
  threshold?: number
  /** Close threshold sits this many dB below the open threshold. */
  hysteresisDb?: number
  attackMs?: number
  holdMs?: number
  releaseMs?: number
  /** Attenuation when closed (dB). Default −80 (practically silent, no zipper). */
  rangeDb?: number
  /** Open slightly early so consonant onsets are not clipped. */
  lookaheadMs?: number
}

const coef = (ms: number, sr: number) => (ms <= 0 ? 0 : Math.exp(-1 / ((ms / 1000) * sr)))

/**
 * Stereo-linked noise gate with attack / hold / release, hysteresis and look-ahead.
 * Detector: peak envelope (instant attack, 10 ms decay). Gain moves smoothly between
 * 1 and the range floor with separate attack/release time constants. In place.
 */
export function gateChannels(channels: Float32Array[], sampleRate: number, opts: GateOptions = {}) {
  const n = channels[0]?.length ?? 0
  if (!n) return
  const openThr = opts.threshold ?? 0.02
  const closeThr = openThr * 10 ** (-(opts.hysteresisDb ?? 6) / 20)
  const floor = 10 ** ((opts.rangeDb ?? -80) / 20)
  const att = coef(opts.attackMs ?? 1, sampleRate)
  const rel = coef(opts.releaseMs ?? 120, sampleRate)
  const holdN = Math.round(((opts.holdMs ?? 50) / 1000) * sampleRate)
  const look = Math.round(((opts.lookaheadMs ?? 2) / 1000) * sampleRate)
  const detDecay = coef(10, sampleRate)

  let det = 0
  let open = false
  let hold = 0
  let g = floor
  // The detector runs `look` samples ahead of the gain stage.
  const gains = new Float32Array(Math.min(n, 1 << 16))
  for (let base = 0; base < n; base += gains.length) {
    const end = Math.min(n, base + gains.length)
    for (let i = base; i < end; i++) {
      const j = i + look
      if (j < n) {
        let a = 0
        for (const ch of channels) {
          const v = ch[j] < 0 ? -ch[j] : ch[j]
          if (v > a) a = v
        }
        det = a > det ? a : det * detDecay
      } else {
        det *= detDecay
      }
      if (det >= openThr) {
        open = true
        hold = holdN
      } else if (open && det < closeThr) {
        if (hold > 0) hold--
        else open = false
      } else if (open) {
        hold = holdN
      }
      const target = open ? 1 : floor
      const c = target > g ? att : rel
      g = target + (g - target) * c
      gains[i - base] = g
    }
    for (const ch of channels) {
      for (let i = base; i < end; i++) ch[i] *= gains[i - base]
    }
  }
}

type BQ = { b0: number; b1: number; b2: number; a1: number; a2: number }

/** RBJ cookbook biquads. */
export function rbj(type: 'highpass' | 'lowpass' | 'peaking' | 'bandpass', freq: number, q: number, sampleRate: number, gainDb = 0): BQ {
  const w0 = (2 * Math.PI * Math.min(freq, sampleRate * 0.49)) / sampleRate
  const cos = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * q)
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number
  if (type === 'highpass') {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
  } else if (type === 'lowpass') {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
  } else if (type === 'bandpass') {
    b0 = alpha; b1 = 0; b2 = -alpha
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
  } else {
    const A = 10 ** (gainDb / 40)
    b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A
    a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

export type DeEssOptions = {
  /** Sidechain band (Hz). */
  lowHz?: number
  highHz?: number
  /** Band level above which reduction starts (dBFS). */
  thresholdDb?: number
  ratio?: number
  maxReductionDb?: number
  attackMs?: number
  releaseMs?: number
  /** Only act when the band is within this many dB of the full-band level (sibilant frames). */
  dominanceDb?: number
}

/**
 * Dynamic de-esser: sidechain = 5–8 kHz band envelope vs full-band envelope; when the
 * band is hot *and* dominant, a peaking cut centred in the band is applied, with gain
 * following the envelope (coefficients updated every 16 samples). 0 dB = exact bypass.
 * Stereo-linked, in place. Returns the max reduction applied (dB, ≥ 0).
 */
export function deEssChannels(channels: Float32Array[], sampleRate: number, opts: DeEssOptions = {}): number {
  const n = channels[0]?.length ?? 0
  if (!n) return 0
  const lo = opts.lowHz ?? 5000
  const hi = Math.min(opts.highHz ?? 8000, sampleRate * 0.45)
  if (hi <= lo) return 0
  const centre = Math.sqrt(lo * hi)
  const q = centre / (hi - lo)
  const thr = opts.thresholdDb ?? -30
  const ratio = Math.max(1, opts.ratio ?? 4)
  const maxRed = opts.maxReductionDb ?? 10
  const att = coef(opts.attackMs ?? 1, sampleRate)
  const rel = coef(opts.releaseMs ?? 60, sampleRate)
  const dominance = opts.dominanceDb ?? 6

  // Sidechain: band-pass (HP·LP) on the linked mono sum.
  const hp = rbj('highpass', lo, 0.7071, sampleRate)
  const lp = rbj('lowpass', hi, 0.7071, sampleRate)
  let hx1 = 0, hx2 = 0, hy1 = 0, hy2 = 0
  let lx1 = 0, lx2 = 0, ly1 = 0, ly2 = 0
  let bandEnv = 0
  let fullEnv = 0
  let redDb = 0
  let maxApplied = 0
  const BLOCK = 16
  const state = channels.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }))
  let cut: BQ = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }

  for (let base = 0; base < n; base += BLOCK) {
    const end = Math.min(n, base + BLOCK)
    for (let i = base; i < end; i++) {
      let x = 0
      for (const ch of channels) x += ch[i]
      x /= channels.length
      const h = hp.b0 * x + hp.b1 * hx1 + hp.b2 * hx2 - hp.a1 * hy1 - hp.a2 * hy2
      hx2 = hx1; hx1 = x; hy2 = hy1; hy1 = h
      const b = lp.b0 * h + lp.b1 * lx1 + lp.b2 * lx2 - lp.a1 * ly1 - lp.a2 * ly2
      lx2 = lx1; lx1 = h; ly2 = ly1; ly1 = b
      const ab = b < 0 ? -b : b
      const ax = x < 0 ? -x : x
      bandEnv = ab > bandEnv ? ab + (bandEnv - ab) * att : ab + (bandEnv - ab) * rel
      fullEnv = ax > fullEnv ? ax + (fullEnv - ax) * att : ax + (fullEnv - ax) * rel
    }
    const bandDb = 20 * Math.log10(bandEnv + 1e-9)
    const fullDb = 20 * Math.log10(fullEnv + 1e-9)
    let want = 0
    if (bandDb > thr && bandDb > fullDb - dominance) want = Math.min(maxRed, (bandDb - thr) * (1 - 1 / ratio))
    // Smooth the reduction itself (fast in, slower out) to avoid zipper noise.
    redDb = want > redDb ? want : redDb + (want - redDb) * 0.08
    if (redDb > maxApplied) maxApplied = redDb
    cut = redDb > 0.05 ? rbj('peaking', centre, q, sampleRate, -redDb) : { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 }
    for (let c = 0; c < channels.length; c++) {
      const data = channels[c]
      const s = state[c]
      for (let i = base; i < end; i++) {
        const x = data[i]
        const y = cut.b0 * x + cut.b1 * s.x1 + cut.b2 * s.x2 - cut.a1 * s.y1 - cut.a2 * s.y2
        s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = y
        data[i] = y
      }
    }
  }
  return maxApplied
}
