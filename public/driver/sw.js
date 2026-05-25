// Sessions 36-37 — driver PWA service worker.
//
// Scope: /driver/ (set by registration in DriverLayout).
//
// Two jobs:
//   1. Web Push: receive a job-offer push, show a notification, open
//      the right URL on click.
//   2. Skeleton install/activate — no offline asset caching yet, just
//      pass-through fetch. The driver app needs connectivity for every
//      meaningful action (status changes, photo upload, signature) so
//      offline mode is misleading; we keep the SW minimal until we
//      have a real use case.

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = { title: 'TalkMate Driver', body: 'You have a new notification', url: '/driver/dashboard' }
  try {
    if (event.data) {
      const parsed = event.data.json()
      payload = { ...payload, ...parsed }
    }
  } catch {
    // Non-JSON payload — keep defaults.
  }

  const notif = self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: payload.icon || '/driver/icon-192.png',
    badge: payload.badge || '/driver/badge-72.png',
    tag: payload.tag,
    data: { url: payload.url },
    requireInteraction: true,
    vibrate: [200, 100, 200],
  })
  event.waitUntil(notif)
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/driver/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a tab is already open on /driver/* focus it and navigate.
      for (const client of windowClients) {
        if (client.url.includes('/driver') && 'focus' in client) {
          return client.focus().then((c) => c.navigate ? c.navigate(url) : c)
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
