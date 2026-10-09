/**
 * Mobile e2e audit of public pages: overlay/menu geometry, overflow, console errors.
 * Usage: node scripts/audit-public-mobile.mjs [baseUrl]
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] || 'http://127.0.0.1:3000'
const OUT_DIR = process.argv[3] || '/tmp/fitf-mobile-audit'
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const CHROME =
  process.env.CHROME_PATH ||
  '/usr/bin/google-chrome-stable'

const PAGES = [
  '/',
  '/about',
  '/services',
  '/services/victim-advocacy',
  '/blog',
  '/get-help',
  '/donate',
  '/volunteer',
  '/resources',
  '/contact',
  '/careers',
  '/privacy',
  '/terms',
  '/accessibility',
  '/podcast',
  '/campaigns',
]

fs.mkdirSync(OUT_DIR, { recursive: true })

function slug(pathname) {
  return pathname === '/' ? 'home' : pathname.replace(/^\//, '').replace(/\//g, '_')
}

async function waitForReady(page) {
  await page.waitForSelector('header[role="banner"]', { timeout: 20000 })
  await page.waitForSelector('.mobile-nav-toggle, label[for="site-mobile-nav"]', { timeout: 10000 })
}

async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const doc = document.documentElement
    const overflowX = Math.max(0, doc.scrollWidth - vw)
    const input = document.getElementById('site-mobile-nav')
    const sheet = document.getElementById('mobile-menu')
    const header = document.querySelector('header[role="banner"]')
    const toggle = document.querySelector('.mobile-nav-toggle')
    const quick = document.querySelector('[aria-label="Safety exit"]')
    const cookie = [...document.querySelectorAll('div')].find((el) =>
      el.textContent?.includes('We use cookies to analyze site traffic')
    )
    const cs = (el) => (el ? getComputedStyle(el) : null)
    const box = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      }
    }
    const parentChain = (el) => {
      const chain = []
      let n = el
      while (n && n !== document.documentElement) {
        chain.push({
          tag: n.tagName,
          id: n.id || undefined,
          class: typeof n.className === 'string' ? n.className.slice(0, 80) : undefined,
        })
        n = n.parentElement
      }
      return chain
    }
    const sheetStyle = cs(sheet)
    const headerStyle = cs(header)
    const overflowing = []
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width > vw + 2 && r.right > vw + 8) {
        overflowing.push({
          tag: el.tagName,
          class: typeof el.className === 'string' ? el.className.slice(0, 60) : '',
          w: Math.round(r.width),
          right: Math.round(r.right),
        })
      }
    })
    const h1 = document.querySelector('h1')
    const hotline = sheet?.querySelector('a[href^="tel:"]')
    const hotlineCard = hotline?.closest('div')
    const intersects = (a, b) =>
      a &&
      b &&
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    return {
      vw,
      vh,
      overflowX,
      scrollWidth: doc.scrollWidth,
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(doc).overflow,
      input: input
        ? {
            checked: input.checked,
            type: input.type,
            parent: input.parentElement?.tagName,
            parentClass: input.parentElement?.className?.toString?.().slice(0, 80),
          }
        : null,
      toggle: toggle
        ? {
            box: box(toggle),
            display: cs(toggle).display,
            ariaExpanded: toggle.getAttribute('aria-expanded'),
          }
        : null,
      header: header
        ? {
            box: box(header),
            z: headerStyle.zIndex,
            filter: headerStyle.filter,
            backdrop: headerStyle.backdropFilter || headerStyle.webkitBackdropFilter,
            position: headerStyle.position,
            overflow: headerStyle.overflow,
          }
        : null,
      sheet: sheet
        ? {
            box: box(sheet),
            display: sheetStyle.display,
            visibility: sheetStyle.visibility,
            opacity: sheetStyle.opacity,
            z: sheetStyle.zIndex,
            position: sheetStyle.position,
            top: sheetStyle.top,
            bottom: sheetStyle.bottom,
            bg: sheetStyle.backgroundColor,
            pointerEvents: sheetStyle.pointerEvents,
            parent: sheet.parentElement?.tagName,
            parentClass: sheet.parentElement?.className?.toString?.().slice(0, 80),
            chain: parentChain(sheet),
            linkCount: sheet.querySelectorAll('a').length,
            firstLink: sheet.querySelector('a')?.textContent?.trim(),
          }
        : null,
      quick: quick
        ? { box: box(quick), z: cs(quick).zIndex, display: cs(quick).display }
        : null,
      cookie: cookie
        ? { box: box(cookie), z: cs(cookie).zIndex, display: cs(cookie).display }
        : null,
      overflowing: overflowing.slice(0, 8),
      h1: h1 ? { box: box(h1), text: h1.textContent?.trim().slice(0, 80) } : null,
      hotline: hotlineCard ? { box: box(hotlineCard) } : null,
      hotlineHitsQuick: intersects(box(hotlineCard), box(quick)),
    }
  })
}

async function openMenu(page) {
  await page.$eval('label[for="site-mobile-nav"], .mobile-nav-toggle', (el) => el.click())
  await new Promise((r) => setTimeout(r, 250))
}

async function closeMenu(page) {
  const checked = await page.$eval('#site-mobile-nav', (el) => el.checked)
  if (checked) {
    await page.$eval('label[for="site-mobile-nav"], .mobile-nav-toggle', (el) => el.click())
    await new Promise((r) => setTimeout(r, 200))
  }
}

function issuesFrom(snapshot, state) {
  const issues = []
  if (!snapshot.toggle || snapshot.toggle.display === 'none') {
    issues.push('hamburger missing at 390px')
  }
  if (!snapshot.sheet) {
    issues.push('mobile sheet not in DOM')
    return issues
  }
  if (state === 'open') {
    if (snapshot.sheet.display === 'none' || snapshot.sheet.visibility === 'hidden') {
      issues.push(`sheet hidden when open (display=${snapshot.sheet.display})`)
    }
    if (!snapshot.sheet.box || snapshot.sheet.box.h < 200 || snapshot.sheet.box.w < 200) {
      issues.push(`sheet geometry collapsed: ${JSON.stringify(snapshot.sheet.box)}`)
    }
    if (snapshot.sheet.box && snapshot.sheet.box.y > 120) {
      issues.push(`sheet starts too low (y=${snapshot.sheet.box.y})`)
    }
    if (snapshot.sheet.parent && snapshot.sheet.parent !== 'BODY') {
      issues.push(`sheet parent is ${snapshot.sheet.parent} not BODY`)
    }
    if (snapshot.sheet.linkCount < 5) {
      issues.push(`few menu links: ${snapshot.sheet.linkCount}`)
    }
    const zSheet = Number(snapshot.sheet.z)
    if (snapshot.cookie && snapshot.cookie.box?.h > 0) {
      const zCookie = Number(snapshot.cookie.z)
      if (zCookie >= zSheet) issues.push('cookie banner stacks over menu')
    }
    if (snapshot.hotlineHitsQuick) {
      issues.push('quick-exit covers menu hotline')
    }
    if (!snapshot.input?.checked) issues.push('checkbox not checked after open click')
  }
  if (state === 'closed') {
    if (snapshot.sheet.display !== 'none' && snapshot.sheet.box?.h > 0 && snapshot.sheet.opacity !== '0') {
      issues.push(`sheet visible when closed (display=${snapshot.sheet.display} h=${snapshot.sheet.box?.h})`)
    }
  }
  if (snapshot.overflowX > 8) {
    issues.push(`horizontal overflow ${snapshot.overflowX}px`)
  }
  if (state === 'closed' && snapshot.h1 && snapshot.h1.box.top < 72) {
    issues.push(`h1 tucked under header (top=${snapshot.h1.box.top})`)
  }
  return issues
}

const report = { base: BASE, viewport: VIEWPORT, pages: [], summary: { fail: 0, warn: 0 } }

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
  ],
})

try {
  const page = await browser.newPage()
  await page.setViewport(VIEWPORT)
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  )

  for (const pathname of PAGES) {
    const url = `${BASE}${pathname}`
    const consoles = []
    const pageErrors = []
    const onConsole = (msg) => {
      const type = msg.type()
      if (type === 'error' || type === 'warning') {
        consoles.push({ type, text: msg.text() })
      }
    }
    const onError = (err) => pageErrors.push(String(err))
    page.on('console', onConsole)
    page.on('pageerror', onError)

    const entry = { path: pathname, ok: true, issues: [], consoles, pageErrors }
    try {
      const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 })
      entry.status = res?.status()
      if (!res || res.status() >= 400) {
        entry.ok = false
        entry.issues.push(`HTTP ${entry.status}`)
      }
      await waitForReady(page)
      await new Promise((r) => setTimeout(r, 400))

      const closed = await measure(page)
      entry.closed = closed
      entry.issues.push(...issuesFrom(closed, 'closed'))

      await page.screenshot({
        path: path.join(OUT_DIR, `${slug(pathname)}-closed.png`),
        type: 'png',
      })

      await openMenu(page)
      const open = await measure(page)
      entry.open = open
      entry.issues.push(...issuesFrom(open, 'open'))

      await page.screenshot({
        path: path.join(OUT_DIR, `${slug(pathname)}-open.png`),
        type: 'png',
      })

      await closeMenu(page)
      const afterClose = await measure(page)
      entry.afterClose = {
        checked: afterClose.input?.checked,
        display: afterClose.sheet?.display,
      }
      if (afterClose.input?.checked) entry.issues.push('menu stayed checked after close')
      if (afterClose.sheet?.display !== 'none') entry.issues.push('sheet still displayed after close')
    } catch (err) {
      entry.ok = false
      entry.issues.push(String(err))
    }

    page.off('console', onConsole)
    page.off('pageerror', onError)

    const realErrors = consoles.filter(
      (c) =>
        c.type === 'error' &&
        !c.text.includes('websocket') &&
        !c.text.includes('WebSocket') &&
        !c.text.includes('Failed to load resource')
    )
    if (pageErrors.length) entry.issues.push(...pageErrors.map((e) => `pageerror: ${e}`))
    if (realErrors.length) entry.issues.push(...realErrors.map((e) => `console: ${e.text}`))
    if (entry.issues.length) entry.ok = false
    if (!entry.ok) report.summary.fail += 1
    report.pages.push(entry)
    console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${pathname} — ${entry.issues.join('; ') || 'ok'}`)
  }

  // Cross-page: open on /blog, click About, confirm landing + closed
  try {
    await page.goto(`${BASE}/blog`, { waitUntil: 'networkidle2', timeout: 45000 })
    await waitForReady(page)
    await openMenu(page)
    await page.evaluate(() => {
      const link = [...document.querySelectorAll('#mobile-menu a')].find((a) => a.textContent?.trim() === 'About')
      link?.click()
    })
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})
    await new Promise((r) => setTimeout(r, 400))
    const afterNav = await measure(page)
    const navIssues = []
    if (!page.url().includes('/about')) navIssues.push(`landed on ${page.url()} instead of /about`)
    if (afterNav.input?.checked) navIssues.push('menu still open after in-app nav')
    if (afterNav.sheet?.display !== 'none') navIssues.push('sheet still displayed after in-app nav')
    report.clientNav = { url: page.url(), issues: navIssues, afterNav }
    console.log(`${navIssues.length ? 'FAIL' : 'PASS'} client-nav blog→about — ${navIssues.join('; ') || 'ok'}`)
    if (navIssues.length) report.summary.fail += 1
  } catch (err) {
    report.clientNav = { error: String(err) }
    report.summary.fail += 1
    console.log(`FAIL client-nav — ${err}`)
  }

  // Desktop: hamburger must hide
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false })
  await page.goto(`${BASE}/about`, { waitUntil: 'networkidle2', timeout: 45000 })
  await waitForReady(page)
  const desktop = await page.evaluate(() => {
    const toggle = document.querySelector('.mobile-nav-toggle')
    const sheet = document.getElementById('mobile-menu')
    const desktopNav = document.querySelector('header nav .hidden.lg\\:flex, header .hidden.lg\\:flex')
    return {
      toggleDisplay: toggle ? getComputedStyle(toggle).display : null,
      sheetDisplay: sheet ? getComputedStyle(sheet).display : null,
      desktopNavDisplay: desktopNav ? getComputedStyle(desktopNav).display : null,
    }
  })
  report.desktop = desktop
  const deskIssues = []
  if (desktop.toggleDisplay !== 'none') deskIssues.push('hamburger visible on desktop')
  if (desktop.sheetDisplay !== 'none') deskIssues.push('sheet visible on desktop')
  report.desktop.issues = deskIssues
  if (deskIssues.length) report.summary.fail += 1
  console.log(`${deskIssues.length ? 'FAIL' : 'PASS'} desktop — ${deskIssues.join('; ') || 'ok'}`)
} finally {
  await browser.close()
}

const outFile = path.join(OUT_DIR, 'report.json')
fs.writeFileSync(outFile, JSON.stringify(report, null, 2))
console.log(`\nWrote ${outFile}`)
console.log(`fails=${report.summary.fail}`)
process.exit(report.summary.fail ? 1 : 0)
