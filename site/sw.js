// Network-first for data (always show the freshest brief); cache-first for the app shell. Falls back to cache offline.
const SHELL = "daw-shell-v1";
const FILES = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "assets/logo.png", "assets/plane.webp", "assets/icon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== SHELL && x.startsWith("daw-")).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.includes("/data/") || r.mode === "navigate") {
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(SHELL).then(c => c.put(r, cp)); return res; }).catch(() => caches.match(r)));
  } else {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { const cp = res.clone(); caches.open(SHELL).then(c => c.put(r, cp)); return res; })));
  }
});