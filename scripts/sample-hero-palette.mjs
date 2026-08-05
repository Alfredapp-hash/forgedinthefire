/**
 * Samples real colours out of the hero artwork, so palette decisions are grounded
 * in the footage rather than invented.
 *
 * Two questions:
 *
 *  1. What is the heat ramp? A hot-iron glow needs a near-white core falling off
 *     through warmer, deeper hues. This reports the brightest pixels in the frame
 *     (the white-hot anchor) and the full distribution of warm-hued pixels bucketed
 *     by brightness, which is the empirical ramp the artwork actually contains.
 *
 *  2. What is the red in the dark middle of the heart? This locates the heart by
 *     hue, then walks a radial profile out from its centroid, so the interior can be
 *     told apart from the bright rim.
 *
 * Usage: node scripts/sample-hero-palette.mjs [clip] [lockup.png]
 */
import { spawnSync } from 'node:child_process';

const CLIP = process.argv[2] ?? 'public/hero-flame-loop.mp4';
const LOCKUP = process.argv[3] ?? 'public/brand/fitf-lockup.png';

const hex = (r, g, b) =>
  '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Warm means red-dominant; the flame in this footage is cyan, so this isolates well. */
const isWarm = (r, g, b) => r > b + 18 && r >= g;

function decodeVideo(path) {
  const r = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-vf', 'format=rgb24', '-f', 'rawvideo', '-'],
    { maxBuffer: 1 << 30 }
  );
  if (r.status !== 0) throw new Error(r.stderr.toString().slice(0, 400));
  return r.stdout;
}

function decodeImage(path) {
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path,
  ]);
  if (probe.status !== 0) throw new Error(probe.stderr.toString().slice(0, 300));
  const [w, h] = probe.stdout.toString().trim().split(',').map(Number);
  const r = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-vf', 'format=rgba', '-f', 'rawvideo', '-'],
    { maxBuffer: 1 << 28 }
  );
  if (r.status !== 0) throw new Error(r.stderr.toString().slice(0, 300));
  return { w, h, data: r.stdout, channels: 4 };
}

