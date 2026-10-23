// Motion evidence: drives local Chrome over CDP with real mouse/wheel/touch input and records the screencast.
// Usage: node tests/motion-capture.mjs <baseURL> <outDir> [scenario...]   (needs Chrome and ffmpeg on PATH or default paths)
// Headless Chrome renders WebGL in software: clips show order and shape of motion, not device performance.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [base = 'http://127.0.0.1:4173/', out = 'docs/qa/motion', ...only] = process.argv.slice(2);
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const sleep = ms => new Promise(done => setTimeout(done, ms));

const desktop = { width: 1440, height: 900, mobile: false };
const phone = { width: 390, height: 844, mobile: true };
const tile = key => `(() => { const r = document.querySelector('.photo-link[data-tile="${key}"] .photo-frame').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`;
const link = selector => `(() => { const r = document.querySelector('${selector}').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`;

// V01–V06 of WEBSITE_MOTION_PLAN.md. Each step: [action, ...args]; t=0 is navigation start.
const scenarios = {
  'v01-cold-entry': { viewport: desktop, fresh: true, hash: '#/overview', steps: [['wait', 7500]] },
  'v01-warm-entry': { viewport: desktop, hash: '#/overview', warm: true, steps: [['wait', 3500]] },
  'v01-skip': { viewport: desktop, fresh: true, hash: '#/overview', steps: [['wait', 1200], ['click', link('.intro-skip')], ['wait', 3000]] },
  'v03-hover': { viewport: desktop, hash: '#/overview', warm: true, steps: [['wait', 3000], ['move', tile('vyhodnoy-na-dache-0'), 12], ['wait', 1600], ['move', [700, 470], 8], ['wait', 1400],
    ['move', tile('fashion-0'), 6], ['move', tile('varvare-5-let-0'), 6], ['move', tile('sasha-s-synom-v-otele-0'), 6], ['move', tile('mama-s-dochkoy-0'), 6], ['move', tile('loft-yula-0'), 6], ['wait', 1500]] },
  'v04-scroll': { viewport: desktop, hash: '#/overview', warm: true, steps: [['wait', 3000], ['wheel', 120, 8, 25], ['wait', 900], ['wheel', 400, 6, 16], ['wait', 300], ['wheel', -400, 6, 16], ['wait', 1500], ['wheel', 300, 30, 16], ['wait', 1800]] },
  'v05-sections': { viewport: desktop, hash: '#/overview', warm: true, steps: [['wait', 3000], ['click', link('[data-nav="list"]')], ['wait', 2600], ['wheel', 200, 8, 20], ['wait', 1200],
    ['click', link('[data-filter="family"]')], ['wait', 2400], ['click', link('[data-nav="info"]')], ['wait', 3600], ['click', link('[data-close]')], ['wait', 3000], ['click', link('[data-nav="overview"]')], ['wait', 2600]] },
  'v06-series': { viewport: desktop, hash: '#/overview', warm: true, steps: [['wait', 3000], ['wheel', 150, 6, 20], ['wait', 1200], ['click', tile('vyhodnoy-na-dache-0')], ['wait', 3500], ['wheel', 200, 6, 20], ['wait', 1200], ['key', 'Escape'], ['wait', 3500]] },
  'v08-reduced-motion': { viewport: desktop, fresh: true, reduced: true, hash: '#/overview', steps: [['wait', 1500], ['wheel', 300, 3, 100], ['wait', 800], ['click', tile('fashion-0')], ['wait', 1200], ['key', 'Escape'], ['wait', 1200]] },
  'v04-phone-strip': { viewport: phone, hash: '#/overview', warm: true, steps: [['wait', 3000], ['swipe', [330, 650], [40, 650], 14], ['wait', 1500], ['swipe', [60, 650], [350, 650], 8], ['wait', 1500]] },
};

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); this.handlers = []; }
  async open() {
    await new Promise((done, fail) => { this.socket.onopen = done; this.socket.onerror = fail; });
    this.socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id && this.pending.has(message.id)) {
        const { done, fail } = this.pending.get(message.id);
        this.pending.delete(message.id);
        message.error ? fail(new Error(message.error.message)) : done(message.result);
      } else this.handlers.forEach(handler => handler(message));
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((done, fail) => this.pending.set(id, { done, fail }));
  }
}

