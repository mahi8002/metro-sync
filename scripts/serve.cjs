// Dependency-free local server; binds to this computer only. Never serves .git/.env.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 5500);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
  if (pathname === '/') pathname = '/Metro Sync_v2.1.1.html';
  const target = path.resolve(root, '.' + pathname);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || relative.split(/[\\/]/).some(part => part.startsWith('.')) || !types[path.extname(target)] || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); return res.end(); }
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)], 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}).listen(port, '127.0.0.1', () => console.log(`Metro Sync: http://127.0.0.1:${port}`));
