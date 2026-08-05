/**
 * Proves the effect: the anvil holds still while the flame keeps moving.
 *
 * Reports, per band, the mean adjacent-frame delta (wrap included, so the loop
 * join is tested too). Also reports a geometry-only figure — the delta after
 * normalising each frame's band brightness — which separates "the anvil is being
 * re-lit" from "the anvil is moving". Deliberate relighting should show up in the
 * raw number and vanish from the geometry number.
 *
 * Usage: node scripts/verify-anvil-static.mjs <clip> [clipToCompare...]
 */
import { spawnSync } from 'node:child_process';

const W = 1280;
const H = 720;
const FRAME = W * H;

const BANDS = [
  ['flame body', 120, 440],
  ['feather   ', 446, 478],
  ['anvil rim ', 478, 516],
  ['anvil body', 516, 596],
  ['anvil base', 596, 660],
  ['ground    ', 660, 716],
];

function load(path) {
  const r = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-vf', 'format=gray', '-f', 'rawvideo', '-'],
    { maxBuffer: 1 << 30 }
  );
  if (r.status !== 0) throw new Error(r.stderr.toString().slice(0, 400));
  const buf = r.stdout;
  const n = Math.floor(buf.length / FRAME);
  return Array.from({ length: n }, (_, i) => buf.subarray(i * FRAME, (i + 1) * FRAME));
}

function bandMean(f, top, bottom) {
  let s = 0;
  for (let y = top; y < bottom; y++) for (let x = 0; x < W; x++) s += f[y * W + x];
  return s / ((bottom - top) * W);
}

/** RMSE between two frames over a band; `scale` re-levels `b` before comparing. */
function bandRmse(a, b, top, bottom, scale = 1) {
  let s = 0;
  let c = 0;
  for (let y = top; y < bottom; y++)
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const d = a[idx] - Math.min(255, b[idx] * scale);
      s += d * d;
      c++;
    }
  return Math.sqrt(s / c);
}

for (const path of process.argv.slice(2)) {
  const F = load(path);
  const n = F.length;
  console.log(`\n${path}  (${n} frames)`);
  console.log('band          raw Δ    geometry Δ   worst raw');
  for (const [name, top, bottom] of BANDS) {
    let raw = 0;
    let geo = 0;
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const cur = F[i];
      const prev = F[(i - 1 + n) % n]; // includes the wrap
      const r = bandRmse(cur, prev, top, bottom);
      const mCur = bandMean(cur, top, bottom);
      const mPrev = bandMean(prev, top, bottom);
      const g = bandRmse(cur, prev, top, bottom, mPrev > 0.5 ? mCur / mPrev : 1);
      raw += r;
      geo += g;
      worst = Math.max(worst, r);
    }
    console.log(
      `${name}  ${(raw / n).toFixed(3).padStart(7)}  ${(geo / n).toFixed(3).padStart(11)}  ` +
        `${worst.toFixed(3).padStart(9)}`
    );
  }

  const flame = (() => {
    let s = 0;
    for (let i = 0; i < n; i++) s += bandRmse(F[i], F[(i - 1 + n) % n], 120, 440);
    return s / n;
  })();
  const anvil = (() => {
    let s = 0;
    for (let i = 0; i < n; i++) s += bandRmse(F[i], F[(i - 1 + n) % n], 478, 716);
    return s / n;
  })();
  console.log(
    `  → flame ${flame.toFixed(3)} vs anvil ${anvil.toFixed(3)}  ` +
      `(flame moves ${(flame / anvil).toFixed(1)}x more)`
  );
}
