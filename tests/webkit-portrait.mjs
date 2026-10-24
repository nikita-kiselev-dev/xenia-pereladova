// PLAYWRIGHT_MODULE=<path> node tests/webkit-portrait.mjs <baseURL> <outputDir>
// Desktop WebKit is an engine check; iOS browser bars, physical touch and GPU still need a real iPhone.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.argv[2] || 'http://127.0.0.1:5173/';
const outputDir = path.resolve(process.argv[3] || '.asset-cache/portrait-webkit');
await mkdir(outputDir, { recursive: true });
const browser = await webkit.launch({ headless: true });
const errors = [], checks = [], measurements = [];
const check = (name, passed, detail) => { checks.push({ name, passed, ...(passed ? {} : { detail }) }); if (!passed) console.error(name, detail); };
const ready = async (page, view) => {
  await page.waitForSelector(`#app[data-page="${view}"][data-phase="ready"]`, { timeout: 20000 });
  await page.waitForSelector('.intro', { state: 'detached' });
  await page.waitForTimeout(250);
};
try {
  for (const [width, height] of [[320, 568], [390, 844], [600, 800], [768, 1024], [1024, 1366]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const label = `${width}x${height}`;
    try {
      await page.goto(`${baseURL}#/overview`, { waitUntil: 'networkidle' });
      await ready(page, 'overview');
      const state = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        logo: !!document.querySelector('.mobile-wordmark')?.getClientRects().length,
        canvas: document.querySelectorAll('canvas').length,
        gl: document.querySelectorAll('img[data-gl]').length,
        loaded: [...document.querySelectorAll('.photo-link img')].filter(img => img.complete && img.naturalWidth > 0).length,
        grain: getComputedStyle(document.querySelector('.noise'), '::after').animationName,
      }));
      measurements.push({ label, ...state });
      check(`${label}: portrait composition without overflow`, state.logo && state.overflow <= 1, state);
      check(`${label}: photos and animated grain`, state.loaded > 0 && state.grain === 'grain', state);
      check(`${label}: WebGL shaders active`, state.canvas === 1 && state.gl > 0, state);
      await page.screenshot({ path: path.join(outputDir, `${label}-overview.png`), scale: 'css' });
      await page.locator('[data-nav="list"]').tap();
      await ready(page, 'list');
      check(`${label}: all series accessible`, await page.locator('.text-list>a:visible').count() === 8);
      await page.locator('.text-list>a').first().tap();
      await ready(page, 'project');
      const frame = await page.locator('.project-photo-frame').first().boundingBox();
      const heading = await page.locator('.project-heading').boundingBox();
      const counter = await page.locator('.project-counter').boundingBox();
      check(`${label}: project photo clears chrome`, frame.y >= heading.y + heading.height + 6 && frame.y + frame.height <= counter.y - 6, { frame, heading, counter });
      await page.screenshot({ path: path.join(outputDir, `${label}-project.png`), scale: 'css' });
      await page.locator('[data-close]').first().tap();
      await ready(page, 'list');
      await page.locator('[data-nav="info"]').tap();
      await ready(page, 'info');
      check(`${label}: Info without overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.locator('[data-close]').first().tap();
      await ready(page, 'list');
      check(`${label}: Close restores List`, page.url().endsWith('#/list'));
    } catch (error) { check(`${label}: scenario completes`, false, String(error)); }
    finally { await context.close(); }
    console.log(`${label} complete`);
  }
} finally {
  check('no console errors or runtime exceptions', errors.length === 0, errors);
  await browser.close();
  await writeFile(path.join(outputDir, 'checks.json'), JSON.stringify({ baseURL, checks, errors, measurements }, null, 2));
  const failed = checks.filter(check => !check.passed);
  console.log(JSON.stringify({ passed: checks.length - failed.length, failed }));
  assert.equal(failed.length, 0);
}
