// Offline support: precache the whole app, serve from cache first, refresh the cache in the background.
const VERSION = "lgql-v1";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/style.css",
  "js/main.js", "js/ui.js", "js/map.js", "js/world.js", "js/art.js", "js/audio.js", "js/state.js", "js/data.js",
  "fonts/press-start-2p.woff2", "fonts/rubik.woff2",
  "icons/icon-32.png", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === "navigate" ? await cache.match("index.html") : null);
      const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || new Response("Offline", { status: 503 });
    })
  );
});
