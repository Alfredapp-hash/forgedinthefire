/**
 * Computes the colour of glowing steel from blackbody radiation.
 *
 * The hero footage contains no incandescent source to sample: its flame is cyan
 * (the frame's brightest pixels are blue-biased) and its only warm pixels belong to
 * the heart, whose ramp is crimson rather than amber. Sampling the artwork therefore
 * cannot produce a hot-iron ramp, so this derives one from physics instead — which is
 * still a real source, not an invented palette.
 *
 * Planck's law gives spectral radiance per temperature; that is integrated against
 * the CIE 1931 colour matching functions to XYZ, converted to sRGB and normalised so
 * the brightest channel saturates. The result is the sequence of hues a cooling piece
 * of steel actually passes through, which is what the glow's falloff should follow.
 *
 * CIE 1931 CMFs use the multi-lobe analytic fit from Wyman, Sloan & Shirley (2013),
 * accurate to well within the tolerance that matters for a UI gradient.
 *
 * Usage: node scripts/compute-heat-ramp.mjs
 */

const H = 6.62607015e-34; // Planck constant, J*s
const C = 2.99792458e8; // speed of light, m/s
const KB = 1.380649e-23; // Boltzmann constant, J/K

/** Piecewise Gaussian used by the CMF fit. */
function pg(x, mu, s1, s2) {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

const xBar = (l) =>
  1.056 * pg(l, 599.8, 37.9, 31.0) +
  0.362 * pg(l, 442.0, 16.0, 26.7) -
  0.065 * pg(l, 501.1, 20.4, 26.2);
const yBar = (l) => 0.821 * pg(l, 568.8, 46.9, 40.5) + 0.286 * pg(l, 530.9, 16.3, 31.1);
const zBar = (l) => 1.217 * pg(l, 437.0, 11.8, 36.0) + 0.681 * pg(l, 459.0, 26.0, 13.8);

/** Spectral radiance at wavelength (nm) and temperature (K). */
function planck(lambdaNm, T) {
  const l = lambdaNm * 1e-9;
  return (2 * H * C * C) / (Math.pow(l, 5) * (Math.exp((H * C) / (l * KB * T)) - 1));
}

const srgbEncode = (u) =>
  u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055;

/** Normalised sRGB for a blackbody at T, with the brightest channel at full. */
function blackbodySrgb(T) {
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let l = 380; l <= 780; l += 1) {
    const rad = planck(l, T);
    X += rad * xBar(l);
    Y += rad * yBar(l);
    Z += rad * zBar(l);
  }
  const sum = X + Y + Z;
  X /= sum;
  Y /= sum;
  Z /= sum;
  // XYZ -> linear sRGB (sRGB D65 primaries)
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  r = Math.max(0, r);
  g = Math.max(0, g);
  b = Math.max(0, b);
  const peak = Math.max(r, g, b) || 1;
  r /= peak;
  g /= peak;
  b /= peak;
  const to255 = (u) => Math.round(Math.min(1, Math.max(0, srgbEncode(u))) * 255);
  return [to255(r), to255(g), to255(b)];
}

const hex = (rgb) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const relLum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

console.log('Blackbody colour of steel by temperature\n');
console.log('     T        hex        rgb              relLum   reads as');
const notes = {
  1200: 'dull red, barely glowing',
  1500: 'red-orange, forge red',
  1800: 'deep orange',
  2200: 'orange',
  2700: 'amber',
  3300: 'pale amber',
  4200: 'warm white',
  5600: 'near white, faintly warm',
  7000: 'white, turning cool',
};
const ramp = {};
for (const T of [1200, 1500, 1800, 2200, 2700, 3300, 4200, 5600, 7000]) {
  const rgb = blackbodySrgb(T);
  ramp[T] = rgb;
  console.log(
    `  ${String(T).padStart(5)}K   ${hex(rgb)}   ` +
      `rgb(${String(rgb[0]).padStart(3)},${String(rgb[1]).padStart(3)},${String(rgb[2]).padStart(3)})   ` +
      `${relLum(rgb).toFixed(3).padStart(6)}   ${notes[T] ?? ''}`
  );
}

// The measured brightest pixel in the artwork, for comparison with the warm core.
const measured = [252, 254, 254];
console.log(
  `\nartwork's brightest 0.04%: ${hex(measured)} relLum ${relLum(measured).toFixed(3)} ` +
    `(blue-biased: b ${measured[2]} > r ${measured[0]})`
);
console.log(
  `site --white token:        #f6fafc relLum ${relLum([246, 250, 252]).toFixed(3)}`
);

// A core that is white but reads warm: take the artwork's brightness, push the hue
// a little toward the hottest blackbody so it is no longer blue-biased.
const hot = ramp[5600];
for (const mix of [0.15, 0.25, 0.35]) {
  const core = [0, 1, 2].map((i) => Math.round(measured[i] * (1 - mix) + hot[i] * mix));
  console.log(
    `core mixed ${(mix * 100).toFixed(0)}% toward 5600K: ${hex(core)} ` +
      `rgb(${core.join(',')}) relLum ${relLum(core).toFixed(3)}`
  );
}

console.log('\nSuggested glow layers, tight/hot inward to wide/cool outward:');
for (const [radius, T] of [[2, 5600], [5, 3300], [11, 2700], [20, 2200], [34, 1800], [52, 1500]]) {
  const rgb = ramp[T];
  console.log(`  ${String(radius).padStart(2)}px  ${String(T).padStart(5)}K  ${hex(rgb)}  ${notes[T]}`);
}
