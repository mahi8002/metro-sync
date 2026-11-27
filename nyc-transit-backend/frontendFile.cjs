// Locates the frontend page so a version bump never needs a code change.
// Order: FRONTEND_FILE env var, then index.html, then the highest
// "Metro Sync_vX.Y.Z.html" in the project folder.
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_DIR = path.resolve(__dirname, '..');
const VERSIONED = /^Metro Sync_v(\d+(?:\.\d+)*)\.html$/i;

const versionParts = (name) => name.match(VERSIONED)[1].split('.').map(Number);

const compareVersions = (a, b) => {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff;
  }
  return 0;
};

function findFrontendFile(dir = PROJECT_DIR) {
  if (process.env.FRONTEND_FILE) return path.resolve(dir, process.env.FRONTEND_FILE);

  const index = path.join(dir, 'index.html');
  if (fs.existsSync(index)) return index;

  const versions = fs.readdirSync(dir).filter((name) => VERSIONED.test(name));
  if (versions.length === 0) {
    throw new Error(`No index.html or "Metro Sync_v*.html" found in ${dir}`);
  }
  return path.join(dir, versions.sort(compareVersions).at(-1));
}

module.exports = { findFrontendFile, PROJECT_DIR };
