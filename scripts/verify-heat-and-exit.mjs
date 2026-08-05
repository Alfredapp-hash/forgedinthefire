/**
 * Playwright verification for the hot-iron copy treatment and the heart-red Quick
 * Exit. Loaded by the Playwright MCP `browser_run_code_unsafe` tool via `filename`.
 *
 * Contrast measurement changes with a glow, and the change matters. Previously the
 * text was white with a dark halo, so the composited pixels a few px out from a glyph
 * were darker than the artwork and the halo only helped. A warm bloom does the
 * opposite: it *raises* luminance right next to the glyphs. Measuring only that band
 * would understate legibility, and measuring only the raw video would overstate it.
 *
 * So each beat is captured twice against the same paused frame — once with the copy
 * visible, once with it hidden. That pins down three separate numbers per line:
 *
 *   - glyph against the true background beneath it (from the copy-hidden frame at the
 *     glyph's own pixels). This is the strict WCAG reading of "text vs background",
 *     and it is the one that must hold.
 *   - glyph against the composited band 3-7px out. This is the metric the previous
 *     round reported, kept so the numbers are comparable, and it is where the bloom
 *     legitimately costs contrast.
 *   - glyph against the composited backdrop 40-70px out, past the bloom, which shows
 *     the halo separating the copy from the steel rather than competing with it.
 *
 * Quick Exit is measured from real painted pixels too, and both of its escape routes
 * are exercised end to end with weather.com stubbed so no network is needed.
 */
