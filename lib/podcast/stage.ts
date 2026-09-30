/** Studio workflow stages. `record` is shown as "Sound Booth" — the focused-in
 *  recording view with the big cameras; the key stays `record` for stored prefs and tests.
 * The episode stays loaded across all of them — this
 *  is a view switcher, not navigation, so recording/session state is preserved. */
export type StudioStage = 'plan' | 'record' | 'edit' | 'publish'

export const STUDIO_STAGES: StudioStage[] = ['plan', 'record', 'edit', 'publish']

export const STUDIO_STAGE_LABEL: Record<StudioStage, string> = {
  plan: 'Plan',
  record: 'Sound Booth',
  edit: 'Edit',
  publish: 'Publish',
}
