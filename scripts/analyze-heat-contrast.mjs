/**
 * Contrast of the hot-iron copy, measured from the paired screenshots that
 * verify-heat-and-exit.mjs captures (one with the copy visible, one with it hidden
 * against the identical paused video frame).
 *
 * Having both frames is what makes this honest. The glyph mask is exactly the set of
 * pixels the copy brightened, so:
 *
 *   - "vs true background" reads the copy-hidden frame at those same pixels. That is
 *     literally the text colour against the background colour behind it, which is what
 *     WCAG 1.4.3 asks for, and it is the number that has to hold.
 *   - "vs 3-7px band" reads the composited frame just outside the glyphs. The previous
 *     round reported this, when a dark halo made it flattering. A warm bloom raises it
 *     instead, so this is where the glow visibly costs contrast — reported rather than
 *     hidden.
 *   - "vs 40-70px backdrop" reads past the bloom, showing the artwork the whole block
 *     sits against.
 *
 * Lines are separated by clustering glyph rows, so the wordmark and the tagline get
 * judged against their own thresholds instead of being averaged together.
 *
 * Usage: node scripts/analyze-heat-contrast.mjs [dir]
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const DIR = process.argv[2] ?? '/Users/purduelaw/heat-verify';

function decode(path) {
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path,
  ]);
  if (probe.status !== 0) throw new Error(`ffprobe: ${probe.stderr.toString().slice(0, 200)}`);
  const [w, h] = probe.stdout.toString().trim().split(',').map(Number);
  const out = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-vf', 'format=rgb24', '-f', 'rawvideo', '-'],
    { maxBuffer: 1 << 30 }
  );
  if (out.status !== 0) throw new Error(`ffmpeg: ${out.stderr.toString().slice(0, 200)}`);
  return { w, h, data: out.stdout };
}

const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const s = i / 255;
  LIN[i] = s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
const lumaOf = (d, p) => 0.2126 * LIN[d[p]] + 0.7152 * LIN[d[p + 1]] + 0.0722 * LIN[d[p + 2]];
const ratio = (a, b) => {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};
const stats = (arr) => {
  if (!arr.length) return null;
  const s = Float64Array.from(arr).sort();
  const q = (f) => s[Math.min(s.length - 1, Math.floor(f * s.length))];
  return {
    n: s.length,
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    p50: q(0.5),
    p95: q(0.95),
    max: s[s.length - 1],
  };
};

/** Chebyshev distance to the nearest set pixel, two-pass, capped. */
function distanceTransform(mask, w, h, cap) {
  const d = new Int32Array(w * h).fill(cap);
  for (let i = 0; i < mask.length; i++) if (mask[i]) d[i] = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x > 0) m = Math.min(m, d[i - 1] + 1);
      if (y > 0) m = Math.min(m, d[i - w] + 1);
      if (y > 0 && x > 0) m = Math.min(m, d[i - w - 1] + 1);
      if (y > 0 && x < w - 1) m = Math.min(m, d[i - w + 1] + 1);
      d[i] = Math.min(m, cap);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x < w - 1) m = Math.min(m, d[i + 1] + 1);
      if (y < h - 1) m = Math.min(m, d[i + w] + 1);
      if (y < h - 1 && x < w - 1) m = Math.min(m, d[i + w + 1] + 1);
      if (y < h - 1 && x > 0) m = Math.min(m, d[i + w - 1] + 1);
      d[i] = Math.min(m, cap);
    }
  }
  return d;
}

const pairs = readdirSync(DIR)
  .filter((f) => f.endsWith('-with.png'))
  .map((f) => f.replace('-with.png', ''))
  .sort();

console.log(
  'Hot-iron copy contrast. "true bg" is the strict WCAG reading; "3-7px" is the\n' +
    'metric the previous round reported; "40-70px" is the backdrop past the bloom.\n'
);

