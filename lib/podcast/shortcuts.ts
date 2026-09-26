/**
 * Canonical keyboard shortcuts for the podcast studio. This is the single source
 * of truth the shortcuts help modal renders, so the printed keys always match the
 * keys the editor and booth actually listen for. Keep in sync with the handlers in
 * audio-editor.tsx / recording-booth.tsx.
 */

export type Shortcut = {
  /** Display string for the key(s), e.g. "Space", "Shift + J", "1–0". */
  keys: string
  /** Plain-verb description of what the key does, from the host's side. */
  action: string
}

export type ShortcutGroup = {
  group: string
  items: Shortcut[]
}

export const STUDIO_SHORTCUTS: ShortcutGroup[] = [
  {
    group: 'Playback',
    items: [
      { keys: 'Space', action: 'Play or pause' },
      { keys: 'L', action: 'Play' },
      { keys: 'K', action: 'Pause' },
      { keys: 'J', action: 'Jump back 1 second' },
      { keys: 'Shift + J', action: 'Jump back 5 seconds' },
    ],
  },
  {
    group: 'Recording',
    items: [
      { keys: 'R', action: 'Start or stop recording' },
      { keys: 'C', action: 'Mark a chapter at the playhead' },
    ],
  },
  {
    group: 'Editing',
    items: [
      { keys: 'S', action: 'Split audio at the playhead' },
      { keys: 'V', action: 'Split the picture at the playhead' },
      { keys: 'F', action: 'Fade the selected clip(s)' },
      { keys: 'Delete', action: 'Cut a hole in the selection' },
      { keys: 'Shift + Delete', action: 'Ripple delete the selection' },
      { keys: 'Shift + M', action: 'Mute the selected range' },
      { keys: '⌘ / Ctrl + click', action: 'Add a clip to the selection' },
      { keys: 'Shift + drag edge', action: 'Roll-trim — trims the neighbor, keeps total length' },
      { keys: '1–0', action: 'Drop a sound effect' },
    ],
  },
  {
    group: 'View',
    items: [
      { keys: '⌘ / Ctrl +', action: 'Zoom in' },
      { keys: '⌘ / Ctrl −', action: 'Zoom out' },
      { keys: '⌘ / Ctrl 0', action: 'Fit the session to the window' },
    ],
  },
  {
    group: 'Help',
    items: [{ keys: '?', action: 'Show keyboard shortcuts' }],
  },
]
