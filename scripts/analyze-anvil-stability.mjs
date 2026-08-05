/**
 * Decides whether the anvil can be frozen without ghosting, and how much of its
 * variation is merely pulsing light rather than movement.
 *
 * If the anvil is geometrically stable and only its brightness changes, then a
 * frozen plate plus per-frame gain reproduces it almost exactly. If it actually
 * drifts, blending live over frozen would double high-contrast edges like the
 * anvil's top rim, so we need to know before committing.
 *
 * Usage: node scripts/analyze-anvil-stability.mjs [clip]
 */
import { spawnSync } from 'node:child_process';

const CLIP = process.argv[2] ?? 'public/hero-flame-loop.mp4';
const W = 1280;
const H = 720;
const FRAME = W * H;

/** Region that would be frozen: below the flame body. */
const REGION_TOP = 480;
const REGION_BOTTOM = 720;

const r = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', CLIP, '-vf', 'format=gray', '-f', 'rawvideo', '-'],
  { maxBuffer: 1 << 30 }
);
if (r.status !== 0) throw new Error(r.stderr.toString().slice(0, 400));
const buf = r.stdout;
const n = Math.floor(buf.length / FRAME);
const F = Array.from({ length: n }, (_, i) => buf.subarray(i * FRAME, (i + 1) * FRAME));
console.log(`${CLIP}: ${n} frames at ${W}x${H}`);
console.log(`Region under test: y ${REGION_TOP}..${REGION_BOTTOM}\n`);

const regionMean = (f) => {
  let s = 0;
  let c = 0;
  for (let y = REGION_TOP; y < REGION_BOTTOM; y++)
    for (let x = 0; x < W; x++) {
      s += f[y * W + x];
      c++;
    }
  return s / c;
};

const means = F.map(regionMean);
const meanOfMeans = means.reduce((a, b) => a + b, 0) / n;

// Pick the frame whose spill level sits nearest the loop mean, so gain stays
// near 1.0 in both directions and worst-case mismatch is minimised.
// Frames 1..10 are cross-dissolved, so restrict to pristine frames.
const pristine = [0, ...Array.from({ length: n - 11 }, (_, k) => k + 11)];
let best = pristine[0];
for (const i of pristine) {
  if (Math.abs(means[i] - meanOfMeans) < Math.abs(means[best] - meanOfMeans)) best = i;
}

console.log(
  `region mean luma: min ${Math.min(...means).toFixed(2)}  ` +
    `mean ${meanOfMeans.toFixed(2)}  max ${Math.max(...means).toFixed(2)}  ` +
    `(swing ${(Math.max(...means) - Math.min(...means)).toFixed(2)})`
);
console.log(
  `best freeze frame (pristine, closest to mean): ${best} ` +
    `(luma ${means[best].toFixed(2)}, gain range ` +
    `${(Math.min(...means) / means[best]).toFixed(3)}..${(Math.max(...means) / means[best]).toFixed(3)})\n`
);

const plate = F[best];

/** RMSE over the region, optionally scaling the plate by `gain` first. */
function regionRmse(f, gain) {
  let s = 0;
  let c = 0;
  for (let y = REGION_TOP; y < REGION_BOTTOM; y++)
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const p = Math.min(255, plate[idx] * gain);
      const d = f[idx] - p;
      s += d * d;
      c++;
    }
  return Math.sqrt(s / c);
}

let rawSum = 0;
let gainSum = 0;
let rawMax = 0;
let gainMax = 0;
for (let i = 0; i < n; i++) {
  const raw = regionRmse(F[i], 1);
  const g = regionRmse(F[i], means[i] / means[best]);
  rawSum += raw;
  gainSum += g;
  rawMax = Math.max(rawMax, raw);
  gainMax = Math.max(gainMax, g);
}

// Noise floor: difference between genuinely adjacent frames in the region.
let adjSum = 0;
for (let i = 1; i < n; i++) {
  let s = 0;
  let c = 0;
  for (let y = REGION_TOP; y < REGION_BOTTOM; y++)
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const d = F[i][idx] - F[i - 1][idx];
      s += d * d;
      c++;
    }
  adjSum += Math.sqrt(s / c);
}

console.log('Anvil region difference vs the frozen plate:');
console.log(`  raw (no correction):      mean ${(rawSum / n).toFixed(3)}  max ${rawMax.toFixed(3)}`);
console.log(`  after per-frame gain:     mean ${(gainSum / n).toFixed(3)}  max ${gainMax.toFixed(3)}`);
console.log(`  adjacent-frame noise floor: ${(adjSum / (n - 1)).toFixed(3)}`);
console.log(
  `\nGain correction removes ${(100 * (1 - gainSum / rawSum)).toFixed(1)}% of the deviation.`
);
console.log(
  gainSum / n < (adjSum / (n - 1)) * 2
    ? 'VERDICT: variation is dominated by light level, not movement → safe to freeze.'
    : 'VERDICT: significant residual after gain → real movement present, expect ghosting.'
);
