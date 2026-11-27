const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_DIR, 'gtfs_supplemented');
const OUTPUT_FILE = path.join(PROJECT_DIR, 'full_graph.json');
let csv;
try {
  csv = require('csv-parser');
} catch (_error) {
  csv = require(
    path.join(PROJECT_DIR, 'nyc-transit-backend', 'node_modules', 'csv-parser')
  );
}
const tripRoutes = new Map();
const graph = new Map();
const edgeTimes = new Map();

const timeToSec = (value) => {
  if (!value) return null;
  const [hours, minutes, seconds] = value.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
};

const addEdge = ({ fromStopId, toStopId, routeId, time }) => {
  if (!fromStopId || !toStopId || !routeId) return;

  const safeTime = time > 0 && time <= 3600 ? time : 120;
  const edgeKey = `${fromStopId}\u0000${toStopId}\u0000${routeId}`;
  const existingTime = edgeTimes.get(edgeKey);

  if (existingTime == null || safeTime < existingTime) {
    edgeTimes.set(edgeKey, safeTime);
  }
};

const readTrips = () =>
  new Promise((resolve, reject) => {
    fs.createReadStream(path.join(DATA_DIR, 'trips.txt'))
      .pipe(csv())
      .on('data', (row) => {
        tripRoutes.set(row.trip_id, {
          routeId: row.route_id,
          directionId: row.direction_id,
        });
      })
      .on('end', resolve)
      .on('error', reject);
  });

const buildEdges = () =>
  new Promise((resolve, reject) => {
    const lastStopByTrip = new Map();

    fs.createReadStream(path.join(DATA_DIR, 'stop_times.txt'))
      .pipe(csv())
      .on('data', (row) => {
        const trip = tripRoutes.get(row.trip_id);
        if (!trip) return;

        const current = {
          stopId: row.stop_id,
          sequence: Number(row.stop_sequence),
          arrivalTime: timeToSec(row.arrival_time),
          departureTime: timeToSec(row.departure_time),
        };
        const previous = lastStopByTrip.get(row.trip_id);

        if (previous && current.sequence > previous.sequence) {
          const departure =
            previous.departureTime ?? previous.arrivalTime;
          const arrival = current.arrivalTime ?? current.departureTime;

          if (departure != null && arrival != null) {
            addEdge({
              fromStopId: previous.stopId,
              toStopId: current.stopId,
              routeId: trip.routeId,
              time: arrival - departure,
            });
          }
        }

        lastStopByTrip.set(row.trip_id, current);
      })
      .on('end', resolve)
      .on('error', reject);
  });

const main = async () => {
  console.log('Reading trips.txt ...');
  await readTrips();

  console.log(`Reading stop_times.txt for ${tripRoutes.size} trips ...`);
  await buildEdges();

  for (const [edgeKey, time] of edgeTimes) {
    const [fromStopId, toStopId, routeId] = edgeKey.split('\u0000');
    if (!graph.has(fromStopId)) graph.set(fromStopId, new Map());
    graph.get(fromStopId).set(`${toStopId}\u0000${routeId}`, {
      to: toStopId,
      time,
      line: routeId,
      routeId,
    });
  }

  // Ensure terminal destinations exist as graph nodes. They intentionally
  // have no outgoing train edge, but the route planner can still arrive there.
  for (const edges of graph.values()) {
    for (const edge of edges.values()) {
      if (!graph.has(edge.to)) graph.set(edge.to, new Map());
    }
  }

  const output = {};
  for (const [fromStopId, edges] of graph) {
    output[fromStopId] = [...edges.values()].sort(
      (a, b) => a.line.localeCompare(b.line) || a.to.localeCompare(b.to)
    );
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output));

  const edgeCount = Object.values(output).reduce(
    (total, edges) => total + edges.length,
    0
  );
  console.log(
    `Wrote ${OUTPUT_FILE}: ${Object.keys(output).length} nodes, ${edgeCount} route-aware edges`
  );
};

main().catch((error) => {
  console.error('Graph generation failed:', error);
  process.exitCode = 1;
});
