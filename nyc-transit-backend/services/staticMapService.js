import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In-memory lookup table: { "N09S": { stopId, stopName, lat, lon, parentStation } }
const stopsMap = new Map();

export function initStaticStops() {
  return new Promise((resolve, reject) => {
    const filePath = path.resolve(__dirname, '../data/stops.txt');

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // MTA stop_ids look like 'N09S' (Southbound), 'N09N' (Northbound), or 'N09' (Parent Station)
        stopsMap.set(row.stop_id, {
          stopId: row.stop_id,
          stopName: row.stop_name,
          lat: parseFloat(row.stop_lat),
          lon: parseFloat(row.stop_lon),
          parentStation: row.parent_station || null,
        });
      })
      .on('end', () => {
        console.log(
          `[Static Mapping] Successfully loaded ${stopsMap.size} stops into memory.`
        );
        resolve();
      })
      .on('error', (err) => reject(err));
  });
}

export function getStopDetails(stopId) {
  if (stopsMap.has(stopId)) {
    return stopsMap.get(stopId);
  }

  // Fallback strategy for unmapped platform codes (e.g. R60N -> R60)
  const baseStationId = stopId ? stopId.slice(0, -1) : null;
  if (baseStationId && stopsMap.has(baseStationId)) {
    const parent = stopsMap.get(baseStationId);
    return {
      ...parent,
      stopId,
      stopName: `${parent.stopName} (${
        stopId.endsWith('N') ? 'Northbound' : 'Southbound'
      })`,
    };
  }

  // Final default fallback if stop is missing from GTFS Static
  return {
    stopId,
    stopName: `Station (${stopId || 'Unknown'})`,
    lat: null,
    lon: null,
  };
}
