// The app is paused: drop the offline copy and step aside, so visitors get the pause page.
// Data the app kept in the browser (localStorage, IndexedDB) is not touched.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister()),
  );
});
