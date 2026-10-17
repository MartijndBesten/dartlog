import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pingDue, pingUsage, PING_KEY } from '../../js/usage-ping.js';

const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), m }; };
const at = (d, h = 12) => new Date(2026, 9, d, h, 0);

test('één seintje per dag: eerste keer first=true, daarna pas de volgende dag weer', async () => {
  const storage = mem(), sent = [];
  const send = async (path, method, body) => { sent.push({ path, method, body }); return { ok: true }; };
  assert.equal(await pingUsage({ version: '1.7.2', send, storage, now: at(17) }), true);
  assert.deepEqual(sent, [{ path: '/v1/ping', method: 'POST', body: { version: '1.7.2', first: true } }]);
  assert.equal(await pingUsage({ version: '1.7.2', send, storage, now: at(17, 23) }), false, 'zelfde dag: niets');
  assert.equal(await pingUsage({ version: '1.7.2', send, storage, now: at(18, 0) }), true, 'nieuwe dag (lokale tijd)');
  assert.deepEqual(sent[1].body, { version: '1.7.2', first: false });
  assert.deepEqual(JSON.parse(storage.getItem(PING_KEY)), { day: '2026-10-18' }, 'alleen de datum wordt onthouden');
});

test('mislukt (offline of server uit): niets onthouden, later opnieuw; kapotte opslag is geen probleem', async () => {
  const storage = mem();
  const fail = async () => { throw new Error('offline'); };
  assert.equal(await pingUsage({ version: '1.7.2', send: fail, storage, now: at(17) }), false);
  assert.equal(storage.getItem(PING_KEY), null);
  assert.deepEqual(pingDue(storage, at(17)), { due: true, first: true });
  storage.setItem(PING_KEY, '{kapot');
  assert.deepEqual(pingDue(storage, at(17)), { due: true, first: true });
  storage.setItem(PING_KEY, JSON.stringify({ day: '2026-10-17' }));
  assert.deepEqual(pingDue(storage, at(17)), { due: false, first: false });
  const broken = { getItem: () => { throw new Error('geen opslag'); }, setItem: () => { throw new Error('geen opslag'); } };
  let n = 0;
  assert.equal(await pingUsage({ version: '1.7.2', send: async () => { n++; }, storage: broken, now: at(17) }), true);
  assert.equal(n, 1);
});
