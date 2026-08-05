/**
 * Second half of the hero copy verification: the states that are easy to break.
 *
 * Loaded by the Playwright MCP `browser_run_code_unsafe` tool via `filename`.
 *
 *   1. prefers-reduced-motion — the staged narrative must be skipped entirely and
 *      the resting state present from the first paint.
 *   2. Cached load — the readyState fix must still clear the black hold, and the
 *      beats must still run from the top rather than starting mid-sequence. This is
 *      where timing assumptions usually break.
 *   3. Handoff and loop — the resting copy must survive the intro/loop crossfade and
 *      stay put across several wraps, with no black gap.
 */
async (page) => {
  const URL = 'http://localhost:3000/';
  const SHOT_DIR = '/Users/purduelaw/hero-verify';
  const out = {};

  const probe = () => {
    const section = document.querySelector('section[aria-labelledby="hero-wordmark"]');
    const videos = [...section.querySelectorAll('video')];
    const wordmark = section.querySelector('#hero-wordmark');
    const paras = [...section.querySelectorAll('p')];
    const dark = paras.find((p) => p.textContent.includes('world grows dark'));
    const forged = paras.find((p) => p.textContent.includes('It is forged'));
    const op = (el) => (el ? +parseFloat(getComputedStyle(el).opacity).toFixed(2) : null);
    // The hold overlay is the last child of the video stage.
    const stage = videos[0]?.parentElement;
    const hold = stage ? [...stage.children].find((c) => c.tagName === 'DIV') : null;
    return {
      videoCount: videos.length,
      introTime: videos[0] ? +videos[0].currentTime.toFixed(2) : null,
      introPaused: videos[0] ? videos[0].paused : null,
      introOpacity: videos[0] ? op(videos[0]) : null,
      loopOpacity: videos[1] ? op(videos[1]) : null,
      loopTime: videos[1] ? +videos[1].currentTime.toFixed(2) : null,
      loopPaused: videos[1] ? videos[1].paused : null,
      holdOpacity: hold ? op(hold) : null,
      copy: { dark: op(dark), forged: op(forged), brand: op(wordmark?.parentElement) },
      headingText: wordmark?.textContent,
      taglineText: wordmark?.parentElement?.querySelector('p')?.textContent?.trim(),
    };
  };

  // ---- 1. prefers-reduced-motion ----------------------------------------------
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  out.reducedMotion = await page.evaluate(probe);
  await page.screenshot({ path: `${SHOT_DIR}/state-reduced-motion.png`, scale: 'css' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // ---- 2. Cached load ---------------------------------------------------------
  // First pass warms the HTTP cache, second pass is the one under test.
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  const timeline = [];
  const started = Date.now();
  // Sample in real time, so this exercises the live rVFC-driven path rather than
  // seeking. Runs well short of the 14.54s handoff.
  while (Date.now() - started < 7600) {
    timeline.push(await page.evaluate(probe));
    await page.waitForTimeout(600);
  }
  out.cachedLoad = {
    // The black hold must be gone almost immediately on a warm cache.
    firstSample: timeline[0],
    holdOpacitySamples: timeline.map((s) => s.holdOpacity),
    // Copy stage against the video's own clock, to confirm the beats track it.
    sequence: timeline.map((s) => ({
      t: s.introTime,
      stage:
        s.copy.brand > 0.5
          ? 'brand'
          : s.copy.dark > 0.5
            ? 'dark'
            : s.copy.forged > 0.5
              ? 'forged'
              : 'none',
      dark: s.copy.dark,
      forged: s.copy.forged,
      brand: s.copy.brand,
    })),
    everAllBlack: timeline.some((s) => s.holdOpacity === 1 && s.introTime > 1),
  };

  // ---- 3. Handoff into the loop ----------------------------------------------
  // Jump close to the handoff and let it run through for real.
  await page.evaluate(() => {
    const v = document.querySelector('section video');
    v.currentTime = 13.6;
    void v.play();
  });
  const handoff = [];
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(700);
    handoff.push(await page.evaluate(probe));
  }
  out.handoff = handoff.map((s) => ({
    introT: s.introTime,
    loopT: s.loopTime,
    loopOpacity: s.loopOpacity,
    introOpacity: s.introOpacity,
    holdOpacity: s.holdOpacity,
    brand: s.copy.brand,
    dark: s.copy.dark,
    forged: s.copy.forged,
  }));
  out.brandHeldThroughout = handoff.every((s) => s.copy.brand === 1);
  out.loopWrapped = new Set(handoff.map((s) => s.loopTime)).size > 3;
  await page.screenshot({ path: `${SHOT_DIR}/state-in-loop.png`, scale: 'css' });

  out.copyText = {
    heading: handoff[0].headingText,
    tagline: handoff[0].taglineText,
  };
  return JSON.stringify(out);
}
