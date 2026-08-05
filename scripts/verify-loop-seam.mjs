/**
 * Measures whether a clip loops without a visible jump.
 *
 * A seamless loop's wrap (last frame → first frame) should be no more abrupt
 * than an ordinary frame-to-frame step inside the clip. This reports the wrap
 * delta as a multiple of the clip's typical step, so a spike is obvious.
 *
 * Usage: node scripts/verify-loop-seam.mjs <clip> [moreClips...]
 */
import { spawnSync } from 'node:child_process';

const W = 128;
const H = 72;
const FRAME_BYTES = W * H;

function frames(path) {
  const r = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'],
    { maxBuffer: 1 << 30 }
  );
  if (r.status !== 0) throw new Error(r.stderr.toString().slice(0, 400));
  const buf = r.stdout;
  const n = Math.floor(buf.length / FRAME_BYTES);
  return Array.from({ length: n }, (_, i) =>
    buf.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES)
  );
}

function rmse(a, b) {
  let s = 0;
  for (let i = 0; i < FRAME_BYTES; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s / FRAME_BYTES);
}

for (const path of process.argv.slice(2)) {
  const f = frames(path);
  const steps = [];
  for (let i = 1; i < f.length; i++) steps.push(rmse(f[i - 1], f[i]));
  const wrap = rmse(f[f.length - 1], f[0]);

  const sorted = [...steps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const max = sorted[sorted.length - 1];

  console.log(`\n${path}`);
  console.log(`  frames:             ${f.length}`);
  console.log(`  median step:        ${median.toFixed(2)}`);
  console.log(`  p95 step:           ${p95.toFixed(2)}`);
  console.log(`  max step:           ${max.toFixed(2)}`);
  console.log(`  WRAP step:          ${wrap.toFixed(2)}`);
  console.log(
    `  wrap / median:      ${(wrap / median).toFixed(2)}x  ` +
      `${wrap <= p95 ? '✅ within normal motion' : '❌ visible jump'}`
  );
}
