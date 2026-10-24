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

test('list links preserve the category through history', () => {
  for (const filter of ['all', 'family', 'portrait', 'events'] as const) {
    assert.deepEqual(parseRoute(galleryHash('list', filter)), { page: 'list', filter });
  }
});

test('switching from a filtered list to overview clears the category', () => {
  for (const filter of ['all', 'family', 'portrait', 'events'] as const) {
    const list = parseRoute(galleryHash('list', filter));
    assert.equal(list.page, 'list');
    if (list.page !== 'list') throw new Error('Expected list route');
    assert.equal(galleryHash('overview', list.filter), '#/overview');
    assert.deepEqual(parseRoute(galleryHash('overview', list.filter)), { page: 'overview', filter: 'all' });
  }
});

test('overview ignores categories in old or direct URLs', () => {
  for (const filter of ['family', 'portrait', 'events']) {
    assert.deepEqual(parseRoute(`#/overview?filter=${filter}`), { page: 'overview', filter: 'all' });
  }
});
