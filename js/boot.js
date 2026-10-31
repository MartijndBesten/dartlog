// OKKIE. — opstarten. In de iPhone-app eerst de duurzame kopie controleren (js/native.js), dan pas de app laden,
// zodat de app nooit met lege opslag begint terwijl de trainingen in de kopie staan. In de browser direct door.
import { prepare, hideSplash } from './native.js';

try { await prepare(); } catch (e) { console.warn('OKKIE. opstarten:', e?.message || e); }
try { await import('./app.js'); } finally { hideSplash(); }
