// Network first, cache as fallback: new content and fixes arrive right away, the app still opens offline.
const CACHE = "espanol-lima-v5";
const SHELL = ["./", "index.html", "css/app.css", "js/app.js", "js/core.js", "js/i18n.js", "js/session.js", "js/home.js", "js/panel.js", "js/login.js", "js/lucia.js", "js/store.js", "js/config.js", "js/icons.js", "manifest.webmanifest", "icons/icon.svg"];

// Lucía's messages arrive as Web Push; tapping the notification opens the chat.
self.addEventListener("push", (e) => {
  let data = { title: "Lucía", body: "Lucía heeft je een berichtje gestuurd.", url: "./?tab=lucia" };
  try { data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "lucia", renotify: true, data: { url: data.url } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./?tab=lucia", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) { open.navigate(url); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});

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
