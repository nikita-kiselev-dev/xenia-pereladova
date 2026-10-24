/**
 * Browser regression contract: docs/research/portrait-2026-10-24.md.
 * PowerShell (bundled Playwright; no project dependency):
 * $env:PLAYWRIGHT_MODULE='C:/Users/Nikita/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
 * node tests/portrait-motion.mjs http://127.0.0.1:5173/ docs/qa/portrait/local
 * Add --red for a short published smoke: cold entry, monochrome XP,
 * sampled cover opening / kept-gallery overlay, decoded first photo, Close.
 * Use a fresh output directory for each target so old screenshots are not mistaken for this run.
 * --counter-resize runs only the 590px -> 610px project-counter regression.
 * Screenshots and sampled DOM geometry are evidence of intermediate states,
 * not a proof of exact original motion, real Safari, or physical touch/GPU fidelity.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const positional = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const baseURL = positional[0] || 'http://127.0.0.1:5173/';
const outputDir = path.resolve(positional[1] || 'docs/qa/portrait/local');
const redOnly = process.argv.includes('--red');
const counterResizeOnly = process.argv.includes('--counter-resize');
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const checks = [];
const errors = [];
const evidence = [];
const config = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' };
let context = await browser.newContext(config);
let page = await context.newPage();
const collectErrors = target => {
  target.on('pageerror', error => errors.push(String(error)));
  target.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
};
collectErrors(page);
let imageIndex = 0;
const image = async name => {
  const file = `${String(++imageIndex).padStart(3, '0')}-${name.replace(/[^a-z0-9-]/gi, '-')}.png`;
  await page.screenshot({ path: path.join(outputDir, file), scale: 'css', timeout: 15000 });
  return file;
};
const check = (name, condition, detail = undefined) => {
  try { assert.ok(condition, name); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, detail, error: error.message }); console.error(`FAIL: ${name}`); }
};

// Observe painted descendants, including GSAP's split chars. Parent visibility alone
// misses masks / descendant transforms; each overflow ancestor clips the observed rect.
const installObserver = () => {
  window.__portraitQA = { samples: [], timer: undefined };
  const visible = element => {
    if (!element) return false;
    let opacity = 1;
    const box = element.getBoundingClientRect();
    let left = Math.max(0, box.left), top = Math.max(0, box.top);
    let right = Math.min(innerWidth, box.right), bottom = Math.min(innerHeight, box.bottom);
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || node.hidden) return false;
      opacity *= Number(style.opacity);
      if (opacity < .04) return false;
      if (node !== element && /(hidden|clip|auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`)) {
        const clip = node.getBoundingClientRect();
        if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
        if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
      }
    }
    return right - left > .5 && bottom - top > .5;
  };
  const textVisible = selector => [...document.querySelectorAll(selector)].some(element => {
    const chars = [...element.querySelectorAll('.char')];
    return chars.length ? chars.some(visible) : visible(element);
  });
  const sample = () => {
    const app = document.querySelector('[data-page][data-phase]');
    const logo = document.querySelector('.mobile-wordmark');
    const caption = document.querySelector('.gallery-intro--overview');
    const rect = logo?.getBoundingClientRect();
    return {
      time: performance.now(), hash: location.hash, page: app?.dataset.page, phase: app?.dataset.phase,
      xp: textVisible('.mobile-wordmark'), caption: textVisible('.gallery-intro--overview'),
      xpFilter: logo ? getComputedStyle(logo).filter : null,
      xpRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      xpGlyphs: [...(logo?.querySelectorAll('.char') || [])].map(char => {
        const r = char.getBoundingClientRect();
        return { text: char.textContent, x: r.x, y: r.y, opacity: getComputedStyle(char).opacity, transform: getComputedStyle(char).transform };
      }),
      captionOpacity: caption ? getComputedStyle(caption).opacity : null,
      galleryInProject: !!document.querySelector('.project-main [data-gallery]'),
      canvas: document.querySelectorAll('canvas').length,
      width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth,
      strip: [...document.querySelectorAll('.photo-link:not([hidden])')].map(el => {
        const r = el.getBoundingClientRect();
        return { key: el.dataset.tile, x: r.x, y: r.y, w: r.width, h: r.height, visible: visible(el) };
      }),
      rows: [...document.querySelectorAll('.text-list > a:not([hidden])')].map(el => ({ slug: el.dataset.project, category: el.dataset.category, visible: visible(el) })),
      scrollY,
    };
  };
  window.__portraitQA.read = sample;
  window.__portraitQA.timer = setInterval(() => {
    window.__portraitQA.samples.push(sample());
    if (window.__portraitQA.samples.length > 1200) window.__portraitQA.samples.shift();
  }, 40);
};
await page.addInitScript(installObserver);
const read = () => page.evaluate(() => window.__portraitQA.read());
const sleep = ms => page.waitForTimeout(ms);
const ready = async name => {
  await page.waitForFunction(() => {
    const app = document.querySelector('[data-page][data-phase]');
    const [route, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
    const expected = route.startsWith('project/') ? 'project' : route === 'info' ? 'info' : route === 'list' ? 'list' : 'overview';
    const filter = new URLSearchParams(query).get('filter') || 'all';
    const applied = expected === 'project' || expected === 'info' || document.querySelector(`[data-filter="${filter}"]`)?.getAttribute('aria-pressed') === 'true';
    return app?.dataset.phase === 'ready' && app?.dataset.page === expected && applied && !document.querySelector('.intro');
  }, undefined, { timeout: 18000 });
  await sleep(180);
  const state = await read();
  check(`${name}: one canvas maximum`, state.canvas <= 1, state.canvas);
  check(`${name}: no horizontal document overflow`, state.overflow <= 1, state.overflow);
  return state;
};
const nav = async (view, name = view) => {
  await page.locator(`[data-nav="${view}"]`).click();
  return ready(name);
};
const projectProgress = () => page.locator('[data-current-photo]').evaluate(counter => {
  const label = counter.querySelector('.sr-only')?.textContent || '';
  const percent = label.match(/^Просмотрено (\d+)%$/);
  return { label, value: percent ? Number(percent[1]) : null, digits: counter.querySelectorAll('.reel').length };
});
const counterResize = async () => {
  await page.setViewportSize({ width: 590, height: 812 });
  const projectURL = new URL(baseURL);
  projectURL.searchParams.set('portrait-qa-counter', 'resize');
  projectURL.hash = '#/project/sasha-s-synom-v-otele';
  await page.goto(projectURL.href, { waitUntil: 'domcontentloaded' });
  await ready('counter resize compact project');
  await page.mouse.move(290, 500);
  await page.mouse.wheel(0, 1624);
  await sleep(900);
  const visibleFigure = () => page.locator('[data-photo-index]').evaluateAll(figures => figures.map(figure => {
    const r = figure.getBoundingClientRect();
    return { index: Number(figure.dataset.photoIndex), visible: Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) };
  }).sort((a, b) => b.visible - a.visible)[0]?.index);
  const beforeFigure = await visibleFigure();
  check('counter resize: compact third figure is visible', beforeFigure === 3, beforeFigure);
  await image('counter-resize-590-third-figure');
  await page.setViewportSize({ width: 610, height: 812 });
  await sleep(1000);
  const afterFigure = await visibleFigure();
  const progress = await projectProgress();
  check('counter resize: wide third figure stays visible', afterFigure === 3, afterFigure);
  check('counter resize: wide counter preserves visible figure', progress.digits === 2 && progress.label === `Фотография ${afterFigure}` && afterFigure === beforeFigure, { beforeFigure, afterFigure, progress });
  await image('counter-resize-610-third-figure');
};
const moveStrip = async name => {
  const before = await read();
  await page.mouse.move(190, Math.round(before.height * .74));
  await page.mouse.wheel(420, 0);
  await sleep(550);
  const wheel = await read();
  const moved = (a, b) => a.strip.some(tile => {
    const other = b.strip.find(candidate => candidate.key === tile.key);
    return other && (Math.abs(other.x - tile.x) > 2 || Math.abs(other.y - tile.y) > 2);
  });
  check(`${name}: wheel moves strip`, moved(before, wheel), { before: before.strip, after: wheel.strip });
  // CDP produces trusted browser touch input (not dispatchEvent / private App methods).
  const session = await context.newCDPSession(page);
  const y = Math.round(wheel.height * .74);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 290, y }] });
  for (let i = 1; i <= 7; i++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 290 - i * 28, y }] });
    await sleep(20);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  await sleep(500);
  const touch = await read();
  check(`${name}: swipe moves strip`, moved(wheel, touch), { before: wheel.strip, after: touch.strip });
};
const transition = async (name, action, { opening = false, screenshots = true, requireKeeper = false } = {}) => {
  const start = await page.evaluate(() => performance.now());
  await action();
  for (const delay of [80, 160, 240, 320]) {
    await sleep(delay);
    if (screenshots) await image(`${name}-${delay}`);
  }
  const final = await ready(name);
  const samples = await page.evaluate(start => window.__portraitQA.samples.filter(s => s.time >= start), start);
  evidence.push({ name, start, samples });
  check(`${name}: transition never duplicates canvas`, samples.every(s => s.canvas <= 1));
  if (opening) {
    const projectSamples = samples.filter(s => s.hash.startsWith('#/project/') && (s.time - start >= 420 || s.page === 'project'));
    check(`${name}: sampled project transition`, projectSamples.length > 0, projectSamples.length);
    check(`${name}: gallery XP hidden over project`, projectSamples.every(s => !s.xp), projectSamples.filter(s => s.xp));
    check(`${name}: gallery caption hidden over project`, projectSamples.every(s => !s.caption), projectSamples.filter(s => s.caption));
    const kept = samples.filter(s => s.galleryInProject);
    if (requireKeeper) check(`${name}: kept gallery branch observed`, kept.length > 0, kept.length);
    check(`${name}: kept gallery has no painted caption or XP`, kept.every(s => !s.xp && !s.caption), kept);
    check(`${name}: first photo decoded and visible`, await page.locator('.project-photo img').first().evaluate(img => {
      const r = img.getBoundingClientRect();
      return img.complete && img.naturalWidth > 0 && r.width > 100 && r.height > 50 && Number(getComputedStyle(img).opacity) > .9;
    }));
    if (final.width <= 600) check(`${name}: mobile next-project hidden`, !await page.locator('.next-project').isVisible());
  }
  return final;
};

try {
  if (counterResizeOnly) {
    await counterResize();
  } else {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await sleep(180);
  check('cold: intro exists', await page.locator('.intro').count() === 1);
  await image('cold-intro');
  if (!redOnly) {
    await page.setViewportSize({ width: 375, height: 635 });
    await sleep(90);
    await page.setViewportSize(config.viewport);
  }
  await ready('cold overview');
  let state = await read();
  check('cold: WebGL canvas mounted', state.canvas === 1, state.canvas);
  check('cold: XP is visible', state.xp, state);
  check('cold: XP is monochrome (filter none)', state.xpFilter === 'none', state.xpFilter);
  await image('cold-overview');

  // Cover selected by real hit testing, avoiding an offscreen cyclic clone.
  const cover = await page.locator('.photo-link').evaluateAll(links => {
    const visible = links.filter(el => {
      const r = el.getBoundingClientRect();
      return !el.hidden && r.left < innerWidth - 35 && r.right > 35 && r.top > 0 && r.bottom < innerHeight - 35;
    });
    visible.sort((a, b) => Math.abs(a.getBoundingClientRect().x + a.getBoundingClientRect().width / 2 - innerWidth / 2) - Math.abs(b.getBoundingClientRect().x + b.getBoundingClientRect().width / 2 - innerWidth / 2));
    return visible[0]?.dataset.tile;
  });
  assert.ok(cover, 'an Overview cover can be clicked');
  await transition('overview-project-kept-gallery', async () => {
    await page.locator(`[data-tile="${cover}"]`).click();
    if (!redOnly) {
      await sleep(90);
      await page.setViewportSize({ width: 375, height: 762 });
      await sleep(70);
      await page.setViewportSize(config.viewport);
    }
  }, { opening: true, requireKeeper: true });
  await page.locator('[data-close]').first().click();
  await ready('overview return');
  if (!redOnly) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(120);
    check('warm: full intro skipped', await page.locator('.intro').count() === 0);
    await ready('warm overview');
    await image('warm-overview');
    await moveStrip('warm overview');
    const beforeSwitch = await read();
    await transition('overview-list', async () => {
      await page.locator('[data-nav="list"]').click();
      await sleep(90);
      await page.setViewportSize({ width: 375, height: 635 });
      await sleep(70);
      await page.setViewportSize(config.viewport);
    });
    const switchEvidence = evidence.at(-1).samples.filter(s => s.xp && s.xpRect);
    check('view switch: XP stays in place', switchEvidence.every(s => Math.abs(s.xpRect.x - beforeSwitch.xpRect.x) < 1 && Math.abs(s.xpRect.y - beforeSwitch.xpRect.y) < 1), switchEvidence.map(s => s.xpRect));
    check('view switch: XP letters do not roll', switchEvidence.every(s => s.xpGlyphs.every((glyph, index) => {
      const before = beforeSwitch.xpGlyphs[index];
      return before && Math.abs(glyph.x - before.x) < 1 && Math.abs(glyph.y - before.y) < 1;
    })), switchEvidence.map(s => s.xpGlyphs));
    check('list: eight rows', await page.locator('.text-list > a:not([hidden])').count() === 8);
    check('list: revealed characters visible', await page.locator('.text-list > a:not([hidden])').evaluateAll(rows => rows.every(row => {
      const chars = [...row.querySelectorAll('.char')];
      return chars.length > 0 && chars.every(char => { const s = getComputedStyle(char); return s.visibility !== 'hidden' && Number(s.opacity) > .9; });
    })));
    check('list: extra biography hidden', !await page.locator('.gallery-intro--list').isVisible());
    check('list: first row receives center pointer hit', await page.locator('.text-list > a').first().evaluate(row => {
      const r = row.getBoundingClientRect();
      return row.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }));
    const series = await page.locator('.text-list > a').evaluateAll(rows => rows.map(row => ({ slug: row.dataset.project, title: row.querySelector('.text-list-name')?.textContent })));
    await page.mouse.move(170, 420);
    await page.mouse.wheel(0, 450);
    await sleep(450);
    await transition('scrolled-list-overview', () => page.locator('[data-nav="overview"]').click());
    await moveStrip('after scrolled list');

    for (const view of ['overview', 'list']) {
      await nav(view);
      await transition(`${view}-info`, () => page.locator('[data-nav="info"]').click());
      check(`${view}: Info heading visible`, await page.locator('.info-content h1').isVisible());
      check(`${view}: Info portrait decoded`, await page.locator('.info-portrait img').evaluate(img => img.complete && img.naturalWidth > 0));
      check(`${view}: mobile Info portrait hidden`, !await page.locator('.info-portrait').isVisible());
      await page.mouse.wheel(0, 400);
      await sleep(250);
      const returned = await transition(`info-close-${view}`, () => page.locator('[data-close]').first().click());
      check(`${view}: Close restores previous view`, returned.page === view, returned);
    }

    for (const [index, project] of series.entries()) {
      await nav('list', `list before ${project.slug}`);
      await page.locator(`.text-list > a[data-project="${project.slug}"]`).scrollIntoViewIfNeeded();
      const listScroll = await page.evaluate(() => ({ window: scrollY, gallery: document.querySelector('[data-gallery]')?.scrollTop || 0 }));
      await transition(`list-project-${project.slug}`, () => page.locator(`.text-list > a[data-project="${project.slug}"]`).click(), { opening: true, screenshots: index === 0 || index === 7 });
      const progressBefore = await projectProgress();
      check(`${project.slug}: mobile project progress has 3 digits and is 0..100`, progressBefore.digits === 3 && progressBefore.value !== null && progressBefore.value >= 0 && progressBefore.value <= 100, progressBefore);
      await page.mouse.move(185, 500);
      await page.mouse.wheel(0, 1100);
      await sleep(500);
      check(`${project.slug}: project scroll moves`, await page.evaluate(() => scrollY > 100));
      const progressAfter = await projectProgress();
      check(`${project.slug}: mobile percent progress increases after scroll`, progressAfter.digits === 3 && progressAfter.value > progressBefore.value && progressAfter.value <= 100, { before: progressBefore, after: progressAfter });
      await transition(`project-close-list-${project.slug}`, () => page.locator('[data-close]').first().click(), { screenshots: false });
      const restored = await page.evaluate(() => ({ window: scrollY, gallery: document.querySelector('[data-gallery]')?.scrollTop || 0 }));
      check(`${project.slug}: list scroll restored`, Math.abs(restored.window - listScroll.window) < 4 && Math.abs(restored.gallery - listScroll.gallery) < 4, { before: listScroll, after: restored });

      // Direct route entry must work without a previous gallery or cached cover.
      const directURL = new URL(baseURL);
      directURL.searchParams.set('portrait-qa-direct', project.slug);
      directURL.hash = `#/project/${project.slug}`;
      await page.goto(directURL.href, { waitUntil: 'domcontentloaded' });
      state = await ready(`direct ${project.slug}`);
      check(`${project.slug}: direct route is project`, state.page === 'project', state);
      check(`${project.slug}: direct route no XP or caption`, !state.xp && !state.caption, state);
      check(`${project.slug}: direct photo decoded`, await page.locator('.project-photo img').first().evaluate(img => img.complete && img.naturalWidth > 0));
      check(`${project.slug}: direct mobile next-project hidden`, !await page.locator('.next-project').isVisible());
      await page.mouse.wheel(0, 900);
      await sleep(250);
      await page.locator('[data-close]').first().click();
      await ready(`direct return ${project.slug}`);
    }

    await nav('overview');
    const interruptCover = await page.locator('.photo-link').evaluateAll(links => links.filter(el => {
      const r = el.getBoundingClientRect();
      return !el.hidden && r.x >= 0 && r.right <= innerWidth && r.y > 100 && r.bottom < innerHeight - 30;
    })[0]?.dataset.tile);
    assert.ok(interruptCover, 'a complete cover is available for opening interruption');
    await page.locator(`[data-tile="${interruptCover}"]`).click();
    await sleep(70);
    await page.setViewportSize({ width: 375, height: 762 });
    await page.locator('[data-nav="list"]').click();
    await ready('interrupted cover opening to List');
    await page.setViewportSize(config.viewport);
    await nav('overview');
    await moveStrip('after opening cancellation with resize');
    for (const view of ['list', 'overview', 'list', 'overview', 'info']) {
      await page.locator(`[data-nav="${view}"]`).click({ timeout: 6000 });
      await sleep(70);
    }
    await ready('rapid info interruption');
    await page.locator('[data-close]').first().click();
    await ready('rapid interruption Close');
    await nav('overview');
    await moveStrip('after interruptions');
    await nav('list');
    for (const category of ['family', 'portrait', 'events', 'all']) {
      // Original phone chrome has no filter buttons; exercise supported hash routes.
      await page.evaluate(category => { location.hash = `#/list${category === 'all' ? '' : `?filter=${category}`}`; }, category);
      const filtered = await ready(`filter ${category}`);
      check(`filter ${category}: only matching rows`, filtered.rows.length > 0 && filtered.rows.every(row => category === 'all' || row.category === category), filtered.rows);
      check(`filter ${category}: selected button`, await page.locator(`[data-filter="${category}"]`).getAttribute('aria-pressed') === 'true');
    }
    await nav('overview');
    for (const [width, height] of [[375, 635], [375, 762], [375, 812], [390, 844], [768, 1024], [812, 375], [375, 812]]) {
      await page.setViewportSize({ width, height });
      await sleep(350);
      state = await ready(`resize ${width}x${height}`);
      check(`resize ${width}x${height}: XP monochrome`, state.xpFilter === 'none', state.xpFilter);
      check(`resize ${width}x${height}: strip visible`, state.strip.some(tile => tile.visible), state.strip);
      await image(`resize-${width}x${height}`);
    }
    await moveStrip('after viewport resize');
    await context.close();
    context = await browser.newContext({ ...config, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    page = await context.newPage();
    collectErrors(page);
    await page.addInitScript(installObserver);
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    state = await ready('desktop overview');
    check('desktop: mobile XP hidden', !state.xp, state);
    check('desktop: overview photos visible', state.strip.some(tile => tile.visible), state.strip);
    await image('desktop-overview');
    await nav('list', 'desktop list');
    state = await read();
    check('desktop: photo list visible', state.strip.some(tile => tile.visible), state.strip);
    await image('desktop-list');
    await page.locator('[data-filter="portrait"]').click();
    await ready('desktop portrait filter');
    check('desktop: filter button applies', await page.locator('[data-filter="portrait"]').getAttribute('aria-pressed') === 'true');
    const desktopCover = await page.locator('.photo-link:not([hidden])').evaluateAll(links => links.map(link => {
      const r = link.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, key: link.dataset.tile };
    }).find(point => point.x > 25 && point.x < innerWidth - 25 && point.y > 100 && point.y < innerHeight - 100 && document.elementFromPoint(point.x, point.y)?.closest('[data-tile]')?.getAttribute('data-tile') === point.key));
    assert.ok(desktopCover, 'a desktop photo has a visible browser hit target');
    await page.mouse.click(desktopCover.x, desktopCover.y);
    await ready('desktop project');
    check('desktop: next-project remains visible', await page.locator('.next-project').isVisible());
    check('desktop: project counter retains 2 digits', (await projectProgress()).digits === 2);
    await page.locator('[data-close]').first().click();
    await ready('desktop project Close');
    await nav('info', 'desktop Info');
    check('desktop: Info portrait remains visible', await page.locator('.info-portrait').isVisible());
    await page.locator('[data-close]').first().click();
    await ready('desktop Info Close');

    for (const scenario of ['no-webgl', 'reduced-motion']) {
      await context.close();
      context = await browser.newContext({ ...config, ...(scenario === 'reduced-motion' ? { reducedMotion: 'reduce' } : {}) });
      page = await context.newPage();
      collectErrors(page);
      await page.addInitScript(installObserver);
      if (scenario === 'no-webgl') await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...options) {
          return type === 'webgl' || type === 'webgl2' ? null : original.call(this, type, ...options);
        };
      });
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
      state = await ready(`${scenario} overview`);
      check(`${scenario}: no canvas`, state.canvas === 0, state.canvas);
      check(`${scenario}: DOM photo fallback painted`, await page.locator('.photo-link:not([hidden]) img').evaluateAll(images => images.some(img => img.complete && img.naturalWidth > 0 && Number(getComputedStyle(img).opacity) > .9)));
      await image(`${scenario}-overview`);
      await moveStrip(scenario);
      await nav('list', `${scenario} list`);
      await transition(`${scenario}-project`, () => page.locator('.text-list > a').first().click(), { opening: true, screenshots: false });
      await page.locator('[data-close]').first().click();
      await ready(`${scenario} project Close`);
      await nav('info', `${scenario} Info`);
      await page.locator('[data-close]').first().click();
      await ready(`${scenario} Info Close`);
      await nav('overview', `${scenario} returned overview`);
      await moveStrip(`${scenario} after returns`);
    }
    await counterResize();
  }
  }
} catch (error) {
  checks.push({ name: 'scenario execution', passed: false, error: error.stack || String(error) });
  try { await image('execution-failure'); } catch { /* Preserve primary failure. */ }
} finally {
  check('browser: no console errors or exceptions', errors.length === 0, errors);
  // Assertions above use every 40ms observation. Persist every observation during
  // the first two seconds, then >=100ms apart (plus the last frame) to keep QA small.
  const compactEvidence = evidence.map(run => {
    let last = -Infinity;
    return { ...run, samples: run.samples.filter((sample, index) => {
      if (sample.time - run.start <= 2000 || sample.time - last >= 100 || index === run.samples.length - 1) { last = sample.time; return true; }
      return false;
    }) };
  });
  const report = { baseURL, viewport: config, redOnly, counterResizeOnly, checks, evidence: compactEvidence, errors, samplePersistence: '40ms for first 2s of each transition, then >=100ms; assertions use all 40ms samples', exactMotionFidelity: 'Not asserted; compare transition screenshots with original recordings. Real iPhone/Safari remains a separate gate.' };
  await writeFile(path.join(outputDir, 'checks.json'), `${JSON.stringify(report)}\n`);
  const failed = checks.filter(item => !item.passed);
  console.log(JSON.stringify({ outputDir, passed: checks.length - failed.length, failed: failed.map(({ name, error, detail }) => ({ name, error, ...(typeof detail === 'string' || typeof detail === 'number' ? { detail } : {}) })) }, null, 2));
  await browser.close();
  if (failed.length) process.exitCode = 1;
}
