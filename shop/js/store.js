(function () {
    'use strict';

    var KEY = {
        cart: 'novacart_cart',
        wishlist: 'novacart_wishlist',
        theme: 'novacart_theme',
        orders: 'novacart_orders',
        recent: 'novacart_recent',
        coupon: 'novacart_coupon'
    };

    var FREE_SHIPPING_MIN = 999;
    var SHIPPING_FEE = 49;
    var GST_PERCENT = 18;
    var MAX_QTY = 10;
    var RECENT_MAX = 8;

    var TAX_RATES = {
        electronics: 0.18,
        fashion: 0.12,
        footwear: 0.12,
        'home-kitchen': 0.12,
        beauty: 0.18,
        sports: 0.18,
        books: 0.05,
        accessories: 0.18
    };

    var COUPONS = {
        NOVARC10: { type: 'percent', value: 10, max: 150, label: '10% off your order' },
        WELCOME15: { type: 'percent', value: 15, max: 250, label: '15% welcome discount' },
        FREESHIP: { type: 'shipping', value: 0, max: 0, label: 'Free shipping on your order' }
    };

    var listeners = [];
    var syncTimer = null;
    var state = {
        cart: [],
        wishlist: [],
        theme: 'light',
        orders: [],
        recent: [],
        coupon: null
    };

    function read(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { }
    }

    function hydrate() {
        state.cart = read(KEY.cart, []).filter(function (l) {
            return l && l.id && NC.data.byId(l.id);
        }).map(function (l) {
            return {
                id: l.id,
                qty: clampQty(l.qty),
                color: l.color || null,
                size: l.size || null
            };
        });

        state.wishlist = read(KEY.wishlist, []).filter(function (id) {
            return !!NC.data.byId(id);
        });

        state.orders = read(KEY.orders, []);
        state.recent = read(KEY.recent, []).filter(function (id) {
            return !!NC.data.byId(id);
        });

        state.coupon = read(KEY.coupon, null);
        if (state.coupon && !COUPONS[state.coupon]) state.coupon = null;

        state.theme = (function () {
            try {
                return localStorage.getItem(KEY.theme);
            } catch (e) {
                return null;
            }
        })() || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }

    function clampQty(qty) {
        qty = parseInt(qty, 10);
        if (isNaN(qty) || qty < 1) qty = 1;
        return Math.min(qty, MAX_QTY);
    }

    function persistCart() {
        write(KEY.cart, state.cart);
        scheduleCloudSync();
    }

    function currentUserId() {
        return (NC.auth && NC.auth.getUser && NC.auth.getUser()) ? NC.auth.getUser().id : null;
    }

    function scheduleCloudSync() {
        var uid = currentUserId();
        if (!uid || !NC.backend || !NC.backend.saveUserCart) return;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(function () {
            NC.backend.saveUserCart(uid, state.cart).catch(function () { });
        }, 500);
    }

    function persistWishlist() {
        write(KEY.wishlist, state.wishlist);
    }

    function persistOrders() {
        write(KEY.orders, state.orders);
    }

    function persistRecent() {
        write(KEY.recent, state.recent);
    }

    function persistCoupon() {
        write(KEY.coupon, state.coupon);
    }

    function emit(reason, payload) {
        listeners.forEach(function (fn) {
            try {
                fn(reason, payload);
            } catch (e) {
                console.error('[store] listener failed', e);
            }
        });
    }

    function subscribe(fn) {
        listeners.push(fn);
        return function () {
            var i = listeners.indexOf(fn);
            if (i !== -1) listeners.splice(i, 1);
        };
    }

    function lineKey(id, color, size) {
        return [id, color || '-', size || '-'].join('::');
    }

    function getLines() {
        return state.cart.map(function (l) {
            var product = NC.data.byId(l.id);
            return {
                key: lineKey(l.id, l.color, l.size),
                id: l.id,
                qty: l.qty,
                color: l.color,
                size: l.size,
                product: product,
                lineTotal: product ? product.price * l.qty : 0
            };
        });
    }

    function getItemCount() {
        return state.cart.reduce(function (sum, l) { return sum + l.qty; }, 0);
    }

    function addToCart(id, qty, color, size) {
        var product = NC.data.byId(id);
        if (!product) return { ok: false, reason: 'Product not found' };

        if (product.stock < 1) return { ok: false, reason: 'Out of stock' };

        var chosenColor = color || (product.colors[0] ? product.colors[0][0] : null);
        var chosenSize = size || (product.sizes[0] || null);
        var qtyWanted = clampQty(qty || 1);
        var key = lineKey(id, chosenColor, chosenSize);

        var existing = null;
        state.cart.forEach(function (l) {
            if (lineKey(l.id, l.color, l.size) === key) existing = l;
        });

        if (existing) {
            existing.qty = clampQty(existing.qty + qtyWanted);
            if (existing.qty > product.stock) existing.qty = clampQty(product.stock);
        } else {
            if (qtyWanted > product.stock) qtyWanted = clampQty(product.stock);
            state.cart.push({ id: id, qty: qtyWanted, color: chosenColor, size: chosenSize });
        }

        pushRecent(id);
        persistCart();
        emit('cart:add', { id: id });
        return { ok: true, qty: qtyWanted };
    }

    function setQty(key, qty) {
        var product = null;
        var next = clampQty(qty);
        state.cart = state.cart.filter(function (l) {
            var k = lineKey(l.id, l.color, l.size);
            if (k === key) {
                product = NC.data.byId(l.id);
                if (product) next = Math.min(next, clampQty(product.stock));
                l.qty = next;
                return true;
            }
            return false;
        });
        persistCart();
        emit('cart:qty', { key: key, qty: next });
        return next;
    }

    function removeLine(key) {
        var removed = null;
        state.cart = state.cart.filter(function (l) {
            var k = lineKey(l.id, l.color, l.size);
            if (k === key) {
                removed = l;
                return false;
            }
            return true;
        });
        if (removed) {
            persistCart();
            emit('cart:remove', { key: key });
            var uid = currentUserId();
            if (uid && NC.backend && NC.backend.recordCartRemoval) {
                NC.backend.recordCartRemoval(uid, removed).catch(function () { });
            }
        }
        return removed;
    }

    function clearCart() {
        state.cart = [];
        state.coupon = null;
        persistCart();
        persistCoupon();
        emit('cart:clear', {});
    }

    function moveToCart(key, qty) {
        var line = null;
        state.cart.forEach(function (l) {
            if (lineKey(l.id, l.color, l.size) === key) line = l;
        });
        if (!line) return false;
        return addToCart(line.id, qty || 1, line.color, line.size).ok;
    }

    // Merge a saved (cloud) cart into the current one, keeping the larger qty.
    function mergeUserCart(lines) {
        if (!Array.isArray(lines) || !lines.length) return;
        var changed = false;
        lines.forEach(function (incoming) {
            if (!incoming || !incoming.id || !NC.data.byId(incoming.id)) return;
            var key = lineKey(incoming.id, incoming.color, incoming.size);
            var existing = null;
            state.cart.forEach(function (l) {
                if (lineKey(l.id, l.color, l.size) === key) existing = l;
            });
            var qty = clampQty(incoming.qty);
            if (existing) {
                if (qty > existing.qty) { existing.qty = qty; changed = true; }
            } else {
                state.cart.push({ id: incoming.id, qty: qty, color: incoming.color || null, size: incoming.size || null });
                changed = true;
            }
        });
        if (changed) {
            persistCart();
            emit('cart:merge', {});
        }
    }

    function isWishlisted(id) {
        return state.wishlist.indexOf(id) !== -1;
    }

    function toggleWishlist(id) {
        var i = state.wishlist.indexOf(id);
        var added;
        if (i === -1) {
            state.wishlist.push(id);
            added = true;
        } else {
            state.wishlist.splice(i, 1);
            added = false;
        }
        persistWishlist();
        emit('wishlist:toggle', { id: id, added: added });
        return added;
    }

    function getWishlist() {
        return state.wishlist.map(NC.data.byId).filter(Boolean);
    }

    function getCoupon() {
        return state.coupon;
    }

    function applyCoupon(code) {
        var key = String(code || '').trim().toUpperCase();
        if (!COUPONS[key]) return { ok: false, reason: 'That coupon code is not valid' };
        if (!state.cart.length) return { ok: false, reason: 'Add something to your cart first' };
        state.coupon = key;
        persistCoupon();
        emit('coupon:apply', { code: key });
        return { ok: true, coupon: COUPONS[key] };
    }

    function clearCoupon() {
        state.coupon = null;
        persistCoupon();
        emit('coupon:clear', {});
    }

    function couponDiscount(subtotal) {
        if (!state.coupon) return 0;
        var c = COUPONS[state.coupon];
        if (!c || c.type !== 'percent') return 0;
        return Math.min(Math.round(subtotal * c.value / 100), c.max);
    }

    function totals() {
        var lines = getLines();
        var subtotal = 0;
        var mrpTotal = 0;
        var tax = 0;

        lines.forEach(function (l) {
            if (!l.product) return;
            var lineSub = l.product.price * l.qty;
            subtotal += lineSub;
            mrpTotal += l.product.mrp * l.qty;
            tax += lineSub * (GST_PERCENT / 100);
        });

        var discount = couponDiscount(subtotal);
        var afterDiscount = Math.max(subtotal - discount, 0);
        var coupon = state.coupon ? COUPONS[state.coupon] : null;
        var shippingFree = lines.length === 0 || afterDiscount >= FREE_SHIPPING_MIN || (coupon && coupon.type === 'shipping');
        var shipping = shippingFree ? 0 : SHIPPING_FEE;
        var savings = (mrpTotal - subtotal) + discount;
        var total = afterDiscount + tax + shipping;

        return {
            lines: lines,
            itemCount: getItemCount(),
            subtotal: subtotal,
            mrpTotal: mrpTotal,
            savings: mrpTotal - subtotal,
            coupon: coupon,
            couponCode: state.coupon,
            couponDiscount: discount,
            gstPercent: GST_PERCENT,
            tax: Math.round(tax),
            shipping: shipping,
            shippingFree: shippingFree,
            freeShippingGap: Math.max(FREE_SHIPPING_MIN - afterDiscount, 0),
            freeShippingMin: FREE_SHIPPING_MIN,
            total: Math.round(total)
        };
    }

    function pushRecent(id) {
        var i = state.recent.indexOf(id);
        if (i !== -1) state.recent.splice(i, 1);
        state.recent.unshift(id);
        state.recent = state.recent.slice(0, RECENT_MAX);
        persistRecent();
    }

    function getRecent() {
        return state.recent.map(NC.data.byId).filter(Boolean);
    }

    function placeOrder(details) {
        var t = totals();
        if (!t.lines.length) return { ok: false, reason: 'Your cart is empty' };

        var stamp = Date.now().toString(36).toUpperCase();
        var rand = Math.random().toString(36).toUpperCase().slice(2, 5);
        var order = {
            id: 'NC-' + stamp + rand,
            placedAt: new Date().toISOString(),
            status: 'pending',
            userId: currentUserId() || '',
            items: t.lines.map(function (l) {
                return {
                    id: l.id,
                    name: l.product.name,
                    brand: l.product.brand,
                    sku: l.product.sku || '',
                    image: (NC.data && NC.data.variantImage)
                        ? NC.data.variantImage(l.product, l.color)
                        : (l.product.images[0] || ''),
                    qty: l.qty,
                    color: l.color,
                    size: l.size,
                    price: l.product.price
                };
            }),
            totals: {
                subtotal: t.subtotal,
                savings: t.savings,
                couponDiscount: t.couponDiscount,
                couponCode: t.couponCode,
                tax: t.tax,
                shipping: t.shipping,
                total: t.total
            },
            address: details.address,
            payment: details.payment,
            delivery: details.delivery
        };

        state.orders.unshift(order);
        state.orders = state.orders.slice(0, 10);
        persistOrders();
        clearCart();

        if (NC.backend && NC.backend.saveOrder) {
            NC.backend.saveOrder(order).catch(function () { });
        }

        emit('order:placed', { order: order });
        return { ok: true, order: order };
    }

    function getOrders() {
        return state.orders;
    }

    function syncOrders() {
        if (!NC.backend || !NC.backend.listOrders) return Promise.resolve(state.orders);
        return NC.backend.listOrders().then(function (list) {
            list = list || [];
            var map = {};
            list.forEach(function (o) { if (o && o.id) map[o.id] = o; });

            var changed = false;
            var uid = currentUserId();

            state.orders.forEach(function (o) {
                var fresh = map[o.id];
                if (fresh && fresh.status && fresh.status !== o.status) {
                    o.status = fresh.status;
                    changed = true;
                }
            });

            if (uid) {
                list.forEach(function (o) {
                    if (!o || !o.id || o.userId !== uid) return;
                    if (state.orders.some(function (x) { return x.id === o.id; })) return;
                    state.orders.push(o);
                    changed = true;
                });
            }

            // Drop orders that no longer exist on the server (e.g. deleted by the
            // admin). A brief grace period protects an order that was just placed
            // and may still be mid-sync.
            var now = Date.now();
            var before = state.orders.length;
            state.orders = state.orders.filter(function (o) {
                if (map[o.id]) return true;
                var placed = new Date(o.placedAt).getTime();
                return !isNaN(placed) && (now - placed) < 60000;
            });
            if (state.orders.length !== before) changed = true;

            if (changed) {
                state.orders.sort(function (a, b) { return new Date(b.placedAt) - new Date(a.placedAt); });
                state.orders = state.orders.slice(0, 25);
                persistOrders();
                emit('orders:sync', {});
            }
            return state.orders;
        }).catch(function () { return state.orders; });
    }

    function getOrder(id) {
        var found = null;
        state.orders.forEach(function (o) {
            if (o.id === id) found = o;
        });
        return found;
    }

    function setTheme(theme) {
        state.theme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', state.theme);
        try {
            localStorage.setItem(KEY.theme, state.theme);
        } catch (e) { }
        emit('theme:change', { theme: state.theme });
        return state.theme;
    }

    function toggleTheme() {
        return setTheme(state.theme === 'dark' ? 'light' : 'dark');
    }

    function getTheme() {
        return state.theme;
    }

    function setFreeShippingMin(value) {
        var n = parseInt(value, 10);
        if (!isNaN(n) && n >= 0) {
            FREE_SHIPPING_MIN = n;
            emit('shipping:min', { min: FREE_SHIPPING_MIN });
        }
        return FREE_SHIPPING_MIN;
    }

    function setGstPercent(value) {
        var n = parseFloat(value);
        if (isNaN(n) || n < 0) n = 0;
        if (n > 100) n = 100;
        GST_PERCENT = n;
        emit('gst:change', { percent: GST_PERCENT });
        return GST_PERCENT;
    }

    function getGstPercent() {
        return GST_PERCENT;
    }

    function setShippingFee(value) {
        var n = Math.max(0, parseInt(value, 10) || 0);
        SHIPPING_FEE = n;
        emit('shipping:fee', { fee: SHIPPING_FEE });
        return SHIPPING_FEE;
    }

    function getShippingFee() {
        return SHIPPING_FEE;
    }

    function getFreeShippingMin() {
        return FREE_SHIPPING_MIN;
    }

    NC.store = {
        FREE_SHIPPING_MIN: FREE_SHIPPING_MIN,
        SHIPPING_FEE: SHIPPING_FEE,
        GST_PERCENT: GST_PERCENT,
        MAX_QTY: MAX_QTY,
        TAX_RATES: TAX_RATES,
        COUPONS: COUPONS,
        init: hydrate,
        subscribe: subscribe,
        emit: emit,
        lineKey: lineKey,
        getLines: getLines,
        getItemCount: getItemCount,
        addToCart: addToCart,
        setQty: setQty,
        removeLine: removeLine,
        clearCart: clearCart,
        moveToCart: moveToCart,
        mergeUserCart: mergeUserCart,
        isWishlisted: isWishlisted,
        toggleWishlist: toggleWishlist,
        getWishlist: getWishlist,
        applyCoupon: applyCoupon,
        clearCoupon: clearCoupon,
        getCoupon: getCoupon,
        totals: totals,
        getRecent: getRecent,
        placeOrder: placeOrder,
        getOrders: getOrders,
        getOrder: getOrder,
        syncOrders: syncOrders,
        setTheme: setTheme,
        toggleTheme: toggleTheme,
        getTheme: getTheme,
        setFreeShippingMin: setFreeShippingMin,
        setGstPercent: setGstPercent,
        getGstPercent: getGstPercent,
        setShippingFee: setShippingFee,
        getShippingFee: getShippingFee,
        getFreeShippingMin: getFreeShippingMin
    };
})();