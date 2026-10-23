// Single browser harness: documented CUA tab API, imported from cua_repl.
import assert from 'node:assert/strict';

const ready = async (tab, page) => {
  await tab.playwright.locator(`#app[data-page="${page}"][data-phase="ready"]`).waitFor({ state: 'visible', timeoutMs: 10000 });
  await tab.playwright.locator('.intro').waitFor({ state: 'detached', timeoutMs: 10000 });
};
const read = tab => tab.playwright.evaluate(() => ({
  hash: location.hash,
  page: document.querySelector('#app').dataset.page,
  phase: document.querySelector('#app').dataset.phase,
  width: innerWidth,
  overflow: document.documentElement.scrollWidth - innerWidth,
  canvas: document.querySelectorAll('canvas').length,
  y: scrollY,
  focusedSlug: document.activeElement?.getAttribute('data-project'),
  heading: document.querySelector('main h1')?.textContent,
  failed: document.querySelectorAll('[data-failed]').length,
  loaded: [...document.querySelectorAll('main img')].filter(image => image.complete && image.naturalWidth > 0).length,
  hiddenByWebgl: [...document.querySelectorAll('main img')].filter(image => image.style.opacity === '0').length,
}));

export async function runCore(tab, baseURL) {
  const results = [];
  const started = new Date().toISOString();
  const check = async (name, callback) => { await callback(); results.push({ name, result: 'PASS' }); };
  await tab.goto(baseURL + '#/overview');
  await tab.reload();
  await ready(tab, 'overview');
  await check('overview and horizontal overflow', async () => { assert((await read(tab)).overflow <= 0); });
  await tab.playwright.locator('[data-nav="list"]').click();
  await ready(tab, 'list');
  await check('list', async () => { assert.equal((await read(tab)).page, 'list'); });
  await tab.playwright.locator('[data-filter="portrait"]').click();
  await ready(tab, 'list');
  await check('portrait filter', async () => {
    assert.equal(await tab.playwright.locator('.text-list>a').count(), 2);
    assert.equal(await tab.playwright.locator('[data-filter="portrait"]').getAttribute('aria-pressed'), 'true');
  });
  const photoSelector = (await read(tab)).width <= 1023 ? '.text-list [data-project="fashion"]' : '.photo-link[data-project="fashion"]';
  await tab.playwright.locator(photoSelector).first().press('Enter');
  await ready(tab, 'project');
  await check('open project with keyboard', async () => { assert.equal((await read(tab)).heading, 'Fashion'); });
  await tab.playwright.locator('[data-close]').first().press('Escape');
  await ready(tab, 'list');
  await check('Escape restores filter and focus', async () => {
    const state = await read(tab);
    assert.equal(state.hash, '#/list?filter=portrait');
    assert.equal(state.focusedSlug, 'fashion');
  });
  await tab.playwright.locator('[data-nav="info"]').click();
  await ready(tab, 'info');
  await check('Info and contact links', async () => {
    assert.equal(await tab.playwright.locator('.info-copy a[href="https://t.me/+79137477927"]').count(), 1);
    assert((await read(tab)).overflow <= 0);
  });
  await tab.back();
  await ready(tab, 'list');
  await tab.forward();
  await ready(tab, 'info');
  await tab.playwright.locator('[data-close]').click();
  await ready(tab, 'list');
  results.push({ name: 'Back / Forward / Close', result: 'PASS' });
  for (const filter of ['family', 'events', 'all']) {
    await tab.playwright.locator(`[data-filter="${filter}"]`).click();
    await ready(tab, 'list');
    assert.equal(await tab.playwright.locator('.text-list>a').count(), filter === 'family' ? 4 : filter === 'events' ? 2 : 8);
  }
  results.push({ name: 'all four categories', result: 'PASS' });
  for (const view of ['overview', 'list', 'overview', 'list', 'overview']) {
    await tab.playwright.locator(`[data-nav="${view}"]`).click();
  }
  await ready(tab, 'overview');
  await check('interrupted transitions settle', async () => { assert((await read(tab)).canvas <= 1); });
  await tab.goto(baseURL + '#/project/novogodnie-studiynye');
  await ready(tab, 'project');
  await tab.reload();
  await ready(tab, 'project');
  await check('direct project URL and refresh', async () => { assert.equal((await read(tab)).heading, 'Новогодние студийные'); });
  await tab.goto(baseURL + '#/project/not-a-real-project');
  await ready(tab, 'project');
  await check('unknown project recovery', async () => { assert.equal(await tab.playwright.locator('.not-found').count(), 1); });
  await tab.playwright.getByRole('link', { name: 'Открыть портфолио', exact: true }).click();
  await ready(tab, 'overview');
  await check('return from unknown project', async () => { assert.equal((await read(tab)).page, 'overview'); });
  const errors = (await tab.dev.logs({ levels: ['error'], limit: 100 })).filter(entry => entry.timestamp >= started);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  results.push({ name: 'no runtime/asset console errors', result: 'PASS' });
  return results;
}

