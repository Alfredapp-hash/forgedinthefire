/**
 * Tests whether the anvil's visible "shift" comes from the cross-dissolve rather
 * than from the footage itself.
 *
 * The loop asset blends w[i] with w[N-D+i] over its first 12 frames. Those two
 * moments have different flame reflections on the metal, so the dissolve
 * cross-fades the anvil's highlights once per loop. That would read as a periodic
 * shimmer on an object the eye expects to be solid.
 *
 * Compares adjacent-frame deltas inside the dissolve against the pristine
 * remainder, per band. A large ratio in the anvil bands confirms the diagnosis.
 *
 * Usage: node scripts/analyze-dissolve-cost.mjs [clip]
 */
import { spawnSync } from 'node:child_process';

const CLIP = process.argv[2] ?? 'public/hero-flame-loop.mp4';
const W = 1280;
const H = 720;
const FRAME = W * H;
/** Frames 1..11 are the dissolve transitions; 12.. are untouched source. */
const DISSOLVE_END = 11;

const r = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', CLIP, '-vf', 'format=gray', '-f', 'rawvideo', '-'],
  { maxBuffer: 1 << 30 }
);
if (r.status !== 0) throw new Error(r.stderr.toString().slice(0, 400));
const buf = r.stdout;
const n = Math.floor(buf.length / FRAME);
const F = Array.from({ length: n }, (_, i) => buf.subarray(i * FRAME, (i + 1) * FRAME));
console.log(`${CLIP}: ${n} frames\n`);

const BANDS = [
  ['flame body   ', 120, 450],
  ['anvil rim    ', 462, 482],
  ['anvil top    ', 482, 516],
  ['anvil body   ', 516, 596],
  ['anvil base   ', 596, 660],
  ['ground       ', 660, 716],
];

function bandDelta(a, b, top, bottom) {
  let s = 0;
  let c = 0;
  for (let y = top; y < bottom; y++)
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const d = a[idx] - b[idx];
      s += d * d;
      c++;
    }
  return Math.sqrt(s / c);
}

console.log('band            dissolve  pristine   ratio');
for (const [name, top, bottom] of BANDS) {
  let dSum = 0;
  let dN = 0;
  let pSum = 0;
  let pN = 0;
  for (let i = 1; i < n; i++) {
    const d = bandDelta(F[i], F[i - 1], top, bottom);
    if (i <= DISSOLVE_END) {
      dSum += d;
      dN++;
    } else {
      pSum += d;
      pN++;
    }
  }
  const dv = dSum / dN;
  const pv = pSum / pN;
  console.log(
    `${name}  ${dv.toFixed(3).padStart(8)}  ${pv.toFixed(3).padStart(8)}  ` +
      `${(dv / pv).toFixed(2).padStart(6)}x`
  );
}

console.log(
  '\nRatio > 1 means the dissolve disturbs that band more than normal motion does.'
);
