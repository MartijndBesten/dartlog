// Cloudflare Pages (advanced mode): wordt bij de build dist/_worker.js.
// - www.okkiedarts.nl en http:// → https://okkiedarts.nl (301), pad en query blijven behouden.
// - Vaste beveiligingsheaders op elk antwoord (ook als _headers in deze modus niet wordt toegepast).
// Verder levert hij alleen de statische bestanden; er is hier geen app en geen opslag.
export const CANONICAL = 'okkiedarts.nl';
export const HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.' + CANONICAL || (url.hostname === CANONICAL && url.protocol === 'http:')) {
      url.hostname = CANONICAL;
      url.protocol = 'https:';
      return new Response(null, { status: 301, headers: { Location: url.toString(), ...HEADERS } });
    }
    const response = await env.ASSETS.fetch(request);
    const out = new Response(response.body, response);
    for (const [k, v] of Object.entries(HEADERS)) out.headers.set(k, v);
    return out;
  },
};
