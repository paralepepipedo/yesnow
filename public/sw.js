const CACHE = 'bitacora-v1';

// Notificaciones push: el servidor envía {titulo, cuerpo, url, tag}.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { cuerpo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'yesnow', {
    body: d.cuerpo || '',
    icon: '/icons/icon.svg',
    tag: d.tag || undefined,
    data: { url: d.url || '/' },
  }));
});

// Al tocar el aviso: enfoca la app si ya está abierta, o la abre en la pantalla correspondiente.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});

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
