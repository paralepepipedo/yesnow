const CACHE = 'bitacora-v1';

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

// Network-first con fallback a caché: mantiene la app usable con conexión
// intermitente sin complicarse con una lista de precacheo que hay que mantener.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return; // nunca cachear respuestas de la API

  e.respondWith(
    fetch(e.request).then((res) => {
      const clone = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
