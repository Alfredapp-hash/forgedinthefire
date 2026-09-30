import { describe, expect, it } from 'vitest'
import { audioInputConstraints, resolveProcessing } from '@/lib/podcast/capture'

describe('capture processing modes', () => {
  it('defaults to raw (cleanup happens after the take); no headphones → browser processing', () => {
    expect(resolveProcessing()).toBe('raw')
    expect(resolveProcessing({ headphones: false })).toBe('browser')
    expect(resolveProcessing({ raw: false })).toBe('browser')
    expect(resolveProcessing({ processing: 'browser', raw: true })).toBe('browser')
  })

  it('raw turns AEC/NS/AGC off and asks for the 48 kHz session rate', () => {
    const c = audioInputConstraints('mic-1', true)
    expect(c.echoCancellation).toBe(false)
    expect(c.noiseSuppression).toBe(false)
    expect(c.autoGainControl).toBe(false)
    expect(c.channelCount).toBe(1)
    expect(c.sampleRate).toEqual({ ideal: 48000 })
    expect(c.deviceId).toEqual({ exact: 'mic-1' })
    expect('voiceIsolation' in c).toBe(false)
  })

  it('browser mode keeps the old boolean meaning (false = processed) and adds voiceIsolation', () => {
    const c = audioInputConstraints(undefined, false) as MediaTrackConstraints & { voiceIsolation?: boolean }
    expect(c.echoCancellation).toBe(true)
    expect(c.voiceIsolation).toBe(true)
    expect(c.deviceId).toBeUndefined()
    expect(audioInputConstraints(undefined, 'browser').echoCancellation).toBe(true)
  })
})
