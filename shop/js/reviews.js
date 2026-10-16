/* ============================================================
   NovaCart — product ratings & reviews
   Signed-in shoppers can rate (1–5 stars) and review a product.
   Reviews are stored through the backend (Supabase when configured,
   otherwise this browser) and are merged with the product's ratings so
   listing pages reflect the new average.
   Exposes: NC.reviews
   ============================================================ */
(function () {
    'use strict';

    var all = [];
    var ready = false;
    var listeners = [];

    function emit() {
        listeners.forEach(function (fn) {
            try { fn(); } catch (e) { console.error('[reviews] listener failed', e); }
        });
    }

    function onChange(fn) {
        listeners.push(fn);
        return function () {
            var i = listeners.indexOf(fn);
            if (i !== -1) listeners.splice(i, 1);
        };
    }

    function currentUser() {
        return (NC.auth && NC.auth.getUser) ? NC.auth.getUser() : null;
    }

    function forProduct(productId) {
        return all.filter(function (r) { return r.productId === productId; })
            .sort(function (a, b) { return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); });
    }

    function userReview(productId) {
        var user = currentUser();
        if (!user) return null;
        var found = forProduct(productId).filter(function (r) { return r.userId === user.id; });
        return found[0] || null;
    }

    function baseOf(product) {
        if (!product._revBase) {
            product._revBase = {
                rating: Number(product.rating) || 0,
                count: Math.max(0, parseInt(product.reviewCount, 10) || 0),
                breakdown: Array.isArray(product.breakdown) ? product.breakdown.slice() : []
            };
        }
        return product._revBase;
    }

    function summary(product) {
        if (!product) return { avg: 0, count: 0, reviews: [], breakdown: [], userReview: null };
        var base = baseOf(product);
        var reviews = forProduct(product.id);
        var count = base.count + reviews.length;
        var sum = base.rating * base.count;
        reviews.forEach(function (r) { sum += r.stars; });
        var avg = count ? (sum / count) : base.rating;

        var counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        base.breakdown.forEach(function (row) {
            var stars = parseInt(row.stars, 10);
            if (stars < 1 || stars > 5) return;
            var rowCount = parseInt(row.count, 10);
            if (!isFinite(rowCount)) rowCount = Math.round((row.pct || 0) / 100 * base.count);
            counts[stars] += Math.max(0, rowCount);
        });
        reviews.forEach(function (r) { counts[r.stars] += 1; });
        var total = counts[1] + counts[2] + counts[3] + counts[4] + counts[5];
        var denominator = total || 1;
        var breakdown = [5, 4, 3, 2, 1].map(function (s) {
            return { stars: s, count: counts[s], pct: Math.round(counts[s] / denominator * 100) };
        });

        return {
            avg: Math.round(avg * 10) / 10,
            count: count,
            reviews: reviews,
            breakdown: breakdown,
            userReview: userReview(product.id)
        };
    }

    function apply() {
        var products = (NC.data && NC.data.products) ? NC.data.products : [];
        products.forEach(function (product) {
            var s = summary(product);
            product.rating = s.avg;
            product.reviewCount = s.count;
            product.breakdown = s.breakdown;
        });
    }

    function submit(productId, stars, text) {
        var user = currentUser();
        if (!user) return Promise.reject(new Error('Please sign in to write a review'));

        stars = parseInt(stars, 10) || 0;
        if (stars < 1 || stars > 5) return Promise.reject(new Error('Please choose a star rating'));

        var body = String(text || '').trim();
        if (body.length < 3) return Promise.reject(new Error('Write a few words about the product'));

        var profile = (NC.auth && NC.auth.getProfile) ? NC.auth.getProfile() : null;
        var existing = userReview(productId);
        var record = {
            id: existing ? existing.id : undefined,
            productId: productId,
            userId: user.id,
            name: (profile && (profile.name || profile.phone)) || user.name || user.phone || 'Shopper',
            stars: stars,
            text: body,
            createdAt: existing ? existing.createdAt : new Date().toISOString()
        };

        return NC.backend.saveReview(record).then(function (saved) {
            saved = saved || record;
            var idx = -1;
            all.forEach(function (r, i) { if (r.id === saved.id) idx = i; });
            if (idx === -1) all.push(saved); else all[idx] = saved;
            apply();
            emit();
            return saved;
        });
    }

    function init() {
        if (!(NC.backend && NC.backend.listReviews)) {
            ready = true;
            return Promise.resolve(all);
        }
        return NC.backend.listReviews().then(function (list) {
            all = Array.isArray(list) ? list : [];
            ready = true;
            apply();
            emit();
            return all;
        }).catch(function () {
            ready = true;
            return all;
        });
    }

    NC.reviews = {
        init: init,
        summary: summary,
        forProduct: forProduct,
        userReview: userReview,
        submit: submit,
        apply: apply,
        onChange: onChange,
        isReady: function () { return ready; }
    };
})();
