/**
 * Track-lane hue map — GarageBand-style colour coding for the studio.
 *
 * One persistent hue per person/track. Host and guest reuse the Forged
 * Light brand blues so the studio still reads as ours; the four cohost
 * slots add warm/cool accents that stay legible on graphite-dark.
 *
 * Mirrors the `--lane-*` CSS variables in app/globals.css and the
 * `lane` colour family in tailwind.config.ts. This is the single source
 * of truth for JS/canvas code (waveforms, clip fills) that needs the
 * actual rgba values rather than a Tailwind class.
 *
 * Phase 0 / additive: importing this changes nothing on its own.
 */

/** Canonical lane identifiers, in assignment order. */
export const LANE_IDS = [
  'host',
  'guest',
  'cohost-1',
  'cohost-2',
  'cohost-3',
  'cohost-4',
] as const;

export type LaneId = (typeof LANE_IDS)[number];

/** Base hex per lane. Mirrors the token map. */
const LANE_BASE: Record<LaneId, string> = {
  host: '#53D6FF', // forged blue
  guest: '#8DEBFF', // ice blue
  'cohost-1': '#FFB86B', // amber
  'cohost-2': '#A6E3A1', // green
  'cohost-3': '#BF9AF2', // violet
  'cohost-4': '#FF8FB0', // pink
};

/** Derived-surface alphas, kept in sync with the CSS `--lane-*` vars. */
const LANE_BG_ALPHA = 0.08; // lane background wash
const LANE_CLIP_ALPHA = 0.22; // clip / waveform fill
const LANE_BORDER_ALPHA = 0.4; // clip / lane border

/** A resolved lane palette: the base hue plus its derived surfaces. */
export type LaneColor = {
  /** The persistent base hue (hex). */
  base: string;
  /** Lane-strip background — base @ ~8%. */
  laneBg: string;
  /** Clip / waveform fill — base @ ~22%. */
  clipFill: string;
  /** Clip / lane border — base @ ~40%. */
  border: string;
  /** The canonical lane id this palette resolved to. */
  id: LaneId;
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Resolve a lane palette from either a lane id (`'host'`, `'cohost-2'`)
 * or a numeric index (0 = host, 1 = guest, 2… = cohorts). Indices wrap
 * around the six lanes so extra participants still get a stable colour.
 *
 * @example
 *   laneColor('host')  // → { base: '#53D6FF', laneBg: 'rgba(83,214,255,0.08)', … }
 *   laneColor(3)       // → the cohost-2 (green) palette
 */
export function laneColor(idOrIndex: LaneId | number): LaneColor {
  const id: LaneId =
    typeof idOrIndex === 'number'
      ? LANE_IDS[((idOrIndex % LANE_IDS.length) + LANE_IDS.length) %
          LANE_IDS.length]
      : idOrIndex;

  const base = LANE_BASE[id];
  return {
    id,
    base,
    laneBg: rgba(base, LANE_BG_ALPHA),
    clipFill: rgba(base, LANE_CLIP_ALPHA),
    border: rgba(base, LANE_BORDER_ALPHA),
  };
}

/** The matching CSS custom-property name for a lane's base hue. */
export function laneCssVar(id: LaneId): string {
  return `var(--lane-${id})`;
}
