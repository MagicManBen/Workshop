// Minimal service worker: caches the app shell for offline load. Data requests
// (Supabase) always go to the network. Bump CACHE_VERSION to invalidate.
const CACHE_VERSION = "workshop-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/config.js",
  "./js/app.js",
  "./js/supabase.js",
  "./js/auth.js",
  "./js/api.js",
  "./js/router.js",
  "./js/ui.js",
  "./js/images.js",
  "./js/qr.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Only handle same-origin GETs from the cache; everything else hits network.
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
