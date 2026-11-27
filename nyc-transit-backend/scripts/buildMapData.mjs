// Pre-generates data/map.json (subway line + station GeoJSON) so the server does
// not have to stream trips.txt/shapes.txt on first request.
// Re-run after changing gtfs_supplemented/ or full_graph.json.
import fs from 'node:fs';
import path from 'node:path';
import { buildMapData, MAP_DATA_FILE } from '../services/mapService.js';
import { getStationRouteLines, initRoutePlanner } from '../services/routePlanningService.js';

await initRoutePlanner();
const data = await buildMapData(await getStationRouteLines());

// Ordered stations per line (from scripts/buildTransitData.mjs), if available.
const lineStopsFile = path.join(path.dirname(MAP_DATA_FILE), 'line_stops.json');
if (fs.existsSync(lineStopsFile)) {
  data.lineStops = JSON.parse(fs.readFileSync(lineStopsFile, 'utf8')).lines;
} else {
  console.warn('data/line_stops.json not found: the line panel will fall back to a geometric order.');
}
fs.writeFileSync(MAP_DATA_FILE, JSON.stringify(data));

const kb = Math.round(fs.statSync(MAP_DATA_FILE).size / 1024);
console.log(
  `Wrote ${MAP_DATA_FILE} (${kb} KB): ${data.featureCounts.lineShapes} line shapes, ${data.featureCounts.stations} stations`
);
