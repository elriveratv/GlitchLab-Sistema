// GlitchLab OS - Service Worker (PWA Offline Cache)
const CACHE_NAME = 'glitchlab-v1-cache-20261103';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './favicon.svg',
  './logo_oficial.png',
  './logo_impresion.png'
];

// Instalación: precachear recursos esenciales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[GlitchLab SW] Advertencia precacheando assets:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activación: limpiar versiones anteriores de cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-First con fallback a cache
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Solo manejar peticiones GET
  if (req.method !== 'GET') return;

  // Ignorar peticiones a Supabase o CDNs de analíticas/APIs
  const url = new URL(req.url);
  if (url.origin.includes('supabase.co')) return;

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        // Si la respuesta es válida, clonar y actualizar cache local
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return networkRes;
      })
      .catch(() => {
        // Sin conexión: buscar en cache
        return caches.match(req).then((cachedRes) => {
          if (cachedRes) return cachedRes;
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return null;
        });
      })
  );
});
