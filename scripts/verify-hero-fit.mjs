/**
 * Asserts the mobile hero stage shows the full 1280×720 lockup.
 *
 * A 100dvh portrait box with object-fit:cover only reveals ~26% of the
 * source width (the anvil horns disappear). The 16:9 stage used below lg
 * must reveal the entire frame.
 *
 * Usage: node scripts/verify-hero-fit.mjs
 */

function computeHeroCoverTransform(viewportW, viewportH, videoW = 1280, videoH = 720) {
  if (!viewportW || !viewportH) return { scale: 1, top: 0, left: 0 };
  const scale = Math.max(viewportW / videoW, viewportH / videoH);
  return {
    scale,
    top: (viewportH - videoH * scale) / 2,
    left: (viewportW - videoW * scale) / 2,
  };
}

function visibleSourceWidth(boxW, boxH) {
  return boxW / computeHeroCoverTransform(boxW, boxH).scale;
}

const IPHONE = { w: 390, h: 844 };
const oldPortrait = visibleSourceWidth(IPHONE.w, IPHONE.h);
const mobileStageH = IPHONE.w * (9 / 16);
const newPortrait = visibleSourceWidth(IPHONE.w, mobileStageH);
const desktop = visibleSourceWidth(1440, 900);

const checks = [
  ['old 100dvh iPhone crops below 40% of source width', oldPortrait < 1280 * 0.4],
  ['16:9 mobile stage shows the full 1280px frame', Math.abs(newPortrait - 1280) < 1],
  ['desktop 1440×900 still cover-fills (not letterboxed)', desktop < 1280],
];

let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) {
    failed += 1;
    console.error('FAIL', label);
  } else {
    console.log('ok  ', label);
  }
}

console.log(
  JSON.stringify(
    {
      oldPortraitPx: +oldPortrait.toFixed(1),
      newPortraitPx: +newPortrait.toFixed(1),
      desktopPx: +desktop.toFixed(1),
    },
    null,
    2
  )
);

if (failed) process.exit(1);
