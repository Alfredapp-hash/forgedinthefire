/**
 * Playwright verification for the hero copy overlay.
 *
 * This file is a bare async function expression, loaded by the Playwright MCP
 * `browser_run_code_unsafe` tool via its `filename` option.
 *
 * The intro hands off to the looping tail at 14.54s, and that handoff pins the copy
 * to its resting state. So each viewport reloads, pauses the intro before it can
 * reach the handoff, then drives it by seeking — which keeps the beats under test
 * while still exercising the real currentTime-driven code path.
 *
 * For every beat it records:
 *   - which block is opaque, proving the beat lands on the intended frame
 *   - the source rows the text occupies, taken from Range line boxes
 *   - flame-body pixels sampled directly behind those line boxes, which is the
 *     literal test of "never overlays the flame"
 *   - contrast of white against the actual painted video pixels behind the text
 *   - whether the copy intersects the navbar or the Quick Exit button
 */
async (page) => {
  const URL = 'http://localhost:3000/';
  const SHOT_DIR = '/Users/purduelaw/hero-verify';

  const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 430, height: 932 },
    { name: 'wide', width: 1920, height: 620 },
  ];

  const BEATS = [
    { name: 'a-pre', t: 0.2, expect: 'none' },
    { name: 'b-dark', t: 1.4, expect: 'dark' },
    { name: 'c-gap', t: 2.95, expect: 'none' },
    { name: 'd-forged', t: 4.6, expect: 'forged' },
    { name: 'e-heart-forming', t: 7.7, expect: 'none' },
    { name: 'f-brand', t: 9.6, expect: 'brand' },
    { name: 'g-late-intro', t: 13.5, expect: 'brand' },
  ];

  /** Runs in the page: opacity, geometry, flame overlap, contrast, collisions. */
  const inspect = (expect) => {
    const section = document.querySelector('section[aria-labelledby="hero-wordmark"]');
    const videos = [...section.querySelectorAll('video')];
    const shown =
      videos.find((v) => parseFloat(getComputedStyle(v).opacity) > 0.5) || videos[0];

    const wordmark = section.querySelector('#hero-wordmark');
    const brandBlock = wordmark.parentElement;
    const paras = [...section.querySelectorAll('p')];
    const els = {
      dark: paras.find((p) => p.textContent.includes('world grows dark')),
      forged: paras.find((p) => p.textContent.includes('It is forged')),
      wordmark,
      tagline: brandBlock.querySelector('p'),
    };
    const opacity = {
      dark: +parseFloat(getComputedStyle(els.dark).opacity).toFixed(2),
      forged: +parseFloat(getComputedStyle(els.forged).opacity).toFixed(2),
      brand: +parseFloat(getComputedStyle(brandBlock).opacity).toFixed(2),
    };

    const WHITE_L = 0.9501; // relative luminance of --white (#f6fafc)
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const relLum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ratio = (L) => (WHITE_L + 0.05) / (L + 0.05);

    const sect = section.getBoundingClientRect();
    const stageEl = shown.parentElement;
    const box = (stageEl || section).getBoundingClientRect();
    const scale = Math.max(box.width / 1280, box.height / 720);
    const offX = box.left + (box.width - 1280 * scale) / 2;
    const offY = box.top + (box.height - 720 * scale) / 2;

    const measure = (el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const boxes = [...range.getClientRects()].filter((b) => b.width > 2 && b.height > 2);
      if (!boxes.length) return null;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const lums = [];
      let flame = 0;
      let sampled = 0;
      const srcRows = [];
      for (const b of boxes) {
        const sx = (b.left - offX) / scale;
        const sy = (b.top - offY) / scale;
        const sw = b.width / scale;
        const sh = b.height / scale;
        srcRows.push([Math.round(sy), Math.round(sy + sh)]);
        canvas.width = Math.max(1, Math.round(sw));
        canvas.height = Math.max(1, Math.round(sh));
        ctx.drawImage(shown, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i];
          const G = d[i + 1];
          const B = d[i + 2];
          lums.push(relLum(R, G, B));
          sampled++;
          // Same flame-body test the offline geometry analysis uses.
          const lum = 0.299 * R + 0.587 * G + 0.114 * B;
          if (B > 130 && B - R > 70 && lum > 90) flame++;
        }
      }
      lums.sort((a, b) => a - b);
      const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
      const q = (f) => lums[Math.min(lums.length - 1, Math.floor(f * lums.length))];
      return {
        lines: boxes.length,
        srcRows,
        screen: boxes.map((b) => ({
          top: Math.round(b.top),
          bottom: Math.round(b.bottom),
          left: Math.round(b.left),
          right: Math.round(b.right),
        })),
        flamePixels: flame,
        flamePct: +((100 * flame) / sampled).toFixed(3),
        contrastMean: +ratio(mean).toFixed(1),
        contrastP95: +ratio(q(0.95)).toFixed(1),
        contrastWorstPixel: +ratio(lums[lums.length - 1]).toFixed(1),
      };
    };

    const visible =
      opacity.brand > 0.5
        ? { wordmark: measure(els.wordmark), tagline: measure(els.tagline) }
        : opacity.dark > 0.5
          ? { dark: measure(els.dark) }
          : opacity.forged > 0.5
            ? { forged: measure(els.forged) }
            : {};

    const quickExit = document.querySelector('button[aria-label^="Quick Exit"]');
    const nav = document.querySelector('header, nav');
    const hits = (a, b) =>
      a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const copyBoxes = Object.values(visible)
      .filter(Boolean)
      .flatMap((m) => m.screen);
    const qe = quickExit?.getBoundingClientRect();
    const nb = nav?.getBoundingClientRect();

    return {
      expect,
      actualStage:
        opacity.brand > 0.5
          ? 'brand'
          : opacity.dark > 0.5
            ? 'dark'
            : opacity.forged > 0.5
              ? 'forged'
              : 'none',
      opacity,
      visible,
      collisions: {
        quickExit: copyBoxes.some((c) => hits(c, qe)),
        navbar: copyBoxes.some((c) => hits(c, nb)),
        quickExitTop: qe ? Math.round(qe.top) : null,
        quickExitLeft: qe ? Math.round(qe.left) : null,
      },
      cover: {
        scale: +scale.toFixed(4),
        visibleSourceRows: [
          Math.round((box.top - offY) / scale),
          Math.round((box.bottom - offY) / scale),
        ],
        visibleSourceWidth: +((box.width / scale)).toFixed(1),
        sectionHeight: Math.round(sect.height),
        stageHeight: Math.round(box.height),
      },
    };
  };

  const report = { viewports: {}, consoleErrors: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 200));
  });

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => {
        const v = document.querySelector('section video');
        return v && v.readyState >= 2;
      },
      null,
      { timeout: 20000 }
    );
    const pausedAt = await page.evaluate(() => {
      const v = document.querySelector('section video');
      v.pause();
      return v.currentTime;
    });

    // Let the black hold and the video's own 1200ms fade finish.
    await page.waitForTimeout(1500);

    const beats = {};
    for (const beat of BEATS) {
      await page.evaluate(async (t) => {
        const v = document.querySelector('section video');
        v.pause();
        if (Math.abs(v.currentTime - t) > 0.01) {
          await new Promise((res) => {
            const done = () => {
              v.removeEventListener('seeked', done);
              res();
            };
            v.addEventListener('seeked', done);
            v.currentTime = t;
          });
        }
      }, beat.t);
      // The copy transition is 900ms; give it room to settle.
      await page.waitForTimeout(1150);
      const result = await page.evaluate(inspect, beat.expect);
      result.t = beat.t;
      beats[beat.name] = result;
      await page.screenshot({ path: `${SHOT_DIR}/${vp.name}-${beat.name}.png`, scale: 'css' });

      // Tight crops of each line of copy, so contrast can be measured on the
      // composited result. The in-page sampling above only sees the video, and so
      // gives no credit to the shadow that actually does the legibility work.
      for (const [key, m] of Object.entries(result.visible)) {
        if (!m) continue;
        const x0 = Math.max(0, Math.min(...m.screen.map((b) => b.left)) - 10);
        const y0 = Math.max(0, Math.min(...m.screen.map((b) => b.top)) - 10);
        const x1 = Math.min(vp.width, Math.max(...m.screen.map((b) => b.right)) + 10);
        const y1 = Math.min(vp.height, Math.max(...m.screen.map((b) => b.bottom)) + 10);
        if (x1 - x0 < 4 || y1 - y0 < 4) continue;
        await page.screenshot({
          path: `${SHOT_DIR}/clip-${vp.name}-${beat.name}-${key}.png`,
          clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
          scale: 'css',
        });
      }
    }
    report.viewports[vp.name] = { viewport: vp, pausedAt: +pausedAt.toFixed(2), beats };
  }
  return JSON.stringify(report);
}
