import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8'));

test('data/map.json has line shapes, stations and per-line station order', () => {
  const map = read('data', 'map.json');
  assert.equal(map.lines.type, 'FeatureCollection');
  assert.ok(map.lines.features.length >= 40);
  assert.equal(map.stations.features.length, 496);
  assert.ok(map.lineStops, 'run `npm run build:map` after `npm run build:transit`');

  const stationIds = new Set(map.stations.features.map((f) => f.properties.stop_id));
  for (const [line, plan] of Object.entries(map.lineStops)) {
    assert.ok(plan.main.length >= 2, `${line} has a trunk`);
    for (const id of [...plan.main, ...plan.branches.flatMap((b) => b.stations)]) {
      assert.ok(stationIds.has(id), `${line}: unknown station ${id}`);
    }
  }
});

test('every day graph has train edges and is a subset of the merged graph', () => {
  const root = path.join(__dirname, '..', '..');
  const edgeKeys = (file) => {
    const graph = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    const keys = new Set();
    for (const [from, edges] of Object.entries(graph)) {
      for (const edge of edges) keys.add(`${from}>${edge.to}:${edge.routeId}`);
    }
    return keys;
  };
  const all = edgeKeys('full_graph.json');
  for (const file of ['full_graph_weekday.json', 'full_graph_saturday.json', 'full_graph_sunday.json']) {
    const keys = edgeKeys(file);
    assert.ok(keys.size > 1000, `${file} is not empty`);
    for (const key of keys) assert.ok(all.has(key), `${file}: ${key} missing from full_graph.json`);
  }
});

test('route plan responses keep the fields the frontend reads', async () => {
  const { planRoutes } = await import('../services/routePlanningService.js');
  const result = await planRoutes('127', '235', 1);
  const route = result.routes[0];
  for (const field of [
    'id', 'duration', 'durationSeconds', 'transfers', 'lines', 'isExpress',
    'steps', 'segments', 'polyline', 'isAda', 'alerts',
  ]) {
    assert.ok(field in route, `route.${field}`);
  }
  for (const field of ['serviceDay', 'accessibleOnly', 'origin', 'destination']) {
    assert.ok(field in result, `result.${field}`);
  }
});

test('frontend locator finds an html file', () => {
  const { findFrontendFile } = require('../frontendFile.cjs');
  assert.ok(fs.existsSync(findFrontendFile()));
});
