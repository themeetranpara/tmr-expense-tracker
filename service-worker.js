// TMR Expense Tracker — Service Worker
// Bump this version string whenever index.html (or any cached asset) changes,
// so returning users get the new version instead of a stale cache.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `tmr-expense-tracker-${CACHE_VERSION}`;

// Same-origin app shell — required for the app to boot offline.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
];

// Cross-origin libraries the app loads at runtime (React/Babel/Chart.js/Tailwind/fonts).
// Cached best-effort with no-cors ("opaque") requests — a failure here must never
// block installation, since some of these may be blocked by the user's network.
const RUNTIME_LIBS = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7/babel.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // App shell must succeed — these are same-origin and always reachable on deploy.
      await cache.addAll(APP_SHELL);
      // Runtime libs are best-effort: cache each individually so one failure
      // (e.g. offline install, blocked CDN) doesn't abort the whole install.
      await Promise.all(
        RUNTIME_LIBS.map(async (url) => {
          try {
            const req = new Request(url, { mode: 'no-cors' });
            const res = await fetch(req);
            await cache.put(req, res);
          } catch (err) {
            // Ignore — will be fetched from network (and cached) on first real use.
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Page navigations: network-first so users get fresh content when online,
  // falling back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch (err) {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('./index.html')) || Response.error();
        }
      })()
    );
    return;
  }

  // Everything else (assets, CDN libs, fonts): cache-first, then network,
  // caching the network response for next time.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;
      try {
        const res = await fetch(request);
        // Cache successful same-origin or opaque cross-origin responses.
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(request, res.clone());
        }
        return res;
      } catch (err) {
        return cached || Response.error();
      }
    })()
  );
});
