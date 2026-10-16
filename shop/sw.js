const VERSION = 'v1.22.0';
const SHELL_CACHE = `novacart-shell-${VERSION}`;
const ASSET_CACHE = `novacart-assets-${VERSION}`;
const IMAGE_CACHE = `novacart-images-${VERSION}`;
const IMAGE_CACHE_LIMIT = 80;
const ICON_CACHE = 'novacart-icons-v2';
const SETTINGS_KEY = './__nc_settings__';
const ICON_DATA_KEY = './__nc_icon__';
const ICON_PATHS = /\/(?:assets\/)?icon-(?:192|512|maskable-512)\.png$/i;
const MANIFEST_PATH = /\/manifest\.(?:webmanifest|json)(?:\?.*)?$/i;

let appSettings = null;

async function loadAppSettings() {
    if (appSettings !== null) return appSettings;
    try {
        const cache = await caches.open(ICON_CACHE);
        const res = await cache.match(SETTINGS_KEY);
        if (res) {
            appSettings = await res.json();
            return appSettings;
        }
    } catch (err) { /* ignore */ }
    return {
        storeName: 'DolphinMore',
        tagline: 'Your style our collection.',
        primaryColor: '#4f46e5',
        metaDescription: 'Your style our collection. Browse electronics, fashion, footwear, home, beauty, sports, books and accessories.',
        iconUrl: 'https://i.ibb.co/RkygTTzP/dolphin.jpg'
    };
}

function dataUrlToResponse(dataUrl) {
    try {
        const parts = dataUrl.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Response(u8arr, {
            status: 200,
            headers: {
                'Content-Type': mime,
                'Cache-Control': 'public, max-age=31536000'
            }
        });
    } catch (e) {
        return null;
    }
}

async function storeAppSettings(settings, icons) {
    if (!settings) return;
    appSettings = settings;
    try {
        const cache = await caches.open(ICON_CACHE);
        await cache.put(SETTINGS_KEY, new Response(JSON.stringify(settings), {
            headers: { 'Content-Type': 'application/json' }
        }));

        if (icons) {
            const map = [
                ['assets/icon-192.png', icons.icon192],
                ['assets/icon-512.png', icons.icon512],
                ['assets/icon-maskable-512.png', icons.iconMaskable]
            ];
            for (const [path, dataUrl] of map) {
                if (dataUrl) {
                    const res = dataUrlToResponse(dataUrl);
                    if (res) {
                        const filename = path.split('/').pop();
                        await cache.put(path, res.clone());
                        await cache.put('./' + path, res.clone());
                        await cache.put(filename, res.clone());
                        await cache.put(new URL(path, self.location.origin).href, res.clone());
                    }
                }
            }
        }
    } catch (err) {
        console.warn('[sw] failed to store settings', err);
    }
}

