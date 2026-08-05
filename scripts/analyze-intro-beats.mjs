/**
 * Finds where the hero intro's narrative beats actually land.
 *
 * The copy sequence is timed against this footage, so the beats need to be
 * anchored to real visual moments rather than round numbers: how dark the frame
 * reads early on, when the flame resolves into a stable column, and when the
 * heart finishes forming. Per frame this reports:
 *
 *   luma   - whole-frame brightness, for "when the world grows dark"
 *   flame  - count of bright cyan pixels, for when the fire establishes
 *   heart  - count of red-dominant pixels plus their bounding box, for when the
 *            heart completes (it is the only warm element in a cyan scene)
 *   copyBg - brightness of the band the copy will occupy, for contrast planning
 *
 * Usage: node scripts/analyze-intro-beats.mjs [video]
 */
import { spawnSync } from 'node:child_process';

const SRC = process.argv[2] ?? 'public/hero-background.mp4';
const W = 640;
const H = 360;
const FPS = 24;
const FRAME = W * H * 3;

/** Candidate copy band in source rows, halved for this decode scale. */
const COPY_TOP = Math.round(482 / 2);
const COPY_BOTTOM = Math.round(600 / 2);

const r = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', SRC, '-vf', `scale=${W}:${H},format=rgb24`, '-f', 'rawvideo', '-'],
  { maxBuffer: 1 << 30 }
);
if (r.status !== 0) throw new Error(r.stderr.toString().slice(0, 400));
const buf = r.stdout;
const n = Math.floor(buf.length / FRAME);
console.log(`${SRC}: ${n} frames (${(n / FPS).toFixed(2)}s) at ${W}x${H}\n`);

const rows = [];
for (let i = 0; i < n; i++) {
  const f = buf.subarray(i * FRAME, (i + 1) * FRAME);
  let luma = 0;
  let flame = 0;
  let heart = 0;
  let hx0 = W;
  let hx1 = 0;
  let hy0 = H;
  let hy1 = 0;
  let copySum = 0;
  let copyN = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 3;
      const R = f[p];
      const G = f[p + 1];
      const B = f[p + 2];
      const l = 0.299 * R + 0.587 * G + 0.114 * B;
      luma += l;
      if (G > 110 && B > 110 && R < G * 0.85) flame++;
      // The heart is the only warm-hued object in an otherwise cyan frame.
      if (R > 95 && R > G * 1.4 && R > B * 1.25) {
        heart++;
        if (x < hx0) hx0 = x;
        if (x > hx1) hx1 = x;
        if (y < hy0) hy0 = y;
        if (y > hy1) hy1 = y;
      }
      if (y >= COPY_TOP && y < COPY_BOTTOM) {
        copySum += l;
        copyN++;
      }
    }
  }
  rows.push({
    i,
    t: i / FPS,
    luma: luma / (W * H),
    flame,
    heart,
    hw: heart ? hx1 - hx0 : 0,
    hh: heart ? hy1 - hy0 : 0,
    copyBg: copySum / copyN,
  });
}

const maxFlame = Math.max(...rows.map((r) => r.flame));
const maxHeart = Math.max(...rows.map((r) => r.heart));

console.log('    t   luma   flame%  heart%  heartBox   copyBg   flame bar / heart bar');
for (let i = 0; i < n; i += 6) {
  const r = rows[i];
  console.log(
    `${r.t.toFixed(2).padStart(5)}  ${r.luma.toFixed(2).padStart(5)}  ` +
      `${((100 * r.flame) / maxFlame).toFixed(0).padStart(5)}%  ` +
      `${((100 * r.heart) / maxHeart).toFixed(0).padStart(5)}%  ` +
      `${String(r.hw).padStart(3)}x${String(r.hh).padStart(3)}  ` +
      `${r.copyBg.toFixed(2).padStart(6)}   ` +
      '='.repeat(Math.round((r.flame / maxFlame) * 22)) +
      ' | ' +
      '#'.repeat(Math.round((r.heart / maxHeart) * 18))
  );
}

/** First time a series reaches `frac` of its own maximum and stays there. */
function stableFrom(key, frac) {
  const max = Math.max(...rows.map((r) => r[key]));
  for (let i = 0; i < n; i++) {
    if (rows[i][key] >= max * frac && rows.slice(i).every((r) => r[key] >= max * frac * 0.9)) {
      return rows[i].t;
    }
  }
  return null;
}

console.log('\nMilestones:');
console.log(`  frame is darkest at            t=${rows.reduce((a, b) => (a.luma < b.luma ? a : b)).t.toFixed(2)}`);
for (const f of [0.25, 0.5, 0.8, 0.9, 0.95]) {
  console.log(
    `  flame reaches ${(f * 100).toFixed(0).padStart(2)}% and holds:  ` +
      `t=${String(stableFrom('flame', f) ?? '-')}`
  );
}
for (const f of [0.5, 0.8, 0.9, 0.95, 0.98]) {
  console.log(
    `  heart reaches ${(f * 100).toFixed(0).padStart(2)}% and holds:  ` +
      `t=${String(stableFrom('heart', f) ?? '-')}`
  );
}

// Where does the heart stop growing? That is when it reads as "fully formed".
const heartPeak = Math.max(...rows.map((r) => r.heart));
const firstFull = rows.find((r) => r.heart >= heartPeak * 0.97);
console.log(
  `\n  heart area peaks at ${heartPeak} px; first within 3% of peak at ` +
    `t=${firstFull ? firstFull.t.toFixed(2) : '-'} (box ${firstFull?.hw}x${firstFull?.hh})`
);

console.log('\nSecond-by-second detail (heart growth):');
console.log('    t   heart%  box(w x h)  copyBg');
for (let s = 0; s <= Math.floor(n / FPS); s++) {
  const r = rows[Math.min(n - 1, s * FPS)];
  console.log(
    `${r.t.toFixed(2).padStart(5)}  ${((100 * r.heart) / maxHeart).toFixed(0).padStart(5)}%  ` +
      `${String(r.hw).padStart(4)} x${String(r.hh).padStart(4)}  ${r.copyBg.toFixed(2).padStart(6)}`
  );
}
