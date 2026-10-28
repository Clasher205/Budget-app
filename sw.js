/* Service Worker: hält die App-Dateien offline vor. Daten liegen in IndexedDB, nicht hier. */
const VERSION = "v1";
const CACHE = `budget-app-${VERSION}`;
const FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./js/app.js", "./js/state.js", "./js/storage.js", "./js/ui.js", "./js/charts.js", "./js/data.js",
  "./js/logic/format.js", "./js/logic/csv.js", "./js/logic/rules.js", "./js/logic/budget.js",
  "./js/logic/pots.js", "./js/logic/fixed.js", "./js/logic/exportfile.js",
  "./js/pages/course.js", "./js/pages/overview.js", "./js/pages/transactions.js", "./js/pages/import.js",
  "./js/pages/budget.js", "./js/pages/fixed.js", "./js/pages/settings.js", "./js/pages/more.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch (err) {
      if (request.mode === "navigate") return cache.match("./index.html");
      throw err;
    }
  })());
});
