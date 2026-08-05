/**
 * Finds the rows in the settled anvil that are kindest to white text.
 *
 * The anvil must not be altered to make copy readable, so placement does the work
 * instead. Polished steel is not uniformly bright: the plate's underside sits in
 * shadow while the waist and feet catch specular highlights. This reports, per row,
 * how bright the backdrop is across the span a centred line of copy would cover —
 * and the contrast white would achieve against the brightest 5% of it, which is the
 * figure that decides legibility.
 *
 * Usage: node scripts/analyze-copy-band.mjs [clip]
 */
import { spawnSync } from 'node:child_process';

const SRC = process.argv[2] ?? 'public/hero-flame-loop.mp4';
const W = 1280;
const H = 720;
const FRAME = W * H * 3;

/** Horizontal spans a centred line covers: a long tagline, and a shorter one. */
const SPANS = [
  ['wide line  ', 295, 850],
  ['short line ', 430, 850],
];

const WHITE_L = 0.9501;
const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const relLum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (L) => (WHITE_L + 0.05) / (L + 0.05);

const r = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', SRC, '-vf', 'format=rgb24', '-f', 'rawvideo', '-'],
  { maxBuffer: 1 << 30 }
);
if (r.status !== 0) throw new Error(r.stderr.toString().slice(0, 400));
const buf = r.stdout;
const frames = Math.floor(buf.length / FRAME);

/** Worst case over the whole loop, so the resting state holds at every frame. */
function rowStats(top, bottom, x0, x1) {
  const lums = [];
  for (let f = 0; f < frames; f++) {
    const frame = buf.subarray(f * FRAME, (f + 1) * FRAME);
    for (let y = top; y < bottom; y++) {
      for (let x = x0; x < x1; x++) {
        const p = (y * W + x) * 3;
        lums.push(relLum(frame[p], frame[p + 1], frame[p + 2]));
      }
    }
  }
  lums.sort((a, b) => a - b);
  const q = (f) => lums[Math.min(lums.length - 1, Math.floor(f * lums.length))];
  return { median: ratio(q(0.5)), p95: ratio(q(0.95)), p99: ratio(q(0.99)) };
}

console.log(`${SRC} (${frames} frames), contrast of white against the backdrop\n`);
for (const [label, x0, x1] of SPANS) {
  console.log(`${label} x ${x0}..${x1}`);
  console.log('  rows        median    p95    p99');
  for (let top = 505; top + 18 <= 716; top += 9) {
    const s = rowStats(top, top + 18, x0, x1);
    const flag = s.p95 >= 7 ? 'AAA' : s.p95 >= 4.5 ? 'AA ' : '   ';
    console.log(
      `  ${String(top).padStart(3)}..${String(top + 18).padStart(3)}  ` +
        `${s.median.toFixed(1).padStart(7)}  ${s.p95.toFixed(1).padStart(5)}  ` +
        `${s.p99.toFixed(1).padStart(5)}  ${flag}`
    );
  }
  console.log();
}
