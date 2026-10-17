// Anonieme dagteller (app: js/usage-ping.js, tabel usage_days, migratie 0007). De app stuurt hooguit één keer per dag
// POST /v1/ping met { version, first }: alleen het versienummer en of dit toestel voor het eerst meldt. We tellen per
// dag en versie op; er wordt niets per toestel bewaard. Het IP-adres dient alleen voor de minuutlimiet (RL_WRITE),
// zoals bij elke schrijfroute, en komt niet in de database. Alleen vanaf de app-adressen (Origin-controle in worker.js).
const VERSION = /^\d+\.\d+\.\d+$/;
const dayKey = () => new Date().toISOString().slice(0, 10);

export async function handleUsage(request, env, path, h, cors) {
  if (path !== '/v1/ping' || request.method !== 'POST') return null;
  // Over de limiet: doen alsof het gelukt is, dan probeert de app het pas morgen weer.
  if (await h.limited(env.RL_WRITE, 'ping:' + h.clientIp(request))) return h.json({ ok: true }, 200, cors);
  let body;
  try { body = await h.bodyJson(request); } catch { return h.fail('Ongeldig verzoek.', 400, cors); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return h.fail('Ongeldig verzoek.', 400, cors);
  const version = typeof body.version === 'string' && VERSION.test(body.version) ? body.version : 'onbekend';
  const first = body.first === true ? 1 : 0;
  await env.DB.prepare(
    'INSERT INTO usage_days(day, version, opens, new_devices) VALUES(?, ?, 1, ?) ' +
    'ON CONFLICT(day, version) DO UPDATE SET opens = opens + 1, new_devices = new_devices + excluded.new_devices'
  ).bind(dayKey(), version, first).run();
  return h.json({ ok: true }, 200, cors);
}

// Voor het beheeroverzicht: per dag (laatste 30 dagen), totalen en de versies van de laatste 7 dagen.
export async function usageOverview(env) {
  const days = await env.DB.prepare(
    "SELECT day, SUM(opens) AS opens, SUM(new_devices) AS newDevices FROM usage_days WHERE day >= date('now', '-29 days') GROUP BY day ORDER BY day"
  ).all();
  const totals = await env.DB.prepare(
    'SELECT COALESCE(SUM(new_devices), 0) AS devices, COALESCE(SUM(opens), 0) AS opens, MIN(day) AS since FROM usage_days'
  ).first();
  const today = await env.DB.prepare('SELECT COALESCE(SUM(opens), 0) AS opens FROM usage_days WHERE day = ?').bind(dayKey()).first();
  const week = await env.DB.prepare(
    "SELECT COALESCE(SUM(opens), 0) AS opens, COALESCE(SUM(new_devices), 0) AS newDevices FROM usage_days WHERE day >= date('now', '-6 days')"
  ).first();
  const versions = await env.DB.prepare(
    "SELECT version, SUM(opens) AS opens FROM usage_days WHERE day >= date('now', '-6 days') GROUP BY version ORDER BY opens DESC LIMIT 6"
  ).all();
  return { days: days.results || [], totals: totals || {}, today: today?.opens || 0, week: week || {}, versions: versions.results || [] };
}
