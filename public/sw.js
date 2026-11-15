/* PXL service worker: network only. Never caches messages, photos, voice or auth data. */
self.addEventListener('install', (event) => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

// Payload is a brief invitation only, never chat content or media.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let incoming;
  try { incoming = event.data.json(); } catch { return; }
  const body = typeof incoming.body === 'string' ? incoming.body.slice(0, 180) : 'A character is inviting you to explore.';
  event.waitUntil(self.registration.showNotification('PXL', {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'pxl-game-invite',
    data: { url: '/' },
    silent: false
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL('/', self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
