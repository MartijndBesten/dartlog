// Anonieme dagteller (app: js/usage-ping.js, tabel usage_days, migratie 0007). De app stuurt hooguit één keer per dag
// POST /v1/ping met { version, first }: alleen het versienummer en of dit toestel voor het eerst meldt. We tellen per
// dag en versie op; er wordt niets per toestel bewaard. Het IP-adres dient alleen voor de minuutlimiet (RL_WRITE),
// zoals bij elke schrijfroute, en komt niet in de database. Alleen vanaf de app-adressen (Origin-controle in worker.js).
//
// Wat de cijfers betekenen (en niet): een "melding" is een toestel dat de app die dag opende (max. één per toestel per
// dag). Dat zijn geen unieke personen (één persoon kan meerdere toestellen hebben, één toestel meerdere spelers) en
// geen installaties. "Nieuwe toestellen" zijn toestellen die voor het eerst meldden; opnieuw installeren of
// browsergegevens wissen telt opnieuw. De server kan een melding niet aan een toestel koppelen en dus niet volledig
// tegen manipulatie beschermen: de cijfers zijn indicatief.
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

export const USAGE_NOTES = [
  'Een melding is een toestel dat de app die dag opende; de app meldt hooguit één keer per toestel per dag, zonder ID.',
  'Meldingen zijn geen unieke personen: één persoon kan meerdere toestellen hebben en één toestel meerdere spelers.',
  'Nieuwe toestellen zijn toestellen die voor het eerst meldden (sinds 1.7.2). Opnieuw installeren of browsergegevens wissen telt opnieuw.',
  'Installaties op het beginscherm meten we niet. Offline dagen tellen pas mee zodra het toestel weer online is.',
  'De server kan een melding niet aan een toestel koppelen en dus niet volledig tegen manipulatie beschermen: de cijfers zijn indicatief.',
];

// Voor het beheeroverzicht: vandaag, 7 en 30 dagen, totalen, per dag (30 dagen) en per versie (7 en 30 dagen).
export async function usageOverview(env) {
  const q = sql => env.DB.prepare(sql);
  const range = async from => await q(
    "SELECT COALESCE(SUM(opens), 0) AS opens, COALESCE(SUM(new_devices), 0) AS newDevices, COUNT(DISTINCT day) AS activeDays FROM usage_days WHERE day >= date('now', ?)"
  ).bind(from).first();
  const versions = async from => (await q(
    "SELECT version, SUM(opens) AS opens, SUM(new_devices) AS newDevices FROM usage_days WHERE day >= date('now', ?) GROUP BY version ORDER BY opens DESC, version DESC LIMIT 8"
  ).bind(from).all()).results || [];
  const days = (await q(
    "SELECT day, SUM(opens) AS opens, SUM(new_devices) AS newDevices FROM usage_days WHERE day >= date('now', '-29 days') GROUP BY day ORDER BY day"
  ).all()).results || [];
  const totals = await q('SELECT COALESCE(SUM(new_devices), 0) AS devices, COALESCE(SUM(opens), 0) AS opens, MIN(day) AS since, COUNT(DISTINCT day) AS activeDays FROM usage_days').first();
  const today = await q('SELECT COALESCE(SUM(opens), 0) AS opens, COALESCE(SUM(new_devices), 0) AS newDevices FROM usage_days WHERE day = ?').bind(dayKey()).first();
  return { day: dayKey(), today: today || { opens: 0, newDevices: 0 }, week: await range('-6 days'), month: await range('-29 days'), totals: totals || {},
    days, versions7: await versions('-6 days'), versions30: await versions('-29 days'), notes: USAGE_NOTES };
}
