// Koppel pas na configureren van Cloudflare D1, Turnstile en de privacyvoorwaarden.
// Alleen voor lokaal testen (localhost/127.0.0.1): localStorage 'okkie.dev' = {"api":"http://127.0.0.1:8799","groups":true}.
// Op elk ander adres (zoals GitHub Pages) wordt die testinstelling genegeerd.
const LOCAL = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const DEV = LOCAL ? (() => { try { return JSON.parse(localStorage.getItem('okkie.dev') || '{}') || {}; } catch { return {}; } })() : {};
export const API_BASE = DEV.api || '';
export const TURNSTILE_SITE_KEY = '';
// Openbare registratie: pas op true na privacyverklaring en ouderlijke toestemming (<16). De API weigert
// registratie daarnaast zelf zolang REGISTRATION_ENABLED in de Worker niet "true" is.
export const REGISTRATION_OPEN = false;
// Mijn vrienden (besloten groepen): pas op true na akkoord en bijgewerkte privacyverklaring. De API weigert
// daarnaast zelf zolang GROUPS_ENABLED in de Worker niet "true" is.
export const GROUPS_OPEN = DEV.groups === true;
