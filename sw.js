const APP_VERSION = 'v1.0.0';
const CACHE_NAME = `study-os-${APP_VERSION}`;

// Core assets required for the app shell to boot instantly
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './assets/favicon.svg',
    './assets/icon-192.png',
    './assets/icon-512.png',
    './css/variables.css',
    './css/style.css',
    './css/layout.css',
    './css/components.css',
    './css/home.css',
    './css/dashboard.css',
    './css/syllabus.css',
    './css/mocks.css',
    './css/routine.css',
    './js/storage.js',
    './js/ui.js',
    './js/dashboard.js',
    './js/mocks.js',
    './js/timer.js',
    './js/routine.js',
    './js/app.js',
    './js/events.js',
    './js/backup.js',
    './js/syllabus.js',
    './data/cgl.json',
    './data/ntpc.json',
    './data/upsc.json'
];

// INSTALLATION: Cache the App Shell and force immediate activation
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Forces the waiting service worker to become the active service worker
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching App Shell');
            return cache.addAll(APP_SHELL);
        })
    );
});

// ACTIVATION: Clean up old caches from previous versions to save space
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of all open pages immediately
    );
});

// FETCHING: "Stale-While-Revalidate" Strategy
self.addEventListener('fetch', (event) => {
    // Ignore non-GET requests and browser extensions
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // 1. Fetch the latest version from the network in the background
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Network failed (offline), do nothing since we serve cache anyway
            });

            // 2. Return the cached response immediately if it exists (0ms load time),
            // otherwise wait for the network response.
            return cachedResponse || fetchPromise;
        })
    );
});