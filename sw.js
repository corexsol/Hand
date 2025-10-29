/* sw.js */
const CACHE = 'hand-launch-v1';
const VIDEO_PATH = 'assets/hand-loop.mp4'; // canonical video path
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './offline.html',
  './' + VIDEO_PATH,
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => k === CACHE ? null : caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

/**
 * Serve requests cache-first. Special-case the MP4 to:
 *  - ensure it’s cached
 *  - handle Range requests from the video element (seek/resume) fully offline.
 */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Handle our video path (any query ignored)
  if (url.pathname.endsWith('/' + VIDEO_PATH) || url.pathname.includes(VIDEO_PATH)) {
    event.respondWith(handleVideo(req));
    return;
  }

  // Documents: cache-first, fallback to offline page
  if (req.destination === 'document') {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(
        resp => resp || fetch(req).then(r => cachePut(req, r)).catch(() => caches.match('./offline.html'))
      )
    );
    return;
  }

  // Other requests: cache-first, fallback to network
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      resp => resp || fetch(req).then(r => cachePut(req, r))
    )
  );
});

async function cachePut(req, resp) {
  try {
    const clone = resp.clone();
    const cache = await caches.open(CACHE);
    // Only cache successful, basic/opaque same-origin-ish responses
    if (clone.ok || clone.type === 'opaque') await cache.put(req, clone);
  } catch (_) {}
  return resp;
}

// --- Video handler with Range support (serves from cache fully offline) ---
async function handleVideo(request) {
  const cache = await caches.open(CACHE);
  // Always key the video by canonical URL to avoid duplicate entries
  const canonical = new Request('./' + VIDEO_PATH);
  let cached = await cache.match(canonical);

  // If not cached yet, fetch once and store (first online run)
  if (!cached) {
    try {
      const net = await fetch(canonical, { cache: 'no-store' });
      await cache.put(canonical, net.clone());
      cached = net;
    } catch (err) {
      // No network and not cached -> offline fallback
      return caches.match('./offline.html');
    }
  }

  // If no Range requested, return whole file
  const range = request.headers.get('Range');
  if (!range) return cached.clone();

  // Build a 206 response from cached bytes
  const buf = await cached.arrayBuffer();
  const size = buf.byteLength;

  // Parse "bytes=start-end"
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = 0, end = size - 1;
  if (m) {
    if (m[1] !== '') start = parseInt(m[1], 10);
    if (m[2] !== '') end = parseInt(m[2], 10);
  }
  if (isNaN(start) || isNaN(end) || start > end || start >= size) {
    // Invalid range -> return 416
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` }
    });
  }

  const chunk = buf.slice(start, end + 1);
  const headers = {
    'Content-Type': 'video/mp4',
    'Content-Length': String(chunk.byteLength),
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable'
  };
  return new Response(chunk, { status: 206, headers });
}
