/**
 * Checks the freeze boundary cannot be seen.
 *
 * Two independent ways a mask betrays itself:
 *   temporal - motion stops abruptly at one row instead of easing out, so the eye
 *              catches a line where the image "goes dead"
 *   spatial  - brightness steps across the boundary, leaving a visible band
 *
 * The first is measured as per-row motion through the feather: it should ramp, not
 * cliff. The second compares each row's brightness curvature at the boundary
 * against the surrounding rows, and compares the frozen build against the
 * pre-freeze build to confirm freezing introduced no new step.
 *
 * Usage: node scripts/verify-feather-seam.mjs <frozenClip> <preFreezeClip>
 */
import { spawnSync } from 'node:child_process';

const W = 1280;
const H = 720;
const FRAME = W * H;
const FEATHER_TOP = 446;
const FEATHER_BOTTOM = 478;

function load(path) {
  const r = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-vf', 'format=gray', '-f', 'rawvideo', '-'],
    { maxBuffer: 1 << 30 }
  );
  if (r.status !== 0) throw new Error(r.stderr.toString().slice(0, 400));
  const b = r.stdout;
  const n = Math.floor(b.length / FRAME);
  return Array.from({ length: n }, (_, i) => b.subarray(i * FRAME, (i + 1) * FRAME));
}

/** Per-row temporal motion and per-row mean brightness. */
function profiles(F) {
  const n = F.length;
  const motion = new Float64Array(H);
  const mean = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    let m = 0;
    let l = 0;
    for (let i = 0; i < n; i++) {
      const cur = F[i];
      const prev = F[(i - 1 + n) % n];
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        m += Math.abs(cur[idx] - prev[idx]);
        l += cur[idx];
      }
    }
    motion[y] = m / (n * W);
    mean[y] = l / (n * W);
  }
  return { motion, mean };
}

const [frozenPath, prePath] = process.argv.slice(2);
const frozen = profiles(load(frozenPath));
const pre = prePath ? profiles(load(prePath)) : null;

console.log(`Feather: rows ${FEATHER_TOP}..${FEATHER_BOTTOM}\n`);
console.log('   y   motion(frozen)  motion(pre)   ramp');
const maxM = Math.max(...frozen.motion.slice(430, 500));
for (let y = 430; y <= 500; y += 2) {
  const mark =
    y === FEATHER_TOP ? ' <- feather top' : y === FEATHER_BOTTOM ? ' <- feather bottom' : '';
  console.log(
    `${String(y).padStart(4)}  ${frozen.motion[y].toFixed(3).padStart(13)}  ` +
      `${(pre ? pre.motion[y].toFixed(3) : '-').padStart(11)}   ` +
      '#'.repeat(Math.round((frozen.motion[y] / maxM) * 30)) +
      mark
  );
}

// A cliff would make one row's motion drop far more than its neighbours do.
let worstDrop = { y: 0, drop: 0 };
for (let y = 431; y < 499; y++) {
  const drop = Math.abs(frozen.motion[y] - frozen.motion[y + 1]);
  if (drop > worstDrop.drop) worstDrop = { y, drop };
}
const drops = [];
for (let y = 431; y < 499; y++) drops.push(Math.abs(frozen.motion[y] - frozen.motion[y + 1]));
drops.sort((a, b) => a - b);
console.log(
  `\nLargest single-row motion drop in 430..500: ${worstDrop.drop.toFixed(3)} ` +
    `at y=${worstDrop.y}  (median row-to-row drop ${drops[drops.length >> 1].toFixed(3)})`
);
console.log(
  `Motion at feather top ${frozen.motion[FEATHER_TOP].toFixed(3)} → ` +
    `bottom ${frozen.motion[FEATHER_BOTTOM].toFixed(3)} over ` +
    `${FEATHER_BOTTOM - FEATHER_TOP} rows: ` +
    `${((frozen.motion[FEATHER_TOP] - frozen.motion[FEATHER_BOTTOM]) / (FEATHER_BOTTOM - FEATHER_TOP)).toFixed(4)} per row`
);

// Spatial: brightness curvature per row. A band shows up as an outlier here.
const curvature = (mean, y) => Math.abs(mean[y - 1] - 2 * mean[y] + mean[y + 1]);
const local = [];
for (let y = 420; y <= 510; y++) local.push(curvature(frozen.mean, y));
local.sort((a, b) => a - b);
const p50 = local[local.length >> 1];
const p95 = local[Math.floor(local.length * 0.95)];
console.log(`\nBrightness curvature in rows 420..510: median ${p50.toFixed(3)}, p95 ${p95.toFixed(3)}`);
for (const y of [FEATHER_TOP - 1, FEATHER_TOP, FEATHER_TOP + 1, FEATHER_BOTTOM - 1, FEATHER_BOTTOM, FEATHER_BOTTOM + 1]) {
  const c = curvature(frozen.mean, y);
  console.log(
    `  y=${y}: ${c.toFixed(3)}  ${c <= p95 ? 'within normal variation' : 'OUTLIER — possible band'}`
  );
}

if (pre) {
  let maxDelta = { y: 0, d: 0 };
  for (let y = 400; y < 540; y++) {
    const d = Math.abs(frozen.mean[y] - pre.mean[y]);
    if (d > maxDelta.d) maxDelta = { y, d };
  }
  console.log(
    `\nLargest brightness shift vs pre-freeze build in rows 400..540: ` +
      `${maxDelta.d.toFixed(3)} at y=${maxDelta.y} ` +
      `(on a 0..255 scale, so ${((maxDelta.d / 255) * 100).toFixed(2)}%)`
  );
}
