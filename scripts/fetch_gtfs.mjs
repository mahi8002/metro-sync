import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '..');
const dataDir = path.join(projectDir, 'gtfs_supplemented');
const archivePath = path.join(projectDir, 'gtfs_supplemented.zip');
const feedUrl =
  'https://web.mta.info/developers/data/nyct/subway/google_transit.zip';

await mkdir(dataDir, { recursive: true });

console.log(`Downloading ${feedUrl}`);
const response = await fetch(feedUrl);
if (!response.ok) {
  throw new Error(`GTFS download failed with HTTP ${response.status}`);
}
await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));

console.log(`Extracting ${archivePath}`);
if (process.platform === 'win32') {
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${dataDir}' -Force`,
  ]);
} else {
  execFileSync('unzip', ['-o', archivePath, '-d', dataDir]);
}

console.log(`GTFS files are available in ${dataDir}`);
console.log(`Archive kept at ${archivePath}`);

