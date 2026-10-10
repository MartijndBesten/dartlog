// OKKIE serviceworker: app-bestanden offline beschikbaar. Gebruikersgegevens staan in localStorage
// en worden hier nooit aangeraakt. Verhoog VERSION bij elke release.
const VERSION = 'okkie-v1.3.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/logic.js',
  './js/store.js',
  './js/board.js',
  './js/chart.js',
  './js/achievements.js',
  './js/brand.js',
  './js/imports.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => (k.startsWith('okkie-') || k.startsWith('oche-')) && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Netwerk eerst (altijd de nieuwste, onderling passende bestanden) en offline uit de cache.
// Zo lopen HTML en JavaScript van verschillende versies nooit door elkaar.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req.mode === 'navigate' ? './index.html' : req, copy));
      }
      return res;
    }).catch(() => caches.match(req.mode === 'navigate' ? './index.html' : req, { ignoreSearch: true }))
  );
});
