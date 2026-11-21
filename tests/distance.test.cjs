const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
for (const name of ['distance.js', 'carbon.js', 'achievements.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'));
const D = globalThis.MetroDistance, C = globalThis.MetroCarbon, A = globalThis.MetroAchievements;
const network = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/transit-network.json'), 'utf8'));
const state = D.prepare(network);
const routes = D.planRoutes(state, '127', '235');
assert.ok(routes.length >= 1);
for (const route of routes) {
  assert.ok(route.transitDistanceKm > 5 && route.transitDistanceKm < 30);
  assert.ok(route.polyline.length > 20);
  assert.equal(route.originId, '127'); assert.equal(route.destinationId, '235');
  assert.ok(Math.abs(route.trainSegments.reduce((s, e) => s + e.distanceKm, 0) - route.transitDistanceKm) < 1e-8);
  for (const edge of route.trainSegments) assert.ok(network.edges[edge.from].some(e => e.to === edge.to && e.route === edge.route && e.shape === edge.shape));
}
assert.ok(D.planRoutes(state, '235', '127')[0].transitDistanceKm > 5);
assert.ok(D.planRoutes(state, '127', '128')[0].transitDistanceKm < routes[0].transitDistanceKm);
assert.deepEqual(D.planRoutes(state, '127', '127'), []);
assert.throws(() => D.planRoutes(state, 'invalid', '127'));
const disconnected = D.prepare({ ...network, edges: {}, transfers: [] });
assert.deepEqual(D.planRoutes(disconnected, '127', '235'), []);
const page = fs.readFileSync(path.join(__dirname, '../Metro Sync_v2.1.1.html'), 'utf8');
const stationLiteral = page.match(/const STATIONS_DATA = (\{[\s\S]*?\n    \});/)[1];
const stations = Object.values(vm.runInNewContext('(' + stationLiteral + ')'));
for (const origin of stations) for (const destination of stations) {
  if (origin.id === destination.id) continue;
  const planned = D.planRoutes(state, origin.mta_id, destination.mta_id, 1);
  assert.ok(planned.length, `No route for ${origin.id} > ${destination.id}`);
  assert.ok(planned[0].transitDistanceKm > 0);
}
console.log('GTFS routes:', routes.map(r => ({ lines: r.lines, km: r.transitDistanceKm, stops: r.trainSegments.length })));
async function main() {
  let calls = 0;
  const response = { code: 'Ok', routes: [{ distance: 12500 }], waypoints: [{ distance: 12 }, { distance: 20 }] };
  const from = network.stops['127'], to = network.stops['235'];
  const client = D.createRoadClient({ minimumIntervalMs: 0, fetchImpl: async url => { calls++; assert.ok(url.includes(`${from.lon},${from.lat};${to.lon},${to.lat}`) || url.includes(`${to.lon},${to.lat};${from.lon},${from.lat}`)); return { ok: true, json: async () => response }; } });
  const road = await client.get(from, to);
  assert.equal(road.drivingDistanceKm, 12.5);
  assert.equal((await client.get(from, to)).cached, true); assert.equal(calls, 1);
  await client.get(to, from); assert.equal(calls, 2); // Road directions have distinct caches.
  for (const data of [{ code: 'NoRoute' }, { ...response, routes: [{ distance: -1 }] }, { ...response, waypoints: [{ distance: 999 }, { distance: 0 }] }]) assert.throws(() => D.parseRoadResponse(data));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.get(from, to, { signal: controller.signal }), { name: 'AbortError' });
  const failing = D.createRoadClient({ minimumIntervalMs: 0, fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(failing.get(from, to), /503/);
  const noRoute = D.createRoadClient({ minimumIntervalMs: 0, fetchImpl: async () => ({ ok: true, json: async () => ({ code: 'NoRoute' }) }) });
  await assert.rejects(noRoute.get(from, to), /No valid/);
  const timeout = D.createRoadClient({ timeoutMs: 5, minimumIntervalMs: 0, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) });
  await assert.rejects(timeout.get(from, to), /timed out/);
  const activeController = new AbortController();
  const cancelling = D.createRoadClient({ minimumIntervalMs: 0, fetchImpl: async (_url, { signal }) => {
    activeController.abort();
    if (signal.aborted) throw new Error('aborted');
    throw new Error('Active abort was not propagated');
  } });
  await assert.rejects(cancelling.get(from, to, { signal: activeController.signal }), { name: 'AbortError' });
  const auto = C.estimateAutomatic(routes[0], road);
  assert.ok(C.validSnapshot(auto)); assert.equal(auto.methodVersion, 'distance-v2');
  let progress = A.complete(A.start(A.empty(), 'TSQ', 'BARC', 'old'), '2026-11-20T12:00:00Z');
  const manual = C.estimate({ drivingDistance: 10, transitDistance: 10, unit: 'km', baselineMode: 'solo-petrol-car', distanceSource: 'Historical manual source' });
  progress = A.complete(A.start(progress, 'TSQ', 'PENN', 'manual'), '2026-11-20T12:01:00Z', manual);
  const before = JSON.parse(JSON.stringify(progress));
  progress = A.complete(A.start(progress, 'TSQ', 'BARC', 'auto'), '2026-11-20T12:02:00Z', auto);
  assert.deepEqual(progress.trips.slice(0, 2), before.trips);
  const restored = A.normalize(JSON.parse(JSON.stringify(progress)));
  assert.equal(C.summarize(restored.trips).estimatedJourneys, 2);
  assert.equal(C.summarize(restored.trips).unestimatedJourneys, 1);
  assert.equal(A.complete(restored, '2026-11-20T12:03:00Z', auto).trips.length, 3);
  assert.equal(C.validSnapshot({ ...auto, transitDistanceKm: auto.transitDistanceKm + 1 }), false);
  assert.equal(C.estimateAutomatic(routes[0], road, 'walking').status, 'unavailable');
  assert.equal(C.estimateAutomatic(null, road).status, 'unavailable');
  console.log('PASS: real GTFS geometry, direction, alternatives, no-route handling, road units/snapping/cache/abort/timeout/errors, automatic snapshots and legacy/manual preservation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
