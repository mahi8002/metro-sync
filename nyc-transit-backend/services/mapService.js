import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import csv from 'csv-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, '..', '..');
const GTFS_DIR = path.join(PROJECT_DIR, 'gtfs_supplemented');

let mapCache = null;
let mapPromise = null;

const readCsv = (filePath, onRow) =>
  new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', onRow)
      .on('end', resolve)
      .on('error', reject);
  });

const buildMapData = async (stationLines) => {
  const routes = new Map();
  const selectedShapes = new Set();
  const shapeCounts = new Map();
  const shapeDirection = new Map();

  await readCsv(path.join(GTFS_DIR, 'routes.txt'), (row) => {
    routes.set(row.route_id, {
      routeId: row.route_id,
      shortName: row.route_short_name,
      longName: row.route_long_name,
      color: row.route_color ? `#${row.route_color}` : null,
    });
  });

  await readCsv(path.join(GTFS_DIR, 'trips.txt'), (row) => {
    if (!row.shape_id) return;
    const key = `${row.route_id}\u0000${row.direction_id}\u0000${row.shape_id}`;
    shapeCounts.set(key, (shapeCounts.get(key) || 0) + 1);
    shapeDirection.set(row.shape_id, {
      routeId: row.route_id,
      directionId: row.direction_id || '0',
    });
  });

  const bestShapeByRouteDirection = new Map();
  for (const [key, count] of shapeCounts) {
    const [routeId, directionId, shapeId] = key.split('\u0000');
    const groupKey = `${routeId}\u0000${directionId}`;
    const current = bestShapeByRouteDirection.get(groupKey);
    if (!current || count > current.count) {
      bestShapeByRouteDirection.set(groupKey, { shapeId, count });
    }
  }
  for (const { shapeId } of bestShapeByRouteDirection.values()) {
    selectedShapes.add(shapeId);
  }

  const shapeCoordinates = new Map();
  await readCsv(path.join(GTFS_DIR, 'shapes.txt'), (row) => {
    if (!selectedShapes.has(row.shape_id)) return;
    if (!shapeCoordinates.has(row.shape_id)) {
      shapeCoordinates.set(row.shape_id, []);
    }
    shapeCoordinates.get(row.shape_id).push({
      sequence: Number(row.shape_pt_sequence),
      coordinates: [Number(row.shape_pt_lon), Number(row.shape_pt_lat)],
    });
  });

  const lineFeatures = [];
  for (const [shapeId, points] of shapeCoordinates) {
    const shapeMeta = shapeDirection.get(shapeId);
    const route = shapeMeta ? routes.get(shapeMeta.routeId) : null;
    lineFeatures.push({
      type: 'Feature',
      properties: {
        shape_id: shapeId,
        route_id: shapeMeta?.routeId || 'UNKNOWN',
        route_short_name: route?.shortName || shapeMeta?.routeId || '?',
        route_long_name: route?.longName || '',
        direction_id: shapeMeta?.directionId || '0',
        route_color: route?.color || null,
      },
      geometry: {
        type: 'LineString',
        coordinates: points
          .sort((a, b) => a.sequence - b.sequence)
          .map((point) => point.coordinates),
      },
    });
  }

  const stationFeatures = [];
  await readCsv(path.join(GTFS_DIR, 'stops.txt'), (row) => {
    if (row.location_type !== '1') return;
    const lines = stationLines.get(row.stop_id) || [];
    stationFeatures.push({
      type: 'Feature',
      properties: {
        stop_id: row.stop_id,
        stop_name: row.stop_name,
        daytime_routes: lines.join(' '),
        lines,
        lat: Number(row.stop_lat),
        lon: Number(row.stop_lon),
      },
      geometry: {
        type: 'Point',
        coordinates: [Number(row.stop_lon), Number(row.stop_lat)],
      },
    });
  });

  return {
    lines: {
      type: 'FeatureCollection',
      features: lineFeatures,
    },
    stations: {
      type: 'FeatureCollection',
      features: stationFeatures,
    },
    generatedAt: new Date().toISOString(),
    source: 'MTA static GTFS: shapes.txt, trips.txt, routes.txt, stops.txt',
    featureCounts: {
      lineShapes: lineFeatures.length,
      stations: stationFeatures.length,
    },
  };
};

export async function getMapData(stationLines) {
  if (mapCache) return mapCache;
  if (mapPromise) return mapPromise;

  mapPromise = buildMapData(stationLines)
    .then((result) => {
      mapCache = result;
      return result;
    })
    .finally(() => {
      mapPromise = null;
    });

  return mapPromise;
}
