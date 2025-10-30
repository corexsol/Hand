/* HandTap SW – v6: canonical full-body cache + proper Range slicing */
const CACHE = 'handtap-v6';
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
    // Cache absolute URLs to avoid key mismatches
    const toCache = ASSETS.map(p => new URL(p, self.location).href);
    await c.addAll(toCache);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Clear old caches
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    try { await self.registration.navigationPreload.enable(); } catch {}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigations: network-first, fallback to cached index
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const preload = await e.preloadResponse;
        if (preload) return preload;
        return await fetch(req);
      } catch {
        const c = await caches.open(CACHE);
        return (await c.match(new URL('./index.html', self.location).href)) || Response.error();
      }
    })());
    return;
  }

  // MP4: serve from a canonical full-body entry, never cache 206
  if (sameOrigin && url.pathname.endsWith('.mp4')) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);

      // Canonical cache key: URL without search/hash
      const key = new URL(req.url);
      key.search = ''; key.hash = '';
      const cacheKey = key.href;

      // Ensure we have a full-body 200 response in cache
      let full = await c.match(cacheKey);
      if (!full || full.status !== 200) {
        // Fetch a full body (no Range), then store under canonical key
        let net;
        try { net = await fetch(cacheKey, { cache: 'no-store' }); } catch { /* noop */ }
        if (net && net.ok) {
          await c.put(cacheKey, net.clone());
          full = net;
        } else {
          // Fallback: pass through original request (may be Range), do NOT cache if 206
          try { return await fetch(req); } catch { return Response.error(); }
        }
      }

      const range = req.headers.get('range');
      if (!range) {
        // Return as-is (no blob read); browsers can still seek if needed
        return full;
      }

      // Slice from cached full blob
      const blob = await full.blob();
      const size = blob.size;

      const m = /bytes=(\d+)-(\d+)?/.exec(range);
      if (!m) return full;

      let start = Number(m[1]);
      let end = m[2] ? Number(m[2]) : size - 1;
      if (!Number.isFinite(start)) start = 0;
      if (!Number.isFinite(end)) end = size - 1;
      start = Math.max(0, Math.min(start, size - 1));
      end   = Math.max(start, Math.min(end,  size - 1));

      const chunk = blob.slice(start, end + 1);
      return new Response(chunk, {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(chunk.size),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      });
    })());
    return;
  }

  // Other same-origin: stale-while-revalidate
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
  }
});
