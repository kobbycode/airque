// Firebase Messaging Service Worker
// Handles background push notifications when the site is closed

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCp88TlFrc2z5JsJWQ8OXve3yKw43PeIyU',
  authDomain: 'sonicstream-radio-2026.firebaseapp.com',
  projectId: 'sonicstream-radio-2026',
  storageBucket: 'sonicstream-radio-2026.firebasestorage.app',
  messagingSenderId: '574457685127',
  appId: '1:574457685127:web:087c13116ce433bdd4c422',
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  const channelName = payload.data?.channelName || 'A channel';
  const channelId = payload.data?.channelId || '';
  const videoId = payload.data?.videoId || '';

  const notificationTitle = payload.notification?.title || `🔴 ${channelName} is LIVE!`;
  const notificationBody = payload.notification?.body || `${channelName} has just started streaming. Tap to watch now.`;

  const notificationOptions = {
    body: notificationBody,
    icon: '/logo.png',
    badge: '/logo.png',
    tag: `live-${channelId}`,           // replaces old notification for same channel
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: videoId
        ? `/live-tv?cid=${channelId}&name=${encodeURIComponent(channelName)}`
        : '/listener-directory',
    },
    actions: [
      { action: 'watch', title: '▶ Watch Now' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click — open the channel page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/listener-directory';
  const fullUrl = self.location.origin + url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === fullUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(fullUrl);
      }
    })
  );
});
