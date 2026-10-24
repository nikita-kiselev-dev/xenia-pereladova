import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { layout, nearest, wrap } from '../src/gallery-layout.ts';
import { portraitLayout, projectFrame } from '../src/viewport.ts';

// Same tile order as the gallery markup: every cover, then the fourth photo of each series.
type Photo = { width: number; height: number };
const { projects } = JSON.parse(readFileSync(new URL('../src/data/portfolio.json', import.meta.url), 'utf8')) as { projects: { cover: Photo; photos: Photo[] }[] };
const portfolio = [...projects.map(project => project.cover), ...projects.map(project => project.photos[Math.min(3, project.photos.length - 1)])].map(photo => photo.width / photo.height);
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('wrap keeps a value inside one period and is continuous across cycles', () => {
  for (const value of [-2500, -1, 0, 1, 999, 1000, 3333]) {
    const wrapped = wrap(value, 1000, 150);
    assert(wrapped >= -150 && wrapped < 850);
    assert.equal(((wrapped - value) % 1000 + 1000) % 1000, 0);
  }
  assert.equal(nearest(100, 2150, 1000), 2100);
});

test('portrait geometry reserves caption, browser controls and safe areas on phones and tablets', () => {
  for (const [width, height] of [[320, 480], [320, 568], [360, 640], [375, 635], [375, 812], [430, 932], [600, 800], [601, 962], [768, 1024], [820, 1180], [1024, 1366], [1280, 1920], [812, 375]]) {
    for (const insets of [{ top: 0, right: 0, bottom: 0, left: 0 }, { top: 59, right: 0, bottom: 34, left: 0 }, { top: 0, right: 44, bottom: 21, left: 44 }]) {
      const view = { width, height, ...insets };
      const portrait = portraitLayout(width, height, insets);
      assert(portrait.wordmark > 0, `${width}x${height}: XP has room`);
      assert(portrait.captionTop + 64 < portrait.photoTop, `${width}x${height}: caption clears strip`);
      assert(portrait.photoTop + portrait.photoHeight <= height - insets.bottom - 64, `${width}x${height}: strip clears footer`);
      for (const ratio of [.5, .8, 1, 1.5, 2]) {
        const frame = projectFrame(ratio, view);
        assert(frame.y >= 110 + insets.top, `${width}x${height}: photo clears heading`);
        assert(frame.y + frame.h <= height - insets.bottom - 100, `${width}x${height}: photo clears counter`);
        assert(frame.x >= insets.left && frame.x + frame.w <= width - insets.right, `${width}x${height}: photo clears cutouts`);
        assert(Math.abs(frame.w / frame.h - ratio) < 1e-10);
      }
    }
  }
});

test('full portfolio cycles without seams on every tested viewport, short filters stay still', () => {
  for (const [vw, vh] of [[1024, 700], [1440, 900], [1920, 1080], [2560, 1440], [375, 635], [375, 762], [375, 812], [390, 844], [768, 1024]]) {
    for (const mode of vw >= 1024 ? ['overview', 'list'] as const : ['strip'] as const) {
      const result = layout(mode, portfolio, vw, vh);
      assert(result.cycling, `${mode} ${vw}x${vh} must cycle`);
      assert(result.period >= (result.axis === 'x' ? vw : vh) + result.margin);
      result.boxes.forEach((box, index) => {
        assert(box.x >= 0 && box.x + box.w <= (result.axis === 'x' ? Infinity : vw), `${mode} ${vw}: box ${index} outside`);
        result.boxes.slice(index + 1).forEach(other => assert(!overlaps(box, other), `${mode} ${vw}x${vh}: overlap at ${index}`));
      });
    }
  }
  const short = layout('list', [.8, .8, .8, .8], 1440, 900);
  assert(!short.cycling);
  assert.equal(short.max, 0);
});
