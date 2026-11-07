const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');

const projectDir = path.resolve(__dirname, '..', '..');
const frontendPath = path.join(projectDir, 'Metro Sync_v2.1.1.html');
const html = fs.readFileSync(frontendPath, 'utf8');
const startMarker = '<script type="text/babel">';
const start = html.indexOf(startMarker);
const end = html.indexOf('</script>', start);

if (start < 0 || end < 0) {
  throw new Error('Babel script block was not found in Metro Sync_v2.1.1.html');
}

const source = html.slice(start + startMarker.length, end);
parser.parse(source, {
  sourceType: 'script',
  plugins: ['jsx'],
});

console.log(`Frontend JSX parse: OK (${source.length} characters)`);
