// Browser fault injection belongs to the test build; never included in dist.
const scenario = new URLSearchParams(location.search).get('scenario');
document.documentElement.dataset.qaScenario = scenario;

if (scenario === 'no-webgl') {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...options) {
    return type === 'webgl2' ? null : original.call(this, type, ...options);
  };
}
if (scenario === 'reduced-motion') {
  const original = window.matchMedia.bind(window);
  window.matchMedia = query => {
    const media = original(query);
    return query === '(prefers-reduced-motion: reduce)' ? new Proxy(media, {
      get(target, property) {
        if (property === 'matches') return true;
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) : media;
  };
}
if (scenario === 'missing-image') {
  const observer = new MutationObserver(() => {
    const image = document.querySelector('main img');
    if (!image) return;
    observer.disconnect();
    image.srcset = '';
    image.src = './missing-photo.webp';
  });
  observer.observe(document.querySelector('#app'), { subtree: true, childList: true });
}
await import('../src/main.ts');

if (scenario === 'context-loss') {
  const trigger = document.createElement('button');
  trigger.textContent = 'Simulate GPU context loss';
  trigger.style.cssText = 'position:fixed;top:70px;right:20px;z-index:100;background:white;padding:12px;border:1px solid';
  trigger.addEventListener('click', () => {
    const context = document.querySelector('canvas')?.getContext('webgl2');
    const extension = context?.getExtension('WEBGL_lose_context');
    if (extension) extension.loseContext();
    trigger.dataset.result = extension ? 'triggered' : 'unavailable';
  });
  document.body.append(trigger);
}

if (scenario === 'profile') {
  const trigger = document.createElement('button');
  trigger.textContent = 'Measure 120 frames';
  trigger.style.cssText = 'position:fixed;top:70px;right:20px;z-index:100;background:white;padding:12px;border:1px solid';
  trigger.addEventListener('click', () => {
    trigger.disabled = true;
    const frames = [];
    let last;
    const sample = now => {
      if (last !== undefined) frames.push(now - last);
      last = now;
      if (frames.length < 120) { requestAnimationFrame(sample); return; }
      const sorted = [...frames].sort((a, b) => a - b);
      const resources = performance.getEntriesByType('resource');
      const output = document.createElement('pre');
      output.dataset.performanceResult = 'true';
      output.style.cssText = 'position:fixed;inset:120px 20px auto;max-height:50vh;overflow:auto;background:white;border:1px solid;padding:12px;z-index:100;font:10px monospace;white-space:pre-wrap';
      output.textContent = JSON.stringify({
        userAgent: navigator.userAgent,
        viewport: [innerWidth, innerHeight],
        devicePixelRatio,
        visibility: document.visibilityState,
        frames: frames.length,
        averageFrameMs: frames.reduce((sum, value) => sum + value, 0) / frames.length,
        p95FrameMs: sorted[Math.floor(sorted.length * .95)],
        maxFrameMs: sorted.at(-1),
        transferBytes: resources.reduce((sum, resource) => sum + resource.transferSize, 0),
        resources: resources.map(resource => ({ name: resource.name, encodedBodySize: resource.encodedBodySize, transferSize: resource.transferSize })),
      }, null, 2);
      document.body.append(output);
    };
    requestAnimationFrame(sample);
  }, { once: true });
  document.body.append(trigger);
}
