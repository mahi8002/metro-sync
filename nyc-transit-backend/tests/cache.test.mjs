import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../services/cacheService.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('concurrent misses share one loader call', async () => {
  const cache = createCache();
  let calls = 0;
  const loader = async () => {
    calls += 1;
    await wait(20);
    return 'value';
  };
  const results = await Promise.all([
    cache.get('k', 1000, loader),
    cache.get('k', 1000, loader),
    cache.get('k', 1000, loader),
  ]);
  assert.equal(calls, 1);
  assert.ok(results.every((result) => result.value === 'value'));
});

test('fresh entries are served from cache', async () => {
  const cache = createCache();
  let calls = 0;
  const loader = async () => ++calls;
  const first = await cache.get('k', 1000, loader);
  const second = await cache.get('k', 1000, loader);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
});

test('a failed refresh serves stale data within maxStaleMs', async () => {
  const cache = createCache();
  await cache.get('k', 5, async () => 'good');
  await wait(15);
  const result = await cache.get(
    'k',
    5,
    async () => {
      throw new Error('boom');
    },
    { maxStaleMs: 10_000 }
  );
  assert.equal(result.value, 'good');
  assert.equal(result.stale, true);
});

test('a failed refresh throws once the data is too old or missing', async () => {
  const failing = async () => {
    throw new Error('boom');
  };
  const cache = createCache();
  await assert.rejects(cache.get('missing', 1000, failing), /boom/);

  await cache.get('old', 5, async () => 'good');
  await wait(20);
  await assert.rejects(cache.get('old', 5, failing, { maxStaleMs: 10 }), /boom/);
});
