export type Rgb = [number, number, number];

export interface VideoAmbientPalette {
  top: Rgb;
  bottom: Rgb;
  left: Rgb;
  right: Rgb;
  teal: Rgb;
  warm: Rgb;
  base: Rgb;
}

export const HERO_PAGE_BG = '#000000';
export const HERO_PAGE_BG_RGB: Rgb = [0, 0, 0];

export const DEFAULT_PALETTE: VideoAmbientPalette = {
  top: [0, 0, 0],
  bottom: [0, 0, 0],
  left: [0, 0, 0],
  right: [0, 0, 0],
  teal: [8, 18, 22],
  warm: [28, 12, 14],
  base: [0, 0, 0],
};

export function blendToPageBg(color: Rgb, amount: number): Rgb {
  const t = Math.min(1, Math.max(0, amount));
  return [
    Math.round(color[0] * (1 - t) + HERO_PAGE_BG_RGB[0] * t),
    Math.round(color[1] * (1 - t) + HERO_PAGE_BG_RGB[1] * t),
    Math.round(color[2] * (1 - t) + HERO_PAGE_BG_RGB[2] * t),
  ];
}

export function rgba([r, g, b]: Rgb, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function smoothRgb(prev: Rgb, next: Rgb, alpha = 0.12): Rgb {
  return [
    Math.round(prev[0] * (1 - alpha) + next[0] * alpha),
    Math.round(prev[1] * (1 - alpha) + next[1] * alpha),
    Math.round(prev[2] * (1 - alpha) + next[2] * alpha),
  ];
}

function avgPixels(
  data: Uint8ClampedArray,
  mode: 'all' | 'dark' | 'teal' | 'warm' | 'edge'
): Rgb | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;

  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i];
    const pg = data[i + 1];
    const pb = data[i + 2];
    const max = Math.max(pr, pg, pb);

    if (mode === 'edge' && max > 55) continue;
    if (mode === 'dark' && max > 90) continue;
    if (mode === 'all' && max < 8) continue;
    if (mode !== 'dark' && mode !== 'edge' && max < 10) continue;
    if (max > 235) continue;

    if (mode === 'teal' && !(pb > pr + 6 && pg > pr + 4)) continue;
    if (mode === 'warm' && !(pr > pg + 6 && pr > pb + 4)) continue;

    r += pr;
    g += pg;
    b += pb;
    n++;
  }

  if (!n) return null;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function sampleRegion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  mode: 'all' | 'dark' | 'teal' | 'warm' | 'edge'
): Rgb | null {
  const { data } = ctx.getImageData(x, y, w, h);
  return avgPixels(data, mode);
}

export function analyzeVideoFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): VideoAmbientPalette {
  const strip = Math.max(2, Math.floor(height * 0.045));
  const side = Math.max(2, Math.floor(width * 0.04));

  const top = sampleRegion(ctx, 0, 0, width, strip, 'edge') ?? DEFAULT_PALETTE.top;
  const bottom =
    sampleRegion(ctx, 0, height - strip, width, strip, 'edge') ?? DEFAULT_PALETTE.bottom;
  const left = sampleRegion(ctx, 0, 0, side, height, 'edge') ?? DEFAULT_PALETTE.left;
  const right =
    sampleRegion(ctx, width - side, 0, side, height, 'edge') ?? DEFAULT_PALETTE.right;
  const teal =
    sampleRegion(
      ctx,
      Math.floor(width * 0.18),
      Math.floor(height * 0.06),
      Math.floor(width * 0.64),
      Math.floor(height * 0.38),
      'teal'
    ) ?? DEFAULT_PALETTE.teal;
  const warm =
    sampleRegion(
      ctx,
      Math.floor(width * 0.22),
      Math.floor(height * 0.26),
      Math.floor(width * 0.56),
      Math.floor(height * 0.42),
      'warm'
    ) ?? DEFAULT_PALETTE.warm;
  const base = sampleRegion(ctx, 0, 0, width, height, 'dark') ?? DEFAULT_PALETTE.base;

  return { top, bottom, left, right, teal, warm, base };
}

