import type { CSSProperties } from 'react';

/** Intrinsic size of both hero videos and the poster still. */
export const HERO_VIDEO_SIZE = {
  width: 1280,
  height: 720,
} as const;

/** Single source of truth for hero video geometry + placement */
export const HERO_VIDEO_LAYOUT = {
  aspectRatio: HERO_VIDEO_SIZE.width / HERO_VIDEO_SIZE.height,
  bleedCss: '0.35in',
  objectPosition: { x: 0.5, y: 0.45 },
  scale: 1.04,
  maskCenter: { x: 50, y: 42 },
} as const;

export interface HeroCoverTransform {
  scale: number;
  top: number;
  left: number;
}

/**
 * CSS `object-fit: cover` mapping from a viewport box into the video's own
 * 1280×720 space. Copy overlays use this so a source row stays on the same
 * piece of artwork as the cover crop moves.
 *
 * When the box is itself 16:9 (the mobile hero stage), cover equals contain
 * and the full anvil / flame / heart lockup is visible. A 100dvh portrait
 * box is much taller than 16:9, so cover would zoom to ~26% of the source
 * width and clip the anvil — that is why the mobile stage is aspect-video.
 */
export function computeHeroCoverTransform(
  viewportW: number,
  viewportH: number,
  videoW = HERO_VIDEO_SIZE.width,
  videoH = HERO_VIDEO_SIZE.height
): HeroCoverTransform {
  if (!viewportW || !viewportH) {
    return { scale: 1, top: 0, left: 0 };
  }
  const scale = Math.max(viewportW / videoW, viewportH / videoH);
  return {
    scale,
    top: (viewportH - videoH * scale) / 2,
    left: (viewportW - videoW * scale) / 2,
  };
}

export const HERO_PLACEMENT = {
  /** Matches navbar h-20 */
  offsetBelowNav: '5rem',
  offsetBelowNavSm: '5.25rem',
  /** Gap between video stage and headline copy */
  gapBeforeCopy: '0.625rem',
  gapBeforeCopySm: '0.875rem',
  stageHorizontalPad: 'max(1rem, 0.75in)',
} as const;

let cachedBleedPx: number | null = null;

export function getBleedPx(): number {
  if (cachedBleedPx !== null) return cachedBleedPx;
  if (typeof document === 'undefined') return 72;

  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;width:${HERO_VIDEO_LAYOUT.bleedCss};height:${HERO_VIDEO_LAYOUT.bleedCss}`;
  document.body.appendChild(probe);
  cachedBleedPx = probe.getBoundingClientRect().width || 72;
  document.body.removeChild(probe);
  return cachedBleedPx;
}

export interface VideoDrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeMainVideoDrawRect(
  stageX: number,
  stageY: number,
  stageW: number,
  stageH: number,
  videoW: number,
  videoH: number
): VideoDrawRect {
  const bleed = getBleedPx();
  const boxX = stageX - bleed;
  const boxY = stageY - bleed;
  const boxW = stageW + bleed * 2;
  const boxH = stageH + bleed * 2;

  const coverScale = Math.max(boxW / videoW, boxH / videoH) * HERO_VIDEO_LAYOUT.scale;
  const drawW = videoW * coverScale;
  const drawH = videoH * coverScale;

  const focalX = boxX + boxW * HERO_VIDEO_LAYOUT.objectPosition.x;
  const focalY = boxY + boxH * HERO_VIDEO_LAYOUT.objectPosition.y;

  return {
    x: focalX - drawW / 2,
    y: focalY - drawH / 2,
    width: drawW,
    height: drawH,
  };
}

export function getVideoMaskGradient(): string {
  const { maskCenter } = HERO_VIDEO_LAYOUT;
  return [
    `linear-gradient(180deg, #000 0%, #000 58%, rgba(0,0,0,0.94) 74%, rgba(0,0,0,0.5) 88%, rgba(0,0,0,0.08) 96%, transparent 100%)`,
    `radial-gradient(ellipse 170% 110% at ${maskCenter.x}% ${maskCenter.y}%, #000 68%, transparent 100%)`,
  ].join(', ');
}

export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getRelativeRect(container: DOMRect, target: DOMRect): StageRect {
  return {
    x: target.left - container.left,
    y: target.top - container.top,
    width: target.width,
    height: target.height,
  };
}

export function getFocalPoint(stage: StageRect): { x: number; y: number } {
  return {
    x: stage.x + stage.width * HERO_VIDEO_LAYOUT.objectPosition.x,
    y: stage.y + stage.height * HERO_VIDEO_LAYOUT.objectPosition.y,
  };
}

export function getMainVideoStyle(): CSSProperties {
  const { bleedCss, objectPosition, scale } = HERO_VIDEO_LAYOUT;
  const origin = `${objectPosition.x * 100}% ${objectPosition.y * 100}%`;
  return {
    top: `calc(-1 * ${bleedCss})`,
    left: `calc(-1 * ${bleedCss})`,
    width: `calc(100% + 2 * ${bleedCss})`,
    height: `calc(100% + 2 * ${bleedCss})`,
    objectFit: 'cover',
    objectPosition: origin,
    transform: `scale(${scale})`,
    transformOrigin: origin,
  };
}
