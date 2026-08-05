/**
 * Tracks where the flame and the anvil actually sit, frame by frame, through the
 * hero intro.
 *
 * The intro is not a locked-off shot: a droplet falls, ignites the anvil, and the
 * camera pulls back, so the anvil's row geometry drifts before settling for the
 * looping tail. Copy has to sit on the anvil band and never touch the flame, so a
 * single hardcoded row is only safe if the numbers say it is.
 *
 * The two subjects separate cleanly by colour rather than brightness: the flame is
 * strongly cyan-biased, while the anvil is desaturated steel. Brightness alone
 * fails here, because the flame's glow and its reflections on the metal are both
 * bright.
 *
 * Reports in source rows (1280x720 space):
 *   flameBottom - lowest row holding flame body, the floor copy must clear
 *   anvilTop    - topmost row with a wide band of steel, i.e. the top plate
 *   groundTop   - lowest row with steel, below which is floor
 *
 * Usage: node scripts/analyze-intro-geometry.mjs [video]
 */
import { spawnSync } from 'node:child_process';

const SRC = process.argv[2] ?? 'public/hero-background.mp4';
const W = 640;
const H = 360;
const FPS = 24;
const FRAME = W * H * 3;
const SCALE = 720 / H;

/** A wide run of steel pixels means we are on the anvil, not on a highlight. */
const METAL_RUN = 150;
/** Flame body needs this many strongly-cyan pixels in a row to count. */
const FLAME_RUN = 12;

const r = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', SRC, '-vf', `scale=${W}:${H},format=rgb24`, '-f', 'rawvideo', '-'],
  { maxBuffer: 1 << 30 }
);
if (r.status !== 0) throw new Error(r.stderr.toString().slice(0, 400));
const buf = r.stdout;
const n = Math.floor(buf.length / FRAME);

const out = [];
for (let i = 0; i < n; i++) {
  const f = buf.subarray(i * FRAME, (i + 1) * FRAME);
  const metal = new Int32Array(H);
  const flame = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 3;
      const R = f[p];
      const G = f[p + 1];
      const B = f[p + 2];
      const lum = 0.299 * R + 0.587 * G + 0.114 * B;
      const sat = Math.max(R, G, B) - Math.min(R, G, B);
      // Flame body: bright and strongly cyan-biased.
      if (B > 130 && B - R > 70 && lum > 90) flame[y]++;
      // Steel: visible but close to neutral, which excludes flame and glow.
      if (lum > 28 && sat < 55) metal[y]++;
    }
  }
  let flameBottom = null;
  for (let y = H - 1; y >= 0; y--) {
    if (flame[y] >= FLAME_RUN) {
      flameBottom = Math.round(y * SCALE);
      break;
    }
  }
  let anvilTop = null;
  for (let y = 0; y < H; y++) {
    if (metal[y] >= METAL_RUN) {
      anvilTop = Math.round(y * SCALE);
      break;
    }
  }
  let groundTop = null;
  for (let y = H - 1; y >= 0; y--) {
    if (metal[y] >= METAL_RUN) {
      groundTop = Math.round(y * SCALE);
      break;
    }
  }
  out.push({ t: i / FPS, flameBottom, anvilTop, groundTop });
}

console.log(`${SRC}: ${n} frames\n`);
console.log('    t  flameBottom  anvilTop  anvilLowest');
for (let i = 0; i < n; i += 6) {
  const r = out[i];
  console.log(
    `${r.t.toFixed(2).padStart(5)}  ${String(r.flameBottom ?? '-').padStart(11)}  ` +
      `${String(r.anvilTop ?? '-').padStart(8)}  ${String(r.groundTop ?? '-').padStart(11)}`
  );
}

const at = (t) => out[Math.min(n - 1, Math.round(t * FPS))];
console.log('\nAt candidate beat times:');
for (const t of [0.5, 1.0, 1.5, 2.0, 2.75, 3.3, 4.0, 5.0, 6.8, 7.5, 8.9, 9.5, 10, 12.5, 14.54]) {
  const r = at(t);
  console.log(
    `  t=${String(t).padStart(5)}  flameBottom=${String(r.flameBottom ?? '-').padStart(4)}  ` +
      `anvilTop=${String(r.anvilTop ?? '-').padStart(4)}  anvilLowest=${String(r.groundTop ?? '-').padStart(4)}`
  );
}

// Constraint for a persistent block: it must clear the flame from the moment it
// appears through the end of the intro, and match the loop's settled geometry.
for (const [label, from] of [
  ['final state onward (t>=8.9)', 8.9],
  ['settled tail (t>=12.5)', 12.5],
]) {
  const seg = out.filter((r) => r.t >= from && r.flameBottom !== null);
  const anv = seg.filter((r) => r.anvilTop !== null);
  console.log(
    `\n${label}: flameBottom ${Math.min(...seg.map((r) => r.flameBottom))}..` +
      `${Math.max(...seg.map((r) => r.flameBottom))}  ` +
      `anvilTop ${Math.min(...anv.map((r) => r.anvilTop))}..${Math.max(...anv.map((r) => r.anvilTop))}`
  );
}

const early = out.filter((r) => r.t >= 0.3 && r.t <= 7.5);
const earlyAnvil = early.filter((r) => r.anvilTop !== null);
console.log(
  `\nDuring beats 1-2 (0.3..7.5s): anvilTop ranges ` +
    `${Math.min(...earlyAnvil.map((r) => r.anvilTop))}..${Math.max(...earlyAnvil.map((r) => r.anvilTop))}`
);
const earlyFlame = early.filter((r) => r.flameBottom !== null);
if (earlyFlame.length) {
  const deepest = Math.max(...earlyFlame.map((r) => r.flameBottom));
  const when = earlyFlame.find((r) => r.flameBottom === deepest);
  console.log(
    `  deepest flame body during beats 1-2: row ${deepest} at t=${when.t.toFixed(2)}`
  );
}
