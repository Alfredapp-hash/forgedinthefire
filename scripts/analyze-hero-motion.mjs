/**
 * Profiles where motion actually lives in the hero loop, per image row.
 *
 * Freezing the anvil means cutting the frame somewhere. That cut has to land
 * below the flame's motion but also below most of its pulsing light spill,
 * otherwise frozen spill meets live spill and the boundary shows. This measures
 * both so the mask geometry is chosen from data.
 *
 * Usage: node scripts/analyze-hero-motion.mjs [clip]
 */
import { spawnSync } from 'node:child_process';

const CLIP = process.argv[2] ?? 'public/hero-flame-loop.mp4';
const W = 320;
const H = 180;
const FRAME = W * H;

const r = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', CLIP, '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'],
  { maxBuffer: 1 << 30 }
);
if (r.status !== 0) throw new Error(r.stderr.toString().slice(0, 400));

const buf = r.stdout;
const n = Math.floor(buf.length / FRAME);
const frames = Array.from({ length: n }, (_, i) =>
  buf.subarray(i * FRAME, (i + 1) * FRAME)
);
console.log(`${CLIP}: ${n} frames at ${W}x${H}\n`);

// Per-row mean |frame-to-frame delta| (motion) and mean luminance (spill level).
const motion = new Float64Array(H);
const luma = new Float64Array(H);

for (let y = 0; y < H; y++) {
  let mSum = 0;
  let lSum = 0;
  for (let i = 0; i < n; i++) {
    const cur = frames[i];
    const prev = frames[(i - 1 + n) % n]; // include the wrap
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      lSum += cur[idx];
      mSum += Math.abs(cur[idx] - prev[idx]);
    }
  }
  motion[y] = mSum / (n * W);
  luma[y] = lSum / (n * W);
}

const maxMotion = Math.max(...motion);
console.log('row  y720   motion  luma   bar');
for (let y = 0; y < H; y += 3) {
  const bar = '#'.repeat(Math.round((motion[y] / maxMotion) * 44));
  console.log(
    `${String(y).padStart(3)}  ${String(Math.round((y / H) * 720)).padStart(4)}  ` +
      `${motion[y].toFixed(2).padStart(6)}  ${luma[y].toFixed(1).padStart(5)}  ${bar}`
  );
}

// Where does motion fall to a small fraction of peak, scanning up from the bottom?
console.log('\nMotion thresholds (scanning from bottom up):');
for (const frac of [0.05, 0.08, 0.12, 0.2, 0.3]) {
  const thresh = maxMotion * frac;
  let y = H - 1;
  while (y > 0 && motion[y] < thresh) y--;
  console.log(
    `  last row below ${(frac * 100).toFixed(0)}% of peak motion: ` +
      `y=${y}/${H} → ${Math.round((y / H) * 720)}/720  (motion ${motion[y].toFixed(2)})`
  );
}

console.log(
  `\npeak motion ${maxMotion.toFixed(2)} at row ` +
    `${motion.indexOf(maxMotion)} (y720=${Math.round((motion.indexOf(maxMotion) / H) * 720)})`
);