/** Collects warm pixels and overall brightest pixels from one RGB(A) buffer. */
function analyse(label, get, w, h) {
  const warm = [];
  const all = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = get(x, y);
      if (!p) continue;
      const [r, g, b] = p;
      const L = luma(r, g, b);
      all.push({ x, y, r, g, b, L });
      if (isWarm(r, g, b) && L > 12) warm.push({ x, y, r, g, b, L });
    }
  }

  console.log(`\n=== ${label} ===`);
  console.log(`pixels: ${all.length}, warm pixels: ${warm.length}`);

  // Brightest pixels overall: the white-hot anchor for the glow's core.
  all.sort((a, b) => b.L - a.L);
  const topN = all.slice(0, Math.max(1, Math.floor(all.length * 0.0004)));
  const mean = (arr, k) => arr.reduce((s, p) => s + p[k], 0) / arr.length;
  console.log(
    `brightest 0.04%: ${hex(mean(topN, 'r'), mean(topN, 'g'), mean(topN, 'b'))} ` +
      `rgb(${mean(topN, 'r').toFixed(0)},${mean(topN, 'g').toFixed(0)},${mean(topN, 'b').toFixed(0)}) ` +
      `luma ${mean(topN, 'L').toFixed(1)}  ` +
      `→ ${mean(topN, 'b') > mean(topN, 'r') ? 'COOL (blue-biased)' : 'warm'}`
  );

  if (!warm.length) return null;

  // Empirical warm ramp: mean colour per brightness bucket.
  console.log('\nwarm-hue ramp by brightness:');
  console.log('  luma band    n        hex        rgb                 sat');
  const bands = [[200, 256], [170, 200], [140, 170], [110, 140], [80, 110], [55, 80], [35, 55], [12, 35]];
  const ramp = [];
  for (const [lo, hi] of bands) {
    const seg = warm.filter((p) => p.L >= lo && p.L < hi);
    if (seg.length < 12) {
      console.log(`  ${String(lo).padStart(3)}..${String(hi).padStart(3)}     ${String(seg.length).padStart(6)}   (too few)`);
      continue;
    }
    const r = mean(seg, 'r');
    const g = mean(seg, 'g');
    const b = mean(seg, 'b');
    const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, Math.max(r, g, b));
    ramp.push({ lo, hi, r, g, b, n: seg.length });
    console.log(
      `  ${String(lo).padStart(3)}..${String(hi).padStart(3)}     ${String(seg.length).padStart(6)}   ` +
        `${hex(r, g, b)}   rgb(${r.toFixed(0).padStart(3)},${g.toFixed(0).padStart(3)},${b.toFixed(0).padStart(3)})   ` +
        `${sat.toFixed(2)}`
    );
  }

  // Heart: the dominant blob of warm pixels. Centroid then radial profile.
  const cx = warm.reduce((s, p) => s + p.x, 0) / warm.length;
  const cy = warm.reduce((s, p) => s + p.y, 0) / warm.length;
  const withR = warm.map((p) => ({ ...p, d: Math.hypot(p.x - cx, p.y - cy) }));
  const maxD = Math.max(...withR.map((p) => p.d));
  console.log(
    `\nheart centroid: (${cx.toFixed(0)}, ${cy.toFixed(0)}), warm extent radius ${maxD.toFixed(0)}px`
  );
  console.log('radial profile (fraction of radius):');
  console.log('  band       n        mean hex    rgb                 p25-luma hex');
  for (let i = 0; i < 6; i++) {
    const lo = (i / 6) * maxD;
    const hi = ((i + 1) / 6) * maxD;
    const seg = withR.filter((p) => p.d >= lo && p.d < hi);
    if (seg.length < 12) continue;
    const r = mean(seg, 'r');
    const g = mean(seg, 'g');
    const b = mean(seg, 'b');
    // Darker quartile within the band: the shadowed interior rather than highlights.
    const sorted = [...seg].sort((a, b2) => a.L - b2.L);
    const dark = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.25)));
    console.log(
      `  ${(i / 6).toFixed(2)}-${((i + 1) / 6).toFixed(2)}  ${String(seg.length).padStart(6)}   ` +
        `${hex(r, g, b)}   rgb(${r.toFixed(0).padStart(3)},${g.toFixed(0).padStart(3)},${b.toFixed(0).padStart(3)})   ` +
        `${hex(mean(dark, 'r'), mean(dark, 'g'), mean(dark, 'b'))}`
    );
  }

  // The specific ask: the dark red in the middle of the heart.
  const inner = withR.filter((p) => p.d < maxD * 0.5);
  const innerSorted = [...inner].sort((a, b2) => a.L - b2.L);
  for (const [name, lo, hi] of [
    ['inner darkest 25%', 0, 0.25],
    ['inner 25-50%     ', 0.25, 0.5],
    ['inner median band', 0.4, 0.6],
  ]) {
    const seg = innerSorted.slice(
      Math.floor(innerSorted.length * lo),
      Math.max(1, Math.floor(innerSorted.length * hi))
    );
    if (!seg.length) continue;
    const r = mean(seg, 'r');
    const g = mean(seg, 'g');
    const b = mean(seg, 'b');
    console.log(
      `  ${name}: ${hex(r, g, b)}  rgb(${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)})  luma ${mean(seg, 'L').toFixed(1)}`
    );
  }
  return { ramp, cx, cy };
}

// ---- video ----
const W = 1280;
const H = 720;
const FRAME = W * H * 3;
const buf = decodeVideo(CLIP);
const frames = Math.floor(buf.length / FRAME);
console.log(`${CLIP}: ${frames} frames at ${W}x${H}`);
// Mid-loop frame: heart fully formed and settled.
const mid = Math.floor(frames / 2);
const f = buf.subarray(mid * FRAME, (mid + 1) * FRAME);
analyse(`${CLIP} frame ${mid}`, (x, y) => {
  const p = (y * W + x) * 3;
  return [f[p], f[p + 1], f[p + 2]];
}, W, H);

// ---- lockup ----
try {
  const img = decodeImage(LOCKUP);
  analyse(`${LOCKUP} (${img.w}x${img.h})`, (x, y) => {
    const p = (y * img.w + x) * 4;
    if (img.data[p + 3] < 200) return null; // ignore transparent
    return [img.data[p], img.data[p + 1], img.data[p + 2]];
  }, img.w, img.h);
} catch (e) {
  console.log(`\n(could not read ${LOCKUP}: ${e.message})`);
}
