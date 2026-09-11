const CACHE_NAME = 'billioncodes-public-__BC_VERSION__';
const PUBLIC_FILES = /*__BC_FILES__*/ [];
const allowed = new Set(PUBLIC_FILES);
const privatePath = path => path === '/api' || path.startsWith('/api/') || /^\/admin(?:[/.]|$)/.test(path);

self.addEventListener('install', event => {
  if (!PUBLIC_FILES.length) { event.waitUntil(Promise.reject(new Error('Offline installation requires a production build.'))); return; }
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PUBLIC_FILES)));
  // No automatic skipWaiting: a new version must not interrupt an active form or lesson.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('billioncodes-public-') && key !== CACHE_NAME) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || privatePath(url.pathname)) return;
  const shell = request.mode === 'navigate' && ['/', '/index.html'].includes(url.pathname);
  if (!shell && (url.search || !allowed.has(url.pathname))) return;
  event.respondWith((async () => {
    if (shell) {
      // Network first keeps online visitors current; only the public shell is a fallback.
      try { return await fetch(request); }
      catch {
        const cached = await (await caches.open(CACHE_NAME)).match('/index.html');
        return cached || new Response('Reconnect to open Billion Codes.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    }
    const cached = await (await caches.open(CACHE_NAME)).match(url.pathname);
    return cached || fetch(request);
  })());
});
