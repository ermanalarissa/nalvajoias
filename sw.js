const CACHE_NAME = 'joiaspro-v0.6';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=0.6',
  './app.js?v=0.6',
  './manifest.json',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/capa/colar-ponto-luz.jpeg',
  './assets/capa/pulseiras-ouro.jpeg',
  './assets/capa/pulseira-elos.jpeg',
  './assets/capa/aneis-coracao.jpeg',
  './assets/capa/brincos-argolas.jpeg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