async function run(name, scenario, port) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  const { width, height, mobile } = scenario.viewport;
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // Real media query (not a JS stub): CSS and matchMedia both see reduced motion.
  if (scenario.reduced) await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const errors = [];
  cdp.handlers.push(message => { if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text); });
  if (scenario.fresh) await cdp.send('Storage.clearDataForOrigin', { origin: new URL(base).origin, storageTypes: 'all' });
  if (scenario.warm) {
    await cdp.send('Page.navigate', { url: base + scenario.hash });
    await sleep(9000);
  }
  const frames = [];
  const dir = mkdtempSync(join(tmpdir(), `xenia-${name}-`));
  cdp.handlers.push(message => {
    if (message.method !== 'Page.screencastFrame') return;
    const { data, metadata, sessionId } = message.params;
    const file = join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, time: metadata.timestamp });
    void cdp.send('Page.screencastFrameAck', { sessionId });
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: width, maxHeight: height });
  const started = Date.now();
  if (scenario.warm) await cdp.send('Page.reload');
  else await cdp.send('Page.navigate', { url: base + scenario.hash });
  const evaluate = async expression => { const reply = await cdp.send('Runtime.evaluate', { expression, returnByValue: true }); if (reply.exceptionDetails) errors.push(reply.exceptionDetails.exception?.description || reply.exceptionDetails.text); return reply.result.value; };
  let pointer = [width / 2, height - 5];
  const mouse = (type, [x, y], extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y]) => ({ x, y })) });
  const point = async value => (typeof value === 'string' ? evaluate(value) : value);
  const marks = [];
  for (const [action, ...args] of scenario.steps) {
    marks.push({ at: Date.now() - started, action, args: args.map(arg => (typeof arg === 'string' && arg.length > 40 ? arg.match(/"([^"]+)"|'([^']+)'/)?.slice(1).find(Boolean) : arg)) });
    if (action === 'wait') await sleep(args[0]);
    if (action === 'move' || action === 'click') {
      const to = await point(args[0]);
      const steps = action === 'move' ? args[1] : 6;
      for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', [pointer[0] + (to[0] - pointer[0]) * i / steps, pointer[1] + (to[1] - pointer[1]) * i / steps]); await sleep(16); }
      pointer = to;
      if (action === 'click') { await mouse('mousePressed', to, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', to, { button: 'left', clickCount: 1 }); }
    }
    if (action === 'wheel') for (let i = 0; i < args[1]; i++) { await mouse('mouseWheel', pointer, { deltaX: 0, deltaY: args[0] }); await sleep(args[2]); }
    if (action === 'key') { await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: args[0], code: args[0], windowsVirtualKeyCode: 27 }); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: args[0], code: args[0], windowsVirtualKeyCode: 27 }); }
    if (action === 'swipe') {
      const [from, to, steps] = args;
      await touch('touchStart', [from]);
      for (let i = 1; i <= steps; i++) { await touch('touchMove', [[from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]]); await sleep(16); }
      await touch('touchEnd', []);
    }
  }
  await cdp.send('Page.stopScreencast');
  const state = await evaluate(`({ hash: location.hash, page: document.querySelector('#app').dataset.page, phase: document.querySelector('#app').dataset.phase, canvas: document.querySelectorAll('canvas').length, intro: !!document.querySelector('.intro'), grain: getComputedStyle(document.querySelector('.noise'), '::after').animationName, focus: document.activeElement?.dataset.project || document.activeElement?.tagName })`);
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
  // Variable frame rate: each frame lasts until the next screencast frame, so the clip keeps real timing.
  const list = frames.map((frame, index) => `file '${frame.file.replace(/\\/g, '/')}'\nduration ${Math.max(.001, ((frames[index + 1]?.time ?? frame.time + .04) - frame.time)).toFixed(4)}`).join('\n');
  writeFileSync(join(dir, 'list.txt'), `${list}\nfile '${frames.at(-1).file.replace(/\\/g, '/')}'\n`);
  const video = resolve(out, `${name}.mp4`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '26', video]);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', video, '-vf', `fps=4,scale=${Math.round(width / (mobile ? 2 : 4))}:-1,tile=6x${mobile ? 3 : 5}`, '-frames:v', '1', resolve(out, `${name}-sheet.jpg`)]);
  rmSync(dir, { recursive: true, force: true });
  const duration = frames.length ? frames.at(-1).time - frames[0].time : 0;
  return { name, viewport: `${width}x${height}`, frames: frames.length, seconds: Number(duration.toFixed(2)), averageFps: Number((frames.length / Math.max(duration, .001)).toFixed(1)), marks, final: state, errors };
}

mkdirSync(out, { recursive: true });
const port = 9333;
const profile = mkdtempSync(join(tmpdir(), 'xenia-chrome-'));
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' });
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(200); } }
  const results = [];
  for (const [name, scenario] of Object.entries(scenarios)) {
    if (only.length && !only.includes(name)) continue;
    const result = await run(name, scenario, port);
    console.log(JSON.stringify(result));
    results.push(result);
  }
  writeFileSync(resolve(out, only.length ? `capture-${only.join('+')}.json` : 'capture.json'), JSON.stringify({ base, chrome: 'headless, SwiftShader WebGL', captured: new Date().toISOString(), results }, null, 2));
} finally {
  browser.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