async function manifestResponse(request) {
    const s = await loadAppSettings();
    const storeName = (s && s.storeName) || 'DolphinMore';
    const tagline = (s && s.tagline) || '';
    const fullName = storeName + (tagline ? ' — ' + tagline : '');
    const desc = (s && (s.metaDescription || s.footerBlurb)) || (tagline || 'Online shopping');
    const themeColor = (s && s.primaryColor) || '#4f46e5';

    const manifestData = {
        name: fullName,
        short_name: storeName,
        description: desc,
        id: './index.html',
        start_url: './index.html',
        scope: './',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        orientation: 'portrait-primary',
        background_color: '#f4f5fa',
        theme_color: themeColor,
        lang: 'en-IN',
        dir: 'ltr',
        categories: ['shopping', 'lifestyle'],
        icons: [
            {
                src: 'assets/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any'
            },
            {
                src: 'assets/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any'
            },
            {
                src: 'assets/icon-maskable-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable'
            }
        ],
        shortcuts: [
            {
                name: 'Your cart',
                short_name: 'Cart',
                url: './index.html#/cart',
                icons: [{ src: 'assets/icon-192.png', sizes: '192x192', type: 'image/png' }]
            },
            {
                name: 'Wishlist',
                short_name: 'Saved',
                url: './index.html#/wishlist',
                icons: [{ src: 'assets/icon-192.png', sizes: '192x192', type: 'image/png' }]
            },
            {
                name: 'My orders',
                short_name: 'Orders',
                url: './index.html#/orders',
                icons: [{ src: 'assets/icon-192.png', sizes: '192x192', type: 'image/png' }]
            }
        ]
    };

    return new Response(JSON.stringify(manifestData, null, 2), {
        status: 200,
        headers: {
            'Content-Type': 'application/manifest+json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
    });
}

async function iconResponse(request) {
    const url = new URL(request.url);
    const filename = url.pathname.split('/').pop();
    const cache = await caches.open(ICON_CACHE);

    // 1. Look for custom canvas-rendered PNG in ICON_CACHE
    let res = await cache.match(request);
    if (!res) res = await cache.match(filename);
    if (!res) res = await cache.match('./assets/' + filename);
    if (!res) res = await cache.match('assets/' + filename);
    if (res && res.ok && res.type !== 'opaque') return res;

    // 2. Fall back to bundled shell asset (which on disk is the high-res dolphin PNG!)
    const shell = await caches.open(SHELL_CACHE);
    const cached = await shell.match(request);
    if (cached) return cached;
    const cachedRel = await shell.match('./assets/' + filename);
    if (cachedRel) return cachedRel;

    // 3. Fall back to network
    return fetch(request);
}

const SHELL_ASSETS = [
    './',
    './index.html',
    './dolphinadmin.html',
    './manifest.json',
    './css/style.css',
    './css/admin.css',
    './js/connect.js',
    './js/config.js',
    './js/shop-context.js',
    './js/data.js',
    './js/backend.js',
    './js/admin.js',
    './js/store.js',
    './js/ui.js',
    './js/router.js',
    './js/auth.js',
    './js/reviews.js',
    './js/views/categories.js',
    './js/views/home.js',
    './js/views/product.js',
    './js/views/cart.js',
    './js/views/wishlist.js',
    './js/views/checkout.js',
    './js/views/order.js',
    './js/views/info.js',
    './js/app.js',
    './assets/placeholder.svg',
    './assets/icon-192.png',
    './assets/icon-512.png',
    './assets/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) => cache.addAll(SHELL_ASSETS))
            .then(() => self.skipWaiting())
            .catch((err) => console.warn('[sw] precache incomplete', err))
    );
});

self.addEventListener('activate', (event) => {
    const keep = new Set([SHELL_CACHE, ASSET_CACHE, IMAGE_CACHE, ICON_CACHE]);
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

async function trimCache(cacheName, limit) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= limit) return;
    await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone());
    }
    return response;
}

async function networkFirst(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        const shell = await cache.match('./index.html');
        if (shell) return shell;
        throw err;
    }
}

async function networkFirstAsset(request) {
    const cache = await caches.open(ASSET_CACHE);
    try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw err;
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Dynamic Manifest
    if (url.origin === self.location.origin && MANIFEST_PATH.test(url.pathname)) {
        event.respondWith(manifestResponse(request));
        return;
    }

    // Dynamic PWA Icons
    if (url.origin === self.location.origin && ICON_PATHS.test(url.pathname)) {
        event.respondWith(iconResponse(request));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request));
        return;
    }

    if (request.destination === 'image') {
        const isLocal = url.origin === self.location.origin;
        event.respondWith(
            cacheFirst(request, isLocal ? ASSET_CACHE : IMAGE_CACHE)
                .then((response) => {
                    if (!isLocal) trimCache(IMAGE_CACHE, IMAGE_CACHE_LIMIT);
                    return response;
                })
                .catch(() => caches.match('./assets/placeholder.svg'))
        );
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(networkFirstAsset(request));
        return;
    }

    event.respondWith(fetch(request).catch(() => Promise.reject(new Error('offline'))));
});

self.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) return;
    if (data === 'skip-waiting') { self.skipWaiting(); return; }
    if (data.type === 'nc:settings') {
        event.waitUntil(storeAppSettings(data.settings, data.icons));
    }
});