// Y&Y Plastic — service worker (permite instalar la app en el teléfono).
// Archivos propios: primero la red (así cada publicación se ve al instante) y, sin conexión, la copia guardada.
// Supabase, Flow y otros dominios no se tocan: siempre van directo a la red.
const CACHE = 'yyplastic-v1';
const BASE = ['./', 'index.html', 'css/styles.css', 'css/pedidos.css', 'js/config.js', 'js/imagenes.js',
  'js/app.js', 'js/carrito.js', 'js/admin.js', 'js/pedidos-admin.js', 'assets/logo.svg',
  'assets/logo-horizontal.svg', 'assets/isotipo.svg', 'assets/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./'))),
  );
});
