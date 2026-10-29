// Network first, cache as fallback: new content and fixes arrive right away, the app still opens offline.
const CACHE = "espanol-lima-v2";
const SHELL = ["./", "index.html", "css/app.css", "js/app.js", "js/core.js", "js/session.js", "js/home.js", "js/panel.js", "js/login.js", "js/store.js", "js/config.js", "js/icons.js", "manifest.webmanifest", "icons/icon.svg"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});
