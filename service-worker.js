// TMR Expense Tracker — Service Worker
// Bump this version string whenever index.html (or any cached asset) changes,
// so returning users get the new version instead of a stale cache.
const CACHE_VERSION = 'v5';
const CACHE_NAME = `tmr-expense-tracker-${CACHE_VERSION}`;

// Same-origin app shell ONLY — required for the app to boot offline.
// Cross-origin CDN libraries (React/Babel/Chart.js/Tailwind/fonts) are
// intentionally NOT listed here and NEVER cached — see the fetch handler
// below. Caching those as opaque cross-origin responses is what caused
// Safari to reject them ("Response served by service worker is opaque"),
// which left React/Babel undefined and crashed the app.
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
  './icons/tmr-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Same-origin only — always reachable on a GitHub Pages deploy.
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Deleting every cache that isn't the current version also clears out
      // any previously (incorrectly) cached opaque CDN responses from older
      // versions of this service worker.
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

  const requestURL = new URL(request.url);
  const isSameOrigin = requestURL.origin === self.location.origin;

  // Cross-origin requests (unpkg.com, cdn.jsdelivr.net, cdn.tailwindcss.com,
  // fonts.googleapis.com, fonts.gstatic.com, etc.) are never intercepted.
  // Not calling respondWith() here means the browser handles the request
  // exactly as if no service worker existed at all — a normal, non-opaque
  // network fetch with correct CORS handling in every browser, including Safari.
  if (!isSameOrigin) return;

  // Same-origin page navigations: network-first so users get fresh content
  // when online, falling back to the cached shell when offline.
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

  // Same-origin assets (manifest, icons, etc.): cache-first, then network,
  // caching the network response for next time.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;
      try {
        const res = await fetch(request);
        if (res && res.ok) {
          cache.put(request, res.clone());
        }
        return res;
      } catch (err) {
        return cached || Response.error();
      }
    })()
  );
});
