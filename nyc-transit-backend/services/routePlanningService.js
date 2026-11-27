import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import csv from 'csv-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '..');
const PROJECT_DIR = path.resolve(BACKEND_DIR, '..');
const GTFS_DIR = path.join(PROJECT_DIR, 'gtfs_supplemented');
const GRAPH_FILE = path.join(PROJECT_DIR, 'full_graph.json');
const STOPS_FILE = path.join(GTFS_DIR, 'stops.txt');
const TRANSFERS_FILE = path.join(GTFS_DIR, 'transfers.txt');
const ADA_FILE = path.join(BACKEND_DIR, 'data', 'ada_stations.json');

// One graph per service day (built by scripts/buildTransitData.mjs). Falls back
// to the merged graph when a day-specific file is missing.
const GRAPH_FILES = {
  all: 'full_graph.json',
  weekday: 'full_graph_weekday.json',
  saturday: 'full_graph_saturday.json',
  sunday: 'full_graph_sunday.json',
};
const DELAY_PENALTY_SECONDS = 240;

const BOARDING_TIME_SECONDS = 45;
const DEFAULT_TRANSFER_TIME_SECONDS = 180;
const LINE_CHANGE_PENALTY_SECONDS = 180;
const EXPRESS_ROUTES = new Set([
  '2',
  '3',
  '4',
  '5',
  '6X',
  '7X',
  'A',
  'D',
  'E',
  'F',
  'FX',
  'Q',
  'Z',
]);

const statePromises = new Map();
let adaPromise = null;

const stationNode = (stationId) => `station:${stationId}`;
const displayRouteId = (routeId) => {
  if (['FS', 'GS', 'H'].includes(routeId)) return 'S';
  if (routeId === 'SI') return 'SIR';
  return String(routeId || 'UNKNOWN').replace(/X$/, '');
};

const readCsv = (filePath, onRow) =>
  new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', onRow)
      .on('end', resolve)
      .on('error', reject);
  });

const addAdjacency = (adjacency, from, edge) => {
  if (!adjacency.has(from)) adjacency.set(from, []);
  adjacency.get(from).push(edge);
};

class MinHeap {
  constructor() {
    this.values = [];
  }

  enqueue(value, priority) {
    this.values.push({ value, priority });
    let index = this.values.length - 1;

    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent].priority <= this.values[index].priority) break;
      [this.values[parent], this.values[index]] = [
        this.values[index],
        this.values[parent],
      ];
      index = parent;
    }
  }

  dequeue() {
    if (this.values.length === 0) return null;
    const result = this.values[0];
    const tail = this.values.pop();

    if (this.values.length > 0) {
      this.values[0] = tail;
      let index = 0;

      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;

        if (
          left < this.values.length &&
          this.values[left].priority < this.values[smallest].priority
        ) {
          smallest = left;
        }
        if (
          right < this.values.length &&
          this.values[right].priority < this.values[smallest].priority
        ) {
          smallest = right;
        }
        if (smallest === index) break;

        [this.values[index], this.values[smallest]] = [
          this.values[smallest],
          this.values[index],
        ];
        index = smallest;
      }
    }

    return result;
  }

  get isEmpty() {
    return this.values.length === 0;
  }
}

