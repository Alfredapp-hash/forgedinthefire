/**
 * WCAG contrast for the Quick Exit button's new heart-red treatment.
 *
 * Two different thresholds are in play and it is easy to conflate them:
 *
 *  - 1.4.3 Contrast (Minimum): the label and icon against the button's fill.
 *    4.5:1, since "Quick Exit" at 16px bold is not WCAG-large (that needs 18.66px
 *    bold or 24px regular).
 *  - 1.4.11 Non-text Contrast: the button's own boundary against the page behind
 *    it. 3:1. A deep red fill is inherently dark, so this is the one at risk and
 *    the one the rim has to carry.
 *
 * Usage: node scripts/check-quick-exit-contrast.mjs
 */

const parse = (h) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const relLum = (hex) => {
  const [r, g, b] = parse(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a, b) => {
  const [x, y] = [relLum(a), relLum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const verdict = (r, need) => (r >= need ? `PASS (>=${need})` : `FAIL (<${need})`);

const T = {
  white: '#f6fafc',
  heatCore: '#fdf9f5',
  obsidian: '#05070a',
  gunmetal: '#11161c',
  heartInteriorDeep: '#6f0d12',
  heartInterior: '#950d12',
  heartInteriorLit: '#a91115',
  heartGlow: '#dc262f',
  heartRim: '#e74d5b',
  hoverRim: '#ff8f9b',
  iceBlue: '#8debff',
  heart: '#ff5b73',
};

console.log('relative luminance of each token');
for (const [k, v] of Object.entries(T)) {
  console.log(`  ${k.padEnd(20)} ${v}  ${relLum(v).toFixed(4)}`);
}

console.log('\n1.4.3 — label + icon against the button fill (needs 4.5:1)');
for (const [name, fill] of [
  ['resting  --heart-interior     ', T.heartInterior],
  ['hover    --heart-glow         ', T.heartGlow],
  ['(alt)    --heart-interior-deep', T.heartInteriorDeep],
  ['(alt)    --heart-interior-lit ', T.heartInteriorLit],
]) {
  const r = ratio(T.white, fill);
  console.log(`  white on ${name} ${fill}  ${r.toFixed(2)}:1  ${verdict(r, 4.5)}`);
}

console.log('\n1.4.11 — the control boundary against the page (needs 3:1)');
for (const [name, colour] of [
  ['fill alone, resting  ', T.heartInterior],
  ['fill alone, hover    ', T.heartGlow],
  ['rim  --heart-rim     ', T.heartRim],
  ['rim  hover #ff8f9b   ', T.hoverRim],
]) {
  for (const [bgName, bg] of [['obsidian', T.obsidian], ['gunmetal', T.gunmetal]]) {
    const r = ratio(colour, bg);
    console.log(
      `  ${name} vs ${bgName.padEnd(9)} ${r.toFixed(2)}:1  ${verdict(r, 3)}`
    );
  }
}

console.log('\nfocus ring visibility (needs 3:1 against both adjacent colours)');
for (const [name, adj] of [
  ['button fill', T.heartGlow],
  ['ring offset (page)', T.obsidian],
]) {
  const r = ratio(T.iceBlue, adj);
  console.log(`  --ice-blue vs ${name.padEnd(19)} ${r.toFixed(2)}:1  ${verdict(r, 3)}`);
}

console.log('\nhover brightening, as a luminance multiple');
const rest = relLum(T.heartInterior);
const hov = relLum(T.heartGlow);
console.log(
  `  ${T.heartInterior} -> ${T.heartGlow}: ${rest.toFixed(4)} -> ${hov.toFixed(4)} ` +
    `= ${(hov / rest).toFixed(2)}x`
);

console.log('\ndoes Quick Exit compete with the heart?');
console.log(
  `  heart --heart ${T.heart} relLum ${relLum(T.heart).toFixed(4)}\n` +
    `  Quick Exit fill ${T.heartInterior} relLum ${relLum(T.heartInterior).toFixed(4)}\n` +
    `  the heart is ${(relLum(T.heart) / relLum(T.heartInterior)).toFixed(1)}x brighter than the button's fill`
);
