/*
 * sw.js — Permet d'installer Lumi comme une appli et de l'ouvrir hors ligne
 * (quand il est servi en https ou par le capteur PC sur 127.0.0.1).
 * Stratégie : le réseau d'abord, la copie locale si le réseau manque.
 */
const CACHE = 'lumi-vivant-v1';
const FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/vie.js',
  './js/creature.js',
  './js/capteurs.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Les mesures du capteur ne sont jamais mises en cache.
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
