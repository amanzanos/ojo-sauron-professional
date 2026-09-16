// Minimal service worker — its only real job is satisfying Chrome's "installable PWA" criteria
// (a fetch handler must exist) so WEROS can be added to a phone's home screen. Deliberately not a
// full offline-first cache strategy: this app leans on live camera/mic/geolocation/network calls
// that don't make sense to serve stale, so we just pass everything straight through to the network.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
