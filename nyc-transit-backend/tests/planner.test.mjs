import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStations, planRoutes } from '../services/routePlanningService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ada = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'ada_stations.json'), 'utf8')
).stations;

const TIMES_SQ = '127';
const ATLANTIC = '235';
const ASTORIA_DITMARS = 'R01'; // not step-free accessible in the ADA data

test('plans Times Sq to Atlantic Av with a plausible direct ride', async () => {
  const result = await planRoutes(TIMES_SQ, ATLANTIC, 3);
  assert.equal(result.origin.name, 'Times Sq-42 St');
  assert.equal(result.destination.name, 'Atlantic Av-Barclays Ctr');
  assert.ok(result.routes.length >= 1);

  const best = result.routes[0];
  assert.equal(best.id, 0);
  assert.equal(best.transfers, 0);
  assert.ok(best.duration >= 15 && best.duration <= 35, `duration ${best.duration}`);
  assert.ok(best.lines.every((line) => ['2', '3'].includes(line)));
});

test('routes are sorted by duration and carry map geometry', async () => {
  const { routes } = await planRoutes(TIMES_SQ, '635', 3);
  for (let i = 1; i < routes.length; i += 1) {
    assert.ok(routes[i].durationSeconds >= routes[i - 1].durationSeconds);
  }
  for (const route of routes) {
    for (const segment of route.segments) {
      if (segment.kind === 'subway') {
        assert.ok(segment.stops.length >= 2);
        for (const stop of segment.stops) {
          assert.ok(Number.isFinite(stop.lat) && Number.isFinite(stop.lon) && stop.name);
        }
      } else {
        assert.ok(Number.isFinite(segment.distanceMeters));
        assert.ok(Array.isArray(segment.path));
      }
    }
  }
});

test('a transfer between different stations reports a walking distance', async () => {
  // 14 St (3) -> 6 Av (L): the 3 and L meet via a street-level transfer.
  const { routes } = await planRoutes(TIMES_SQ, 'L06', 1);
  const walks = routes[0].segments.filter(
    (segment) => segment.kind === 'transfer' && segment.fromName !== segment.toName
  );
  assert.ok(walks.length >= 1);
  for (const walk of walks) {
    assert.ok(walk.distanceMeters > 0 && walk.distanceMeters < 1500);
    assert.ok(walk.durationSeconds >= 60);
  }
});

test('unknown stations and identical endpoints are handled', async () => {
  const unknown = await planRoutes('NOPE', ATLANTIC, 3);
  assert.equal(unknown.error, 'unknown_station');

  const same = await planRoutes(TIMES_SQ, TIMES_SQ, 3);
  assert.deepEqual(same.routes, []);
});

test('accessible mode rejects a non step-free destination', async () => {
  assert.equal(ada[ASTORIA_DITMARS].ada, 0);
  const result = await planRoutes(TIMES_SQ, ASTORIA_DITMARS, 3, { accessible: true });
  assert.equal(result.reason, 'destination_not_accessible');
  assert.deepEqual(result.routes, []);
});

test('accessible routes only board, leave and transfer at step-free stations', async () => {
  const ids = Object.keys(ada).filter((id) => ada[id].ada === 1);
  const pairs = [
    [TIMES_SQ, ATLANTIC],
    ['161', 'G08'],
    ['A24', '635'],
  ].filter(([a, b]) => ids.includes(a) && ids.includes(b));
  assert.ok(pairs.length >= 1);

  for (const [from, to] of pairs) {
    const { routes } = await planRoutes(from, to, 3, { accessible: true });
    for (const route of routes) {
      assert.equal(route.isAda, true);
      for (const segment of route.segments.filter((s) => s.kind === 'subway')) {
        for (const stop of [segment.stops[0], segment.stops[segment.stops.length - 1]]) {
          assert.ok(ada[stop.id]?.ada >= 1, `${stop.name} (${stop.id}) is not step-free`);
        }
      }
    }
  }
});

test('an elevator outage removes step-free access to that station', async () => {
  const result = await planRoutes(TIMES_SQ, ATLANTIC, 3, {
    accessible: true,
    blockedStationIds: new Set([TIMES_SQ]),
  });
  assert.equal(result.reason, 'origin_not_accessible');
});

test('weekend graphs do not offer lines that only run on weekdays', async () => {
  const stations = await getStations();
  const sample = stations.filter((_, index) => index % 40 === 0).map((s) => s.id);
  const weekdayOnly = new Set(['B', 'W', 'Z']);
  let checked = 0;
  for (let i = 0; i + 1 < sample.length; i += 1) {
    const result = await planRoutes(sample[i], sample[i + 1], 3, { dayType: 'sunday' });
    for (const route of result.routes || []) {
      checked += 1;
      assert.ok(route.lines.every((line) => !weekdayOnly.has(line)), route.lines.join('>'));
    }
  }
  assert.ok(checked > 0);
});

test('delay alerts are attached to routes and keep the route available', async () => {
  const alertsByLine = {
    2: [{ headline: 'Test delay', kind: 'delay' }],
    3: [{ headline: 'Test delay', kind: 'delay' }],
  };
  const result = await planRoutes(TIMES_SQ, ATLANTIC, 3, { alertsByLine });
  assert.equal(result.alertsAvailable, true);
  assert.ok(result.routes.length >= 1);
  assert.ok(result.routes[0].alerts.length >= 1);
  assert.equal(result.routes[0].alerts[0].items[0].headline, 'Test delay');
});

test('every station is covered by the ADA data', async () => {
  const stations = await getStations();
  const missing = stations.filter((station) => !ada[station.id]);
  assert.deepEqual(missing.map((s) => s.id), []);
});
