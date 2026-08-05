/**
 * Builds the hero's looping tail clip: a live, seamlessly-looping flame over a
 * frozen anvil.
 *
 * Two problems are solved here.
 *
 * 1. Seamless loop. Frame analysis (scripts/find-loop-points.mjs) shows the flame
 *    never repeats — the closest-matching frame pair in the tail still differs by
 *    ~7.8 RMSE, so any hard cut pops. A cross-dissolve is baked in instead, which
 *    makes the wrap frame-continuous with the source:
 *
 *      window W = w[0..N-1]
 *      blend[i] = w[i] * a  +  w[N-D+i] * (1-a)     for i in 0..D-1
 *      output   = blend ++ w[D..N-D-1]
 *
 *    Output length is N-D, and output[0] = w[N-D] while output[last] = w[N-D-1] —
 *    consecutive source frames. The wrap is a real frame transition, not a cut.
 *
 * 2. Static anvil. scripts/analyze-dissolve-cost.mjs shows that same dissolve is
 *    invisible on the flame (0.85x normal motion) but costs 1.85x on the anvil's
 *    specular rim: the two blended moments have different flame reflections on the
 *    metal, so the highlights cross-fade once per loop. Chaos reads as fine in fire
 *    and as wrong in steel, which is the "subtle shift" the whole frame appeared to
 *    have. Below the flame we therefore substitute a single frozen frame, so the
 *    dissolve cannot touch the anvil at all.
 *
 *    The trap is that the flame lights the anvil, so freezing naively freezes that
 *    light too. Handled three ways, all measured rather than assumed:
 *      - scripts/analyze-anvil-drift.mjs shows no translational drift (41/49 frames
 *        align best at zero offset), so blending live over frozen cannot double the
 *        anvil's edges. Only illumination differs, never geometry.
 *      - The feather starts in the dark trough between the flame's base and the
 *        anvil's top edge (row luma bottoms out at ~14 near y=460), where any
 *        mismatch is least visible, and the ramp is a smoothstep so there is no
 *        hard line anywhere.
 *      - The frozen plate's brightness is re-modulated per row per frame to track
 *        the live footage, so the anvil keeps breathing with the fire without
 *        moving. Rim brightness genuinely swings ~29% over the loop, so this is
 *        restoring real signal, not cosmetic.
 *
 *    The plate is chosen as the pristine frame whose spill level sits nearest the
 *    loop mean, which keeps that gain near 1.0 in both directions.
 *
 * Usage: node scripts/build-hero-loop.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';

const SRC = 'assets-src/hero-background.pre-loop-encode.mp4';
const OUT = 'public/hero-flame-loop.mp4';
const TMP = '/tmp/heroloop';

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;
const FRAME_BYTES = WIDTH * HEIGHT * 3;

/** First frame of the loop window. Frame 300 = 12.5s, well after the flame is lit. */
const WINDOW_START_FRAME = 300;
/** Dissolve length in frames (0.5s at 24fps). */
const BLEND_FRAMES = 12;

/**
 * Freeze feather, in source rows.
 *
 * TOP sits just under the flame body, inside the dark trough above the anvil.
 * BOTTOM sits just past the anvil's bright top edge (y 468..476), so the rim —
 * where the dissolve did the most damage — ends up essentially frozen while the
 * flame above stays entirely live.
 */
const FREEZE_TOP = 446;
const FREEZE_BOTTOM = 478;

/** Pixels this bright in the plate are anvil/glow rather than background. */
const SUBJECT_LUMA = 24;
/** Vertical smoothing of the gain profile, to avoid row-to-row banding. */
const GAIN_SMOOTH_ROWS = 14;
/** Gain limits: enough to breathe, tight enough to stay a light change. */
const GAIN_MIN = 0.9;
const GAIN_MAX = 1.12;

mkdirSync(TMP, { recursive: true });

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'inherit', 'pipe'] });
  if (r.status !== 0) {
    throw new Error(`${cmd} failed:\n${r.stderr?.toString().slice(0, 800)}`);
  }
}

// 1. Pull the loop window out as raw RGB so frame maths is exact.
const rawPath = `${TMP}/window.rgb`;
run('ffmpeg', [
  '-v', 'error', '-y',
  '-i', SRC,
  '-vf', `select=gte(n\\,${WINDOW_START_FRAME}),setpts=PTS-STARTPTS,format=rgb24`,
  '-vsync', '0',
  '-f', 'rawvideo',
  rawPath,
]);