const buildExpandedGraph = async (rawGraph) => {
  const stationByStopId = new Map();
  const platformParent = new Map();
  const stations = new Map();

  await readCsv(STOPS_FILE, (row) => {
    const stop = {
      id: row.stop_id,
      name: row.stop_name,
      lat: Number(row.stop_lat),
      lon: Number(row.stop_lon),
      locationType: row.location_type || '',
      parentId: row.parent_station || null,
    };
    stationByStopId.set(stop.id, stop);

    if (stop.locationType === '1') {
      stations.set(stop.id, {
        id: stop.id,
        name: stop.name,
        lat: stop.lat,
        lon: stop.lon,
        // The MTA stops.txt feed does not include borough names. Do not infer
        // them from coordinates because station complexes often sit near
        // borough boundaries and the result would be misleading.
        borough: null,
        lines: new Set(),
      });
    } else if (stop.parentId) {
      platformParent.set(stop.id, stop.parentId);
    }
  });

  const adjacency = new Map();
  const trainNodes = new Set(Object.keys(rawGraph));

  for (const edges of Object.values(rawGraph)) {
    for (const edge of edges) trainNodes.add(edge.to);
  }

  // Platform-to-platform GTFS trip edges retain their route metadata.
  for (const [fromStopId, edges] of Object.entries(rawGraph)) {
    for (const edge of edges) {
      const routeId = edge.routeId || edge.line || 'UNKNOWN';
      const line = displayRouteId(routeId);
      addAdjacency(adjacency, fromStopId, {
        from: fromStopId,
        to: edge.to,
        time: Number(edge.time) || 120,
        cost: Number(edge.time) || 120,
        line,
        routeId,
        kind: 'train',
      });

      const fromParent = platformParent.get(fromStopId);
      const toParent = platformParent.get(edge.to);
      if (fromParent && stations.has(fromParent)) {
        stations.get(fromParent).lines.add(line);
      }
      if (toParent && stations.has(toParent)) {
        stations.get(toParent).lines.add(line);
      }
    }
  }

  // Parent-station hubs make a parent station selectable independently of
  // direction-specific platform IDs such as 127N and 127S.
  for (const [platformId, parentId] of platformParent) {
    if (!stations.has(parentId) || !trainNodes.has(platformId)) continue;

    addAdjacency(adjacency, stationNode(parentId), {
      from: stationNode(parentId),
      to: platformId,
      time: BOARDING_TIME_SECONDS,
      cost: BOARDING_TIME_SECONDS + 120,
      line: 'WALK',
      routeId: 'STATION',
      kind: 'walk',
    });
    addAdjacency(adjacency, platformId, {
      from: platformId,
      to: stationNode(parentId),
      time: BOARDING_TIME_SECONDS,
      cost: BOARDING_TIME_SECONDS + 120,
      line: 'WALK',
      routeId: 'STATION',
      kind: 'walk',
    });
  }

  let transferEdgeCount = 0;
  await readCsv(TRANSFERS_FILE, (row) => {
    const from = row.from_stop_id;
    const to = row.to_stop_id;
    if (!stations.has(from) || !stations.has(to) || from === to) return;

    const time = Math.max(
      60,
      Number(row.min_transfer_time) || DEFAULT_TRANSFER_TIME_SECONDS
    );
    addAdjacency(adjacency, stationNode(from), {
      from: stationNode(from),
      to: stationNode(to),
      time,
      cost: time + 240,
      line: 'WALK',
      routeId: 'TRANSFER',
      kind: 'transfer',
    });
    addAdjacency(adjacency, stationNode(to), {
      from: stationNode(to),
      to: stationNode(from),
      time,
      cost: time + 240,
      line: 'WALK',
      routeId: 'TRANSFER',
      kind: 'transfer',
    });
    transferEdgeCount += 2;
  });

  const stationDirectory = [...stations.values()]
    .map((station) => ({
      ...station,
      lines: [...station.lines].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const stationLines = new Map(
    stationDirectory.map((station) => [station.id, station.lines])
  );

  return {
    adjacency,
    stationByStopId,
    platformParent,
    stations,
    stationDirectory,
    stationLines,
    stats: {
      rawNodes: Object.keys(rawGraph).length,
      platformNodes: trainNodes.size,
      routeAwareEdges: Object.values(rawGraph).reduce(
        (sum, edges) => sum + edges.length,
        0
      ),
      stationNodes: stations.size,
      transferEdges: transferEdgeCount,
    },
  };
};

const loadState = (dayType) => {
  if (!statePromises.has(dayType)) {
    const promise = (async () => {
      let file = path.join(PROJECT_DIR, GRAPH_FILES[dayType] || GRAPH_FILES.all);
      if (!fs.existsSync(file)) file = GRAPH_FILE;
      const rawGraph = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      return buildExpandedGraph(rawGraph);
    })();
    promise.catch(() => statePromises.delete(dayType));
    statePromises.set(dayType, promise);
  }
  return statePromises.get(dayType);
};

export async function initRoutePlanner() {
  return loadState('all');
}

const getState = (dayType = 'all') => loadState(dayType);

// Static ADA flags per station (data/ada_stations.json); null if not available.
const loadAdaData = () => {
  adaPromise ??= fs.promises
    .readFile(ADA_FILE, 'utf8')
    .then((text) => JSON.parse(text).stations)
    .catch(() => null);
  return adaPromise;
};

// Day type (weekday / saturday / sunday) in New York for a given instant.
export const serviceDayFor = (date = new Date()) => {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
  }).format(date);
  if (weekday === 'Saturday') return 'saturday';
  if (weekday === 'Sunday') return 'sunday';
  return 'weekday';
};

const getNodeLabel = (state, node) => {
  if (node.startsWith('station:')) {
    const station = state.stations.get(node.slice('station:'.length));
    return station?.name || node;
  }

  const stop = state.stationByStopId.get(node);
  if (!stop) return node;
  const parent = stop.parentId ? state.stations.get(stop.parentId) : null;
  return parent?.name || stop.name;
};

const getNodeCoordinates = (state, node) => {
  if (node.startsWith('station:')) {
    const station = state.stations.get(node.slice('station:'.length));
    return station ? [station.lon, station.lat] : null;
  }

  const stop = state.stationByStopId.get(node);
  return stop && Number.isFinite(stop.lon) && Number.isFinite(stop.lat)
    ? [stop.lon, stop.lat]
    : null;
};

const shortestPath = (state, source, destination, blockedLines = new Set(), constraints = null) => {
  const sourceState = `${source}\u0000`;
  const distances = new Map([[sourceState, 0]]);
  const actualTimes = new Map([[sourceState, 0]]);
  const previous = new Map();
  const queue = new MinHeap();
  let destinationState = null;
  queue.enqueue(sourceState, 0);

  while (!queue.isEmpty) {
    const current = queue.dequeue();
    if (!current) break;
    if (current.priority !== distances.get(current.value)) continue;
    const [currentNode, currentLine] = current.value.split('\u0000');
    if (currentNode === destination) {
      destinationState = current.value;
      break;
    }

    for (const edge of state.adjacency.get(currentNode) || []) {
      if (edge.kind === 'train' && blockedLines.has(edge.line)) continue;
      if (constraints?.isPlatformOk && edge.kind === 'walk') {
        // Boarding / leaving a platform needs step-free access there.
        const platform = edge.from.startsWith('station:') ? edge.to : edge.from;
        if (!constraints.isPlatformOk(platform)) continue;
      }
      if (constraints?.isStationOk && edge.kind === 'transfer') {
        if (
          !constraints.isStationOk(edge.from.slice('station:'.length)) ||
          !constraints.isStationOk(edge.to.slice('station:'.length))
        ) {
          continue;
        }
      }

      const changesLine =
        edge.kind === 'train' &&
        currentLine &&
        currentLine !== edge.line;
      const nextLine = edge.kind === 'train' ? edge.line : '';
      const nextState = `${edge.to}\u0000${nextLine}`;
      const boardsTrain = edge.kind === 'train' && (!currentLine || changesLine);
      const nextDistance =
        current.priority +
        (edge.cost ?? edge.time) +
        (changesLine ? LINE_CHANGE_PENALTY_SECONDS + 240 : 0) +
        (boardsTrain ? constraints?.linePenalties?.get(edge.line) || 0 : 0);
      const nextActualTime =
        (actualTimes.get(current.value) ?? 0) +
        edge.time +
        (changesLine ? LINE_CHANGE_PENALTY_SECONDS : 0);

      if (nextDistance < (distances.get(nextState) ?? Infinity)) {
        distances.set(nextState, nextDistance);
        actualTimes.set(nextState, nextActualTime);
        previous.set(nextState, {
          previousState: current.value,
          node: currentNode,
          edge,
        });
        queue.enqueue(nextState, nextDistance);
      }
    }
  }

  if (!destinationState || !distances.has(destinationState)) return null;

  const nodes = [];
  const edges = [];
  let cursorState = destinationState;
  while (cursorState !== sourceState) {
    const step = previous.get(cursorState);
    if (!step) return null;
    edges.unshift(step.edge);
    nodes.unshift(step.node);
    cursorState = step.previousState;
  }
  nodes.push(destination);

  return {
    totalTime: actualTimes.get(destinationState),
    searchCost: distances.get(destinationState),
    nodes,
    edges,
  };
};

const haversineMeters = (a, b) => {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
};

const buildSegments = (state, path) => {
  const segments = [];

  for (const edge of path.edges) {
    const fromName = getNodeLabel(state, edge.from);
    const toName = getNodeLabel(state, edge.to);
    const kind =
      edge.kind === 'train' ? 'subway' : edge.kind === 'transfer' ? 'transfer' : 'walk';
    const last = segments[segments.length - 1];

    if (
      kind === 'subway' &&
      last?.kind === 'subway' &&
      last.line === edge.line
    ) {
      last.to = edge.to;
      last.toName = toName;
      last.durationSeconds += edge.time;
      last.stopIds.push(edge.to);
      continue;
    }

    if (
      kind !== 'subway' &&
      last?.kind !== 'subway' &&
      last?.from === edge.from
    ) {
      last.to = edge.to;
      last.toName = toName;
      last.durationSeconds += edge.time;
      last.kind = kind === 'transfer' || last.kind === 'transfer' ? 'transfer' : 'walk';
      continue;
    }

    segments.push({
      kind,
      line: edge.line,
      routeId: edge.routeId,
      from: edge.from,
      fromName,
      to: edge.to,
      toName,
      durationSeconds: edge.time,
      stopIds: kind === 'subway' ? [edge.from, edge.to] : [],
    });
  }

  // Attach map geometry: every stop passed on a subway segment, and the
  // endpoints of walk/transfer segments.
  const toPoint = (node) => {
    const coordinates = getNodeCoordinates(state, node);
    if (!coordinates) return null;
    const stop = state.stationByStopId.get(node);
    return {
      id: stop?.parentId || node.replace(/^station:/, ''),
      name: getNodeLabel(state, node),
      lat: coordinates[1],
      lon: coordinates[0],
    };
  };
  for (const segment of segments) {
    if (segment.kind === 'subway') {
      segment.stops = segment.stopIds.map(toPoint).filter(Boolean);
    } else {
      segment.path = [segment.from, segment.to].map(toPoint).filter(Boolean);
      // Straight-line walking distance between the two stations (metres).
      segment.distanceMeters =
        segment.path.length === 2 ? haversineMeters(segment.path[0], segment.path[1]) : 0;
    }
  }

  return segments;
};

const buildRouteOption = (state, path, index, origin, destination) => {
  const segments = buildSegments(state, path);
  const transitSegments = segments.filter((segment) => segment.kind === 'subway');
  const lines = transitSegments.map((segment) => segment.line);
  const transitSeconds = transitSegments.reduce(
    (sum, segment) => sum + segment.durationSeconds,
    0
  );
  const walkingSeconds = Math.max(0, path.totalTime - transitSeconds);
  const steps = [];

  for (const segment of segments) {
    const minutes = Math.max(1, Math.round(segment.durationSeconds / 60));
    if (segment.kind === 'subway') {
      const stopCount = Math.max(1, segment.stopIds.length - 1);
      steps.push(
        `Ride ${segment.line} from ${segment.fromName} to ${segment.toName} (${minutes} min, ${stopCount} stops)`
      );
    } else if (segment.fromName !== segment.toName) {
      steps.push(
        `Transfer from ${segment.fromName} to ${segment.toName} (${minutes} min walk)`
      );
    }
  }

  steps.push(`Arrive at ${destination.name}`);

  const polyline = [];
  const seenCoordinates = new Set();
  for (const node of path.nodes) {
    const coordinates = getNodeCoordinates(state, node);
    if (!coordinates) continue;
    const key = coordinates.join(',');
    if (seenCoordinates.has(key)) continue;
    seenCoordinates.add(key);
    polyline.push([coordinates[1], coordinates[0]]);
  }

  return {
    id: index,
    title: index === 0 ? 'Fastest Route' : `Alternative Route ${index}`,
    duration: Math.max(1, Math.round(path.totalTime / 60)),
    durationSeconds: path.totalTime,
    transitMinutes: Math.round(transitSeconds / 60),
    walkingMinutes: Math.round(walkingSeconds / 60),
    transfers: Math.max(0, transitSegments.length - 1),
    isAda: null,
    lines,
    isExpress: transitSegments.map((segment) =>
      EXPRESS_ROUTES.has(segment.routeId)
    ),
    steps,
    segments,
    polyline,
    originId: origin.id,
    destinationId: destination.id,
  };
};

export async function getStations() {
  const state = await getState();
  return state.stationDirectory;
}

export async function getRoutePlannerStats() {
  const state = await getState();
  return state.stats;
}

export async function getStationRouteLines() {
  const state = await getState();
  return state.stationLines;
}

export async function planRoutes(originQuery, destinationQuery, maxOptions = 3, options = {}) {
  const {
    accessible = false,
    dayType = 'all',
    blockedStationIds = new Set(),
    alertsByLine = null,
  } = options;
  const state = await getState(dayType);
  const adaStations = await loadAdaData();

  const findStation = (value) => {
    if (!value) return null;
    const normalized = decodeURIComponent(String(value)).trim();
    if (state.stations.has(normalized)) return state.stations.get(normalized);
    const lowered = normalized.toLowerCase();
    return (
      state.stationDirectory.find(
        (station) => station.name.toLowerCase() === lowered
      ) || null
    );
  };

  const origin = findStation(originQuery);
  const destination = findStation(destinationQuery);
  if (!origin || !destination) {
    return {
      error: 'unknown_station',
      message: `Unknown station: ${!origin ? originQuery : destinationQuery}`,
    };
  }
  if (origin.id === destination.id) return { origin, destination, routes: [] };

  const summary = (station) => ({ id: station.id, name: station.name });
  const meta = {
    origin: summary(origin),
    destination: summary(destination),
    serviceDay: dayType,
    accessibleOnly: accessible,
    accessibilityDataAvailable: Boolean(adaStations),
    alertsAvailable: Boolean(alertsByLine),
  };

  // Step-free access rules from the ADA data and current elevator outages.
  const isStationOk = (id) => {
    const record = adaStations?.[id];
    return Boolean(record && record.ada >= 1 && !blockedStationIds.has(id));
  };
  const isPlatformOk = (platformId) => {
    const stationId = state.platformParent.get(platformId);
    const record = adaStations?.[stationId];
    if (!record || blockedStationIds.has(stationId)) return false;
    if (record.ada === 1) return true;
    if (record.ada !== 2) return false;
    const side = platformId.slice(-1);
    return side === 'N' ? record.north : side === 'S' ? record.south : false;
  };

  if (accessible && !adaStations) {
    return { ...meta, routes: [], reason: 'accessibility_data_unavailable' };
  }
  if (accessible) {
    if (!isStationOk(origin.id)) return { ...meta, routes: [], reason: 'origin_not_accessible' };
    if (!isStationOk(destination.id)) return { ...meta, routes: [], reason: 'destination_not_accessible' };
  }

  const linePenalties = new Map();
  for (const [line, alerts] of Object.entries(alertsByLine || {})) {
    if (alerts.some((alert) => alert.kind === 'delay')) linePenalties.set(line, DELAY_PENALTY_SECONDS);
  }
  const constraints = {
    linePenalties,
    ...(accessible ? { isPlatformOk, isStationOk } : {}),
  };

  const source = stationNode(origin.id);
  const target = stationNode(destination.id);
  const fastest = shortestPath(state, source, target, new Set(), constraints);
  if (!fastest) {
    return {
      ...meta,
      routes: [],
      reason: accessible ? 'no_accessible_route' : 'no_route',
      message: 'No connected subway route was found between these stations.',
    };
  }

  const candidates = [fastest];
  const fastestOption = buildRouteOption(state, fastest, 0, origin, destination);
  const signatures = new Set([fastestOption.lines.join('>')]);

  for (const line of new Set(fastestOption.lines)) {
    if (candidates.length >= Math.max(1, maxOptions)) break;
    const alternative = shortestPath(state, source, target, new Set([line]), constraints);
    if (!alternative) continue;

    const signaturePath = buildRouteOption(
      state,
      alternative,
      0,
      origin,
      destination
    );
    const signature = signaturePath.lines.join('>');
    if (signatures.has(signature)) continue;

    signatures.add(signature);
    candidates.push(alternative);
  }

  // A route is step-free when every boarding and alighting platform is.
  const isRouteAccessible = (route) =>
    route.segments
      .filter((segment) => segment.kind === 'subway' && segment.stopIds.length > 1)
      .every(
        (segment) =>
          isPlatformOk(segment.stopIds[0]) &&
          isPlatformOk(segment.stopIds[segment.stopIds.length - 1])
      );

  const routes = candidates
    .map((candidate, index) =>
      buildRouteOption(state, candidate, index, origin, destination)
    )
    .sort(
      (a, b) =>
        a.durationSeconds - b.durationSeconds ||
        a.transfers - b.transfers ||
        a.lines.length - b.lines.length
    )
    .map((route, index) => ({
      ...route,
      id: index,
      title: index === 0 ? 'Fastest Route' : `Alternative Route ${index}`,
      isAda: adaStations ? isRouteAccessible(route) : null,
      alerts: alertsByLine
        ? [...new Set(route.lines)]
            .filter((line) => alertsByLine[line]?.length)
            .map((line) => ({ line, items: alertsByLine[line].slice(0, 3) }))
        : [],
    }));

  return {
    ...meta,
    generatedAt: new Date().toISOString(),
    routes,
  };
}
