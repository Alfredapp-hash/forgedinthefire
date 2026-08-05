/**
 * Measures the hero copy's contrast as the eye actually receives it.
 *
 * Sampling the video behind the text understates legibility, because the glyphs
 * carry their own shadow and that shadow is what separates white from polished
 * steel. This works on composited screenshots instead, so the shadow is included.
 *
 * For each crop it separates glyph pixels from the background immediately around
 * them, then reports the contrast between the text and that local background:
 *
 *   median - the typical reading condition
 *   p95    - a hard case, the 95th-percentile brightest local background
 *   worst  - the single brightest pixel adjacent to a stroke
 *
 * WCAG AA wants 4.5:1 for normal text and 3:1 for large text; AAA wants 7:1.
 *
 * Usage: node scripts/analyze-copy-contrast.mjs <crop.png>...
 */
import { spawnSync } from 'node:child_process';

/** Pixels this bright are treated as glyph rather than background. */
const GLYPH_LUMA = 170;
/**
 * The background band around each stroke, in pixels.
 *
 * The inner limit matters: a glyph's anti-aliased edge ramps from ink to backdrop
 * over a pixel or two, and counting that ramp as "background" reports a false ~2:1
 * everywhere — even where the backdrop is pure black. Start outside the ramp.
 */
const NEAR_MIN = 3;
const NEAR_MAX = 7;

const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const relLum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

function decode(path) {
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path,
  ]);
  if (probe.status !== 0) throw new Error(probe.stderr.toString().slice(0, 300));
  const [w, h] = probe.stdout.toString().trim().split(',').map(Number);
  const r = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-vf', 'format=rgb24', '-f', 'rawvideo', '-'],
    { maxBuffer: 1 << 28 }
  );
  if (r.status !== 0) throw new Error(r.stderr.toString().slice(0, 300));
  return { w, h, data: r.stdout };
}

console.log(
  'crop'.padEnd(42) +
    'glyph%  textL   median   p95    worst   verdict'
);

for (const path of process.argv.slice(2)) {
  const { w, h, data } = decode(path);
  const luma = new Float32Array(w * h);
  const lum255 = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const R = data[i * 3];
    const G = data[i * 3 + 1];
    const B = data[i * 3 + 2];
    luma[i] = relLum(R, G, B);
    lum255[i] = Math.round(0.299 * R + 0.587 * G + 0.114 * B);
  }

  const isGlyph = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (lum255[i] >= GLYPH_LUMA) isGlyph[i] = 1;
  const glyphCount = isGlyph.reduce((a, b) => a + b, 0);
  if (!glyphCount) {
    console.log(path.split('/').pop().padEnd(42) + '   no glyph pixels found');
    continue;
  }

  // Text luminance: the glyph cores, which is what the reader perceives as the ink.
  const glyphLums = [];
  for (let i = 0; i < w * h; i++) if (isGlyph[i]) glyphLums.push(luma[i]);
  glyphLums.sort((a, b) => a - b);
  const textL = glyphLums[Math.floor(glyphLums.length * 0.5)];

  // Chebyshev distance to the nearest glyph pixel, by two chamfer passes.
  const BIG = 1e6;
  const dist = new Float64Array(w * h).fill(BIG);
  for (let i = 0; i < w * h; i++) if (isGlyph[i]) dist[i] = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let d = dist[i];
      if (y > 0) d = Math.min(d, dist[i - w] + 1);
      if (x > 0) d = Math.min(d, dist[i - 1] + 1);
      if (y > 0 && x > 0) d = Math.min(d, dist[i - w - 1] + 1);
      if (y > 0 && x < w - 1) d = Math.min(d, dist[i - w + 1] + 1);
      dist[i] = d;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let d = dist[i];
      if (y < h - 1) d = Math.min(d, dist[i + w] + 1);
      if (x < w - 1) d = Math.min(d, dist[i + 1] + 1);
      if (y < h - 1 && x < w - 1) d = Math.min(d, dist[i + w + 1] + 1);
      if (y < h - 1 && x > 0) d = Math.min(d, dist[i + w - 1] + 1);
      dist[i] = d;
    }
  }

  // Local background: outside the anti-aliasing ramp but still beside the text.
  const near = [];
  for (let i = 0; i < w * h; i++) {
    if (dist[i] >= NEAR_MIN && dist[i] <= NEAR_MAX) near.push(luma[i]);
  }
  near.sort((a, b) => a - b);
  const q = (f) => near[Math.min(near.length - 1, Math.floor(f * near.length))];
  const median = contrast(textL, q(0.5));
  const p95 = contrast(textL, q(0.95));
  const worst = contrast(textL, near[near.length - 1]);

  const isLarge = /wordmark|dark|forged/.test(path);
  const floor = isLarge ? 3 : 4.5;
  const verdict = p95 >= 7 ? 'AAA' : p95 >= floor ? 'AA' : 'BELOW AA';

  console.log(
    path.split('/').pop().replace('.png', '').padEnd(42) +
      `${((100 * glyphCount) / (w * h)).toFixed(1).padStart(5)}%  ` +
      `${textL.toFixed(3)}  ${median.toFixed(1).padStart(6)}  ` +
      `${p95.toFixed(1).padStart(5)}  ${worst.toFixed(1).padStart(6)}   ${verdict}`
  );
}
