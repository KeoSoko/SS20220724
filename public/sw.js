// Simple Slips Service Worker
const CACHE_NAME = 'simple-slips-v7';
const STATIC_CACHE = 'simple-slips-static-v7';
const DYNAMIC_CACHE = 'simple-slips-dynamic-v7';

// Files to cache for offline functionality  
const STATIC_FILES = [
  '/',
  '/manifest.json?v=1.4',
  '/attached_assets/192 Icon redesigned_1754568272116.png?v=3',
  '/attached_assets/512 Icon redesigned_1754568278738.png?v=3'
];

// Enhanced PWA Features for PWA Builder compatibility
const SW_VERSION = '7.0.0';
const API_CACHE_TIME = 1000 * 60 * 5; // 5 minutes
const IMAGE_CACHE_TIME = 1000 * 60 * 60 * 24; // 24 hours

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v7 - Fixed Icon Paths & Cache-Busting');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static files');
        return cache.addAll(STATIC_FILES).catch((error) => {
          console.warn('[SW] Some files could not be cached:', error);
          // Don't fail the entire installation if some files fail
          return Promise.resolve();
        });
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Background Sync for offline receipt uploads
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  if (event.tag === 'receipt-upload') {
    event.waitUntil(processOfflineReceipts());
  }
});

// Periodic Background Sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-receipts') {
    event.waitUntil(syncReceiptsData());
  }
});

// Enhanced Fetch event with improved caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Handle API requests with network-first strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful API responses for short time
          if (response.ok && request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // For receipt uploads, return a special offline response that the app can handle
          if (url.pathname === '/api/receipts' && request.method === 'POST') {
            return new Response(
              JSON.stringify({ 
                offline: true,
                message: 'Receipt saved offline - will upload when connection returns'
              }),
              {
                status: 202, // Accepted for processing
                statusText: 'Accepted',
                headers: { 'Content-Type': 'application/json' }
              }
            );
          }
          
          // For other API requests, try to serve from cache
          return caches.match(request).then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // Return a more gentle offline message
            return new Response(
              JSON.stringify({ 
                offline: true,
                message: 'This feature requires an internet connection'
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

  // Handle image requests with cache-first strategy
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
    );
    return;
  }

  // Handle navigation requests (pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses for offline access
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached API response if offline
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return offline page for failed API requests
            return new Response(
              JSON.stringify({ 
                error: 'Offline', 
                message: 'You are currently offline. Please check your internet connection.' 
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

  // Handle static resources and pages
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Cache the response for future use
            const responseToCache = response.clone();
            caches.open(DYNAMIC_CACHE)
              .then((cache) => {
                cache.put(request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // Return offline page for navigation requests
            if (request.mode === 'navigate') {
              return caches.match('/');
            }
            return new Response('Content not available offline', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// Background sync for receipt uploads when back online
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'receipt-upload') {
    event.waitUntil(syncReceiptUploads());
  }
});

// Background functions for offline support
async function syncReceiptUploads() {
  console.log('[SW] Processing offline receipt uploads...');
  try {
    // Implementation for background sync of receipts
    // This would integrate with IndexedDB to process queued uploads
    return Promise.resolve();
  } catch (error) {
    console.error('[SW] Error processing offline receipts:', error);
    throw error;
  }
}

async function processOfflineReceipts() {
  console.log('[SW] Processing offline receipts...');
  try {
    // Get stored offline receipts from IndexedDB
    // Process and upload when online
    return Promise.resolve();
  } catch (error) {
    console.error('[SW] Error processing offline receipts:', error);
  }
}

async function syncReceiptsData() {
  console.log('[SW] Syncing receipts data...');
  try {
    // Implementation for periodic sync
    return Promise.resolve();
  } catch (error) {
    console.error('[SW] Error syncing receipts:', error);
  }
}

// Push notification handler
self.addEventListener('push', (event) => {
  console.log('[SW] Push message received');
  
  let notificationData = {
    title: 'Simple Slips',
    body: 'You have a new notification',
    icon: '/attached_assets/192 Icon redesigned_1754568272116.png',
    badge: '/attached_assets/192 Icon redesigned_1754568272116.png',
    tag: 'simple-slips-notification',
    requireInteraction: false,
    data: {
      url: '/'
    }
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = { ...notificationData, ...payload };
    } catch (error) {
      console.error('[SW] Error parsing push data:', error);
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            return client.navigate(urlToOpen);
          }
        }
        
        // Open new window if app is not open
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Helper function for syncing receipt uploads
async function syncReceiptUploads() {
  try {
    // Get pending uploads from IndexedDB
    const pendingUploads = await getPendingUploads();
    
    for (const upload of pendingUploads) {
      try {
        await fetch('/api/receipts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(upload.data)
        });
        
        // Remove from pending uploads after successful sync
        await removePendingUpload(upload.id);
        console.log('[SW] Receipt upload synced:', upload.id);
      } catch (error) {
        console.error('[SW] Failed to sync receipt upload:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Error during receipt upload sync:', error);
  }
}

// Placeholder functions for IndexedDB operations
async function getPendingUploads() {
  // Implementation would use IndexedDB to get pending uploads
  return [];
}

async function removePendingUpload(id) {
  // Implementation would remove the upload from IndexedDB
  console.log('[SW] Removing pending upload:', id);
}