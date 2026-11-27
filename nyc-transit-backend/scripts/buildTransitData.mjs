// Builds the route graphs and the per-line station order from a full static GTFS
// folder (needs trips.txt + stop_times.txt, ~140 MB, which are not shipped in
// the runtime package).
//
//   node scripts/buildTransitData.mjs [path-to-full-gtfs-folder]
//
// Default folder: ../../gtfs_supplemented (next to the runtime package).
//
// Outputs (runtime package root / data):
//   full_graph.json            all service days merged (as before)
//   full_graph_weekday.json    weekday trips only
//   full_graph_saturday.json   Saturday trips only
//   full_graph_sunday.json     Sunday trips only
//   data/line_stops.json       ordered stations per line, with branches
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import csv from 'csv-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, '..', '..');
const GTFS_DIR = path.resolve(process.argv[2] || path.join(PROJECT_DIR, '..', 'gtfs_supplemented'));
const DATA_DIR = path.resolve(__dirname, '..', 'data');

for (const file of ['trips.txt', 'stop_times.txt', 'stops.txt']) {
  if (!fs.existsSync(path.join(GTFS_DIR, file))) {
    console.error(`Missing ${file} in ${GTFS_DIR}. Pass the full GTFS folder as the first argument.`);
    process.exit(1);
  }
}

const DAY_TYPES = ['all', 'weekday', 'saturday', 'sunday'];

const displayRouteId = (routeId) => {
  if (['FS', 'GS', 'H'].includes(routeId)) return 'S';
  if (routeId === 'SI') return 'SIR';
  return String(routeId || 'UNKNOWN').replace(/X$/, '');
};

const dayTypeOf = (tripId, serviceId) => {
  const text = `${serviceId} ${tripId}`;
  if (/sunday/i.test(text)) return 'sunday';
  if (/saturday/i.test(text)) return 'saturday';
  if (/weekday/i.test(text)) return 'weekday';
  return null;
};

const timeToSec = (value) => {
  if (!value) return null;
  const [h, m, sec] = value.split(':').map(Number);
  return h * 3600 + m * 60 + sec;
};

const readCsv = (file, onRow) =>
  new Promise((resolve, reject) => {
    fs.createReadStream(path.join(GTFS_DIR, file))
      .pipe(csv())
      .on('data', onRow)
      .on('end', resolve)
      .on('error', reject);
  });

const parentOf = new Map();
await readCsv('stops.txt', (row) => {
  if (row.parent_station) parentOf.set(row.stop_id, row.parent_station);
});

const trips = new Map();
await readCsv('trips.txt', (row) => {
  trips.set(row.trip_id, {
    routeId: row.route_id,
    direction: row.direction_id,
    dayType: dayTypeOf(row.trip_id, row.service_id),
  });
});
console.log(`trips.txt: ${trips.size} trips`);

const edgeTimes = Object.fromEntries(DAY_TYPES.map((day) => [day, new Map()]));
const lastStopByTrip = new Map();
const sequences = new Map();

const addEdge = (dayType, fromStopId, toStopId, routeId, time) => {
  const safeTime = time > 0 && time <= 3600 ? time : 120;
  const key = `${fromStopId}\u0000${toStopId}\u0000${routeId}`;
  const times = edgeTimes[dayType];
  const existing = times.get(key);
  if (existing == null || safeTime < existing) times.set(key, safeTime);
};

await readCsv('stop_times.txt', (row) => {
  const trip = trips.get(row.trip_id);
  if (!trip) return;

  const current = {
    stopId: row.stop_id,
    sequence: Number(row.stop_sequence),
    arrival: timeToSec(row.arrival_time),
    departure: timeToSec(row.departure_time),
  };
  const previous = lastStopByTrip.get(row.trip_id);
  if (previous && current.sequence > previous.sequence) {
    const departure = previous.departure ?? previous.arrival;
    const arrival = current.arrival ?? current.departure;
    if (departure != null && arrival != null) {
      const time = arrival - departure;
      addEdge('all', previous.stopId, current.stopId, trip.routeId, time);
      if (trip.dayType) addEdge(trip.dayType, previous.stopId, current.stopId, trip.routeId, time);
    }
  }
  lastStopByTrip.set(row.trip_id, current);

  const station = parentOf.get(row.stop_id) || row.stop_id;
  if (!sequences.has(row.trip_id)) sequences.set(row.trip_id, []);
  const list = sequences.get(row.trip_id);
  if (list[list.length - 1] !== station) list.push(station);
});
console.log(`stop_times.txt: read ${sequences.size} trips`);

