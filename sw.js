/* HandTap SW – portrait PWA, offline precache, sane fetch */
const CACHE = 'handtap-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/hand-loop.mp4',
  './assets/hand-loop2.mp4'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Cleanup old versions
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)));
    // Enable faster navigations if supported
    try { await self.registration.navigationPreload.enable(); } catch {}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // App navigations: network-first, fallback to cached index
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const preload = await e.preloadResponse;
        if (preload) return preload;
        const net = await fetch(req);
        return net;
      } catch {
        const c = await caches.open(CACHE);
        return (await c.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Media (mp4): cache-first; fetch & fill cache if missing
  if (sameOrigin && url.pathname.endsWith('.mp4')) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const net = await fetch(req);
        // Only cache successful same-origin responses
        if (net.ok && net.type !== 'opaque') c.put(req, net.clone());
        return net;
      } catch {
        // Best-effort fallback to whichever video is available
        return (await c.match('./assets/hand-loop2.mp4')) ||
               (await c.match('./assets/hand-loop.mp4')) ||
               Response.error();
      }
    })());
    return;
  }

  // Other same-origin GET: stale-while-revalidate
  if (sameOrigin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      const netP = fetch(req).then(res => {
        if (res && res.ok) c.put(req, res.clone());
        return res;
      }).catch(() => null);
      return hit || (await netP) || Response.error();
    })());
    return;
  }

  // Cross-origin: just pass through
  // (Add CORS caching here if ever needed)
});