const raw = readFileSync(rawPath);
const N = Math.floor(raw.length / FRAME_BYTES);
const D = BLEND_FRAMES;

if (N < D * 2 + 1) {
  throw new Error(`Window too short: ${N} frames for a ${D}-frame dissolve`);
}

const frame = (i) => raw.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES);
const loopCount = N - D;

console.log(
  `Window: ${N} frames (${(N / FPS).toFixed(3)}s) starting at frame ` +
    `${WINDOW_START_FRAME} (${(WINDOW_START_FRAME / FPS).toFixed(3)}s)`
);
console.log(
  `Dissolve: ${D} frames (${(D / FPS).toFixed(3)}s) → ` +
    `loop ${loopCount} frames (${(loopCount / FPS).toFixed(3)}s)`
);

// 2. Build the seamless loop (dissolve, then the untouched middle).
const loop = Buffer.allocUnsafe(loopCount * FRAME_BYTES);

for (let i = 0; i < D; i++) {
  const t = D === 1 ? 1 : i / (D - 1);
  const a = t * t * (3 - 2 * t); // smoothstep
  const incoming = frame(i); // w[i]
  const outgoing = frame(N - D + i); // w[N-D+i]
  const dst = loop.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES);
  for (let p = 0; p < FRAME_BYTES; p++) {
    dst[p] = (incoming[p] * a + outgoing[p] * (1 - a) + 0.5) | 0;
  }
}

for (let i = D; i < loopCount; i++) {
  frame(i).copy(loop, i * FRAME_BYTES);
}

const lf = (i) => loop.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES);

/** Luma plane for one loop frame, used for all measurement below. */
function lumaOf(buf) {
  const out = new Float32Array(WIDTH * HEIGHT);
  for (let i = 0, p = 0; i < out.length; i++, p += 3) {
    out[i] = 0.299 * buf[p] + 0.587 * buf[p + 1] + 0.114 * buf[p + 2];
  }
  return out;
}

const lumas = Array.from({ length: loopCount }, (_, i) => lumaOf(lf(i)));

// 3. Choose the freeze frame: pristine, and closest to the loop's mean spill.
// Frames 1..D-1 are cross-dissolved; 0 and D-1.. are untouched source frames.
const frozenBandMean = (L) => {
  let s = 0;
  let c = 0;
  for (let y = FREEZE_BOTTOM; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) {
      const v = L[y * WIDTH + x];
      if (v >= SUBJECT_LUMA) {
        s += v;
        c++;
      }
    }
  return c ? s / c : 0;
};

const bandMeans = lumas.map(frozenBandMean);
const loopMean = bandMeans.reduce((a, b) => a + b, 0) / loopCount;
const pristine = [0, ...Array.from({ length: loopCount - (D - 1) }, (_, k) => k + D - 1)];
let plateIdx = pristine[0];
for (const i of pristine) {
  if (Math.abs(bandMeans[i] - loopMean) < Math.abs(bandMeans[plateIdx] - loopMean)) {
    plateIdx = i;
  }
}
console.log(
  `\nFreeze plate: loop frame ${plateIdx} (source frame ` +
    `${WINDOW_START_FRAME + (plateIdx === 0 ? N - D : plateIdx)}), ` +
    `spill ${bandMeans[plateIdx].toFixed(2)} vs loop mean ${loopMean.toFixed(2)} ` +
    `[range ${Math.min(...bandMeans).toFixed(2)}..${Math.max(...bandMeans).toFixed(2)}]`
);

const plate = lf(plateIdx);
const plateLuma = lumas[plateIdx];

// 4. Feather: smoothstep from fully live to fully frozen.
const frozenWeight = new Float32Array(HEIGHT);
for (let y = 0; y < HEIGHT; y++) {
  if (y < FREEZE_TOP) frozenWeight[y] = 0;
  else if (y >= FREEZE_BOTTOM) frozenWeight[y] = 1;
  else {
    const t = (y - FREEZE_TOP) / (FREEZE_BOTTOM - FREEZE_TOP);
    frozenWeight[y] = t * t * (3 - 2 * t);
  }
}
console.log(
  `Feather: rows ${FREEZE_TOP}..${FREEZE_BOTTOM} (${FREEZE_BOTTOM - FREEZE_TOP}px, ` +
    `${(((FREEZE_BOTTOM - FREEZE_TOP) / HEIGHT) * 100).toFixed(1)}% of height); ` +
    `fully frozen below y=${FREEZE_BOTTOM}`
);

