// Root Service Worker Clean-up Handler
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((k) => k.startsWith('shop-menu-')).map((k) => caches.delete(k))
            );
        }).then(() => self.registration.unregister())
    );
});

