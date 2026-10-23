import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const portfolio = JSON.parse(readFileSync(resolve(root, 'src/data/portfolio.json'), 'utf8'));

test('every published photo and cover exists, with usable dimensions and source attribution', () => {
  const slugs = new Set();
  for (const project of portfolio.projects) {
    assert(!slugs.has(project.slug), `Duplicate slug: ${project.slug}`);
    assert(/^[a-z0-9-]+$/.test(project.slug));
    slugs.add(project.slug);
    assert(project.title && project.photos.length);
    for (const photo of [project.cover, ...project.photos]) {
      assert(photo.width > 0 && photo.height > 0);
      assert(photo.alt && photo.source.startsWith('https://i.wfolio.ru/'));
      for (const key of ['src', 'thumbnail']) {
        assert(photo[key].startsWith('images/'));
        assert(existsSync(resolve(root, 'public', photo[key])), photo[key]);
      }
    }
  }
  assert(existsSync(resolve(root, 'public', portfolio.portrait.src)));
  assert.equal(slugs.size, 8);
});
