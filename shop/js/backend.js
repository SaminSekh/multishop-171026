/* ============================================================
   NovaCart — backend layer
   Bridges the storefront to Supabase (data) and imgbb (images).
   Falls back to localStorage when
   Supabase is not configured or offline.
   ============================================================ */
(function () {
    'use strict';

    var CACHE = {
        products: 'novacart_admin_products',
        settings: 'novacart_admin_settings',
        orders: 'novacart_admin_orders',
        users: 'novacart_admin_users',
        bans: 'novacart_admin_bans'
    };

    var STORE_ORDERS_KEY = 'novacart_orders';
    var USERS_KEY = 'novacart_users';
    var REVIEWS_KEY = 'novacart_reviews';
    var BANS_KEY = 'novacart_bans';
    var VISITOR_IP_KEY = 'novacart_visitor_ip';

    var cfg = (window.NC_CONFIG || {});
    var supa = cfg.supabase || {};
    var imgbbCfg = cfg.imgbb || {};

    function isPlaceholder(value) {
        if (!value) return true;
        return /YOUR-|your-|xxxx|placeholder|^$/i.test(String(value));
    }

    function isConfigured() {
        return !isPlaceholder(supa.url) && !isPlaceholder(supa.anonKey) &&
            /^https?:\/\//i.test(String(supa.url || ''));
    }

    function hasImgbb() {
        return !isPlaceholder(imgbbCfg.key);
    }

    /* ---------------- local cache ---------------- */

    function readCache(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function writeCache(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { }
    }

    /* ---------------- Supabase REST ---------------- */

    function rest(path, opts) {
        opts = opts || {};
        var base = String(supa.url).replace(/\/+$/, '') + '/rest/v1/' + path;
        var headers = {
            apikey: supa.anonKey,
            Authorization: 'Bearer ' + supa.anonKey,
            Accept: 'application/json'
        };
        if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
        if (supa.apiSchema) headers['Accept-Profile'] = supa.apiSchema;
        if (opts.body !== undefined) headers['Content-Profile'] = supa.apiSchema;
        if (opts.prefer) headers.Prefer = opts.prefer;

        return fetch(base, {
            method: opts.method || 'GET',
            headers: headers,
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
        }).then(function (res) {
            if (!res.ok) {
                return res.text().then(function (text) {
                    var message = text;
                    try { message = JSON.parse(text).message || text; } catch (e) { }
                    throw new Error('Supabase ' + res.status + ': ' + message);
                });
            }
            if (res.status === 204) return null;
            return res.text().then(function (text) {
                return text ? JSON.parse(text) : null;
            });
        });
    }

    /* ---------------- record <-> row mapping ---------------- */

    function rowToRecord(row) {
        var price = Number(row.price) || 0;
        var mrp = Number(row.mrp) || 0;
        return {
            id: row.id,
            name: row.name,
            brand: row.brand || '',
            category: row.category || '',
            price: price,
            mrp: mrp,
            discountPct: (mrp > price && mrp > 0) ? Math.round(((mrp - price) / mrp) * 100) : 0,
            rating: Number(row.rating) || 4.5,
            reviewCount: row.review_count || 0,
            stock: row.stock || 0,
            images: row.images || [],
            colors: row.colors || [],
            sizes: row.sizes || [],
            description: row.description || '',
            highlights: row.highlights || [],
            badges: row.badges || [],
            keywords: row.keywords || '',
            visible: row.visible !== false,
            sortOrder: row.sort_order || 0
        };
    }

    function recordToRow(rec) {
        return {
            id: rec.id,
            name: rec.name,
            brand: rec.brand || '',
            category: rec.category || '',
            price: Number(rec.price) || 0,
            mrp: Number(rec.mrp) || 0,
            rating: Number(rec.rating) || 4.5,
            review_count: parseInt(rec.reviewCount, 10) || 0,
            stock: parseInt(rec.stock, 10) || 0,
            images: rec.images || [],
            colors: rec.colors || [],
            sizes: rec.sizes || [],
            description: rec.description || '',
            highlights: rec.highlights || [],
            badges: rec.badges || [],
            keywords: rec.keywords || '',
            visible: rec.visible !== false,
            sort_order: parseInt(rec.sortOrder, 10) || 0,
            updated_at: new Date().toISOString()
        };
    }

    function normalizeRecord(rec) {
        rec = rec || {};
        var price = Number(rec.price) || 0;
        var mrp = Number(rec.mrp) || 0;
        return {
            id: String(rec.id || '').trim() || ('p' + Date.now().toString(36)),
            name: String(rec.name || '').trim(),
            brand: String(rec.brand || '').trim(),
            category: String(rec.category || '').trim(),
            price: price,
            mrp: mrp,
            discountPct: (mrp > price && mrp > 0) ? Math.round(((mrp - price) / mrp) * 100) : 0,
            rating: Number(rec.rating) || 4.5,
            reviewCount: parseInt(rec.reviewCount, 10) || 0,
            stock: parseInt(rec.stock, 10) || 0,
            images: toArray(rec.images),
            colors: toColors(rec.colors),
            sizes: toArray(rec.sizes),
            description: String(rec.description || ''),
            highlights: toArray(rec.highlights),
            badges: toArray(rec.badges),
            keywords: Array.isArray(rec.keywords) ? rec.keywords.join(',') : String(rec.keywords || ''),
            visible: rec.visible !== false,
            sortOrder: parseInt(rec.sortOrder, 10) || 0
        };
    }

    function toArray(value) {
        if (Array.isArray(value)) return value.map(function (v) { return String(v == null ? '' : v).trim(); }).filter(Boolean);
        return String(value == null ? '' : value).split(/[\n,]/).map(function (v) { return v.trim(); }).filter(Boolean);
    }

    function toColors(value) {
        if (!Array.isArray(value)) return [];
        return value.map(function (c) {
            var name, hex, image, sizes, stock, sizeStock;
            if (Array.isArray(c)) {
                name = c[0]; hex = c[1]; image = c[2]; sizes = c[3]; stock = c[4]; sizeStock = c[5];
            } else if (c && typeof c === 'object') {
                name = c.name; hex = c.hex || c.value; image = c.image || c.img || c.imageUrl; sizes = c.sizes; stock = c.stock;
                sizeStock = c.sizeStock || c.sizesStock;
            } else {
                name = c; hex = '#cccccc';
            }
            var qty = null;
            if (stock !== undefined && stock !== null && stock !== '') {
                qty = Math.max(0, parseInt(stock, 10) || 0);
            }
            var bySize = null;
            if (sizeStock && typeof sizeStock === 'object' && !Array.isArray(sizeStock)) {
                bySize = {};
                Object.keys(sizeStock).forEach(function (key) {
                    var v = sizeStock[key];
                    if (v !== undefined && v !== null && v !== '') {
                        bySize[String(key).trim()] = Math.max(0, parseInt(v, 10) || 0);
                    }
                });
                if (!Object.keys(bySize).length) bySize = null;
            }
            return [
                String(name || '').trim(),
                String(hex || '#cccccc').trim(),
                String(image || '').trim(),
                toArray(sizes),
                qty,
                bySize
            ];
        }).filter(function (c) { return c[0]; });
    }

    /* ---------------- products (multishop) ---------------- */

    function asObj(value) {
        if (!value) return {};
        if (typeof value === 'object') return value;
        if (typeof value === 'string') {
            try { return JSON.parse(value) || {}; } catch (e) { return {}; }
        }
        return {};
    }

    function asList(value) {
        if (Array.isArray(value)) return value;
        if (value == null || value === '') return [];
        if (typeof value === 'string') {
            var s = value.trim();
            if (!s) return [];
            try {
                var parsed = JSON.parse(s);
                if (Array.isArray(parsed)) return parsed;
                if (parsed && typeof parsed === 'object') return [parsed];
            } catch (e) { }
            return s.split(/[\n,]/).map(function (x) { return x.trim(); }).filter(Boolean);
        }
        return [];
    }

    // Map a multishop `products` row to the storefront product record shape.
    function shopRowToRecord(row) {
        var meta = asObj(row.metadata);
        var images = asList(row.product_images);
        if (!images.length && row.product_image) images = [row.product_image];
        var price = Number(row.selling_price) || 0;
        var mrp = Number(meta.mrp || meta.original_price || meta.mrp_price) || price;

        var attrs = asObj(meta.attributes);

        var colorSrc = asList(meta.colors);
        if (!colorSrc.length) colorSrc = asList(meta.available_colors);
        if (!colorSrc.length) colorSrc = asList(meta.color);
        if (!colorSrc.length) colorSrc = asList(attrs.color);
        if (!colorSrc.length && attrs.color_stock) colorSrc = Object.keys(attrs.color_stock);
        var colors = colorSrc.map(function (c) {
            if (c && typeof c === 'object') return c;
            return { name: String(c == null ? '' : c).trim() };
        }).filter(function (c) {
            var n = String((c && c.name) || '').trim().toLowerCase();
            return n && n !== 'all';
        });

        var sizeSrc = asList(meta.sizes);
        if (!sizeSrc.length) sizeSrc = asList(meta.available_sizes);
        if (!sizeSrc.length) sizeSrc = asList(meta.size);
        if (!sizeSrc.length) sizeSrc = asList(attrs.size);
        if (!sizeSrc.length) {
            var stockMap = asObj(meta.size_stock);
            if (!Object.keys(stockMap).length) stockMap = asObj(attrs.size_stock);
            sizeSrc = Object.keys(stockMap);
        }
        var sizes = sizeSrc.map(function (s) {
            return s && typeof s === 'object' ? (s.name || s.value || '') : s;
        }).filter(function (s) {
            var n = String(s == null ? '' : s).trim().toLowerCase();
            return n && n !== 'all';
        });

        return {
            id: row.id,
            name: row.product_name || 'Untitled product',
            brand: meta.brand || row.type || '',
            category: row.category || meta.category || row.type || 'General',
            price: price,
            mrp: mrp,
            rating: Number(meta.rating) || 4.5,
            reviewCount: parseInt(meta.reviewCount || meta.review_count, 10) || 0,
            stock: parseInt(row.stock, 10) || 0,
            images: images,
            colors: colors,
            sizes: sizes,
            description: row.description || meta.description || '',
            highlights: asList(meta.highlights),
            badges: asList(meta.badges),
            keywords: asList(meta.keywords).join(', ') ||
                [row.product_name, row.category, row.sku].filter(Boolean).join(' '),
            visible: row.show_in_store !== false,
            sortOrder: Number(row.priority) || 0,
            sku: row.sku || ''
        };
    }

    function listProducts() {
        if (!isConfigured()) return Promise.resolve(localRecords());
        if (!NC.shop || !NC.shop.id) return Promise.resolve(localRecords());
        return rest('products?select=*&shop_id=eq.' + encodeURIComponent(NC.shop.id) +
            '&order=priority.asc,created_at.desc')
            .then(function (rows) {
                var records = (rows || []).map(shopRowToRecord);
                if (records.length) writeCache(CACHE.products, records);
                return records;
            })
            .catch(function (err) {
                console.warn('[backend] product read failed, using local cache:', err.message || err);
                return localRecords();
            });
    }

    function saveProduct(record) {
        var rec = normalizeRecord(record);
        if (!rec.id) rec.id = 'p' + Date.now().toString(36);
        if (!isConfigured()) {
            var all = localRecords();
            upsertLocal(all, rec);
            writeCache(CACHE.products, all);
            return Promise.resolve(rec);
        }
        return rest('products', {
            method: 'POST',
            body: recordToRow(rec),
            prefer: 'resolution=merge-duplicates,return=representation'
        }).then(function (rows) {
            return rows && rows[0] ? rowToRecord(rows[0]) : rec;
        }).catch(function (err) {
            console.warn('[backend] product save failed, using local cache:', err.message || err);
            var all = localRecords();
            upsertLocal(all, rec);
            writeCache(CACHE.products, all);
            return rec;
        });
    }

    function deleteProduct(id) {
        if (!isConfigured()) {
            var all = localRecords().filter(function (r) { return r.id !== id; });
            writeCache(CACHE.products, all);
            return Promise.resolve();
        }
        return rest('products?id=eq.' + encodeURIComponent(id), {
            method: 'DELETE',
            prefer: 'return=minimal'
        });
    }

    function importRecords(records) {
        var seen = {};
        var incoming = (records || []).map(normalizeRecord).filter(function (r) {
            if (!r.id || seen[r.id]) return false;
            seen[r.id] = true;
            return true;
        });

        return existingRecords().then(function (existing) {
            existing = existing || [];
            var have = {};
            existing.forEach(function (r) { have[r.id] = true; });
            var added = incoming.filter(function (r) { return !have[r.id]; });
            var result = { added: added.length, skipped: incoming.length - added.length, total: incoming.length };

            var store = function () {
                var merged = existing.slice();
                added.forEach(function (r) { merged.push(r); });
                merged.sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
                writeCache(CACHE.products, merged);
                return result;
            };

            if (!isConfigured()) return store();
            if (!added.length) return result;
            return rest('products', {
                method: 'POST',
                body: added.map(recordToRow),
                prefer: 'resolution=merge-duplicates,return=minimal'
            }).then(store);
        });
    }

    function existingRecords() {
        if (isConfigured()) return listProducts();
        var cached = readCache(CACHE.products, null);
        if (cached) return Promise.resolve(cached);
        return Promise.resolve(localRecords());
    }

    function upsertLocal(all, rec) {
        var found = false;
        all.forEach(function (r, i) { if (r.id === rec.id) { all[i] = rec; found = true; } });
        if (!found) all.push(rec);
        all.sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
    }

    function localRecords() {
        var cached = readCache(CACHE.products, null);
        if (cached && cached.length) return cached;
        return NC.data.rawRecords();
    }

    /* ---------------- orders ---------------- */

    function normalizeOrder(order) {
        order = order || {};
        return {
            id: String(order.id || '').trim() || ('NC-' + Date.now().toString(36).toUpperCase()),
            placedAt: order.placedAt || new Date().toISOString(),
            status: String(order.status || 'pending'),
            userId: String(order.userId || ''),
            items: Array.isArray(order.items) ? order.items : [],
            totals: order.totals || {},
            address: order.address || {},
            payment: order.payment || '',
            delivery: order.delivery || {},
            estimatedDelivery: order.estimatedDelivery || order.estimated_delivery || null,
            stockApplied: !!order.stockApplied
        };
    }

    function orderToRow(order) {
        return {
            id: order.id,
            shop_id: (NC.shop && NC.shop.id) || null,
            status: order.status || 'pending',
            data: order,
            created_at: order.placedAt || new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    }

    function rowToOrder(row) {
        var order = row.data;
        if (typeof order === 'string') {
            try { order = JSON.parse(order); } catch (e) { order = {}; }
        }
        order = (order && typeof order === 'object') ? order : {};
        order.id = row.id;
        order.status = row.status || order.status || 'pending';
        if (row.created_at && !order.placedAt) order.placedAt = row.created_at;
        return normalizeOrder(order);
    }

    function localOrders() {
        var byId = {};
        readCache(STORE_ORDERS_KEY, []).forEach(function (o) {
            if (o && o.id) byId[o.id] = normalizeOrder(o);
        });
        readCache(CACHE.orders, []).forEach(function (o) {
            if (o && o.id) byId[o.id] = normalizeOrder(o);
        });
        return Object.keys(byId).map(function (k) { return byId[k]; }).sort(function (a, b) {
            return new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime();
        });
    }

    function upsertOrderLocal(all, rec) {
        var found = false;
        all.forEach(function (o, i) { if (o.id === rec.id) { all[i] = rec; found = true; } });
        if (!found) all.push(rec);
    }

    function listOrders() {
        if (!isConfigured()) return Promise.resolve(localOrders());
        var shopFilter = (NC.shop && NC.shop.id)
            ? ('&shop_id=eq.' + encodeURIComponent(NC.shop.id)) : '';
        return rest('orders?select=*' + shopFilter + '&order=created_at.desc').then(function (rows) {
            var orders = (rows || []).map(rowToOrder);
            writeCache(CACHE.orders, orders);
            return orders;
        }).catch(function (err) {
            console.warn('[backend] order read failed, using local cache:', err.message || err);
            return localOrders();
        });
    }

    function saveOrder(order) {
        var rec = normalizeOrder(order);
        if (!isConfigured()) {
            var all = localOrders();
            upsertOrderLocal(all, rec);
            writeCache(CACHE.orders, all);
            return Promise.resolve(rec);
        }
        return rest('orders', {
            method: 'POST',
            body: orderToRow(rec),
            prefer: 'resolution=merge-duplicates,return=representation'
        }).then(function (rows) {
            return rows && rows[0] ? rowToOrder(rows[0]) : rec;
        }).catch(function (err) {
            console.warn('[backend] order save failed, using local cache:', err.message || err);
            var all = localOrders();
            upsertOrderLocal(all, rec);
            writeCache(CACHE.orders, all);
            return rec;
        });
    }

    function updateOrderStatus(id, status) {
        id = String(id || '').trim();
        status = String(status || 'pending');
        if (!isConfigured()) {
            var all = localOrders();
            all.forEach(function (o) { if (o.id === id) o.status = status; });
            writeCache(CACHE.orders, all);
            return Promise.resolve({ id: id, status: status });
        }
        return rest('orders?id=eq.' + encodeURIComponent(id), {
            method: 'PATCH',
            body: { status: status, updated_at: new Date().toISOString() },
            prefer: 'return=minimal'
        }).then(function () {
            return { id: id, status: status };
        }).catch(function (err) {
            console.warn('[backend] order status update failed, using local cache:', err.message || err);
            var all = localOrders();
            all.forEach(function (o) { if (o.id === id) o.status = status; });
            writeCache(CACHE.orders, all);
            return { id: id, status: status };
        });
    }

    function purgeLocalOrder(id) {
        [CACHE.orders, STORE_ORDERS_KEY].forEach(function (key) {
            var list = readCache(key, null);
            if (Array.isArray(list)) {
                writeCache(key, list.filter(function (o) { return !o || o.id !== id; }));
            }
        });
    }

    function deleteOrder(id) {
        id = String(id || '').trim();
        if (!isConfigured()) {
            purgeLocalOrder(id);
            return Promise.resolve();
        }
        return rest('orders?id=eq.' + encodeURIComponent(id), {
            method: 'DELETE',
            prefer: 'return=minimal'
        }).then(function () {
            purgeLocalOrder(id);
        }).catch(function (err) {
            console.warn('[backend] order delete failed, using local cache:', err.message || err);
            purgeLocalOrder(id);
        });
    }

    /* ---------------- reviews (user ratings & reviews) ---------------- */

    function normalizeReview(rec) {
        rec = rec || {};
        return {
            id: String(rec.id || '').trim() || ('rv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
            productId: String(rec.productId || '').trim(),
            userId: String(rec.userId || '').trim(),
            name: String(rec.name || '').trim(),
            stars: Math.max(1, Math.min(5, parseInt(rec.stars, 10) || 5)),
            text: String(rec.text || '').trim(),
            createdAt: rec.createdAt || new Date().toISOString()
        };
    }

    function reviewToRow(review) {
        return {
            id: review.id,
            product_id: review.productId,
            user_id: review.userId,
            data: review,
            created_at: review.createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    }

    function rowToReview(row) {
        var review = row.data;
        if (typeof review === 'string') {
            try { review = JSON.parse(review); } catch (e) { review = {}; }
        }
        review = (review && typeof review === 'object') ? review : {};
        review.id = row.id;
        if (row.created_at && !review.createdAt) review.createdAt = row.created_at;
        return normalizeReview(review);
    }

    function localReviews() {
        var list = readCache(REVIEWS_KEY, []);
        return (Array.isArray(list) ? list : []).map(normalizeReview);
    }

    function upsertReviewLocal(all, rec) {
        var found = false;
        all.forEach(function (r, i) { if (r.id === rec.id) { all[i] = rec; found = true; } });
        if (!found) all.push(rec);
    }

    function listReviews() {
        if (!isConfigured()) return Promise.resolve(localReviews());
        return rest('reviews?select=*&order=created_at.desc').then(function (rows) {
            var reviews = (rows || []).map(rowToReview);
            writeCache(REVIEWS_KEY, reviews);
            return reviews;
        }).catch(function (err) {
            console.warn('[backend] review read failed, using local cache:', err.message || err);
            return localReviews();
        });
    }

    function saveReview(review) {
        var rec = normalizeReview(review);
        if (!isConfigured()) {
            var local = localReviews();
            upsertReviewLocal(local, rec);
            writeCache(REVIEWS_KEY, local);
            return Promise.resolve(rec);
        }
        return rest('reviews', {
            method: 'POST',
            body: reviewToRow(rec),
            prefer: 'resolution=merge-duplicates,return=representation'
        }).then(function (rows) {
            return rows && rows[0] ? rowToReview(rows[0]) : rec;
        }).catch(function (err) {
            console.warn('[backend] review save failed, using local cache:', err.message || err);
            var local = localReviews();
            upsertReviewLocal(local, rec);
            writeCache(REVIEWS_KEY, local);
            return rec;
        });
    }

    function deleteReview(id) {
        id = String(id || '').trim();
        if (!isConfigured()) {
            writeCache(REVIEWS_KEY, localReviews().filter(function (r) { return r.id !== id; }));
            return Promise.resolve();
        }
        return rest('reviews?id=eq.' + encodeURIComponent(id), {
            method: 'DELETE',
            prefer: 'return=minimal'
        }).catch(function (err) {
            console.warn('[backend] review delete failed, using local cache:', err.message || err);
            writeCache(REVIEWS_KEY, localReviews().filter(function (r) { return r.id !== id; }));
        });
    }

    /* ---------------- users (shopper accounts) ---------------- */

    function dedupeAddresses(list) {
        if (!Array.isArray(list)) return [];
        var seen = {};
        var out = [];
        list.forEach(function (a) {
            if (!a || typeof a !== 'object') return;
            var key = [a.line1, a.line2, a.city, a.state, a.pincode].map(function (v) {
                return String(v == null ? '' : v).trim().toLowerCase();
            }).join('|');
            if (seen[key]) return;
            seen[key] = true;
            out.push(a);
        });
        return out;
    }

    function normalizeUser(user) {
        user = user || {};
        return {
            id: String(user.id || '').trim() || ('u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
            name: String(user.name || '').trim(),
            phone: String(user.phone || '').replace(/\D/g, ''),
            password: user.password != null ? String(user.password) : '',
            addresses: dedupeAddresses(user.addresses),
            cart: Array.isArray(user.cart) ? user.cart : [],
            cartRemoved: Array.isArray(user.cartRemoved) ? user.cartRemoved
                : (Array.isArray(user.cart_removed) ? user.cart_removed : []),
            visits: Math.max(0, parseInt(user.visits, 10) || 0),
            lastVisit: user.lastVisit || user.last_visit || null,
            banned: user.banned === true || user.banned === 'true',
            lastIp: String(user.lastIp || user.last_ip || '').trim(),
            createdAt: user.createdAt || user.created_at || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    function userToRow(user) {
        return {
            id: user.id,
            name: user.name,
            phone: user.phone,
            password: user.password,
            addresses: user.addresses,
            cart: user.cart,
            created_at: user.createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    }

    function rowToUser(row) {
        return normalizeUser({
            id: row.id,
            name: row.name,
            phone: row.phone,
            password: row.password,
            addresses: row.addresses,
            cart: row.cart,
            cartRemoved: row.cart_removed,
            visits: row.visits,
            lastVisit: row.last_visit,
            banned: row.banned,
            lastIp: row.last_ip,
            createdAt: row.created_at
        });
    }

    function localUsers() {
        return readCache(USERS_KEY, []).map(normalizeUser);
    }

    function upsertUserLocal(all, rec) {
        var found = false;
        all.forEach(function (u, i) { if (u.id === rec.id) { all[i] = rec; found = true; } });
        if (!found) all.push(rec);
    }

    function writeUsersLocal(list) {
        writeCache(USERS_KEY, list);
        writeCache(CACHE.users, list);
    }

    function listUsers() {
        if (!isConfigured()) return Promise.resolve(localUsers());
        return rest('users?select=*&order=created_at.desc').then(function (rows) {
            var users = (rows || []).map(rowToUser);
            users.forEach(function (u) {
                var local = localRemovedFor(u.id);
                if (!local.length) return;
                var merged = (u.cartRemoved || []).slice();
                local.forEach(function (x) {
                    if (!x) return;
                    var dup = merged.some(function (m) {
                        return m && String(m.id) === String(x.id) &&
                            (m.color || null) === (x.color || null) &&
                            (m.size || null) === (x.size || null);
                    });
                    if (!dup) merged.push(x);
                });
                u.cartRemoved = merged;
            });
            writeCache(CACHE.users, users);
            return users;
        }).catch(function (err) {
            console.warn('[backend] user read failed, using local cache:', err.message || err);
            return localUsers();
        });
    }

    function getUserByPhone(phone) {
        var digitsPhone = String(phone || '').replace(/\D/g, '');
        if (!isConfigured()) {
            var found = null;
            localUsers().forEach(function (u) { if (u.phone === digitsPhone) found = u; });
            return Promise.resolve(found);
        }
        return rest('users?select=*&phone=eq.' + encodeURIComponent(digitsPhone) + '&limit=1')
            .then(function (rows) {
                return rows && rows[0] ? rowToUser(rows[0]) : null;
            });
    }

    function getUser(id) {
        id = String(id || '').trim();
        if (!id) return Promise.resolve(null);
        if (!isConfigured()) {
            var found = null;
            localUsers().forEach(function (u) { if (u.id === id) found = u; });
            return Promise.resolve(found);
        }
        return rest('users?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1')
            .then(function (rows) {
                return rows && rows[0] ? rowToUser(rows[0]) : null;
            });
    }

    function saveUser(user) {
        var rec = normalizeUser(user);
        // Generic account saves (profile edits, password, cart) must not reset
        // the visit counter. Cloud rows omit the column; local rows merge it.
        var visitsProvided = user != null && (user.visits != null || user.lastVisit != null || user.last_visit != null);
        if (!isConfigured()) {
            var all = localUsers();
            if (!visitsProvided) {
                all.forEach(function (u) {
                    if (u.id === rec.id) { rec.visits = u.visits; rec.lastVisit = u.lastVisit; }
                });
            }
            upsertUserLocal(all, rec);
            writeUsersLocal(all);
            return Promise.resolve(rec);
        }
        return rest('users', {
            method: 'POST',
            body: userToRow(rec),
            prefer: 'resolution=merge-duplicates,return=representation'
        }).then(function (rows) {
            return rows && rows[0] ? rowToUser(rows[0]) : rec;
        });
    }

    function deleteUser(id) {
        id = String(id || '').trim();
        if (!isConfigured()) {
            writeUsersLocal(localUsers().filter(function (u) { return u.id !== id; }));
            return Promise.resolve();
        }
        return rest('users?id=eq.' + encodeURIComponent(id), {
            method: 'DELETE',
            prefer: 'return=minimal'
        });
    }

    function saveUserCart(id, cart) {
        id = String(id || '').trim();
        if (!id) return Promise.resolve();
        var lines = Array.isArray(cart) ? cart : [];
        if (!isConfigured()) {
            var all = localUsers();
            all.forEach(function (u) { if (u.id === id) u.cart = lines; });
            writeUsersLocal(all);
            return Promise.resolve();
        }
        return rest('users?id=eq.' + encodeURIComponent(id), {
            method: 'PATCH',
            body: { cart: lines, updated_at: new Date().toISOString() },
            prefer: 'return=minimal'
        });
    }

    function mirrorUserPatch(id, patch) {
        var all = localUsers();
        var hit = null;
        all.forEach(function (u) { if (u.id === id) hit = u; });
        if (!hit) {
            hit = normalizeUser({ id: id });
            all.push(hit);
        }
        for (var k in patch) hit[k] = patch[k];
        writeUsersLocal(all);
        return true;
    }

    function localRemovedFor(id) {
        var found = null;
        localUsers().forEach(function (u) { if (u.id === id) found = u; });
        return (found && Array.isArray(found.cartRemoved)) ? found.cartRemoved : [];
    }

    function saveUserCartRemoved(id, list) {
        id = String(id || '').trim();
        if (!id) return Promise.resolve();
        var lines = Array.isArray(list) ? list : [];
        mirrorUserPatch(id, { cartRemoved: lines });
        if (!isConfigured()) return Promise.resolve();
        return rest('users?id=eq.' + encodeURIComponent(id), {
            method: 'PATCH',
            body: { cart_removed: lines, updated_at: new Date().toISOString() },
            prefer: 'return=minimal'
        }).catch(function (err) {
            console.warn('[backend] could not save cart_removed to Supabase — run supabase-schema.sql so the cart_removed column exists:', err.message || err);
        });
    }

    // Record that a shopper added a line to the cart and later removed it.
    function recordCartRemoval(id, line) {
        id = String(id || '').trim();
        if (!id || !line || !line.id) return Promise.resolve();
        var entry = {
            id: String(line.id),
            qty: Math.max(1, parseInt(line.qty, 10) || 1),
            color: line.color || null,
            size: line.size || null,
            removedAt: new Date().toISOString()
        };
        return getUser(id).catch(function () { return null; }).then(function (user) {
            var base = (user && Array.isArray(user.cartRemoved)) ? user.cartRemoved : localRemovedFor(id);
            var list = base.filter(function (x) {
                return !(x && String(x.id) === entry.id &&
                    (x.color || null) === entry.color &&
                    (x.size || null) === entry.size);
            });
            list.unshift(entry);
            return saveUserCartRemoved(id, list.slice(0, 50));
        }).catch(function (err) {
            console.warn('[backend] cart removal record failed:', err && err.message);
        });
    }

    // Count a storefront visit for a signed-in shopper. The storefront calls
    // this once per page load (and on sign-in). Returns the new count.
    function recordVisit(id) {
        id = String(id || '').trim();
        if (!id) return Promise.resolve(null);
        var nowIso = new Date().toISOString();

        if (!isConfigured()) {
            var all = localUsers();
            var hit = null;
            all.forEach(function (u) {
                if (u.id === id) { u.visits = (u.visits || 0) + 1; u.lastVisit = nowIso; hit = u; }
            });
            if (hit) writeUsersLocal(all);
            return Promise.resolve(hit);
        }

        return getUser(id).then(function (user) {
            if (!user) return null;
            var visits = (user.visits || 0) + 1;
            return rest('users?id=eq.' + encodeURIComponent(id), {
                method: 'PATCH',
                body: { visits: visits, last_visit: nowIso },
                prefer: 'return=minimal'
            }).then(function () {
                return { visits: visits, lastVisit: nowIso };
            });
        }).catch(function (err) {
            console.warn('[backend] visit record failed:', err && err.message);
            return null;
        });
    }

    /* ---------------- bans (blocked shoppers & IPs) ---------------- */

    function normalizeBan(ban) {
        ban = ban || {};
        return {
            id: String(ban.id || '').trim() || ('b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
            ip: String(ban.ip || '').trim(),
            userId: String(ban.userId || ban.user_id || '').trim(),
            phone: String(ban.phone || '').replace(/\D/g, ''),
            reason: String(ban.reason || '').trim(),
            createdAt: ban.createdAt || ban.created_at || new Date().toISOString()
        };
    }

    function banToRow(b) {
        return {
            id: b.id,
            ip: b.ip || null,
            user_id: b.userId || null,
            phone: b.phone || null,
            reason: b.reason || '',
            created_at: b.createdAt || new Date().toISOString()
        };
    }

    function rowToBan(row) {
        return normalizeBan({
            id: row.id, ip: row.ip, userId: row.user_id,
            phone: row.phone, reason: row.reason, createdAt: row.created_at
        });
    }

    function localBans() { return readCache(BANS_KEY, []).map(normalizeBan); }
    function writeBansLocal(list) { writeCache(BANS_KEY, list); writeCache(CACHE.bans, list); }

    function listBans() {
        if (!isConfigured()) return Promise.resolve(localBans());
        return rest('bans?select=*&order=created_at.desc').then(function (rows) {
            var bans = (rows || []).map(rowToBan);
            writeCache(CACHE.bans, bans);
            return bans;
        }).catch(function (err) {
            console.warn('[backend] ban read failed, using local cache:', err.message || err);
            return localBans();
        });
    }

    function saveBan(ban) {
        var rec = normalizeBan(ban);
        if (!rec.ip && !rec.userId && !rec.phone) return Promise.resolve(null);
        if (!isConfigured()) {
            var all = localBans();
            all.unshift(rec);
            writeBansLocal(all);
            return Promise.resolve(rec);
        }
        return rest('bans', {
            method: 'POST',
            body: banToRow(rec),
            prefer: 'resolution=merge-duplicates,return=representation'
        }).then(function (rows) {
            return rows && rows[0] ? rowToBan(rows[0]) : rec;
        }).catch(function (err) {
            console.warn('[backend] ban save failed — run supabase-schema.sql so the bans table exists:', err.message || err);
            return rec;
        });
    }

    function deleteBan(id) {
        id = String(id || '').trim();
        if (!id) return Promise.resolve();
        if (!isConfigured()) {
            writeBansLocal(localBans().filter(function (b) { return b.id !== id; }));
            return Promise.resolve();
        }
        return rest('bans?id=eq.' + encodeURIComponent(id), {
            method: 'DELETE', prefer: 'return=minimal'
        }).catch(function (err) { console.warn('[backend] ban delete failed:', err.message || err); });
    }

    // Remove every ban tied to a shopper (by account id and/or mobile).
    function clearBansForUser(userId, phone) {
        userId = String(userId || '').trim();
        phone = String(phone || '').replace(/\D/g, '');
        var keep = function (b) {
            if (userId && b.userId === userId) return false;
            if (phone && b.phone === phone) return false;
            return true;
        };
        if (!isConfigured()) {
            writeBansLocal(localBans().filter(keep));
            return Promise.resolve();
        }
        var tasks = [];
        if (userId) tasks.push(rest('bans?user_id=eq.' + encodeURIComponent(userId), { method: 'DELETE', prefer: 'return=minimal' }));
        if (phone) tasks.push(rest('bans?phone=eq.' + encodeURIComponent(phone), { method: 'DELETE', prefer: 'return=minimal' }));
        if (!tasks.length) return Promise.resolve();
        return Promise.all(tasks).catch(function (err) { console.warn('[backend] ban clear failed:', err.message || err); });
    }

    function setUserBanned(id, banned) {
        id = String(id || '').trim();
        if (!id) return Promise.resolve();
        var flag = banned === true;
        mirrorUserPatch(id, { banned: flag });
        if (!isConfigured()) return Promise.resolve();
        return rest('users?id=eq.' + encodeURIComponent(id), {
            method: 'PATCH',
            body: { banned: flag, updated_at: new Date().toISOString() },
            prefer: 'return=minimal'
        }).catch(function (err) {
            console.warn('[backend] could not set ban flag — run supabase-schema.sql so the banned column exists:', err.message || err);
        });
    }

    function setUserLastIp(id, ip) {
        id = String(id || '').trim();
        ip = String(ip || '').trim();
        if (!id || !ip) return Promise.resolve();
        mirrorUserPatch(id, { lastIp: ip });
        if (!isConfigured()) return Promise.resolve();
        return rest('users?id=eq.' + encodeURIComponent(id), {
            method: 'PATCH',
            body: { last_ip: ip, updated_at: new Date().toISOString() },
            prefer: 'return=minimal'
        }).catch(function (err) {
            console.warn('[backend] could not store last_ip — run supabase-schema.sql so the last_ip column exists:', err.message || err);
        });
    }

    // Best-effort public IP of the current visitor (needs a network round trip).
    function getVisitorIp() {
        var cached = null;
        try { cached = sessionStorage.getItem(VISITOR_IP_KEY); } catch (e) { }
        if (cached) return Promise.resolve(cached);
        return fetch('https://api.ipify.org?format=json', { cache: 'no-store' })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                var ip = data && data.ip ? String(data.ip).trim() : '';
                if (ip) { try { sessionStorage.setItem(VISITOR_IP_KEY, ip); } catch (e) { } }
                return ip;
            })
            .catch(function () { return ''; });
    }

    // Returns the first ban matching the visitor (by IP, account id or mobile).
    function checkBan(ip, userId, phone) {
        ip = String(ip || '').trim();
        userId = String(userId || '').trim();
        phone = String(phone || '').replace(/\D/g, '');
        return listBans().then(function (bans) {
            var hit = null;
            (bans || []).forEach(function (b) {
                if (hit) return;
                if (ip && b.ip && b.ip === ip) hit = b;
                else if (userId && b.userId && b.userId === userId) hit = b;
                else if (phone && b.phone && b.phone === phone) hit = b;
            });
            return hit;
        }).catch(function () { return null; });
    }

    /* ---------------- settings ---------------- */

    function defaultSettings() {
        return {
            storeName: 'DolphinMore',
            brandAccent: 'More',
            logoUrl: 'https://i.ibb.co/RkygTTzP/dolphin.jpg',
            apkIconUrl: '',
            tagline: 'Your style our collection.',
            metaDescription: 'A fast, modern shopping experience with free delivery over ₹999 and cash on delivery.',
            heroSlides: [],
            primaryColor: '#4f46e5',
            accentColor: '#f59e0b',
            freeShippingMin: 999,
            shippingFee: 49,
            gstPercent: 18,
            promoText: 'Free delivery over ₹999',
            footerBlurb: 'A modern shopping experience built for speed, with transparent pricing and delivery you can track.',
            contacts: [],
            helpLinks: [
                { label: 'Track order', href: '#/orders' },
                { label: 'Shipping & delivery', href: '#/info/shipping' },
                { label: 'Payment options', href: '#/info/payment' },
                { label: 'Contact us', href: '#/info/contact' }
            ],
            companyLinks: [
                { label: 'About NovaCart', href: '#/info/about' },
                { label: 'Careers', href: '#/info/careers' },
                { label: 'Privacy policy', href: '#/info/privacy' },
                { label: 'Terms of service', href: '#/info/terms' }
            ],
            pages: [
                {
                    slug: 'shipping',
                    title: 'Shipping & delivery',
                    body: 'We deliver across India within 2-4 business days after your order is confirmed.\n' +
                        'Delivery is free on orders over ₹999. A flat ₹49 fee applies below that.\n' +
                        'Cash on delivery is available on every order — pay the delivery partner when your parcel arrives.'
                },
                {
                    slug: 'payment',
                    title: 'Payment options',
                    body: 'This store currently supports cash on delivery only.\n' +
                        'No prepaid payment is required to place an order. Simply confirm your cart and pay on delivery.'
                },
                {
                    slug: 'contact',
                    title: 'Contact us',
                    body: 'Have a question about an order? Reach out using any of the contact options in the footer.\n' +
                        'Our support team replies within 24 hours on business days.'
                },
                {
                    slug: 'about',
                    title: 'About us',
                    body: 'A modern shopping experience built for speed, with transparent pricing and delivery you can track.\n' +
                        'Browse curated products across every category — from electronics and fashion to home and beauty.'
                },
                {
                    slug: 'careers',
                    title: 'Careers',
                    body: 'We are always looking for people who love building great shopping experiences.\n' +
                        'Send your details to us through the contact options in the footer and we will get back to you.'
                },
                {
                    slug: 'privacy',
                    title: 'Privacy policy',
                    body: 'We collect only the information needed to process and deliver your orders, such as your name, contact number and delivery address.\n' +
                        'We never sell your personal data to third parties.'
                },
                {
                    slug: 'terms',
                    title: 'Terms of service',
                    body: 'By placing an order on this store you agree to provide accurate delivery details and to pay for the items you order.\n' +
                        'Prices and availability may change without notice.'
                }
            ],
            adminPassword: null
        };
    }

    function getSettings() {
        return NC.settings || defaultSettings();
    }

    // Build the storefront settings object from the multishop shop + shop_settings rows.
    function settingsFromShop(ctx) {
        var shop = (ctx && ctx.shop) || {};
        var ss = (ctx && ctx.settings) || {};
        var defaults = defaultSettings();

        var contacts = [];
        function addContact(type, value, label) {
            var v = String(value == null ? '' : value).trim();
            if (!v) return;
            contacts.push({ type: type, value: v, label: label || '' });
        }
        addContact('call', shop.phone, 'Call');
        addContact('whatsapp', ss.whatsapp_number || shop.admin_whatsapp, 'WhatsApp');
        addContact('telegram', ss.telegram_id, 'Telegram');
        addContact('map', ss.google_maps_url, 'Location');
        asList(ss.extra_contacts).forEach(function (c) {
            if (c && typeof c === 'object' && c.type && c.value) {
                contacts.push({ type: c.type, value: c.value, label: c.label || '' });
            }
        });

        var heroSlides = [];
        asList(ss.carousel_images).forEach(function (item) {
            if (!item) return;
            if (typeof item === 'string') heroSlides.push({ image: item });
            else heroSlides.push({
                image: item.image || item.url || item.src || '',
                title: item.title || item.headline || '',
                subtitle: item.subtitle || item.text || '',
                href: item.href || item.link || ''
            });
        });

        var helpLinks = [
            { label: 'Track order', href: '#/orders' },
            { label: 'Shipping & delivery', href: '#/info/shipping' },
            { label: 'Payment options', href: '#/info/payment' },
            { label: 'Contact us', href: '#/info/contact' }
        ];
        var companyLinks = [
            { label: 'Privacy policy', href: '#/info/privacy' },
            { label: 'Terms of service', href: '#/info/terms' }
        ];

        return shallowMerge(defaults, {
            storeName: shop.shop_name || defaults.storeName,
            brandAccent: '',
            logoUrl: shop.shop_logo || '',
            tagline: ss.seo_title || ss.banner_text || '',
            metaDescription: ss.seo_description || ss.about_us || defaults.metaDescription,
            footerBlurb: ss.about_us || defaults.footerBlurb,
            promoText: ss.banner_text || defaults.promoText,
            primaryColor: ss.theme_color || defaults.primaryColor,
            contacts: contacts,
            heroSlides: heroSlides,
            helpLinks: helpLinks,
            companyLinks: companyLinks
        });
    }

    function loadSettings() {
        if (!isConfigured()) return Promise.resolve(getSettings());
        return (NC.shopReady || Promise.resolve(null)).then(function (ctx) {
            if (!ctx) return getSettings();
            var data = settingsFromShop(ctx);
            writeCache(CACHE.settings, data);
            applySettings(data);
            return getSettings();
        }).catch(function () {
            return getSettings();
        });
    }

    function saveSettings(data) {
        data = data || {};
        var merged = shallowMerge(defaultSettings(), data);
        // A plain appearance save does not carry adminPassword, so keep the one
        // already stored instead of overwriting it with the default (null).
        if (data.adminPassword === undefined) {
            var current = getSettings().adminPassword;
            merged.adminPassword = current === undefined ? null : current;
        }
        writeCache(CACHE.settings, merged);
        applySettings(merged);
        if (!isConfigured()) return Promise.resolve(merged);
        return rest('settings', {
            method: 'POST',
            body: { id: 1, data: merged, updated_at: new Date().toISOString() },
            prefer: 'resolution=merge-duplicates,return=minimal'
        }).then(function () {
            return merged;
        });
    }

    function shallowMerge(base, patch) {
        var out = {};
        Object.keys(base).forEach(function (k) { out[k] = base[k]; });
        Object.keys(patch).forEach(function (k) {
            if (patch[k] !== undefined && patch[k] !== null) out[k] = patch[k];
        });
        return out;
    }

    /* ---------------- admin password ---------------- */

    // The gate password lives in the Supabase settings row (salt + SHA-256 hash),
    // never in JavaScript config. Until one is set the default below is used.
    var ADMIN_DEFAULT_PASSWORD = 'admin123';

    function hexFromBuffer(buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return ('0' + b.toString(16)).slice(-2);
        }).join('');
    }

    function randomSalt() {
        var a = new Uint8Array(16);
        var c = window.crypto || window.msCrypto;
        if (c && c.getRandomValues) c.getRandomValues(a);
        else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
        return hexFromBuffer(a.buffer);
    }

    // Deterministic non-crypto fallback for browsers without SubtleCrypto.
    function fallbackHash(text) {
        var h1 = 0x811c9dc5, h2 = 0x1000193;
        for (var i = 0; i < text.length; i++) {
            var c = text.charCodeAt(i);
            h1 = ((h1 ^ c) * 16777619) >>> 0;
            h2 = ((h2 + c * (i + 1)) * 2654435761) >>> 0;
        }
        return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
    }

    function canSha256() {
        return !!(window.crypto && window.crypto.subtle && window.TextEncoder);
    }

    function hashAdminPassword(password, salt, algo) {
        var text = 'novacart-admin::' + salt + '::' + String(password);
        if (algo === 'sha256' && canSha256()) {
            return window.crypto.subtle
                .digest('SHA-256', new TextEncoder().encode(text))
                .then(hexFromBuffer);
        }
        return Promise.resolve(fallbackHash(text));
    }

    function adminPasswordRecord() {
        var p = getSettings().adminPassword;
        return (p && typeof p === 'object' && p.hash) ? p : null;
    }

    function hasAdminPassword() {
        return !!adminPasswordRecord();
    }

    function verifyAdminPassword(password) {
        var rec = adminPasswordRecord();
        if (!rec) return Promise.resolve(String(password || '') === ADMIN_DEFAULT_PASSWORD);
        return hashAdminPassword(password, rec.salt, rec.algo).then(function (hash) {
            return hash === rec.hash;
        });
    }

    function setAdminPassword(password) {
        var salt = randomSalt();
        var algo = canSha256() ? 'sha256' : 'fallback';
        return hashAdminPassword(password, salt, algo).then(function (hash) {
            var next = shallowMerge(defaultSettings(), getSettings());
            next.adminPassword = {
                salt: salt,
                hash: hash,
                algo: algo,
                updatedAt: new Date().toISOString()
            };
            return saveSettings(next).then(function () {
                return next.adminPassword;
            });
        });
    }

    function clearAdminPassword() {
        var next = shallowMerge(defaultSettings(), getSettings());
        next.adminPassword = null;
        return saveSettings(next);
    }

    /* ---------------- image upload (imgbb) ---------------- */

    function uploadImage(file) {
        if (!hasImgbb()) {
            return Promise.reject(new Error('Add your imgbb API key in js/config.js to enable uploads'));
        }
        var form = new FormData();
        form.append('image', file);
        return fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(imgbbCfg.key), {
            method: 'POST',
            body: form
        }).then(function (res) {
            return res.json();
        }).then(function (json) {
            if (!json || !json.success) {
                var msg = json && json.error && json.error.message ? json.error.message : 'Upload failed';
                throw new Error(msg);
            }
            return (json.data && (json.data.display_url || json.data.url)) || '';
        });
    }

    /* ---------------- apply to storefront ---------------- */

    function applyRecords(records) {
        var visible = (records || []).filter(function (r) { return r.visible !== false; });
        var normalized = visible.map(function (r, i) { return NC.data.normalize(r, i); });
        NC.data.setProducts(normalized);
    }

    function loadProducts() {
        return listProducts().then(function (records) {
            if (!records || !records.length) return NC.data.products;
            applyRecords(records);
            return NC.data.products;
        });
    }

    /* ---------------- branding helpers ---------------- */

    function hexToRgb(hex) {
        var h = String(hex || '').replace('#', '').trim();
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        if (!/^[0-9a-f]{6}$/i.test(h)) return { r: 79, g: 70, b: 229 };
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16)
        };
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(function (v) {
            var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
            return s.length === 1 ? '0' + s : s;
        }).join('');
    }

    function mix(hex, target, amount) {
        var a = hexToRgb(hex);
        var b = hexToRgb(target);
        return rgbToHex(
            a.r + (b.r - a.r) * amount,
            a.g + (b.g - a.g) * amount,
            a.b + (b.b - a.b) * amount
        );
    }

    function rgba(hex, alpha) {
        var c = hexToRgb(hex);
        return 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + alpha + ')';
    }

    function renderBrandName(el, s) {
        var name = s.storeName || 'NovaCart';
        var accent = s.brandAccent || '';
        el.textContent = '';
        if (accent && name.slice(-accent.length) === accent && name.length > accent.length) {
            el.appendChild(document.createTextNode(name.slice(0, name.length - accent.length)));
            var em = document.createElement('em');
            em.textContent = accent;
            el.appendChild(em);
        } else {
            el.textContent = name;
        }
    }

    function renderBrandMark(el, s) {
        el.textContent = '';
        if (s.logoUrl) {
            var img = document.createElement('img');
            img.src = s.logoUrl;
            img.alt = s.storeName || '';
            img.loading = 'lazy';
            el.appendChild(img);
        } else {
            var name = (s.storeName || 'N').trim();
            el.textContent = (name.charAt(0) || 'N').toUpperCase();
        }
    }

    function applyColors(s) {
        var primary = s.primaryColor || '#4f46e5';
        var accent = s.accentColor || '#f59e0b';
        var strong = mix(primary, '#000000', 0.2);
        var light = mix(primary, '#ffffff', 0.5);
        var lightStrong = mix(primary, '#ffffff', 0.68);
        var css = ':root{--brand:' + primary + ';--brand-strong:' + strong + ';--brand-soft:' +
            rgba(primary, 0.12) + ';--accent:' + accent + ';}' +
            '[data-theme="dark"]{--brand:' + light + ';--brand-strong:' + lightStrong + ';--brand-soft:' +
            rgba(primary, 0.22) + ';--accent:' + accent + ';}';
        var styleEl = document.getElementById('nc-brand-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'nc-brand-style';
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = css;
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', primary);
    }

    function renderIconCanvas(img, width, height, isMaskable) {
        try {
            var canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            var ctx = canvas.getContext('2d');
            if (!ctx) return null;

            if (isMaskable) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                var pad = Math.round(width * 0.1);
                var dw = width - (pad * 2);
                var dh = height - (pad * 2);
                var scale = Math.min(dw / (img.width || 1), dh / (img.height || 1));
                var sw = (img.width || 1) * scale;
                var sh = (img.height || 1) * scale;
                var sx = pad + (dw - sw) / 2;
                var sy = pad + (dh - sh) / 2;
                ctx.drawImage(img, sx, sy, sw, sh);
            } else {
                var scale = Math.max(width / (img.width || 1), height / (img.height || 1));
                var sw = (img.width || 1) * scale;
                var sh = (img.height || 1) * scale;
                var sx = (width - sw) / 2;
                var sy = (height - sh) / 2;
                ctx.drawImage(img, sx, sy, sw, sh);
            }
            return canvas.toDataURL('image/png');
        } catch (e) {
            return null;
        }
    }

    function convertImageToIcons(imgUrl, callback) {
        if (!imgUrl) {
            callback(null);
            return;
        }

        fetch(imgUrl, { mode: 'cors' })
            .then(function (res) {
                if (!res.ok) throw new Error('Fetch status ' + res.status);
                return res.blob();
            })
            .then(function (blob) {
                var objectUrl = URL.createObjectURL(blob);
                var img = new Image();
                img.onload = function () {
                    try {
                        var icon192 = renderIconCanvas(img, 192, 192, false);
                        var icon512 = renderIconCanvas(img, 512, 512, false);
                        var iconMaskable = renderIconCanvas(img, 512, 512, true);
                        URL.revokeObjectURL(objectUrl);
                        callback({
                            icon192: icon192,
                            icon512: icon512,
                            iconMaskable: iconMaskable
                        });
                    } catch (e) {
                        URL.revokeObjectURL(objectUrl);
                        callback(null);
                    }
                };
                img.onerror = function () {
                    URL.revokeObjectURL(objectUrl);
                    callback(null);
                };
                img.src = objectUrl;
            })
            .catch(function () {
                var img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = function () {
                    try {
                        var icon192 = renderIconCanvas(img, 192, 192, false);
                        var icon512 = renderIconCanvas(img, 512, 512, false);
                        var iconMaskable = renderIconCanvas(img, 512, 512, true);
                        callback({
                            icon192: icon192,
                            icon512: icon512,
                            iconMaskable: iconMaskable
                        });
                    } catch (e) {
                        callback(null);
                    }
                };
                img.onerror = function () {
                    callback(null);
                };
                img.src = imgUrl;
            });
    }

    function sendToServiceWorker(payload) {
        if (!('serviceWorker' in navigator)) return;
        var send = function (sw) {
            try { if (sw) sw.postMessage(payload); } catch (e) { }
        };
        send(navigator.serviceWorker.controller);
        if (navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready.then(function (reg) {
                if (reg) send(reg.active || reg.waiting || reg.installing);
            }).catch(function () { });
        }
        if (navigator.serviceWorker.getRegistration) {
            navigator.serviceWorker.getRegistration().then(function (reg) {
                if (reg) send(reg.active || reg.waiting || reg.installing);
            }).catch(function () { });
        }
    }

    function syncManifestAndPwa(s) {
        if (!s) return;

        var manifestLink = document.querySelector('link[rel="manifest"]');
        if (!manifestLink) {
            manifestLink = document.createElement('link');
            manifestLink.rel = 'manifest';
            manifestLink.id = 'app-manifest';
            document.head.appendChild(manifestLink);
        }
        if (manifestLink.getAttribute('href') !== 'manifest.json') {
            manifestLink.setAttribute('href', 'manifest.json');
        }

        var manifestSettings = {
            storeName: s.storeName || 'DolphinMore',
            tagline: s.tagline || '',
            primaryColor: s.primaryColor || '#4f46e5',
            metaDescription: s.metaDescription || s.footerBlurb || s.tagline || '',
            iconUrl: s.apkIconUrl || s.logoUrl || ''
        };

        sendToServiceWorker({
            type: 'nc:settings',
            settings: manifestSettings
        });

        var iconUrl = manifestSettings.iconUrl;
        if (iconUrl) {
            convertImageToIcons(iconUrl, function (icons) {
                if (icons) {
                    sendToServiceWorker({
                        type: 'nc:settings',
                        settings: manifestSettings,
                        icons: icons
                    });
                }
            });
        }
    }

    var CONTACT_META = {
        call: { label: 'Call', icon: 'i-phone' },
        whatsapp: { label: 'WhatsApp', icon: 'i-whatsapp' },
        telegram: { label: 'Telegram', icon: 'i-telegram' },
        email: { label: 'Email', icon: 'i-mail' },
        map: { label: 'Location', icon: 'i-pin' },
        url: { label: 'Website', icon: 'i-globe' }
    };

    function contactEscape(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function contactHref(c) {
        var v = String(c.value || '').trim();
        if (!v) return '';
        switch (c.type) {
            case 'call': return 'tel:' + v.replace(/[^\d+]/g, '');
            case 'whatsapp': return 'https://wa.me/' + v.replace(/[^\d]/g, '');
            case 'telegram': return /^https?:/i.test(v) ? v : 'https://t.me/' + v.replace(/^@/, '');
            case 'email': return 'mailto:' + v;
            default: return v;
        }
    }

    function renderStoreContacts(list) {
        var contacts = (list || []).filter(function (c) { return c && String(c.value || '').trim(); });
        document.querySelectorAll('[data-footer-contacts]').forEach(function (col) {
            col.hidden = contacts.length === 0;
        });
        document.querySelectorAll('.footer-grid').forEach(function (grid) {
            grid.classList.toggle('has-contacts', contacts.length > 0);
        });
        document.querySelectorAll('[data-store-contacts]').forEach(function (ul) {
            ul.innerHTML = contacts.map(function (c) {
                var meta = CONTACT_META[c.type] || CONTACT_META.url;
                var label = String(c.label || '').trim() || meta.label;
                var href = contactHref(c);
                var icon = '<svg class="icon" aria-hidden="true"><use href="#' + meta.icon + '"></use></svg>';
                if (!href) return '<li><span class="footer-contact-item">' + icon + contactEscape(label) + '</span></li>';
                var external = /^https?:/i.test(href);
                return '<li><a class="footer-contact-item" href="' + contactEscape(href) + '"' +
                    (external ? ' target="_blank" rel="noopener"' : '') + '>' + icon +
                    contactEscape(label) + '</a></li>';
            }).join('');
        });
    }

    function linkItemMarkup(l) {
        var label = String(l && l.label || '').trim();
        var href = String(l && l.href || '').trim();
        if (!label && !href) return '';
        if (!href) return '<li><span class="footer-link-plain">' + contactEscape(label) + '</span></li>';
        var external = /^https?:/i.test(href);
        return '<li><a href="' + contactEscape(href) + '"' +
            (external ? ' target="_blank" rel="noopener"' : '') + '>' + contactEscape(label || href) + '</a></li>';
    }

    function renderStoreLinks(help, company) {
        document.querySelectorAll('[data-footer-help]').forEach(function (ul) {
            var list = (help || []).filter(function (l) { return l && (l.label || l.href); });
            ul.innerHTML = list.map(linkItemMarkup).join('');
            var col = ul.closest('[data-footer-help-col]');
            if (col) col.hidden = list.length === 0;
        });
        document.querySelectorAll('[data-footer-company]').forEach(function (ul) {
            var list = (company || []).filter(function (l) { return l && (l.label || l.href); });
            ul.innerHTML = list.map(linkItemMarkup).join('');
            var col = ul.closest('[data-footer-company-col]');
            if (col) col.hidden = list.length === 0;
        });
    }

    function applySettings(data) {
        var s = shallowMerge(defaultSettings(), data || {});
        NC.settings = s;

        document.title = (s.storeName || 'DolphinMore') + (s.tagline ? ' — ' + s.tagline : '');

        var desc = document.querySelector('meta[name="description"]');
        if (desc && s.metaDescription) desc.setAttribute('content', s.metaDescription);

        document.querySelectorAll('[data-brand-name]').forEach(function (el) { renderBrandName(el, s); });
        document.querySelectorAll('[data-brand-logo]').forEach(function (el) { renderBrandMark(el, s); });
        document.querySelectorAll('[data-store-blurb]').forEach(function (el) { el.textContent = s.footerBlurb || ''; });
        document.querySelectorAll('[data-promo-text]').forEach(function (el) { el.textContent = s.promoText || ''; });
        renderStoreContacts(s.contacts);
        renderStoreLinks(s.helpLinks, s.companyLinks);

        applyColors(s);

        syncManifestAndPwa(s);

        var apkIcon = s.apkIconUrl || s.logoUrl || 'assets/icon-192.png';
        document.querySelectorAll('[data-pwa-icon]').forEach(function (el) {
            if (el.tagName === 'IMG') {
                el.src = apkIcon;
            } else {
                el.style.backgroundImage = 'url(' + apkIcon + ')';
            }
        });
        document.querySelectorAll('[data-pwa-app-name]').forEach(function (el) {
            el.textContent = 'Install ' + (s.storeName || 'DolphinMore') + ' APK';
        });
        document.querySelectorAll('[data-pwa-store-title]').forEach(function (el) {
            el.textContent = (s.storeName || 'DolphinMore') + ' — Online Shopping';
        });
        document.querySelectorAll('[data-pwa-dev-name]').forEach(function (el) {
            el.textContent = (s.storeName || 'DolphinMore') + ' Official • Shopping';
        });

        var appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
        if (appleIcon) appleIcon.setAttribute('href', 'assets/icon-192.png');
        var favIcon = document.querySelector('link[rel="icon"]');
        if (favIcon) favIcon.setAttribute('href', 'assets/icon-192.png');

        if (NC.store && NC.store.setFreeShippingMin) {
            NC.store.setFreeShippingMin(s.freeShippingMin);
        }
        if (NC.store && NC.store.setShippingFee) {
            NC.store.setShippingFee(s.shippingFee);
        }
        if (NC.store && NC.store.setGstPercent) {
            NC.store.setGstPercent(s.gstPercent);
        }
        return s;
    }

    /* ---------------- storefront bootstrap ---------------- */

    function bootstrapStore() {
        var cachedSettings = readCache(CACHE.settings, null);
        if (cachedSettings) applySettings(cachedSettings);
        else applySettings(defaultSettings());

        var cachedProducts = readCache(CACHE.products, null);
        if (cachedProducts && cachedProducts.length) applyRecords(cachedProducts);

        if (!isConfigured()) return Promise.resolve('local');

        return (NC.shopReady || Promise.resolve(null)).then(function () {
            return Promise.all([loadSettings(), loadProducts()]);
        }).then(function () {
            return 'supabase';
        }).catch(function (err) {
            console.warn('[backend] falling back to local catalog:', err.message || err);
            return 'local';
        });
    }

    NC.backend = {
        isConfigured: isConfigured,
        hasImgbb: hasImgbb,
        listProducts: listProducts,
        loadProducts: loadProducts,
        saveProduct: saveProduct,
        deleteProduct: deleteProduct,
        importRecords: importRecords,
        listOrders: listOrders,
        saveOrder: saveOrder,
        updateOrderStatus: updateOrderStatus,
        deleteOrder: deleteOrder,
        localOrders: localOrders,
        listReviews: listReviews,
        saveReview: saveReview,
        deleteReview: deleteReview,
        localReviews: localReviews,
        listUsers: listUsers,
        getUser: getUser,
        getUserByPhone: getUserByPhone,
        saveUser: saveUser,
        deleteUser: deleteUser,
        saveUserCart: saveUserCart,
        saveUserCartRemoved: saveUserCartRemoved,
        recordCartRemoval: recordCartRemoval,
        recordVisit: recordVisit,
        localUsers: localUsers,
        listBans: listBans,
        saveBan: saveBan,
        deleteBan: deleteBan,
        clearBansForUser: clearBansForUser,
        setUserBanned: setUserBanned,
        setUserLastIp: setUserLastIp,
        getVisitorIp: getVisitorIp,
        checkBan: checkBan,
        localBans: localBans,
        getSettings: getSettings,
        loadSettings: loadSettings,
        saveSettings: saveSettings,
        adminAuth: {
            isSet: hasAdminPassword,
            verify: verifyAdminPassword,
            set: setAdminPassword,
            clear: clearAdminPassword,
            defaultPassword: ADMIN_DEFAULT_PASSWORD
        },
        defaultSettings: defaultSettings,
        applySettings: applySettings,
        applyRecords: applyRecords,
        uploadImage: uploadImage,
        localRecords: localRecords,
        resetLocal: function () {
            try {
                localStorage.removeItem(CACHE.products);
                localStorage.removeItem(CACHE.settings);
                localStorage.removeItem(CACHE.orders);
                localStorage.removeItem(CACHE.users);
                localStorage.removeItem(CACHE.bans);
                localStorage.removeItem(BANS_KEY);
                localStorage.removeItem(REVIEWS_KEY);
            } catch (e) { }
        },
        bootstrapStore: bootstrapStore
    };
})();
