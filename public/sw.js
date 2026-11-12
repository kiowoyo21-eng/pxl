/* PXL service worker: intentionally network-only.
 * Registration enables the installable app lifecycle. No fetch handler, caches,
 * background sync, notification storage, or offline response snapshots are used.
 * Login, roster and chats always require a live network connection.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
