// public/sw.js
// Service worker for Jabumarket — handles Web Push notifications.
// Installed by the vendor orders page on first load.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// ── Push event ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'New order', body: '', icon: '/favicon.ico', data: {} };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon ?? '/favicon.ico',
      badge:   '/favicon.ico',
      tag:     'new-order',          // replace previous unread order notification
      renotify: true,                // vibrate/sound even if replacing
      vibrate: [200, 100, 200],
      data:    data.data ?? {},
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.href ?? '/vendor/orders';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes('/vendor') && 'focus' in client) {
          client.focus();
          client.navigate?.(targetUrl);
          return;
        }
      }
      // Otherwise open a new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});