// ---- route graphs ----------------------------------------------------------
const writeGraph = (dayType, file) => {
  const graph = new Map();
  for (const [key, time] of edgeTimes[dayType]) {
    const [from, to, routeId] = key.split('\u0000');
    if (!graph.has(from)) graph.set(from, new Map());
    graph.get(from).set(`${to}\u0000${routeId}`, { to, time, line: routeId, routeId });
  }
  for (const edges of [...graph.values()]) {
    for (const edge of edges.values()) if (!graph.has(edge.to)) graph.set(edge.to, new Map());
  }
  const output = {};
  for (const [from, edges] of graph) {
    output[from] = [...edges.values()].sort(
      (a, b) => a.line.localeCompare(b.line) || a.to.localeCompare(b.to)
    );
  }
  const target = path.join(PROJECT_DIR, file);
  fs.writeFileSync(target, JSON.stringify(output));
  const edgeCount = Object.values(output).reduce((sum, edges) => sum + edges.length, 0);
  console.log(`Wrote ${file}: ${Object.keys(output).length} nodes, ${edgeCount} edges`);
};
writeGraph('all', 'full_graph.json');
writeGraph('weekday', 'full_graph_weekday.json');
writeGraph('saturday', 'full_graph_saturday.json');
writeGraph('sunday', 'full_graph_sunday.json');

// ---- station order per line --------------------------------------------------
// Every trip gives an ordered list of stations. Per line (all directions,
// oriented the same way) pick the fullest common pattern as the main trunk and
// list the stations of other patterns that are not on it as branches.
const patternsByLine = new Map();
for (const [tripId, stations] of sequences) {
  const trip = trips.get(tripId);
  if (!trip || stations.length < 2) continue;
  const line = displayRouteId(trip.routeId);
  const oriented = trip.direction === '1' ? [...stations].reverse() : stations;
  const key = oriented.join(',');
  if (!patternsByLine.has(line)) patternsByLine.set(line, new Map());
  const patterns = patternsByLine.get(line);
  const entry = patterns.get(key);
  if (entry) entry.count += 1;
  else patterns.set(key, { stations: oriented, count: 1 });
}

const lines = {};
for (const [line, patterns] of patternsByLine) {
  const all = [...patterns.values()];
  const maxCount = Math.max(...all.map((pattern) => pattern.count));
  const significant = all.filter((pattern) => pattern.count >= maxCount * 0.05);
  const main = significant.reduce((best, pattern) =>
    pattern.stations.length > best.stations.length ||
    (pattern.stations.length === best.stations.length && pattern.count > best.count)
      ? pattern
      : best
  );
  const mainSet = new Set(main.stations);

  const branches = new Map();
  for (const pattern of all) {
    if (pattern.count < maxCount * 0.03) continue;
    let run = [];
    let from = null;
    let previous = null;
    const flush = (next) => {
      if (run.length) {
        const key = `${from}|${next}|${run.join(',')}`;
        const known = branches.get(key);
        if (!known || pattern.count > known.count) {
          branches.set(key, { from, to: next, stations: run, count: pattern.count });
        }
      }
      run = [];
    };
    for (const station of pattern.stations) {
      if (mainSet.has(station)) {
        flush(station);
        previous = station;
        continue;
      }
      if (run.length === 0) from = previous;
      run.push(station);
    }
    flush(null);
  }

  // Drop branches whose stations are all covered by a longer branch.
  const kept = [];
  for (const branch of [...branches.values()].sort((a, b) => b.stations.length - a.stations.length)) {
    const covered = kept.some((other) => branch.stations.every((station) => other.stations.includes(station)));
    if (!covered) kept.push(branch);
  }

  lines[line] = {
    main: main.stations,
    branches: kept.map(({ from, to, stations }) => ({ from, to, stations })),
  };
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(DATA_DIR, 'line_stops.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), lines })
);
console.log(
  `Wrote data/line_stops.json: ${Object.keys(lines).length} lines, ` +
    Object.entries(lines).map(([id, l]) => `${id}:${l.main.length}+${l.branches.length}b`).join(' ')
);
