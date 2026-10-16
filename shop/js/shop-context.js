/* ============================================================
   Storefront — shop context (multi-tenant)
   ------------------------------------------------------------
   Resolves which shop this storefront belongs to from the URL:
       ?id=<shop uuid>   or   ?u=<shop slug>
   Loads the shop row + its shop_settings from the multishop
   Supabase project and exposes them as NC.shop / NC.shopReady.

   Loaded BEFORE backend.js so the backend can filter products,
   settings and orders by the resolved shop.
   ============================================================ */
(function () {
    'use strict';

    var cfg = (window.NC_CONFIG || {});
    var supa = cfg.supabase || {};

    function rest(path) {
        var base = String(supa.url || '').replace(/\/+$/, '') + '/rest/v1/' + path;
        var headers = {
            apikey: supa.anonKey,
            Authorization: 'Bearer ' + supa.anonKey,
            Accept: 'application/json'
        };
        if (supa.apiSchema) headers['Accept-Profile'] = supa.apiSchema;
        return fetch(base, { headers: headers }).then(function (res) {
            if (!res.ok) {
                return res.text().then(function (text) {
                    var message = text;
                    try { message = JSON.parse(text).message || text; } catch (e) { }
                    throw new Error('Supabase ' + res.status + ': ' + message);
                });
            }
            return res.text().then(function (text) {
                return text ? JSON.parse(text) : null;
            });
        });
    }

    function readParams() {
        var params = new URLSearchParams(window.location.search);
        var id = params.get('id');
        var slug = params.get('u');
        // Short style: first bare parameter name counts as the slug (e.g. ?free)
        if (!id && !slug && window.location.search.length > 1) {
            slug = window.location.search.substring(1).split('&')[0].split('=')[0];
        }
        return { id: id, slug: slug };
    }

    function errorScreen(message) {
        NC.shopError = true;
        try { document.title = 'Store unavailable'; } catch (e) { }
        var paint = function () {
            var main = document.getElementById('view');
            var html = '<section class="empty-state" style="padding:80px 20px;text-align:center;">' +
                '<h1 style="font-size:1.4rem;margin-bottom:12px;">Store unavailable</h1>' +
                '<p style="color:#64748b;">' + String(message || 'We could not load this store.') + '</p>' +
                '</section>';
            if (main) main.innerHTML = html;
            else document.body.insertAdjacentHTML('afterbegin', html);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { setTimeout(paint, 0); });
        } else {
            setTimeout(paint, 0);
        }
    }

    // Show the error and hand back a promise that never settles, so the app's
    // bootstrap never re-renders the storefront over the error screen.
    function unreachable(message) {
        errorScreen(message);
        NC.shop = null;
        NC.shopReady = new Promise(function () { });
    }

    var NC = window.NC = window.NC || {};
    NC.shop = null;
    NC.shopReady = Promise.resolve(null);

    if (!supa.url || !supa.anonKey) {
        unreachable('Store configuration is missing.');
        return;
    }

    var sel = readParams();
    if (!sel.id && !sel.slug) {
        unreachable('This store link is incomplete (missing shop address).');
        return;
    }

    var shopPath = sel.slug
        ? 'shops?select=*&slug=eq.' + encodeURIComponent(sel.slug) + '&limit=1'
        : 'shops?select=*&id=eq.' + encodeURIComponent(sel.id) + '&limit=1';

    NC.shopReady = rest(shopPath).then(function (rows) {
        var shop = rows && rows[0];
        if (!shop) throw new Error('We could not find the shop you are looking for.');

        var status = String(shop.status || 'active');
        if (status.indexOf('frozen') !== -1 || status.indexOf('suspended') !== -1) {
            throw new Error('This shop is temporarily unavailable.');
        }

        NC.shop = { id: shop.id, slug: shop.slug, shop: shop, settings: null };

        return rest('shop_settings?select=*&shop_id=eq.' + encodeURIComponent(shop.id) + '&limit=1')
            .then(function (settingsRows) {
                NC.shop.settings = (settingsRows && settingsRows[0]) || {};
                return NC.shop;
            })
            .catch(function () {
                NC.shop.settings = {};
                return NC.shop;
            });
    }).catch(function (err) {
        console.error('[shop-context]', err && err.message);
        unreachable(err && err.message);
        // Never settle so backend.bootstrapStore() (which captured this promise)
        // never resolves and therefore never re-renders over the error screen.
        return new Promise(function () { });
    });
})();
