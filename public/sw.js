const CACHE_NAME = 'simple-slips-v9';
const STATIC_CACHE = 'simple-slips-static-v9';
const DYNAMIC_CACHE = 'simple-slips-dynamic-v9';

const STATIC_FILES = [
  '/manifest.json?v=1.5'
];

const SW_VERSION = '9.0.0';

const CRITICAL_API_PATHS = [
  '/api/login',
  '/api/register',
  '/api/logout',
  '/api/forgot-password',
  '/api/forgot-username',
  '/api/reset-password',
  '/api/verify-email',
  '/api/check-email',
  '/api/user',
  '/api/emergency-login',
  '/api/log-error',
  '/api/resend-verification'
];

self.addEventListener('install', (event) => {
  console.log('[SW v9] Installing - nuclear cache cleanup');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[SW v9] Deleting cache during install:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      return caches.open(STATIC_CACHE).then((cache) => {
        return cache.addAll(STATIC_FILES).catch((error) => {
          console.warn('[SW v9] Some static files could not be cached:', error);
          return Promise.resolve();
        });
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW v9] Activating - deleting ALL old caches');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('[SW v9] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          console.log('[SW v9] Reloading client:', client.url);
          client.navigate(client.url);
        });
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!url.protocol.startsWith('http')) return;

  if (request.method !== 'GET') {
    return;
  }

  if (CRITICAL_API_PATHS.some(path => url.pathname.startsWith(path))) {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response(
              JSON.stringify({ 
                offline: true,
                message: 'This data is not available offline'
              }),
              {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'application/json' }
              }
            );
          });
        })
    );
    return;
  }

  if (request.destination === 'image' || url.pathname.includes('/uploads/') || url.pathname.includes('/attached_assets/')) {
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) return response;
          return fetch(request).then(fetchResponse => {
            const responseClone = fetchResponse.clone();
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, responseClone);
            });
            return fetchResponse;
          });
        })
        .catch(() => {
          return new Response('', { status: 404 });
        })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return caches.match('/').then(root => root || new Response(
              '<html><body><h1>You are offline</h1><p>Please check your internet connection and reload.</p><script>setTimeout(() => location.reload(), 5000);</script></body></html>',
              { status: 503, headers: { 'Content-Type': 'text/html' } }
            ));
          });
        })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        return caches.match(request).then(cached => {
          if (cached) return cached;
          return new Response('', { status: 404 });
        });
      })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'receipt-upload') {
    event.waitUntil(Promise.resolve());
  }
});

self.addEventListener('push', (event) => {
  let notificationData = {
    title: 'Simple Slips',
    body: 'You have a new notification',
    icon: '/attached_assets/192 Icon redesigned_1754568272116.png',
    badge: '/attached_assets/192 Icon redesigned_1754568272116.png',
    tag: 'simple-slips-notification',
    requireInteraction: false,
    data: { url: '/' }
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = { ...notificationData, ...payload };
    } catch (error) {
      console.error('[SW v9] Error parsing push data:', error);
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            return client.navigate(urlToOpen);
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
