import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRoute, galleryHash } from '../src/navigation.ts';

test('route defaults, malformed slugs and query values remain navigable', () => {
  assert.deepEqual(parseRoute(''), { page: 'overview', filter: 'all' });
  assert.deepEqual(parseRoute('#/list?filter=family'), { page: 'list', filter: 'family' });
  assert.deepEqual(parseRoute('#/list?filter=invalid'), { page: 'list', filter: 'all' });
  assert.deepEqual(parseRoute('#/project/%E0%A4%A'), { page: 'project', slug: '' });
  assert.deepEqual(parseRoute('#/project/a%20b'), { page: 'project', slug: 'a b' });
  assert.deepEqual(parseRoute('#/info'), { page: 'info' });
  assert.deepEqual(parseRoute('#/unknown'), { page: 'overview', filter: 'all' });
});

test('gallery links preserve the current view and filter through history', () => {
  for (const view of ['overview', 'list'] as const) {
    for (const filter of ['all', 'family', 'portrait', 'events'] as const) {
      assert.deepEqual(parseRoute(galleryHash(view, filter)), { page: view, filter });
    }
  }
});