export function buildHeroBackground(p: VideoAmbientPalette): string {
  const settle = blendToPageBg(p.bottom, 0.72);
  return [
    `radial-gradient(ellipse 140% 94% at 50% -4%, ${rgba(p.teal, 0.22)} 0%, transparent 58%)`,
    `radial-gradient(ellipse 96% 74% at 50% 33%, ${rgba(p.teal, 0.16)} 0%, ${rgba(p.teal, 0.03)} 44%, transparent 78%)`,
    `radial-gradient(ellipse 76% 62% at 50% 40%, ${rgba(p.warm, 0.12)} 0%, transparent 74%)`,
    `radial-gradient(ellipse 108% 60% at 50% 68%, ${rgba(p.warm, 0.08)} 0%, transparent 76%)`,
    `linear-gradient(90deg, ${rgba(p.left, 0.65)} 0%, transparent 22%, transparent 78%, ${rgba(p.right, 0.65)} 100%)`,
    `linear-gradient(180deg, ${rgba(p.top, 0.88)} 0%, ${rgba(p.base, 0.45)} 38%, ${rgba(p.base, 0.62)} 66%, ${rgba(settle, 0.82)} 88%, ${HERO_PAGE_BG} 100%)`,
  ].join(', ');
}

/** Palette-synced fade at the bottom edge of the visual hero */
export function buildHeroBridgeFade(p: VideoAmbientPalette): string {
  const soft = blendToPageBg(p.bottom, 0.28);
  const mid = blendToPageBg(p.base, 0.52);
  const near = blendToPageBg(p.bottom, 0.74);
  const settle = blendToPageBg(p.base, 0.9);
  return [
    `linear-gradient(180deg, transparent 0%, ${rgba(soft, 0.12)} 18%, ${rgba(mid, 0.42)} 42%, ${rgba(near, 0.78)} 66%, ${rgba(settle, 0.96)} 84%, ${HERO_PAGE_BG} 100%)`,
    `radial-gradient(ellipse 90% 45% at 50% 100%, ${rgba(p.teal, 0.06)} 0%, transparent 62%)`,
    `radial-gradient(ellipse 70% 35% at 50% 100%, ${rgba(p.warm, 0.05)} 0%, transparent 58%)`,
  ].join(', ');
}

/** Copy block backdrop — starts exactly where the bridge ends */
export function buildHeroCopyBackdrop(p: VideoAmbientPalette): string {
  return [
    `radial-gradient(ellipse 130% 36% at 50% 0%, ${rgba(p.teal, 0.05)} 0%, transparent 48%)`,
    `radial-gradient(ellipse 100% 28% at 50% 0%, ${rgba(p.warm, 0.035)} 0%, transparent 52%)`,
    `linear-gradient(180deg, ${HERO_PAGE_BG} 0%, ${HERO_PAGE_BG} 100%)`,
  ].join(', ');
}

export function smoothPalette(
  prev: VideoAmbientPalette,
  next: VideoAmbientPalette,
  alpha = 0.12
): VideoAmbientPalette {
  return {
    top: smoothRgb(prev.top, next.top, alpha),
    bottom: smoothRgb(prev.bottom, next.bottom, alpha),
    left: smoothRgb(prev.left, next.left, alpha),
    right: smoothRgb(prev.right, next.right, alpha),
    teal: smoothRgb(prev.teal, next.teal, alpha),
    warm: smoothRgb(prev.warm, next.warm, alpha),
    base: smoothRgb(prev.base, next.base, alpha),
  };
}

/** Ease palette transitions near loop seams */
export function paletteSmoothingAlpha(videoTime: number, duration: number): number {
  if (!duration || duration <= 0) return 0.09;
  const seam = 0.35;
  if (videoTime < seam || videoTime > duration - seam) return 0.04;
  return 0.09;
}