// Subject pixels per row, from the plate, for gain measurement.
const rowSubjects = [];
for (let y = 0; y < HEIGHT; y++) {
  const xs = [];
  if (y >= FREEZE_BOTTOM) {
    for (let x = 0; x < WIDTH; x++) {
      if (plateLuma[y * WIDTH + x] >= SUBJECT_LUMA) xs.push(x);
    }
  }
  rowSubjects.push(xs);
}

/**
 * Per-row brightness ratio between a live frame and the plate, over anvil pixels
 * only — the full row is mostly black background, which would wash the signal out.
 * Rows above the frozen band reuse the topmost measured row.
 */
function gainProfile(L) {
  const g = new Float32Array(HEIGHT).fill(1);
  for (let y = FREEZE_BOTTOM; y < HEIGHT; y++) {
    const xs = rowSubjects[y];
    if (xs.length < 40) continue;
    let live = 0;
    let base = 0;
    for (const x of xs) {
      live += L[y * WIDTH + x];
      base += plateLuma[y * WIDTH + x];
    }
    g[y] = base > 1 ? live / base : 1;
  }
  // Vertical smoothing, so no row jumps relative to its neighbours.
  const sm = new Float32Array(HEIGHT).fill(1);
  for (let y = FREEZE_BOTTOM; y < HEIGHT; y++) {
    let s = 0;
    let c = 0;
    for (let d = -GAIN_SMOOTH_ROWS; d <= GAIN_SMOOTH_ROWS; d++) {
      const yy = y + d;
      if (yy < FREEZE_BOTTOM || yy >= HEIGHT) continue;
      s += g[yy];
      c++;
    }
    sm[y] = Math.min(GAIN_MAX, Math.max(GAIN_MIN, c ? s / c : 1));
  }
  for (let y = 0; y < FREEZE_BOTTOM; y++) sm[y] = sm[FREEZE_BOTTOM];
  return sm;
}

// 5. Composite: live flame over the re-lit frozen plate.
const out = Buffer.allocUnsafe(loopCount * FRAME_BYTES);
let gainLo = Infinity;
let gainHi = -Infinity;

for (let i = 0; i < loopCount; i++) {
  const live = lf(i);
  const dst = out.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES);
  const gain = gainProfile(lumas[i]);

  for (let y = 0; y < HEIGHT; y++) {
    const fw = frozenWeight[y];
    const g = gain[y];
    if (y >= FREEZE_BOTTOM) {
      gainLo = Math.min(gainLo, g);
      gainHi = Math.max(gainHi, g);
    }
    let p = y * WIDTH * 3;
    if (fw === 0) {
      live.copy(dst, p, p, p + WIDTH * 3);
      continue;
    }
    const lw = 1 - fw;
    for (let x = 0; x < WIDTH; x++, p += 3) {
      for (let c = 0; c < 3; c++) {
        const frozen = plate[p + c] * g;
        const v = live[p + c] * lw + frozen * fw;
        dst[p + c] = v > 255 ? 255 : (v + 0.5) | 0;
      }
    }
  }
}

console.log(
  `Relight gain across frozen rows: ${gainLo.toFixed(3)}..${gainHi.toFixed(3)}`
);

const outRaw = `${TMP}/loop.rgb`;
writeFileSync(outRaw, out);

// 6. Encode. Dense keyframes keep the native loop restart cheap.
//
// CRF 17 rather than 19: with the anvil frozen, lossy noise is the only thing
// still moving down there, and it is measurable (scripts/verify-anvil-static.mjs).
// Tightening quality buys a visibly stiller plate for ~170KB, which the loop has
// 14.5s of intro playback to buffer.
run('ffmpeg', [
  '-v', 'error', '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgb24',
  '-s', `${WIDTH}x${HEIGHT}`, '-r', String(FPS),
  '-i', outRaw,
  '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-crf', '17', '-preset', 'slow',
  '-g', '12', '-keyint_min', '12', '-sc_threshold', '0',
  '-an', '-movflags', '+faststart',
  OUT,
]);

console.log(
  `\nWrote ${OUT} (${(statSync(OUT).size / 1024 / 1024).toFixed(2)} MB)`
);
console.log(
  `Wrap check: output[0] = w[${N - D}], output[last] = w[${N - D - 1}] ` +
    `(consecutive source frames)`
);
