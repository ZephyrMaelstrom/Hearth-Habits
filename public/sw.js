// Hearth & Habits service worker: offline app shell.
// Pages: network first, falling back to the cached copy when offline.
// Same-origin assets: cache first (Vite fingerprints file names, so a cached
// file never goes stale), stored on first use.
//
// The same file serves the main app (/Hearth-Habits/) and the preview build
// (/Hearth-Habits/preview/). Each keeps its own cache, and the main app's
// worker leaves the preview's pages alone.
const SCOPE = new URL(self.registration.scope).pathname;
const PREFIX = `hearth:${SCOPE}:`;
const CACHE = `${PREFIX}v2`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            // this worker's older caches, plus the Phase 1 cache name
            .filter((k) => (k.startsWith(PREFIX) && k !== CACHE) || (k === 'hearth-v1' && !SCOPE.endsWith('/preview/')))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fonts, Firebase: straight to the network
  if (!url.pathname.startsWith(SCOPE)) return;
  if (url.pathname.slice(SCOPE.length).startsWith('preview/')) return; // the preview build has its own worker

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

// ---- push reminders (Phase 3): the hourly Ember job sends {title, body, tag, url}
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : '' };
  }
  const title = d.title || 'Ember';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || '',
      tag: d.tag || 'ember',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: { url: d.url || './' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
      return self.clients.openWindow(url);
    }),
  );
});