export async function runFallbacks(tab, baseURL) {
  const results = [];
  for (const scenario of ['no-webgl', 'reduced-motion']) {
    await tab.goto(`${baseURL}tests/fixture.html?scenario=${scenario}#/overview`);
    await ready(tab, 'overview');
    await tab.playwright.locator('.photo-link').first().waitFor({ state: 'visible' });
    const state = await read(tab);
    assert.equal(state.canvas, 0);
    assert.equal(state.hiddenByWebgl, 0);
    assert(state.loaded > 0);
    await tab.playwright.locator('.photo-link').first().click();
    await ready(tab, 'project');
    await tab.playwright.locator('[data-close]').first().click();
    await ready(tab, 'overview');
    results.push({ name: `${scenario}: DOM content / project / Close`, result: 'PASS' });
  }
  await tab.goto(`${baseURL}tests/fixture.html?scenario=context-loss#/overview`);
  await ready(tab, 'overview');
  await tab.playwright.locator('canvas').waitFor({ state: 'attached' });
  // At least one texture has hidden its matching DOM image before the fault.
  await tab.playwright.locator('img[style*="opacity: 0"]').first().waitFor({ state: 'attached' });
  await tab.playwright.getByRole('button', { name: 'Simulate GPU context loss' }).click();
  await tab.playwright.locator('canvas').waitFor({ state: 'detached' });
  const fallback = await read(tab);
  assert.equal(fallback.hiddenByWebgl, 0);
  assert(fallback.loaded > 0);
  results.push({ name: 'real WEBGL_lose_context extension restores DOM', result: 'PASS' });
  await tab.goto(`${baseURL}tests/fixture.html?scenario=missing-image#/project/fashion`);
  await ready(tab, 'project');
  await tab.playwright.locator('[data-failed]').waitFor({ state: 'visible' });
  assert((await read(tab)).failed > 0);
  await tab.playwright.locator('[data-close]').first().click();
  await ready(tab, 'overview');
  results.push({ name: 'missing photo gives visible fallback and navigable page', result: 'PASS' });
  return results;
}

export { read as readState };

export async function runResponsive(tab, viewport, saveScreenshot) {
  const results = [];
  for (const [width, height] of [[320, 740], [390, 844], [768, 1024], [1440, 900], [1920, 1080]]) {
    await viewport.set({ width, height });
    for (const [name, hash] of [['overview', '#/overview'], ['list', '#/list'], ['project', '#/project/mama-s-dochkoy'], ['info', '#/info']]) {
      await tab.goto('http://127.0.0.1:4173/' + hash);
      await ready(tab, name);
      const state = await read(tab);
      assert.equal(state.width, width);
      assert(state.overflow <= 0, `${width} ${name}: overflow ${state.overflow}`);
      assert.equal(state.failed, 0);
      if ([390, 768, 1440].includes(width)) await saveScreenshot(`${name}-${width}.png`, await tab.screenshot({ fullPage: name === 'info' }));
      results.push({ width, height, view: name, overflow: state.overflow, result: 'PASS' });
    }
  }
  return results;
}

export async function runResizePreservation(tab, viewport) {
  await viewport.set({ width: 1440, height: 900 });
  await tab.goto('http://127.0.0.1:4173/#/project/mama-s-dochkoy');
  await ready(tab, 'project');
  await tab.scroll([720, 450], 'down', 1);
  await tab.getAXState({ emit: false });
  const before = await read(tab);
  assert(before.y > 100);
  await viewport.set({ width: 768, height: 1024 });
  await ready(tab, 'project');
  const after = await read(tab);
  assert(after.y > 100, 'Resizing a project must not reset it to the first frame');
  return { name: 'project resize preserves scroll', beforeY: before.y, afterY: after.y, result: 'PASS' };
}

export async function runNarrowOverview(tab, viewport) {
  await viewport.set({ width: 390, height: 844 });
  await tab.goto('http://127.0.0.1:4173/#/overview');
  await tab.reload();
  await ready(tab, 'overview');
  const sample = () => tab.playwright.evaluate(() => ({
    label: document.querySelector('[data-mobile-title]').textContent,
    wordmarkTop: document.querySelector('.mobile-wordmark').getBoundingClientRect().top,
    stageHeight: document.querySelector('.list-stage').getBoundingClientRect().height,
    height: innerHeight,
  }));
  const before = await sample();
  await tab.scroll([195, 650], 'down', .5);
  await tab.getAXState({ emit: false });
  const after = await sample();
  assert.notEqual(after.label, before.label);
  assert(Math.abs(after.wordmarkTop - before.wordmarkTop) < 1);
  await tab.playwright.locator('.photo-link').first().press('Enter');
  await ready(tab, 'project');
  await tab.playwright.locator('[data-close]').first().click();
  const transition = await sample();
  assert.equal(transition.stageHeight, transition.height, 'A transition must not make fixed layers relative to the long main');
  await ready(tab, 'overview');
  return { result: 'PASS', before, after, transition };
}
