import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { planRoutes } from '../services/routePlanningService.js';

const root = new URL('../../', import.meta.url);
for (const file of ['distance.js', 'carbon.js', 'eco-score.js', 'achievements.js']) {
  vm.runInThisContext(fs.readFileSync(new URL(file, root), 'utf8'));
}
const { MetroDistance: D, MetroCarbon: C, MetroEcoScore: E, MetroAchievements: A } = globalThis;
const network = D.prepare(JSON.parse(fs.readFileSync(new URL('data/transit-network.json', root), 'utf8')));
const road = { drivingDistanceKm: 12, roadSource: 'test-road', fetchedAt: '2026-11-27T12:00:00Z' };

test('Eco distances follow backend-selected platform hops in both directions and service days', async () => {
  for (const dayType of ['weekday', 'saturday', 'sunday']) {
    for (const [from, to] of [['127','235'], ['235','127'], ['125','128'], ['631','635']]) {
      const result = await planRoutes(from, to, 3, { dayType });
      assert.ok(result.routes.length);
      for (const route of result.routes) {
        const measured = D.measureRoute(network, route);
        assert.ok(measured.transitDistanceKm > 0, `${dayType}: ${from} > ${to}, ${route.lines}`);
        const expectedHops = route.segments.filter(s => s.kind === 'subway').flatMap(s => s.stopIds.slice(1).map((to, i) => ({ from: s.stopIds[i], to, route: s.routeId })));
        assert.deepEqual(measured.trainSegments.map(({from,to,route}) => ({from,to,route})), expectedHops);
        assert.deepEqual(measured.segments, route.segments);
        assert.deepEqual(measured.polyline, route.polyline);
        assert.ok(C.validSnapshot(C.estimateAutomatic(measured, road)));
      }
    }
  }
});

test('Unmatched platform hops stay unestimated; no substitute route or straight-line distance', async () => {
  const route = (await planRoutes('127','235')).routes[0];
  const bad = structuredClone(route);
  bad.segments.find(s => s.kind === 'subway').stopIds[1] = 'unknown';
  const result = D.measureRoute(network, bad);
  assert.equal(result.transitDistanceKm, undefined);
  assert.equal(C.estimateAutomatic(result, road).status, 'unavailable');
});

test('Journey snapshot survives reload and later searches; legacy progress stays intact', async () => {
  const route = D.measureRoute(network, (await planRoutes('127','235')).routes[0]);
  const snapshot = E.attach(C.estimateAutomatic(route, road));
  let progress = A.complete(A.start(A.empty(), 'TSQ', 'BARC', 'old'), '2026-11-20T12:00:00Z');
  const legacy = structuredClone(progress.trips[0]);
  progress = A.start(progress, '127', '235', 'new');
  progress.active.carbon = C.snapshot(snapshot);
  progress = A.normalize(JSON.parse(JSON.stringify(progress)));
  const saved = A.complete(progress, '2026-11-27T12:00:00Z', progress.active.carbon);
  assert.equal(saved.active, null);
  assert.deepEqual(saved.trips[0], legacy);
  assert.deepEqual(saved.trips[1].carbon, snapshot);
  assert.equal(A.complete(saved, '2026-11-27T12:00:00Z').trips.length, 2);
  assert.equal(C.summarize(saved.trips).estimatedJourneys, 1);
});
