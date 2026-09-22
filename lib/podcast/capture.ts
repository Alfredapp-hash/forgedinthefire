/** Dual (or more) local audio inputs for the production room. */

export function audioInputConstraints(deviceId: string | undefined, raw: boolean): MediaTrackConstraints {
  const audio: MediaTrackConstraints = {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: !raw,
    noiseSuppression: !raw,
    autoGainControl: !raw,
    channelCount: 1,
  }
  if (!raw) {
    Object.assign(audio, { voiceIsolation: true })
  }
  return audio
}

export async function openInputStream(deviceId: string | undefined, raw: boolean): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot open a microphone')
  }
  return navigator.mediaDevices.getUserMedia({ audio: audioInputConstraints(deviceId, raw) })
}

/** Open unique devices one at a time so Chrome is less likely to kill the first stream. */
export async function openInputStreams(
  deviceIds: string[],
  raw: boolean,
): Promise<Map<string, MediaStream>> {
  const unique = [...new Set(deviceIds.map((id) => id || ''))]
  const out = new Map<string, MediaStream>()
  for (const id of unique) {
    const stream = await openInputStream(id || undefined, raw)
    const live = stream.getAudioTracks().some((t) => t.readyState === 'live')
    if (!live) {
      stream.getTracks().forEach((t) => t.stop())
      throw new Error('A microphone track ended as soon as it opened. Chrome often allows only one input — pick two hardware devices, not the same mic twice.')
    }
    for (const [key, prev] of out) {
      if (prev.getAudioTracks().some((t) => t.readyState !== 'live')) {
        stream.getTracks().forEach((t) => t.stop())
        prev.getTracks().forEach((t) => t.stop())
        throw new Error(
          `Opening a second mic stopped “${key || 'default'}”. Use two named devices (interface inputs), or a mixer into one mic.`,
        )
      }
    }
    out.set(id, stream)
  }
  return out
}

export function recorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'
  return ''
}

export type LaneCapture = {
  key: string
  recorder: MediaRecorder | null
  kind: 'worklet' | 'media-recorder'
  stop: () => void
  done: Promise<Blob>
}

function startMediaRecorderCapture(key: string, stream: MediaStream): LaneCapture {
  const audioOnly = new MediaStream(stream.getAudioTracks())
  const mime = recorderMime()
  const recorder = mime ? new MediaRecorder(audioOnly, { mimeType: mime }) : new MediaRecorder(audioOnly)
  const chunks: Blob[] = []
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' }))
    }
    recorder.onerror = () => reject(new Error('Recorder failed'))
  })
  recorder.start(250)
  return {
    key,
    recorder,
    kind: 'media-recorder',
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop()
    },
    done,
  }
}

export async function startLaneCapture(key: string, stream: MediaStream): Promise<LaneCapture> {
  try {
    const { startWorkletCapture } = await import('@/lib/podcast/worklet-capture')
    const worklet = await startWorkletCapture(key, stream)
    if (worklet) return worklet
  } catch {
    /* Chrome-only path; MediaRecorder stays the fallback */
  }
  return startMediaRecorderCapture(key, stream)
}

export function stopLaneCapture(capture: LaneCapture) {
  capture.stop()
}

export function stopStreams(streams: Iterable<MediaStream | null | undefined>) {
  for (const stream of streams) {
    stream?.getTracks().forEach((t) => t.stop())
  }
}
