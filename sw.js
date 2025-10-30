/* HandTap SW – range-aware video cache */
const CACHE = 'handtap-v5';
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
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)));
    try { await self.registration.navigationPreload.enable(); } catch {}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigations: network first → fallback to cached index
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const preload = await e.preloadResponse;
        if (preload) return preload;
        return await fetch(req);
      } catch {
        const c = await caches.open(CACHE);
        return (await c.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // MP4: range-aware, cache-first
  if (sameOrigin && url.pathname.endsWith('.mp4')) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      // Match ignoring Range header (Cache API ignores most headers)
      let cached = await c.match(req, { ignoreSearch: false });
      if (!cached) {
        // If not precached, fetch, store, and continue
        try {
          const net = await fetch(req);
          if (net.ok) c.put(req, net.clone());
          cached = net;
        } catch {
          return Response.error();
        }
      }

      const range = req.headers.get('range');
      if (!range) {
        // Serve full response with Accept-Ranges so the player can reuse it
        const full = await cached.blob();
        return new Response(full, {
          status: 200,
          headers: {
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
            'Content-Length': String(full.size),
            'Cache-Control': 'public, max-age=31536000, immutable'
          }
        });
      }

      // Parse "bytes=start-end"
      const m = /bytes=(\d+)-(\d+)?/.exec(range);
      if (!m) return cached;

      const size = (await cached.blob()).size;
      let start = Number(m[1]);
      let end = m[2] ? Number(m[2]) : size - 1;
      start = isFinite(start) ? start : 0;
      end = isFinite(end) ? Math.min(end, size - 1) : size - 1;
      if (start > end || start >= size) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}` }
        });
      }

      const blob = await cached.blob();
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
    return;
  }
});
