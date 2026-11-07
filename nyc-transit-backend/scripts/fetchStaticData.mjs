import axios from 'axios';
import AdmZip from 'adm-zip';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const ZIP_URL =
  'https://web.mta.info/developers/data/nyct/subway/google_transit.zip';

async function main() {
  console.log(`Downloading static GTFS from ${ZIP_URL} ...`);
  const res = await axios.get(ZIP_URL, { responseType: 'arraybuffer' });
  const zip = new AdmZip(Buffer.from(res.data));
  const entry = zip.getEntry('stops.txt');
  if (!entry) throw new Error('stops.txt not found in archive');
  mkdirSync(DATA_DIR, { recursive: true });
  const buf = entry.getData();
  writeFileSync(path.join(DATA_DIR, 'stops.txt'), buf);
  console.log(`Wrote data/stops.txt (${buf.length} bytes)`);
}

main().catch((err) => {
  console.error('Failed to fetch static data:', err.message);
  process.exit(1);
});
