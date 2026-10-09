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

/** Where single-letter keys work — printed in the help so hosts know why a key did nothing. */
export const SHORTCUT_SCOPE_NOTE =
  'Single-letter keys (R, S, J, K, L, F, C, V, 1–0, Delete) work when the timeline has focus or nothing is focused — click the timeline first. They never fire while a button or text field has focus. ⌘/Ctrl combinations and ? work everywhere except inside a text field.'

/** Plain-language explainer, rendered in the help modal (moved out of the editor footer). */
export const STUDIO_HOW_IT_WORKS: { title: string; body: string }[] = [
  {
    title: 'Recording',
    body: 'One lane per person. "New take" starts after the current mix, so the next person comes in after the last one. "Re-record from here" drops in at the playhead while the mix plays in your headphones (that is a punch-in). "Pick up" continues from your own last take. The lead-in plays the mix for a few seconds before recording starts and trims itself off. Takes autosave on this computer as you record; if the tab crashes, you are offered them back.',
  },
  {
    title: 'Two mics, one button',
    body: 'Arm Host + Guest and press Record once — both takes roll together. The quieter mic is lowered (never hard-muted) while the other person talks, using volume automation, so nothing is lost. A remote guest records in their own booth and their take is laid on the Guest lane on the same clock.',
  },
  {
    title: 'Best take, layers and comps',
    body: 'Each person can have several takes. "Best take" (A) is the one you hear; the others stay silent. Under Advanced, "L" layers a take on top of the best one, and "Comp" uses a take for just the selected range — take 2 for the flub, take 1 for the rest.',
  },
  {
    title: 'Clean-up and effects',
    body: '"Clean up voice" reduces background noise and rumble without touching the recording — it is an effect on playback and export, so you can turn it off. Under Advanced, the Effects rack adds more (EQ, compression, de-esser, colour) with a wet/dry control, and "Apply permanently" bakes an effect into the take (Undo brings it back).',
  },
  {
    title: 'Music under voices',
    body: 'Add a music bed, then under Advanced use "Lower music under voices": pick the voice lane that should push the music down and by how much. It writes volume automation only — no take is rewritten. You can also drag a range on the music lane and set a section volume.',
  },
  {
    title: 'Camera and picture',
    body: 'Turning a camera on shows a live preview; Record then also writes a video file on this computer, on the same clock as the audio. Picture edits (split, trim, titles, B-roll, stingers, dissolves) live on the picture lane above each person’s audio. Linked keeps picture and audio moving together; Unlinked edits them apart. Video downloads are local files — the podcast feed always carries the audio mix.',
  },
  {
    title: 'Export and publish',
    body: '"Export episode" makes one master mix, saves the audio file to the episode (that is what Apple Podcasts, Spotify and Amazon Music pull from /podcast/rss.xml), and downloads the video when the session has picture. Under Advanced you can also export stems, match podcast loudness (−16 LUFS) and export a selection only.',
  },
]

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
      { keys: '⌘ / Ctrl + Z', action: 'Undo' },
      { keys: 'Shift + ⌘ / Ctrl + Z', action: 'Redo' },
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
