/**
 * Distinguishes "the anvil moves" from "the light on the anvil changes".
 *
 * This matters because the frozen plate has to be blended into live footage
 * through a feather. If the anvil translates between frames, that blend doubles
 * high-contrast edges (the top rim especially) and the seam becomes visible. If
 * instead the geometry is fixed and only illumination varies, blending two
 * brightness variants of identical geometry is harmless.
 *
 * Measured only over actual anvil pixels, since the full lower band is mostly
 * black background which dilutes every statistic.
 *
 * Usage: node scripts/analyze-anvil-drift.mjs [clip]
 */
import { spawnSync } from 'node:child_process';

const CLIP = process.argv[2] ?? 'public/hero-flame-loop.mp4';
const W = 1280;
const H = 720;
const FRAME = W * H;
const TOP = 480;
const BOTTOM = 715;
/** Above this luma a pixel is anvil/glow rather than background. */
const SUBJECT_LUMA = 24;

const r = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', CLIP, '-vf', 'format=gray', '-f', 'rawvideo', '-'],
  { maxBuffer: 1 << 30 }
);
if (r.status !== 0) throw new Error(r.stderr.toString().slice(0, 400));
const buf = r.stdout;
const n = Math.floor(buf.length / FRAME);
const F = Array.from({ length: n }, (_, i) => buf.subarray(i * FRAME, (i + 1) * FRAME));

const PLATE = 36;
const plate = F[PLATE];

// Subject pixels, from the plate.
const subject = [];
for (let y = TOP; y < BOTTOM; y++)
  for (let x = 0; x < W; x++) {
    if (plate[y * W + x] >= SUBJECT_LUMA) subject.push({ x, y });
  }
console.log(`${CLIP}: ${n} frames`);
console.log(
  `Subject pixels (luma >= ${SUBJECT_LUMA}) in y ${TOP}..${BOTTOM}: ` +
    `${subject.length} (${((100 * subject.length) / ((BOTTOM - TOP) * W)).toFixed(1)}% of band)\n`
);

function shiftedRmse(f, dx, dy) {
  let s = 0;
  for (const { x, y } of subject) {
    const sx = Math.min(W - 1, Math.max(0, x + dx));
    const sy = Math.min(H - 1, Math.max(0, y + dy));
    const d = f[sy * W + sx] - plate[y * W + x];
    s += d * d;
  }
  return Math.sqrt(s / subject.length);
}

// If the anvil drifts, some non-zero offset will beat (0,0).
let improvedCount = 0;
const offsets = [];
let sumZero = 0;
let sumBest = 0;
for (let i = 0; i < n; i++) {
  const zero = shiftedRmse(F[i], 0, 0);
  let bestD = zero;
  let bestOff = [0, 0];
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      const d = shiftedRmse(F[i], dx, dy);
      if (d < bestD) {
        bestD = d;
        bestOff = [dx, dy];
      }
    }
  sumZero += zero;
  sumBest += bestD;
  if (bestOff[0] || bestOff[1]) improvedCount++;
  offsets.push(bestOff.join(','));
}

console.log('Alignment test (does shifting the frame match the plate better?):');
console.log(`  mean RMSE at zero offset: ${(sumZero / n).toFixed(3)}`);
console.log(`  mean RMSE at best offset: ${(sumBest / n).toFixed(3)}`);
console.log(`  frames improved by shifting: ${improvedCount}/${n}`);
const tally = offsets.reduce((m, o) => ((m[o] = (m[o] ?? 0) + 1), m), {});
console.log(`  best offsets: ${JSON.stringify(tally)}`);

// Now: how much of the residual is smooth (illumination) vs structural (motion)?
// Correct the plate with a heavily blurred ratio map; whatever survives is structure.
function boxBlurRows(src, radius) {
  const out = new Float64Array(W * H);
  for (let y = TOP; y < BOTTOM; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      let c = 0;
      for (let dy = -radius; dy <= radius; dy += 4)
        for (let dx = -radius; dx <= radius; dx += 4) {
          const sy = y + dy;
          const sx = x + dx;
          if (sy < TOP || sy >= BOTTOM || sx < 0 || sx >= W) continue;
          s += src[sy * W + sx];
          c++;
        }
      out[y * W + x] = c ? s / c : src[y * W + x];
    }
  }
  return out;
}

const plateBlur = boxBlurRows(plate, 32);
let localSum = 0;
for (let i = 0; i < n; i++) {
  const fBlur = boxBlurRows(F[i], 32);
  let s = 0;
  for (const { x, y } of subject) {
    const idx = y * W + x;
    const g = plateBlur[idx] > 1 ? fBlur[idx] / plateBlur[idx] : 1;
    const corrected = Math.min(255, plate[idx] * g);
    const d = F[i][idx] - corrected;
    s += d * d;
  }
  localSum += Math.sqrt(s / subject.length);
}

let adj = 0;
for (let i = 1; i < n; i++) {
  let s = 0;
  for (const { x, y } of subject) {
    const idx = y * W + x;
    const d = F[i][idx] - F[i - 1][idx];
    s += d * d;
  }
  adj += Math.sqrt(s / subject.length);
}

console.log('\nResidual on subject pixels:');
console.log(`  vs plate, uncorrected:              ${(sumZero / n).toFixed(3)}`);
console.log(`  vs plate, local illumination match: ${(localSum / n).toFixed(3)}`);
console.log(`  adjacent-frame noise floor:         ${(adj / (n - 1)).toFixed(3)}`);
console.log(
  `\nLocal illumination matching removes ` +
    `${(100 * (1 - localSum / sumZero)).toFixed(1)}% of the deviation.`
);
