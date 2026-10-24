// Uses the same external Playwright installation as portrait-motion.mjs; no application dependency.
// PLAYWRIGHT_MODULE=<path> node tests/responsive-portrait.mjs <baseURL> <outputDir>
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.argv[2] || 'http://127.0.0.1:5173/';
const outputDir = path.resolve(process.argv[3] || '.asset-cache/responsive-portrait');
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const checks = [], errors = [], measurements = [];
const check = (name, condition, detail) => {
  checks.push({ name, passed: !!condition, ...(condition ? {} : { detail }) });
  if (!condition) console.error(`FAIL ${name}: ${JSON.stringify(detail)}`);
};
const ready = async (page, view) => {
  await page.waitForSelector(`#app[data-page="${view}"][data-phase="ready"]`, { timeout: 20000 });
  await page.waitForSelector('.intro', { state: 'detached' });
  await page.waitForTimeout(220);
};
const rects = page => page.evaluate(() => {
  const rect = element => {
    if (!element || !element.getClientRects().length) return null;
    const r = element.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  };
  return {
    width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth,
    logo: rect(document.querySelector('.mobile-wordmark')),
    caption: rect(document.querySelector('.gallery-intro--overview')),
    heading: rect(document.querySelector('.project-heading')),
    counter: rect(document.querySelector('.project-counter')),
    frame: rect(document.querySelector('.project-photo-frame')),
    controls: [...document.querySelectorAll('.site-nav a, .close-button')].map(rect).filter(Boolean),
    tiles: [...document.querySelectorAll('.photo-link:not([hidden])')].map(rect).filter(r => r && r.right > 0 && r.x < innerWidth),
    gl: document.querySelectorAll('img[data-gl]').length,
    canvas: document.querySelectorAll('canvas').length,
    rows: [...document.querySelectorAll('.text-list>a:not([hidden])')].filter(el => el.getClientRects().length).length,
    scroll: scrollY,
    shaders: window.shaderQA,
  };
});
const swipe = async (context, page, x, y, dx, dy) => {
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 8, y: y + dy * i / 8 }] });
    await page.waitForTimeout(25);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  await page.waitForTimeout(420);
};
const makeContext = async (viewport, options = {}) => {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2, ...options });
  await context.addInitScript(() => {
    sessionStorage.setItem('xenia:visited', 'true');
    window.shaderQA = { bend: 0, animation: 0, draws: 0 };
    const names = new WeakMap();
    const proto = WebGL2RenderingContext.prototype;
    const get = proto.getUniformLocation, set = proto.uniform1f, draw = proto.drawElements;
    proto.getUniformLocation = function (...args) { const location = get.apply(this, args); if (location) names.set(location, args[1]); return location; };
    proto.uniform1f = function (location, value) {
      if (names.get(location) === 'uSpeed') window.shaderQA.bend = Math.max(window.shaderQA.bend, Math.abs(value));
      if (names.get(location) === 'uAnim') window.shaderQA.animation = Math.max(window.shaderQA.animation, value);
      return set.call(this, location, value);
    };
    proto.drawElements = function (...args) { window.shaderQA.draws++; return draw.apply(this, args); };
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return { context, page };
};

try {
  const sizes = [[320, 480], [320, 568], [360, 640], [375, 812], [390, 844], [430, 932], [540, 720], [600, 800], [601, 962], [768, 1024], [820, 1180], [1024, 1366], [1280, 1920], [812, 375], [1024, 768], [1440, 900]];
  for (const [width, height] of sizes) {
    const label = `${width}x${height}`;
    const compact = width <= 1023 || height >= width;
    const { context, page } = await makeContext({ width, height }, { isMobile: compact, hasTouch: compact });
    try {
      await page.goto(`${baseURL}#/overview`, { waitUntil: 'networkidle' });
      await ready(page, 'overview');
      await page.waitForFunction(() => document.querySelector('img[data-gl]'));
      let state = await rects(page);
      measurements.push({ name: `${label} overview`, ...state });
      check(`${label}: no document overflow`, state.overflow <= 1, state);
      check(`${label}: shader draws photos`, state.canvas === 1 && state.gl > 0 && state.shaders.draws > 0, state.shaders);
      if (compact) check(`${label}: controls have 44px touch targets`, state.controls.every(r => r.h >= 43.5), state.controls);
      if (compact) {
        check(`${label}: portrait composition`, !!state.logo && !!state.caption, state);
        check(`${label}: caption clears strip`, state.tiles.every(tile => tile.y >= state.caption.bottom + 12), state);
        check(`${label}: strip clears footer`, state.tiles.every(tile => tile.bottom <= height - 60), state);
        await page.screenshot({ path: path.join(outputDir, `${label}-overview.png`), scale: 'css' });
        await page.evaluate(() => { window.shaderQA.bend = 0; });
        await swipe(context, page, width * .75, state.tiles[0].y + state.tiles[0].h / 2, -width * .45, 0);
        const after = await rects(page);
        check(`${label}: trusted horizontal touch moves photos without opening`, after.tiles[0]?.x !== state.tiles[0]?.x && !page.url().includes('/project/'), after);
        check(`${label}: touch drives bend shader`, after.shaders.bend > 1, after.shaders);
        await page.waitForTimeout(900);
        const tile = await page.locator('.photo-link').evaluateAll(links => links.find(el => { const r = el.getBoundingClientRect(); return !el.hidden && r.x > 10 && r.right < innerWidth - 10; })?.dataset.tile);
        if (tile) {
          await page.evaluate(() => { window.shaderQA.animation = 0; });
          await page.locator(`[data-tile="${tile}"]`).tap();
          await ready(page, 'project');
          const opened = await rects(page);
          check(`${label}: open retains animation shader`, opened.shaders.animation > .05, opened.shaders);
          await page.locator('[data-close]').first().tap();
          await ready(page, 'overview');
        }
      }
      await page.locator('[data-nav="list"]')[compact ? 'tap' : 'click']();
      await ready(page, 'list');
      state = await rects(page);
      check(`${label}: list layout`, compact ? state.rows === 8 : state.rows === 0, state);
      check(`${label}: list has no overflow`, state.overflow <= 1, state.overflow);
      const selector = compact ? '.text-list>a' : '.photo-link';
      if (compact) await page.locator(selector).first().tap();
      else await page.goto(`${baseURL}#/project/sasha-s-synom-v-otele`);
      await ready(page, 'project');
      state = await rects(page);
      measurements.push({ name: `${label} project`, ...state });
      check(`${label}: photo clears fixed heading`, state.frame.y >= state.heading.bottom + 6, state);
      check(`${label}: photo clears fixed counter`, state.frame.bottom <= state.counter.y - 6, state);
      check(`${label}: Close has a 44px target`, state.controls.every(r => r.h >= 43.5), state.controls);
      await page.screenshot({ path: path.join(outputDir, `${label}-project.png`), scale: 'css' });
      if (width === 375) {
        await swipe(context, page, width - 45, 20, 0, 130);
        check('drag starting on Close does not activate it', page.url().includes('/project/'));
      }
      if (compact) await swipe(context, page, width / 2, height * .72, 0, -height * .45);
      else { await page.mouse.move(width / 2, height / 2); await page.mouse.wheel(0, height * .8); await page.waitForTimeout(700); }
      check(`${label}: series scrolls natively`, (await rects(page)).scroll > 30, await rects(page));
      await page.locator('[data-close]').first()[compact ? 'tap' : 'click']();
      await ready(page, 'list');
      await page.locator('[data-nav="info"]')[compact ? 'tap' : 'click']();
      await ready(page, 'info');
      check(`${label}: Info has no overflow`, (await rects(page)).overflow <= 1);
      await page.screenshot({ path: path.join(outputDir, `${label}-info.png`), scale: 'css' });
      await page.locator('[data-close]').first()[compact ? 'tap' : 'click']();
      await ready(page, 'list');
    } catch (error) {
      check(`${label}: scenario completes`, false, String(error));
      await page.screenshot({ path: path.join(outputDir, `${label}-failure.png`) });
    } finally { await context.close(); }
    console.log(`${label} complete`);
  }

  const { context, page } = await makeContext({ width: 390, height: 844 });
  await page.goto(`${baseURL}#/overview`, { waitUntil: 'networkidle' });
  await ready(page, 'overview');
  let initial = await rects(page);
  await swipe(context, page, 290, initial.tiles[0].y + 30, 0, -120);
  const vertical = await rects(page);
  check('vertical touch also moves horizontal gallery without document scroll', vertical.tiles[0]?.x !== initial.tiles[0]?.x && vertical.scroll === 0 && !page.url().includes('/project/'), vertical);
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { value: 744, configurable: true });
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(250);
  const chromeHeight = await page.evaluate(() => ({ css: parseFloat(document.documentElement.style.getPropertyValue('--viewport-height')), canvas: document.querySelector('canvas').getBoundingClientRect().height }));
  check('visual viewport resize updates CSS and canvas without window resize', chromeHeight.css === 744 && chromeHeight.canvas === 744, chromeHeight);
  const beforePinch = await rects(page);
  await page.evaluate(() => {
    Object.defineProperty(visualViewport, 'height', { value: 372, configurable: true });
    Object.defineProperty(visualViewport, 'scale', { value: 2, configurable: true });
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(250);
  const zoomHeight = await page.evaluate(() => parseFloat(document.documentElement.style.getPropertyValue('--viewport-height')));
  const afterPinch = await rects(page);
  check('pinch zoom does not rearrange gallery', zoomHeight === 744 && Math.abs(beforePinch.tiles[0].y - afterPinch.tiles[0].y) < 1, { zoomHeight, beforePinch, afterPinch });
  await page.evaluate(() => {
    delete visualViewport.height;
    delete visualViewport.scale;
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(250);
  // Safe areas are injected at the same CSS boundary used by env(); physical cutouts still need hardware QA.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-top', '59px');
    document.documentElement.style.setProperty('--safe-bottom', '34px');
    dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(300);
  let state = await rects(page);
  check('safe areas: caption and strip stay apart', state.tiles.every(r => r.y >= state.caption.bottom + 12 && r.bottom <= 844 - 34 - 60), state);
  for (const size of [{ width: 844, height: 390 }, { width: 1024, height: 1366 }, { width: 1366, height: 1024 }, { width: 390, height: 744 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(350);
    state = await rects(page);
    check(`resize ${size.width}x${size.height}: composition changes`, size.width <= 1023 || size.height >= size.width ? !!state.logo : !state.logo, state);
    check(`resize ${size.width}x${size.height}: no overflow`, state.overflow <= 1, state.overflow);
  }
  await page.locator('[data-nav="list"]').tap();
  await ready(page, 'list');
  await page.locator('.text-list>a').first().tap();
  await ready(page, 'project');
  await page.evaluate(() => scrollTo(0, innerHeight * 2.2));
  await page.waitForTimeout(250);
  const before = await rects(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  const after = await rects(page);
  check('rotation retains current photo and relative scroll', Math.abs(before.scroll / before.height - after.scroll / after.height) < .03, { before, after });
  await page.locator('[data-close]').first().tap();
  await ready(page, 'list');
  await page.locator('[data-nav="overview"]').tap();
  await ready(page, 'overview');
  await page.locator('[data-nav="list"]').tap();
  await page.waitForTimeout(100);
  await page.setViewportSize({ width: 1366, height: 1024 });
  await ready(page, 'list');
  check('breakpoint during transition settles in desktop List', (await rects(page)).rows === 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  check('breakpoint restores accessible portrait List', (await rects(page)).rows === 8);
  await context.close();

  for (const fallback of ['no-webgl', 'reduced-motion']) {
    const { context, page } = await makeContext({ width: 390, height: 844 }, fallback === 'reduced-motion' ? { reducedMotion: 'reduce' } : {});
    if (fallback === 'no-webgl') await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : get.call(this, type, ...args); };
    });
    await page.goto(`${baseURL}#/overview`, { waitUntil: 'networkidle' });
    await ready(page, 'overview');
    state = await rects(page);
    check(`${fallback}: DOM photos remain`, state.canvas === 0 && await page.locator('.photo-link img').first().evaluate(img => img.complete && img.naturalWidth > 0 && getComputedStyle(img).opacity === '1'), state);
    await swipe(context, page, 300, state.tiles[0].y + 30, -180, 0);
    const moved = await rects(page);
    check(`${fallback}: touch still navigates gallery`, moved.tiles[0]?.x !== state.tiles[0]?.x && !page.url().includes('/project/'), moved);
    await context.close();
  }
} catch (error) { check('remaining scenarios complete', false, String(error)); }
finally {
  check('no console errors or runtime exceptions', errors.length === 0, errors);
  await browser.close();
  const failed = checks.filter(check => !check.passed);
  await writeFile(path.join(outputDir, 'checks.json'), JSON.stringify({ baseURL, checks, errors, measurements }, null, 2));
  console.log(JSON.stringify({ passed: checks.length - failed.length, failed }));
  assert.equal(failed.length, 0, `${failed.length} responsive checks failed`);
}