async (page) => {
  const URL = 'http://localhost:3000/';
  const DIR = '/Users/purduelaw/heat-verify';

  const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 430, height: 932 },
    { name: 'wide', width: 1920, height: 620 },
  ];
  const BEATS = [
    { name: 'dark', t: 1.4, expect: 'dark' },
    { name: 'forged', t: 4.6, expect: 'forged' },
    { name: 'brand', t: 9.6, expect: 'brand' },
  ];

  const report = { consoleErrors: [], consoleWarnings: [], viewports: {}, quickExit: {} };
  page.on('console', (m) => {
    const t = m.text().slice(0, 200);
    if (m.type() === 'error') report.consoleErrors.push(t);
    if (m.type() === 'warning') report.consoleWarnings.push(t);
  });
  page.on('pageerror', (e) => report.consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));

  const waitReady = async () => {
    await page.waitForFunction(
      () => {
        const v = document.querySelector('section video');
        return v && v.readyState >= 2;
      },
      null,
      { timeout: 20000 }
    );
    await page.waitForTimeout(1500);
  };

  /** Line boxes of each visible copy element, plus flame pixels behind them. */
  const inspect = () => {
    const section = document.querySelector('section[aria-labelledby="hero-wordmark"]');
    const videos = [...section.querySelectorAll('video')];
    const shown =
      videos.find((v) => parseFloat(getComputedStyle(v).opacity) > 0.5) || videos[0];
    const wordmark = section.querySelector('#hero-wordmark');
    const brand = wordmark.parentElement;
    const paras = [...section.querySelectorAll('p')];
    const els = {
      dark: paras.find((p) => p.textContent.includes('world grows dark')),
      forged: paras.find((p) => p.textContent.includes('It is forged')),
      wordmark,
      tagline: brand.querySelector('p'),
    };
    const op = (el) => +parseFloat(getComputedStyle(el).opacity).toFixed(2);
    const opacity = { dark: op(els.dark), forged: op(els.forged), brand: op(brand) };
    const stage =
      opacity.brand > 0.5 ? 'brand' : opacity.dark > 0.5 ? 'dark' : opacity.forged > 0.5 ? 'forged' : 'none';

    const sect = section.getBoundingClientRect();
    const scale = Math.max(sect.width / 1280, sect.height / 720);
    const offY = sect.top + (sect.height - 720 * scale) / 2;

    // Flame test: sample the video frame directly behind each line box and count
    // pixels that belong to the flame body rather than to steel.
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(shown, 0, 0, 1280, 720);

    const lines = {};
    for (const [key, el] of Object.entries(els)) {
      if (!el) continue;
      const visible = key === 'wordmark' || key === 'tagline' ? opacity.brand > 0.5 : op(el) > 0.5;
      if (!visible) continue;
      // Rects come from the element's text nodes only. Selecting the whole element
      // would also return the decorative bloom span's box, which is far wider than
      // the glyphs and would inflate the region the flame test looks at.
      const boxes = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(walker.currentNode);
        boxes.push(...[...r.getClientRects()].filter((b) => b.width > 2 && b.height > 2));
      }
      if (!boxes.length) continue;

      let flame = 0;
      let sampled = 0;
      const rows = [];
      for (const b of boxes) {
        const r0 = Math.max(0, Math.floor((b.top - offY) / scale));
        const r1 = Math.min(719, Math.ceil((b.bottom - offY) / scale));
        rows.push([r0, r1]);
        const sx = Math.max(0, Math.floor((b.left - (sect.left + (sect.width - 1280 * scale) / 2)) / scale));
        const sw = Math.min(1280 - sx, Math.ceil(b.width / scale));
        if (sw <= 0 || r1 <= r0) continue;
        const d = ctx.getImageData(sx, r0, sw, r1 - r0).data;
        for (let i = 0; i < d.length; i += 4) {
          sampled++;
          // The same flame-body test the previous round and the offline geometry
          // analysis use, so the counts stay directly comparable.
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (d[i + 2] > 130 && d[i + 2] - d[i] > 70 && lum > 90) flame++;
        }
      }
      lines[key] = {
        flamePixels: flame,
        sampledPixels: sampled,
        sourceRows: [Math.min(...rows.map((r) => r[0])), Math.max(...rows.map((r) => r[1]))],
        screen: boxes.map((b) => ({
          left: Math.round(b.left),
          top: Math.round(b.top),
          right: Math.round(b.right),
          bottom: Math.round(b.bottom),
        })),
      };
    }

    // Collisions with the navbar and Quick Exit.
    const qe = document.querySelector('.quick-exit-alert')?.getBoundingClientRect() ?? null;
    const nb = document.querySelector('nav')?.getBoundingClientRect() ?? null;
    const hits = (a, b) =>
      !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const allBoxes = Object.values(lines).flatMap((l) => l.screen);

    return {
      stage,
      opacity,
      lines,
      coverScale: +scale.toFixed(4),
      collisions: {
        quickExit: allBoxes.some((c) => hits(c, qe)),
        navbar: allBoxes.some((c) => hits(c, nb)),
      },
      // The h1 must still read once, not twice, despite the duplicated glow layer.
      headingText: wordmark.textContent,
      headingAriaHiddenChildren: [...wordmark.children].filter(
        (c) => c.getAttribute('aria-hidden') === 'true'
      ).length,
    };
  };

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await waitReady();

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
      await page.waitForTimeout(1150);

      const result = await page.evaluate(inspect);
      result.t = beat.t;
      result.expected = beat.expect;
      beats[beat.name] = result;

      // Paired captures against the identical paused frame. The copy layer has no
      // transition of its own, so hiding it is instantaneous and the video does not
      // advance while paused — the two frames differ only by the copy.
      await page.screenshot({ path: `${DIR}/${vp.name}-${beat.name}-with.png`, scale: 'css' });
      await page.evaluate(() => {
        const layer = document.querySelector('#hero-wordmark')?.closest('.pointer-events-none');
        if (layer) layer.style.visibility = 'hidden';
      });
      await page.screenshot({ path: `${DIR}/${vp.name}-${beat.name}-without.png`, scale: 'css' });
      await page.evaluate(() => {
        const layer = document.querySelector('#hero-wordmark')?.closest('.pointer-events-none');
        if (layer) layer.style.visibility = '';
      });
    }
    report.viewports[vp.name] = { viewport: vp, beats };
  }

  // ---- Quick Exit ----
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await waitReady();
  // The button fades in after a 1s delay.
  await page.waitForTimeout(1400);

  // The section borrows the wordmark as its accessible name, so the bloom layer must
  // contribute nothing to it — and the h1's own text must not have been duplicated.
  report.accessibleName = {
    headingTextContent: await page.evaluate(
      () => document.querySelector('#hero-wordmark').textContent
    ),
    heading: await page
      .locator('#hero-wordmark')
      .ariaSnapshot()
      .then((s) => s.trim().slice(0, 200))
      .catch((e) => `error: ${e.message}`),
    section: await page
      .locator('section[aria-labelledby="hero-wordmark"]')
      .ariaSnapshot()
      .then((s) => s.trim().split('\n')[0].slice(0, 200))
      .catch((e) => `error: ${e.message}`),
  };

  const qeBox = await page.evaluate(() => {
    const b = document.querySelector('.quick-exit-alert');
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return {
      rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      background: cs.backgroundColor,
      color: cs.color,
      borderColor: cs.borderColor,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      hitArea: Math.round(r.width * r.height),
      accessibleLabel: b.getAttribute('aria-label'),
    };
  });
  report.quickExit.resting = qeBox;

  const pad = 26;
  const clip = {
    x: Math.max(0, qeBox.rect.x - pad),
    y: Math.max(0, qeBox.rect.y - pad),
    width: qeBox.rect.width + pad * 2,
    height: qeBox.rect.height + pad * 2,
  };
  await page.screenshot({ path: `${DIR}/qe-default.png`, clip, scale: 'css' });

  await page.hover('.quick-exit-alert');
  await page.waitForTimeout(400);
  report.quickExit.hover = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.quick-exit-alert'));
    return { background: cs.backgroundColor, color: cs.color, borderColor: cs.borderColor };
  });
  await page.screenshot({ path: `${DIR}/qe-hover.png`, clip, scale: 'css' });

  // Move the pointer away, then reach the button by keyboard so :focus-visible
  // actually applies — a programmatic .focus() does not trigger it in Chromium.
  await page.mouse.move(10, 10);
  await page.waitForTimeout(200);
  let tabs = 0;
  let focused = false;
  while (tabs < 80 && !focused) {
    await page.keyboard.press('Tab');
    tabs++;
    focused = await page.evaluate(() =>
      document.activeElement?.classList?.contains('quick-exit-alert') ?? false
    );
  }
  report.quickExit.focus = {
    reachedByKeyboard: focused,
    tabStops: tabs,
    ...(await page.evaluate(() => {
      const b = document.querySelector('.quick-exit-alert');
      const cs = getComputedStyle(b);
      return {
        matchesFocusVisible: b.matches(':focus-visible'),
        background: cs.backgroundColor,
        outline: cs.outline,
        boxShadow: cs.boxShadow.slice(0, 160),
      };
    })),
  };
  await page.screenshot({ path: `${DIR}/qe-focus.png`, clip, scale: 'css' });

  // ---- both escape routes, with weather.com stubbed ----
  const stub = async () => {
    await page.route('https://weather.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stub</body></html>' })
    );
  };

  await stub();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await waitReady();
  await page.waitForTimeout(1400);
  await page.click('.quick-exit-alert');
  await page.waitForURL(/weather\.com/, { timeout: 10000 }).catch(() => {});
  report.quickExit.clickResult = page.url();

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await waitReady();
  await page.waitForTimeout(1400);
  await page.keyboard.press('Control+Escape');
  await page.waitForURL(/weather\.com/, { timeout: 10000 }).catch(() => {});
  report.quickExit.ctrlEscapeResult = page.url();
  await page.unroute('https://weather.com/**');

  return JSON.stringify(report);
}
