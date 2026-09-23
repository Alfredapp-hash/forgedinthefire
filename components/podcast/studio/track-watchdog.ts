'use client'

/**
 * Watches capture inputs for silent failure: a mic unplugged mid-take ('ended'), a track the OS
 * stopped feeding ('mute'), an AudioContext Safari 'interrupted' (phone call, Siri), or a device
 * list change that removed an input. Reports a human label so the editor can raise a loud banner.
 */

export type WatchedInput = { label: string; stream: MediaStream }

export function watchInputs(
  inputs: WatchedInput[],
  onLost: (label: string, reason: string) => void,
  contexts: (AudioContext | null | undefined)[] = [],
): () => void {
  const cleanups: Array<() => void> = []
  for (const { label, stream } of inputs) {
    for (const track of stream.getAudioTracks()) {
      const ended = () => onLost(label, 'disconnected')
      // 'mute' fires when the source stops delivering (e.g. OS took the device). Give it a beat.
      let muteTimer: ReturnType<typeof setTimeout> | null = null
      const muted = () => {
        if (muteTimer) clearTimeout(muteTimer)
        muteTimer = setTimeout(() => {
          if (track.muted && track.readyState === 'live') onLost(label, 'stopped sending sound')
        }, 1500)
      }
      const unmuted = () => {
        if (muteTimer) clearTimeout(muteTimer)
        muteTimer = null
      }
      track.addEventListener('ended', ended)
      track.addEventListener('mute', muted)
      track.addEventListener('unmute', unmuted)
      cleanups.push(() => {
        if (muteTimer) clearTimeout(muteTimer)
        track.removeEventListener('ended', ended)
        track.removeEventListener('mute', muted)
        track.removeEventListener('unmute', unmuted)
      })
    }
  }

  const onDeviceChange = () => {
    for (const { label, stream } of inputs) {
      if (stream.getAudioTracks().some((t) => t.readyState === 'ended')) onLost(label, 'disconnected')
    }
  }
  navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange)
  cleanups.push(() => navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange))

  for (const ctx of contexts) {
    if (!ctx) continue
    const onState = () => {
      const s = ctx.state as string
      // Safari reports 'interrupted' for calls / Siri; plain 'suspended' is also normal on close.
      if (s === 'interrupted') onLost('Audio engine', 'was interrupted by the system')
    }
    ctx.addEventListener('statechange', onState)
    cleanups.push(() => ctx.removeEventListener('statechange', onState))
  }

  return () => cleanups.forEach((fn) => fn())
}
