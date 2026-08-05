/**
 * Magnified crops of the hero copy, purely so the hot-iron treatment can be looked
 * at. Loaded by the Playwright MCP `browser_run_code_unsafe` tool via `filename`.
 *
 * Crops are generous — the bloom extends well past the glyphs, and a tight crop would
 * cut off exactly the falloff that needs judging.
 */
async (page) => {
  const URL = 'http://localhost:3000/';
  const DIR = '/Users/purduelaw/heat-verify';

  const shots = [];
  for (const vp of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 430, height: 932 },
  ]) {
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
    await page.waitForTimeout(1500);

    for (const beat of [
      { name: 'dark', t: 1.4 },
      { name: 'forged', t: 4.6 },
      { name: 'brand', t: 9.6 },
    ]) {
      await page.evaluate(async (t) => {
        const v = document.querySelector('section video');
        v.pause();
        await new Promise((res) => {
          const done = () => {
            v.removeEventListener('seeked', done);
            res();
          };
          v.addEventListener('seeked', done);
          v.currentTime = t;
        });
      }, beat.t);
      await page.waitForTimeout(1150);

      // Region of the copy currently on screen, padded out to include the bloom.
      const box = await page.evaluate(() => {
        const section = document.querySelector('section[aria-labelledby="hero-wordmark"]');
        const wordmark = section.querySelector('#hero-wordmark');
        const brand = wordmark.parentElement;
        const paras = [...section.querySelectorAll('p')];
        const cands = [
          paras.find((p) => p.textContent.includes('world grows dark')),
          paras.find((p) => p.textContent.includes('It is forged')),
          brand,
        ].filter((el) => el && parseFloat(getComputedStyle(el).opacity) > 0.5);
        if (!cands.length) return null;
        const rs = cands.map((el) => el.getBoundingClientRect());
        return {
          left: Math.min(...rs.map((r) => r.left)),
          top: Math.min(...rs.map((r) => r.top)),
          right: Math.max(...rs.map((r) => r.right)),
          bottom: Math.max(...rs.map((r) => r.bottom)),
        };
      });
      if (!box) continue;

      const PAD = 70;
      const clip = {
        x: Math.max(0, Math.round(box.left + (box.right - box.left) * 0.5 - 380)),
        y: Math.max(0, Math.round(box.top - PAD)),
        width: Math.min(760, vp.width),
        height: Math.min(Math.round(box.bottom - box.top + PAD * 2), vp.height),
      };
      clip.width = Math.min(clip.width, vp.width - clip.x);
      clip.height = Math.min(clip.height, vp.height - clip.y);
      const path = `${DIR}/${vp.name}-${beat.name}.png`;
      await page.screenshot({ path, clip, scale: 'css' });
      shots.push({ path, clip });
    }
  }
  return JSON.stringify(shots, null, 2);
}
