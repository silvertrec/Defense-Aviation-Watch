// Network-first for everything so a deploy or data refresh is never hidden behind a stale cache.
// The cache is only an offline fallback.
const CACHE = "daw-shell-v3";
const FILES = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "assets/logo.png", "assets/plane.webp", "assets/icon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE && x.startsWith("daw-")).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } return res; })
      .catch(() => caches.match(r).then(m => m || caches.match("index.html")))
  );
});
