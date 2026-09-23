/**
 * ONE AudioContext for the guest booth.
 *
 * iOS/Safari only lets an AudioContext start inside a user gesture, and a
 * resume() called later (from a poll, a timer or a WebRTC event) can hang
 * forever. So the booth creates this context and calls resume() synchronously
 * in the Join (or "Test my microphone") tap, then reuses it for the meters and
 * the headphone mix for the whole visit. Guest backups use MediaRecorder, which
 * needs no AudioContext and no gesture.
 */

export type GuestAudioSession = {
  ctx: AudioContext
  /** Call synchronously from a tap handler (before any await). */
  unlock: () => void
  running: () => boolean
  /** Level meter on the shared context. Returns a stop function. */
  meter: (stream: MediaStream, onLevel: (peak: number) => void) => () => void
  close: () => void
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

export function createGuestAudioSession(): GuestAudioSession | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext
  if (!Ctor) return null
  let ctx: AudioContext
  try {
    ctx = new Ctor({ latencyHint: 'interactive' })
  } catch {
    return null
  }

  const unlock = () => {
    if (ctx.state === 'closed') return
    // Not awaited on purpose: the call itself must happen inside the gesture.
    void ctx.resume().catch(() => {})
    try {
      // A one-sample silent buffer "warms" the iOS output path inside the gesture.
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(ctx.destination)
      src.start(0)
    } catch {
      /* ignore */
    }
  }

  return {
    ctx,
    unlock,
    running: () => ctx.state === 'running',
    meter(stream, onLevel) {
      if (ctx.state === 'closed' || !stream.getAudioTracks().length) return () => {}
      let src: MediaStreamAudioSourceNode
      try {
        src = ctx.createMediaStreamSource(stream)
      } catch {
        return () => {}
      }
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      src.connect(analyser)
      const data = new Uint8Array(analyser.fftSize)
      let raf = 0
      let last = 0
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick)
        if (now - last < 50) return
        last = now
        analyser.getByteTimeDomainData(data)
        let peak = 0
        for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128) / 128)
        onLevel(peak)
      }
      raf = requestAnimationFrame(tick)
      return () => {
        cancelAnimationFrame(raf)
        try {
          src.disconnect()
          analyser.disconnect()
        } catch {
          /* ignore */
        }
      }
    },
    close() {
      if (ctx.state !== 'closed') void ctx.close().catch(() => {})
    },
  }
}
