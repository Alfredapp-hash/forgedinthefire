/**
 * Per-row report used to place the freeze mask.
 *
 * Three things need locating:
 *   flame  - rows containing flame body, which must stay fully live
 *   reflect- rows where the flame's reflection churns on the metal, which is what
 *            freezing actually costs us
 *   swing  - how much each row's overall light level varies, which is what a
 *            per-frame gain could restore
 *
 * Usage: node scripts/analyze-anvil-rows.mjs [clip]
 */
import { spawnSync } from 'node:child_process';

const CLIP = process.argv[2] ?? 'public/hero-flame-loop.mp4';
const W = 1280;
const H = 720;
const FRAME = W * H;
const PLATE = 36;
/** Flame body and hot highlights sit well above this. */
const HOT = 110;

const r = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', CLIP, '-vf', 'format=gray', '-f', 'rawvideo', '-'],
  { maxBuffer: 1 << 30 }
);
if (r.status !== 0) throw new Error(r.stderr.toString().slice(0, 400));
const buf = r.stdout;
const n = Math.floor(buf.length / FRAME);
const F = Array.from({ length: n }, (_, i) => buf.subarray(i * FRAME, (i + 1) * FRAME));
const plate = F[PLATE];

console.log(`${CLIP}: ${n} frames, plate = frame ${PLATE}\n`);
console.log('   y   mean  swing%  resid  hotpx  hotmove   bar(resid)');

const rows = [];
for (let y = 0; y < H; y++) {
  const means = [];
  let resid = 0;
  let hotMove = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    let rs = 0;
    let hm = 0;
    const f = F[i];
    const prev = F[(i - 1 + n) % n];
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      s += f[idx];
      const d = f[idx] - plate[idx];
      rs += d * d;
      if (f[idx] >= HOT || prev[idx] >= HOT) hm += Math.abs(f[idx] - prev[idx]);
    }
    means.push(s / W);
    resid += Math.sqrt(rs / W);
    hotMove += hm / W;
  }
  const mean = means.reduce((a, b) => a + b, 0) / n;
  const lo = Math.min(...means);
  const hi = Math.max(...means);
  let hotPx = 0;
  for (let x = 0; x < W; x++) if (plate[y * W + x] >= HOT) hotPx++;
  rows.push({
    y,
    mean,
    swing: mean > 0.5 ? (100 * (hi - lo)) / mean : 0,
    resid: resid / n,
    hotPx,
    hotMove: hotMove / n,
  });
}

const maxResid = Math.max(...rows.map((r) => r.resid));
for (let y = 380; y < H; y += 8) {
  const r = rows[y];
  console.log(
    `${String(y).padStart(4)}  ${r.mean.toFixed(1).padStart(5)}  ` +
      `${r.swing.toFixed(1).padStart(5)}  ${r.resid.toFixed(2).padStart(6)}  ` +
      `${String(r.hotPx).padStart(5)}  ${r.hotMove.toFixed(2).padStart(6)}   ` +
      '#'.repeat(Math.round((r.resid / maxResid) * 40))
  );
}

// Lowest row still containing flame body / hot moving pixels.
let lastHot = 0;
let lastHotMove = 0;
for (let y = 0; y < H; y++) {
  if (rows[y].hotPx > 3) lastHot = y;
  if (rows[y].hotMove > 1.0) lastHotMove = y;
}
console.log(`\nlowest row with hot pixels (luma>=${HOT}) in plate: y=${lastHot}`);
console.log(`lowest row with hot motion > 1.0:                  y=${lastHotMove}`);

const band = (a, b, key) =>
  (rows.slice(a, b).reduce((s, r) => s + r[key], 0) / (b - a)).toFixed(2);
console.log('\nBand summary:');
for (const [a, b] of [
  [380, 460],
  [460, 480],
  [480, 520],
  [520, 560],
  [560, 600],
  [600, 660],
  [660, 715],
]) {
  console.log(
    `  y ${String(a).padStart(3)}..${String(b).padStart(3)}: ` +
      `resid ${band(a, b, 'resid').padStart(6)}  swing% ${band(a, b, 'swing').padStart(5)}  ` +
      `hotMove ${band(a, b, 'hotMove').padStart(6)}  mean ${band(a, b, 'mean').padStart(6)}`
  );
}
