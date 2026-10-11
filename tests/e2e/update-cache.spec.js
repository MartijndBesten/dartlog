import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Een update zoals op GitHub Pages: bestanden met max-age=600 (de lokale testserver stuurt no-cache).
// De nieuwe serviceworker moet de nieuwe bestanden opslaan, niet een oude app.js uit de browsercache.
const root = fileURLToPath(new URL('../..', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
let deployed = {};   // pad → inhoud van de "nieuwe versie"
let server, port;

test.beforeAll(async () => {
  deployed = {};
  server = createServer(async (req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    try {
      const body = deployed[rel] ?? await readFile(join(root, rel));
      res.writeHead(200, { 'Content-Type': types[extname(rel)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));   // vrije poort: ook met parallelle workers
  port = server.address().port;
});
test.afterAll(() => new Promise(r => server.close(r)));

test('update met browsercache (max-age=600): nieuwe cache bevat de nieuwe app.js', async ({ browser }, info) => {
  test.skip(info.project.name !== 'iphone', 'één keer is genoeg');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const url = `http://127.0.0.1:${port}/`;
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // Nieuwe versie "uitrollen": andere cachenaam en een herkenbare app.js.
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  deployed = {
    'sw.js': sw.replace(/const VERSION = '[^']+'/, "const VERSION = 'okkie-vtest-update'"),
    'js/app.js': (await readFile(join(root, 'js/app.js'), 'utf8')) + '\n// nieuwe-versie-test\n',
  };
  await expect.poll(async () => {
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => {}));
    await page.reload();
    return page.evaluate(() => caches.keys());
  }, { timeout: 20000 }).toEqual(['okkie-vtest-update']);
  const cached = await page.evaluate(async () => (await (await caches.open('okkie-vtest-update')).match(new URL('js/app.js', location.href).href)).text());
  expect(cached).toContain('// nieuwe-versie-test');
  // En wat de pagina zelf laadt, is ook de nieuwe versie.
  const served = await page.evaluate(async () => (await fetch('js/app.js')).text());
  expect(served).toContain('// nieuwe-versie-test');
  await ctx.close();
});
