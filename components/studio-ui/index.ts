/**
 * studio-ui — the GarageBand-style primitives kit for the podcast studio.
 *
 * Small, composable, token-driven client components with no business
 * logic. They build ON the Forged Light brand (globals.css tokens +
 * tailwind.config.ts theme). Import from '@/components/studio-ui'.
 */

export { Panel } from './Panel';
export type { PanelProps } from './Panel';

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { IconButton } from './IconButton';
export type { IconButtonProps } from './IconButton';

export { SegmentedControl } from './SegmentedControl';
export type {
  SegmentedControlProps,
  SegmentedOption,
} from './SegmentedControl';

export { Chip, Badge } from './Chip';
export type { ChipProps, ChipTone } from './Chip';

export { Kbd } from './Kbd';
export type { KbdProps } from './Kbd';

export { Meter } from './Meter';
export type { MeterProps } from './Meter';

export { Fader } from './Fader';
export type { FaderProps } from './Fader';

export { Slider } from './Slider';
export type { SliderProps } from './Slider';

export { RecordButton } from './RecordButton';
export type { RecordButtonProps, RecordState } from './RecordButton';

// Lane colour helper lives with the podcast lib but is re-exported here
// so the kit is a one-stop import for studio surfaces.
export { laneColor, laneCssVar, LANE_IDS } from '@/lib/podcast/lanes';
export type { LaneColor, LaneId } from '@/lib/podcast/lanes';
