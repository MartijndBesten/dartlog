// Afgeschermde testomgeving voor Mijn vrienden: de echte Worker-code op een tijdelijke SQLite-database in het geheugen.
// Alleen localhost, alleen fictieve gegevens; bij stoppen is alles weg. Gebruik: node tools/dev-api.mjs [poort]
// Raakt geen Cloudflare-account, geen productie- of stagingdatabase.
import { createServer } from 'node:http';
import worker from '../cloud/src/worker.js';
import { createD1 } from '../cloud/tests/d1-shim.js';

const port = Number(process.argv[2] || 8799);
// Eén eenmalige oprichterscode per test en per toestel (de echte server staat ook meerdere codes toe).
export const TEST_FOUNDER_CODES = ['iphone', 'android', 'desktop'].flatMap(d => ['groep', 'kind', 'offline', 'toets', 'extra'].map(t => `okkie-test-${d}-${t}-2026`));
const env = {
  DB: createD1(),
  ALLOWED_ORIGINS: 'http://localhost:4173,http://127.0.0.1:4173',
  REGISTRATION_ENABLED: 'false',
  GROUPS_ENABLED: 'true',
  MINORS_OPEN: 'true',   // alleen lokaal; in productie staat dit uit (VRIENDEN.md §4)
  GROUP_FOUNDER_CODE: TEST_FOUNDER_CODES.join(','),
};

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  headers.set('CF-Connecting-IP', req.socket.remoteAddress || '127.0.0.1');
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
  const response = await worker.fetch(new Request(`https://api.test${req.url}`, { method: req.method, headers, body }), env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, '127.0.0.1', () => console.log(`OKKIE test-API (Mijn vrienden) op http://localhost:${port}`));
