(function (scope) {
  'use strict';
  const displayLine = route => ['FS', 'GS', 'H'].includes(route) ? 'S' : route === 'SI' ? 'SIR' : route.replace(/X$/, '');
  function prepare(network) {
    if (network.version !== 1 || !network.stops || !network.edges || !network.shapes) throw new Error('Unsupported transit distance data.');
    const adjacency = new Map();
    const add = (from, edge) => { if (!adjacency.has(from)) adjacency.set(from, []); adjacency.get(from).push({ ...edge, from }); };
    const platforms = new Set();
    for (const [from, edges] of Object.entries(network.edges)) for (const edge of edges) {
      if (!(edge.distanceKm > 0) || !network.shapes[edge.shape]) continue;
      platforms.add(from); platforms.add(edge.to);
      add(from, { ...edge, kind: 'train' });
    }
    for (const id of platforms) {
      const parent = network.stops[id]?.parent;
      if (!parent) continue;
      add(parent, { to: id, seconds: 45, kind: 'walk', distanceKm: 0 });
      add(id, { to: parent, seconds: 45, kind: 'walk', distanceKm: 0 });
    }
    for (const edge of network.transfers || []) add(edge.from, { to: edge.to, seconds: edge.seconds, kind: 'walk', distanceKm: 0 });
    return { network, adjacency };
  }
  function shortest(state, origin, destination, blocked) {
    const first = origin + '\0';
    const distance = new Map([[first, 0]]), previous = new Map(), queue = [[0, first]];
    let target;
    while (queue.length) {
      queue.sort((a, b) => a[0] - b[0]);
      const [cost, key] = queue.shift();
      if (cost !== distance.get(key)) continue;
      const [node, lastRoute] = key.split('\0');
      if (node === destination) { target = key; break; }
      for (const edge of state.adjacency.get(node) || []) {
        if (edge.kind === 'train' && blocked.has(edge.route)) continue;
        const nextRoute = edge.kind === 'train' ? edge.route : lastRoute;
        const penalty = edge.kind === 'train' && lastRoute && lastRoute !== edge.route ? 180 : 0;
        const nextKey = edge.to + '\0' + nextRoute;
        const nextCost = cost + edge.seconds + penalty;
        if (nextCost < (distance.get(nextKey) ?? Infinity)) {
          distance.set(nextKey, nextCost); previous.set(nextKey, { key, edge }); queue.push([nextCost, nextKey]);
        }
      }
    }
    if (!target) return null;
    const edges = [];
    for (let cursor = target; cursor !== first;) {
      const step = previous.get(cursor); if (!step) return null;
      edges.unshift(step.edge); cursor = step.key;
    }
    return { edges, seconds: distance.get(target) };
  }
  function option(state, path, origin, destination) {
    const trains = path.edges.filter(e => e.kind === 'train');
    if (!trains.length) return null;
    const segments = [], polyline = [];
    for (const edge of path.edges) {
      if (edge.kind !== 'train') continue;
      const points = state.network.shapes[edge.shape];
      const geometry = [edge.startPoint, ...points.slice(edge.startIndex + 1, edge.endIndex + 1), edge.endPoint];
      for (const point of geometry) {
        const last = polyline[polyline.length - 1];
        if (!last || last[0] !== point[0] || last[1] !== point[1]) polyline.push(point);
      }
      const lastSegment = segments[segments.length - 1];
      if (lastSegment && lastSegment.route === edge.route && lastSegment.to === edge.from) {
        lastSegment.to = edge.to; lastSegment.stops++; lastSegment.distanceKm += edge.distanceKm;
      } else segments.push({ route: edge.route, from: edge.from, to: edge.to, stops: 1, distanceKm: edge.distanceKm });
    }
    const name = id => state.network.stops[id]?.name || id;
    const steps = segments.map(s => `Ride ${displayLine(s.route)} from ${name(s.from)} to ${name(s.to)} (${s.stops} stops)`);
    steps.push('Arrive at ' + name(destination));
    return { originId: origin, destinationId: destination, duration: Math.round(path.seconds / 60),
      transfers: Math.max(0, segments.length - 1), isAda: null,
      lines: segments.map(s => displayLine(s.route)), isExpress: segments.map(s => /X$/.test(s.route)), steps,
      transitDistanceKm: trains.reduce((sum, e) => sum + e.distanceKm, 0), polyline,
      routeKey: trains.map(e => `${e.from}:${e.to}:${e.route}:${e.shape}`).join('|'),
      trainSegments: trains.map(e => ({ from: e.from, to: e.to, route: e.route, shape: e.shape, distanceKm: e.distanceKm })),
      transitSource: state.network.source, transitDataVersion: state.network.archiveSha256,
      transitGeneratedAt: state.network.generatedAt, routes: segments.map(s => s.route) };
  }
  function planRoutes(state, origin, destination, maxOptions = 3) {
    if (origin === destination) return [];
    if (!state.network.stops[origin] || !state.network.stops[destination]) throw new Error('Station not found in GTFS data.');
    const first = shortest(state, origin, destination, new Set());
    if (!first) return [];
    const fastest = option(state, first, origin, destination);
    if (!fastest) return [];
    const options = [fastest], seen = new Set([fastest.routes.join('>')]);
    for (const route of new Set(fastest.routes)) {
      if (options.length >= maxOptions) break;
      const path = shortest(state, origin, destination, new Set([route]));
      const next = path && option(state, path, origin, destination);
      if (next && !seen.has(next.routes.join('>'))) { seen.add(next.routes.join('>')); options.push(next); }
    }
    return options.sort((a, b) => a.duration - b.duration).map((r, id) => ({ ...r, id, title: id ? `Alternative GTFS Route ${id}` : 'Suggested GTFS Route' }));
  }
  function parseRoadResponse(data) {
    const route = data?.routes?.[0];
    if (data?.code !== 'Ok' || typeof route?.distance !== 'number' || !Number.isFinite(route.distance) || route.distance <= 0 || route.distance > 2000000) throw new Error('No valid driving route was returned.');
    if (!Array.isArray(data.waypoints) || data.waypoints.length !== 2 || data.waypoints.some(p => typeof p.distance !== 'number' || !Number.isFinite(p.distance) || p.distance < 0 || p.distance > 250)) throw new Error('Driving route could not snap within 250 m of the stations.');
    return { drivingDistanceKm: route.distance / 1000, snappingMetres: data.waypoints.map(p => p.distance) };
  }
  function createRoadClient({ endpoint = 'https://router.project-osrm.org', fetchImpl = scope.fetch?.bind(scope), timeoutMs = 10000, ttlMs = 86400000, minimumIntervalMs = 1100 } = {}) {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid OSRM endpoint.');
    const cache = new Map(); let tail = Promise.resolve(), lastStarted = 0;
    const abort = () => new DOMException('Request cancelled', 'AbortError');
    function get(from, to, { signal } = {}) {
      const validPoint = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
      if (!validPoint(from) || !validPoint(to)) return Promise.reject(new Error('Invalid station coordinates.'));
      const coordinates = `${from.lon},${from.lat};${to.lon},${to.lat}`;
      const existing = cache.get(coordinates);
      if (signal?.aborted) return Promise.reject(abort());
      if (existing && Date.now() - existing.cachedAt < ttlMs) return Promise.resolve({ ...existing, cached: true });
      const task = tail.catch(() => {}).then(async () => {
        const afterQueue = cache.get(coordinates);
        if (signal?.aborted) throw abort();
        if (afterQueue && Date.now() - afterQueue.cachedAt < ttlMs) return { ...afterQueue, cached: true };
        await new Promise(resolve => setTimeout(resolve, Math.max(0, minimumIntervalMs - (Date.now() - lastStarted))));
        if (signal?.aborted) throw abort();
        lastStarted = Date.now();
        const controller = new AbortController();
        const cancel = () => controller.abort();
        signal?.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(cancel, timeoutMs);
        try {
          const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/route/v1/driving/${coordinates}?overview=false&alternatives=false&steps=false&radiuses=250;250`, { signal: controller.signal });
          if (!response.ok) throw new Error(`Driving service returned HTTP ${response.status}.`);
          const data = await response.json();
          if (signal?.aborted) throw abort();
          const result = { ...parseRoadResponse(data), roadSource: url.origin, roadDataVersion: data.data_version || null, fetchedAt: new Date().toISOString(), cachedAt: Date.now() };
          if (cache.size >= 100) cache.delete(cache.keys().next().value);
          cache.set(coordinates, result);
          return { ...result, cached: false };
        } catch (error) {
          if (signal?.aborted) throw abort();
          if (controller.signal.aborted) throw new Error('Driving service timed out. Please retry.');
          throw error;
        } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
      });
      tail = task; return task;
    }
    return { get, clearCache: () => cache.clear() };
  }
  scope.MetroDistance = { prepare, planRoutes, parseRoadResponse, createRoadClient };
})(globalThis);
