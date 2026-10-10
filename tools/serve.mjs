// Minimale statische server voor lokaal testen: node tools/serve.mjs [poort]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = normalize(path === '/' ? '/index.html' : path).replace(/^[/\\]+/, '');
  if (rel.startsWith('..') || rel.startsWith('node_modules')) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(join(root, rel));
    res.writeHead(200, { 'Content-Type': types[extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Niet gevonden');
  }
}).listen(port, () => console.log(`OCHE draait op http://localhost:${port}`));
