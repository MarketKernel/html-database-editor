// db-manager's service worker: the page from its own cache, offline too. A new version waits beside the old one
// until the page asks it to take over ("activate"): an update never happens behind the user's back.
const VERSION = '__VERSION__';
const CACHE = '__CACHE__';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('db-manager-') && name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.ports[0]?.postMessage(VERSION);
  if (event.data === 'activate') self.skipWaiting();
});

// Only this version's cache answers: the cache of a waiting version may sit beside it.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request.mode === 'navigate' ? './index.html' : request, { ignoreSearch: true });
      return cached ?? fetch(request);
    }),
  );
});
