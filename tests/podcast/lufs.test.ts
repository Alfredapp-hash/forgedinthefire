import { describe, expect, it } from 'vitest'
import { gainForTargetLufs, measureLoudness } from '@/lib/podcast/lufs'
import { integratedLoudness } from '@/lib/studio/loudness'
import { FakeAudioBuffer, sine } from '../helpers/audio-buffer'

function buffer(channels: Float32Array[], sampleRate: number): AudioBuffer {
  const b = new FakeAudioBuffer({ length: channels[0].length, numberOfChannels: channels.length, sampleRate })
  channels.forEach((c, i) => b.copyToChannel(c, i))
  return b as unknown as AudioBuffer
}

/** The production room's export meter (lib/podcast/lufs.ts) vs the release-checklist meter. */
describe('lib/podcast/lufs measureLoudness', () => {
  for (const sr of [48000, 44100]) {
    it(`agrees with lib/studio/loudness within 0.5 LU at ${sr} Hz (mono + stereo)`, () => {
      const x = sine(997, -20, 4, sr)
      const mono = measureLoudness(buffer([x], sr)).lufs
      const stereo = measureLoudness(buffer([x, x.slice()], sr)).lufs
      expect(mono).toBeCloseTo(integratedLoudness({ sampleRate: sr, channels: [x] }).lufs, 0)
      expect(Math.abs(stereo - integratedLoudness({ sampleRate: sr, channels: [x, x.slice()] }).lufs)).toBeLessThan(0.5)
      expect(mono).toBeGreaterThan(-23.5)
      expect(mono).toBeLessThan(-22.5)
    })
  }

  it('silence → −Infinity → unity gain', () => {
    const r = measureLoudness(buffer([new Float32Array(48000)], 48000))
    expect(r.lufs).toBe(-Infinity)
    expect(gainForTargetLufs(r.lufs)).toBe(1)
  })

  // BS.1770 gates blocks under −70 LUFS; when EVERY block is under the gate the programme is −∞.
  // lufs.ts falls back to the ungated blocks instead, so a near-silent mix (muted mic, room tone)
  // reads e.g. −85 LUFS and "Match −16 LUFS" on export applies ~+69 dB of gain → limiter-crushed noise.
  it.fails('BUG: all-below-gate mix is not treated as silence (huge make-up gain on export)', () => {
    const x = sine(997, -85, 3, 48000)
    const r = measureLoudness(buffer([x], 48000))
    expect(gainForTargetLufs(r.lufs)).toBeLessThan(10 ** (24 / 20)) // anything under +24 dB would be sane
  })
})