for (const key of pairs) {
  const A = decode(`${DIR}/${key}-with.png`);
  const B = decode(`${DIR}/${key}-without.png`);
  if (A.w !== B.w || A.h !== B.h) {
    console.log(`${key}: size mismatch, skipping`);
    continue;
  }
  const { w, h } = A;
  const withL = new Float64Array(w * h);
  const withoutL = new Float64Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 3) {
    withL[i] = lumaOf(A.data, p);
    withoutL[i] = lumaOf(B.data, p);
  }

  // Glyph core: bright in the composite and substantially brighter than the frame
  // without the copy. The second condition is what excludes the anvil's own specular
  // highlights, which are identical in both frames.
  const core = new Uint8Array(w * h);
  let any = false;
  for (let i = 0; i < w * h; i++) {
    if (withL[i] > 0.62 && withL[i] - withoutL[i] > 0.15) {
      core[i] = 1;
      any = true;
    }
  }
  if (!any) {
    console.log(`${key}: no glyph pixels found`);
    continue;
  }

  // Split into lines by clustering rows, tolerating small vertical gaps within a line.
  const rowHas = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (core[y * w + x]) {
        rowHas[y] = 1;
        break;
      }
    }
  }
  const groups = [];
  let start = -1;
  let gap = 0;
  const GAP_TOL = 6;
  for (let y = 0; y < h; y++) {
    if (rowHas[y]) {
      if (start < 0) start = y;
      gap = 0;
    } else if (start >= 0) {
      if (++gap > GAP_TOL) {
        groups.push([start, y - gap]);
        start = -1;
      }
    }
  }
  if (start >= 0) groups.push([start, h - 1]);

  const dist = distanceTransform(core, w, h, 200);

  console.log(`=== ${key} ===`);
  for (const [y0, y1] of groups) {
    if (y1 - y0 < 4) continue;
    // Bands are collected only within this line's rows, padded, so neighbouring
    // lines do not leak into one another's measurements.
    const pad = 80;
    const ya = Math.max(0, y0 - pad);
    const yb = Math.min(h - 1, y1 + pad);

    const glyph = [];
    const trueBg = [];
    const near = [];
    const outer = [];
    for (let y = ya; y <= yb; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (core[i] && y >= y0 && y <= y1) {
          glyph.push(withL[i]);
          trueBg.push(withoutL[i]);
        }
        const dv = dist[i];
        if (dv >= 3 && dv <= 7) near.push(withL[i]);
        else if (dv >= 40 && dv <= 70) outer.push(withL[i]);
      }
    }
    // How far the light actually travels. Having the copy-hidden frame means the
    // glow's contribution can be isolated exactly: at each distance from a glyph,
    // the mean luminance the copy added. The reach is where that dies away.
    const added = new Map();
    for (let y = ya; y <= yb; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const dv = dist[i];
        if (dv === 0 || dv > 90) continue;
        if (!added.has(dv)) added.set(dv, []);
        added.get(dv).push(withL[i] - withoutL[i]);
      }
    }
    const meanAt = (dv) => {
      const a = added.get(dv);
      return a && a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    };
    let reach01 = 0;
    let reach002 = 0;
    for (let dv = 1; dv <= 90; dv++) {
      if (meanAt(dv) >= 0.01) reach01 = dv;
      if (meanAt(dv) >= 0.002) reach002 = dv;
    }

    const g = stats(glyph);
    const tb = stats(trueBg);
    const nr = stats(near);
    const ou = stats(outer);
    const px = y1 - y0 + 1;
    console.log(
      `  line rows ${String(y0).padStart(3)}..${String(y1).padStart(3)} (${String(px).padStart(2)}px tall, ${g.n} glyph px)`
    );
    console.log(`    glyph luminance        mean ${g.mean.toFixed(3)}  p50 ${g.p50.toFixed(3)}`);
    console.log(
      `    vs true background     mean ${ratio(g.mean, tb.mean).toFixed(1)}:1   ` +
        `worst(p95 bg) ${ratio(g.mean, tb.p95).toFixed(1)}:1   ` +
        `worst pixel ${ratio(g.mean, tb.max).toFixed(1)}:1`
    );
    if (nr)
      console.log(
        `    vs 3-7px band          mean ${ratio(g.mean, nr.mean).toFixed(1)}:1   ` +
          `p95 ${ratio(g.mean, nr.p95).toFixed(1)}:1`
      );
    if (ou)
      console.log(
        `    vs 40-70px backdrop    mean ${ratio(g.mean, ou.mean).toFixed(1)}:1   ` +
          `p95 ${ratio(g.mean, ou.p95).toFixed(1)}:1`
      );
    console.log(
      `    glow reach             ${reach01}px to +0.01 luma, ${reach002}px to +0.002   ` +
        `[added luma at 2px ${meanAt(2).toFixed(3)}, 8px ${meanAt(8).toFixed(3)}, ` +
        `20px ${meanAt(20).toFixed(3)}, 50px ${meanAt(50).toFixed(3)}]`
    );
  }
  console.log();
}
