// Beheer van OKKIE is standaard gesloten. Alleen gesigneerde Cloudflare Access JWT's.
// Voor zowel dashboard-HTML als API-cijfers moet verificatie slagen.
// Er bestaat geen query-parameter-, dev- of wachtwoord-bypass.
const decoder = new TextDecoder();
let keyCache = { issuer: '', keys: [], expires: 0 };
function b64url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4));
    return Uint8Array.from(binary, c=>c.charCodeAt(0));
  } catch { return null; }
}
function parsePart(value) {
  const bytes = b64url(value);
  if (!bytes) return null;
  try { return JSON.parse(decoder.decode(bytes)); } catch { return null; }
}
function settings(env) {
  const team = String(env.CF_ACCESS_TEAM_DOMAIN || '').replace(/^https:\/\//,'').replace(/\/+$/,'');
  const audience = String(env.CF_ACCESS_AUD || '');
  const emails = String(env.ADMIN_ALLOWED_EMAILS || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  const host = String(env.ADMIN_HOST || '').toLowerCase();
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) ||
      !/^[0-9a-f-]{20,}$/i.test(audience) || !emails.length ||
      !/^[a-z0-9.-]+$/.test(host) || host.includes('..')) return null;
  return { issuer: 'https://'+team, audience, emails, host };
}
async function signingKeys(issuer, fetchImpl = fetch) {
  if (keyCache.issuer === issuer && keyCache.expires > Date.now()) return keyCache.keys;
  const res = await fetchImpl(issuer+'/cdn-cgi/access/certs', {cache:'no-store'});
  if (!res.ok) return [];
  const body = await res.json();
  const keys = Array.isArray(body.keys) ? body.keys.filter(k => k.kty === 'RSA' && k.n && k.e && k.kid) : [];
  if (keys.length) keyCache = {issuer, keys, expires:Date.now()+300_000};
  return keys;
}
export async function isAdminRequest(request, env, fetchImpl = fetch) {
  const cfg = settings(env);
  if (!cfg || new URL(request.url).hostname.toLowerCase() !== cfg.host) return false;
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt || jwt.length > 10000) return false;
  const parts = jwt.split('.');
  if (parts.length !== 3) return false;
  const header = parsePart(parts[0]), claims = parsePart(parts[1]), signature = b64url(parts[2]);
  if (!header || !claims || !signature || header.alg !== 'RS256' || typeof header.kid !== 'string') return false;
  const now = Math.floor(Date.now()/1000);
  if (claims.iss !== cfg.issuer ||
      !Array.isArray(claims.aud) && claims.aud !== cfg.audience ||
      (Array.isArray(claims.aud) && !claims.aud.includes(cfg.audience)) ||
      !Number.isInteger(claims.exp) || claims.exp <= now ||
      (claims.nbf != null && (!Number.isInteger(claims.nbf) || claims.nbf > now+30)) ||
      !cfg.emails.includes(String(claims.email || '').toLowerCase())) return false;
  try {
    const keys = await signingKeys(cfg.issuer,fetchImpl);
    const jwk = keys.find(k=>k.kid===header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(parts[0]+'.'+parts[1]));
  } catch { return false; }
}
export function adminHostMatches(request,env) {
  const cfg = settings(env);
  return !!cfg && new URL(request.url).hostname.toLowerCase() === cfg.host;
}
export function _clearJwksCacheForTest() {
  keyCache = { issuer:'',keys:[],expires:0 };
}
