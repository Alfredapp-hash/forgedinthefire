/**
 * Finds the pair of frames in the hero video's fully-lit tail whose images match
 * most closely, so a loop cut between them is as close to invisible as possible.
 *
 * Flame footage flickers constantly, so an arbitrary "last N seconds" boundary
 * always pops. This scores every candidate (in, out) pair instead.
 *
 * Usage: node scripts/find-loop-points.mjs [videoPath]
 */
import { spawnSync } from 'node:child_process';

const VIDEO =
  process.argv[2] ?? 'assets-src/hero-background.pre-loop-encode.mp4';

// Only consider the stretch where the flame is already fully lit.
const WINDOW_START = 9.0;
const FPS = 24;
const W = 128;
const H = 72;
const FRAME_BYTES = W * H;

// A loop shorter than this feels twitchy; longer than the window is impossible.
const MIN_LOOP_SECONDS = 1.2;

// Motion continuity matters as much as a static frame match: if the flame is
// moving in different directions at the two cut points, it still reads as a jump.
const MOTION_WEIGHT = 0.6;

function decodeGrayFrames(path, startSeconds) {
  const args = [
    '-v', 'error',
    '-ss', String(startSeconds),
    '-i', path,
    '-vf', `scale=${W}:${H},format=gray`,
    '-f', 'rawvideo',
    '-',
  ];
  const out = spawnSync('ffmpeg', args, { maxBuffer: 1 << 30 });
  if (out.status !== 0) {
    throw new Error(`ffmpeg failed: ${out.stderr?.toString().slice(0, 500)}`);
  }
  const buf = out.stdout;
  const count = Math.floor(buf.length / FRAME_BYTES);
  const frames = [];
  for (let i = 0; i < count; i++) {
    frames.push(buf.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES));
  }
  return frames;
}

function rmse(a, b) {
  let sum = 0;
  for (let i = 0; i < FRAME_BYTES; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / FRAME_BYTES);
}

/** Frame-to-frame delta, used as a cheap proxy for local motion direction. */
function motionSignature(frames, index) {
  const prev = frames[Math.max(0, index - 1)];
  const cur = frames[index];
  const sig = new Float32Array(FRAME_BYTES);
  for (let i = 0; i < FRAME_BYTES; i++) sig[i] = cur[i] - prev[i];
  return sig;
}

function motionDistance(sigA, sigB) {
  let sum = 0;
  for (let i = 0; i < FRAME_BYTES; i++) {
    const d = sigA[i] - sigB[i];
    sum += d * d;
  }
  return Math.sqrt(sum / FRAME_BYTES);
}

const frames = decodeGrayFrames(VIDEO, WINDOW_START);
console.log(
  `Decoded ${frames.length} frames from ${WINDOW_START}s ` +
    `(${(frames.length / FPS).toFixed(2)}s of footage) at ${W}x${H}`
);

const motion = frames.map((_, i) => motionSignature(frames, i));
const minGap = Math.round(MIN_LOOP_SECONDS * FPS);

const results = [];
// `out` is the frame we cut away from; `inn` is the frame we cut back to.
for (let out = frames.length - 1; out >= minGap; out--) {
  for (let inn = 0; inn <= out - minGap; inn++) {
    const still = rmse(frames[out], frames[inn]);
    const move = motionDistance(motion[out], motion[inn]);
    results.push({
      inn,
      out,
      still,
      move,
      score: still + MOTION_WEIGHT * move,
      inT: WINDOW_START + inn / FPS,
      outT: WINDOW_START + out / FPS,
    });
  }
}

results.sort((a, b) => a.score - b.score);

console.log('\nBest loop candidates (lower score = less visible cut):');
console.log('  in(s)    out(s)   len(s)  still   motion  score');
for (const r of results.slice(0, 12)) {
  console.log(
    `  ${r.inT.toFixed(3)}  ${r.outT.toFixed(3)}  ${(r.outT - r.inT).toFixed(3)}   ` +
      `${r.still.toFixed(2)}   ${r.move.toFixed(2)}   ${r.score.toFixed(2)}`
  );
}

const worst = results[results.length - 1];
console.log(
  `\nFor scale, worst pair scores ${worst.score.toFixed(2)} ` +
    `(still ${worst.still.toFixed(2)})`
);

const best = results[0];
console.log(
  `\nBEST: in=${best.inT.toFixed(4)} out=${best.outT.toFixed(4)} ` +
    `length=${(best.outT - best.inT).toFixed(4)}`
);

// Best candidate per loop length, so we can trade loop duration against cut quality.
console.log('\nBest pair for each target loop length:');
console.log('  len(s)   in(s)    out(s)   still   score');
for (const target of [1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.5, 4.0]) {
  const band = results.filter(
    (r) => Math.abs(r.outT - r.inT - target) < 0.06
  );
  if (!band.length) continue;
  const b = band[0];
  console.log(
    `  ${target.toFixed(2)}   ${b.inT.toFixed(3)}  ${b.outT.toFixed(3)}  ` +
      `${b.still.toFixed(2)}   ${b.score.toFixed(2)}`
  );
}
