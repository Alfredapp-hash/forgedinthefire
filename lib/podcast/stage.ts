/** Studio workflow stages. The episode stays loaded across all of them — this
 *  is a view switcher, not navigation, so recording/session state is preserved. */
export type StudioStage = 'plan' | 'record' | 'edit' | 'publish'

export const STUDIO_STAGES: StudioStage[] = ['plan', 'record', 'edit', 'publish']

export const STUDIO_STAGE_LABEL: Record<StudioStage, string> = {
  plan: 'Plan',
  record: 'Record',
  edit: 'Edit',
  publish: 'Publish',
}
