import type { CSSProperties } from 'react';

/** Single source of truth for hero video geometry + placement */
export const HERO_VIDEO_LAYOUT = {
  aspectRatio: 16 / 9,
  bleedCss: '0.5in',
  objectPosition: { x: 0.5, y: 0.38 },
  scale: 1.08,
  maskCenter: { x: 50, y: 38 },
} as const;

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
    `linear-gradient(180deg, #000 0%, #000 52%, rgba(0,0,0,0.92) 68%, rgba(0,0,0,0.55) 82%, rgba(0,0,0,0.12) 94%, transparent 100%)`,
    `radial-gradient(ellipse 165% 105% at ${maskCenter.x}% ${maskCenter.y}%, #000 62%, transparent 100%)`,
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
