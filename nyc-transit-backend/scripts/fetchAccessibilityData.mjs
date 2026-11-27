// Downloads MTA station accessibility (ADA) flags from the public NY open-data
// portal ("MTA Subway Stations", dataset 39hk-dx4f) into data/ada_stations.json.
//   ada: 0 = not accessible, 1 = fully accessible, 2 = partially accessible
//   north/south: whether the northbound / southbound platform is accessible
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const URL = 'https://data.ny.gov/resource/39hk-dx4f.json?$limit=2000';

const res = await axios.get(URL, { timeout: 30000 });
if (!Array.isArray(res.data) || res.data.length === 0) {
  throw new Error('Unexpected response from data.ny.gov');
}

const stations = {};
for (const row of res.data) {
  if (!row.gtfs_stop_id) continue;
  stations[row.gtfs_stop_id] = {
    name: row.stop_name,
    ada: Number(row.ada) || 0,
    north: Number(row.ada_northbound) === 1,
    south: Number(row.ada_southbound) === 1,
    notes: row.ada_notes && row.ada_notes !== 'NaN' ? row.ada_notes : null,
  };
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(
  path.join(DATA_DIR, 'ada_stations.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), source: URL, stations })
);
const counts = [0, 1, 2].map((v) => Object.values(stations).filter((s) => s.ada === v).length);
console.log(`Wrote data/ada_stations.json: ${Object.keys(stations).length} stations (ada 0/1/2 = ${counts.join('/')})`);
