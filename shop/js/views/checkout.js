/* ============================================================
   NovaCart — checkout lightbox
   Collects name, contact number and a delivery location picked on the
   map, plus a coupon code in a modal, then places the order.
   Saved details are stored on the shopper's profile.
   ============================================================ */
(function () {
    'use strict';

    var STATES = ['Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
        'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha',
        'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

    var form = blank();
    var errors = {};
    var placing = false;
    var bound = false;
    var mapState = { map: null, marker: null, tiles: null };
    var searchBusy = false;

    function $(sel, root) { return (root || document).querySelector(sel); }
    function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
    function esc(v) { return NC.ui.esc(v); }
    function icon(id) { return NC.ui.icon(id); }
    function money(v) { return NC.ui.money(v); }
    function toast(m, t) { NC.ui.toast(m, t); }

    function blank() {
        return {
            name: '', phone: '',
            line1: '', line2: '', city: '', state: '', pincode: '',
            lat: null, lng: null
        };
    }

    function prefill() {
        form = blank();
        var p = (NC.auth && NC.auth.getProfile && NC.auth.getProfile()) || {};
        var a = (NC.auth && NC.auth.lastAddress && NC.auth.lastAddress()) || null;
        form.name = p.name || '';
        form.phone = p.phone || '';
        if (a) {
            form.line1 = a.line1 || '';
            form.line2 = a.line2 || '';
            form.city = a.city || '';
            form.state = a.state || '';
            form.pincode = a.pincode || '';
            form.lat = a.lat != null ? a.lat : null;
            form.lng = a.lng != null ? a.lng : null;
        }
    }

    /* ---------------- markup ---------------- */

    function field(name, label, opts) {
        opts = opts || {};
        var err = errors[name];
        var control;
        if (opts.type === 'select') {
            control = '<select class="input" data-co-input="' + name + '" id="co-' + name + '">' +
                '<option value="">Select a state</option>' +
                STATES.map(function (s) {
                    return '<option value="' + esc(s) + '"' + (form.state === s ? ' selected' : '') + '>' +
                        esc(s) + '</option>';
                }).join('') + '</select>';
        } else {
            control = '<input class="input" data-co-input="' + name + '" id="co-' + name + '" type="' +
                (opts.type || 'text') + '" value="' + esc(form[name]) + '" placeholder="' +
                esc(opts.placeholder || '') + '"' +
                (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '') +
                (opts.maxlength ? ' maxlength="' + opts.maxlength + '"' : '') +
                (opts.autocomplete ? ' autocomplete="' + opts.autocomplete + '"' : '') + '>';
        }
        return '<div class="field' + (err ? ' invalid' : '') + '" data-co-field="' + name + '">' +
            '<label for="co-' + name + '">' + esc(label) +
            (opts.optional ? ' <span class="muted">(optional)</span>' : ' <span class="req">*</span>') + '</label>' +
            control +
            (err ? '<span class="field-error">' + esc(err) + '</span>' : '') +
            '</div>';
    }

    function bodyMarkup() {
        return '<div class="co-layout">' +
            '<div class="co-form">' +
            '<h3 class="co-sub">' + icon('i-user') + 'Contact details</h3>' +
            '<div class="co-grid">' +
            field('name', 'Full name', { placeholder: 'Ananya Sharma', autocomplete: 'name' }) +
            field('phone', 'Contact number', { type: 'tel', placeholder: '9876543210', inputmode: 'numeric', maxlength: 10, autocomplete: 'tel' }) +
            '</div>' +

            '<h3 class="co-sub">' + icon('i-pin') + 'Delivery address</h3>' +
            '<div class="field" data-co-field="address">' +
            '<div class="co-map-search">' +
            '<input class="input" id="coPlaceSearch" type="text" placeholder="Search your area, e.g. MG Road, Bengaluru">' +
            '<button class="btn btn-outline" type="button" data-co="search">Search</button>' +
            '<button class="btn btn-ghost" type="button" data-co="locate" aria-label="Use my current location">' +
            icon('i-crosshair') + 'My location</button>' +
            '</div>' +
            '<div class="co-map" id="coMap"><div class="co-map-empty">Loading map…</div></div>' +
            '<p class="co-map-hint">Tap the map or drag the pin to set your delivery point.</p>' +
            '<p class="co-map-hint" id="coAddrLine" hidden></p>' +
            '</div>' +
            '</div>' +

            '<div class="co-side">' +
            '<div class="co-summary" id="coSummary"></div>' +
            '<button class="btn btn-primary btn-lg btn-block" type="button" data-co="place"></button>' +
            '<div class="co-assurance">' +
            '<span>' + icon('i-truck') + 'Cash on delivery available</span>' +
            '<span>' + icon('i-shield') + 'Secure checkout — your details stay private</span>' +
            '<span>' + icon('i-card') + 'Pay in cash when your order arrives</span>' +
            '</div>' +
            '</div>' +
            '</div>';
    }

    function summaryMarkup(t) {
        var rows = '<div class="totals-row"><span>Subtotal (' + t.itemCount + ' item' + (t.itemCount === 1 ? '' : 's') +
            ')</span><span>' + money(t.subtotal) + '</span></div>';
        if (t.couponDiscount > 0) {
            rows += '<div class="totals-row"><span>Coupon ' + esc(t.couponCode) + '</span>' +
                '<span style="color:var(--success);font-weight:600">− ' + money(t.couponDiscount) + '</span></div>';
        }
        if (t.tax > 0) {
            rows += '<div class="totals-row"><span>GST</span><span>' + money(t.tax) + '</span></div>';
        }
        rows += '<div class="totals-row' + (t.shipping === 0 ? ' free' : '') + '"><span>Delivery</span><span>' +
            (t.shipping === 0 ? 'FREE' : money(t.shipping)) + '</span></div>';
        rows += '<div class="totals-row grand"><span>Total</span><span>' + money(t.total) + '</span></div>';

        var items = t.lines.filter(function (l) { return l.product; }).map(function (l) {
            return '<div class="co-line">' +
                '<img src="' + esc(NC.data.variantImage(l.product, l.color)) + '" alt="" loading="lazy" onerror="NC.ui.imgError(this)">' +
                '<div><b>' + esc(l.product.name) + '</b><span>Qty ' + l.qty +
                (l.color ? ' · ' + esc(l.color) : '') + (l.size ? ' · ' + esc(l.size) : '') + '</span></div>' +
                '<strong>' + money(l.lineTotal) + '</strong>' +
                '</div>';
        }).join('');

        return '<h3>Order summary</h3>' +
            '<div class="co-lines">' + items + '</div>' + rows +
            '<div class="coupon-row">' +
            '<input class="input" id="coCoupon" type="text" placeholder="Coupon code" value="' +
            esc(t.couponCode || '') + '" aria-label="Coupon code">' +
            '<button class="btn btn-outline" type="button" data-co="apply-coupon">Apply</button></div>' +
            (t.coupon ? '<button class="link-danger" type="button" data-co="clear-coupon" style="margin:0">' +
                icon('i-close') + 'Remove ' + esc(t.coupon.label) + '</button>' : '');
    }

    function refreshSummary() {
        var box = $('#coSummary');
        if (box) box.innerHTML = summaryMarkup(NC.store.totals());
        refreshPlaceBtn();
    }

    function refreshPlaceBtn() {
        var btn = $('[data-co="place"]');
        if (!btn) return;
        var total = money(NC.store.totals().total);
        btn.disabled = placing;
        btn.innerHTML = icon('i-shield') + (placing ? 'Placing order…' : 'Place order · ' + total);
    }

    /* ---------------- map ---------------- */

    function normalizeState(name) {
        if (!name) return '';
        var clean = String(name).trim();
        for (var i = 0; i < STATES.length; i++) {
            if (STATES[i].toLowerCase() === clean.toLowerCase()) return STATES[i];
        }
        return clean;
    }

    function searchUrl(q) {
        return 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=' +
            encodeURIComponent(q);
    }

    function reverseUrl(lat, lng) {
        return 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=' +
            encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lng);
    }

    function placeMarker(lat, lng) {
        if (!mapState.map || !window.L) return;
        if (!mapState.marker) {
            mapState.marker = window.L.marker([lat, lng], { draggable: true }).addTo(mapState.map);
            mapState.marker.on('dragend', function () {
                var ll = mapState.marker.getLatLng();
                reverse(ll.lat, ll.lng);
            });
        } else {
            mapState.marker.setLatLng([lat, lng]);
        }
        mapState.map.setView([lat, lng], 16);
    }

    function syncFields() {
        errors.address = null;
        paintErrors();
        var line = $('#coAddrLine');
        if (!line) return;
        var text = [form.line1, form.line2, form.city, form.state, form.pincode].filter(Boolean).join(', ');
        if (!text && form.lat != null && form.lng != null) text = 'Location pinned on map';
        if (text) {
            line.innerHTML = icon('i-pin') + ' ' + esc(text);
            line.hidden = false;
        } else {
            line.textContent = '';
            line.hidden = true;
        }
    }

    function reverse(lat, lng) {
        form.lat = lat;
        form.lng = lng;
        fetch(reverseUrl(lat, lng), { headers: { Accept: 'application/json' } })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var a = (data && data.address) || {};
                var line1 = [a.house_number, a.road].filter(Boolean).join(' ');
                form.line1 = line1 || form.line1 || data.display_name || '';
                form.line2 = a.neighbourhood || a.suburb || a.hamlet || a.village || form.line2 || '';
                form.city = a.city || a.town || a.village || a.county || a.municipality || form.city || '';
                form.state = normalizeState(a.state || form.state);
                form.pincode = a.postcode || form.pincode || '';
                syncFields();
            })
            .catch(function () {
                toast('Could not fetch the address for this point — try another spot', 'info');
            });
    }

    function locate() {
        if (!navigator.geolocation) { toast('Location is not available in this browser', 'error'); return; }
        toast('Getting your location…', 'info');
        navigator.geolocation.getCurrentPosition(function (pos) {
            var lat = pos.coords.latitude;
            var lng = pos.coords.longitude;
            placeMarker(lat, lng);
            reverse(lat, lng);
        }, function () {
            toast('Could not access your location', 'error');
        }, { enableHighAccuracy: true, timeout: 8000 });
    }

    function searchLocation() {
        var input = $('#coPlaceSearch');
        var q = input ? input.value.trim() : '';
        if (!q || searchBusy) return;
        searchBusy = true;
        fetch(searchUrl(q), { headers: { Accept: 'application/json' } })
            .then(function (r) { return r.json(); })
            .then(function (rows) {
                if (!rows || !rows.length) { toast('No matching location found', 'error'); return; }
                var hit = rows[0];
                var lat = parseFloat(hit.lat);
                var lng = parseFloat(hit.lon);
                placeMarker(lat, lng);
                reverse(lat, lng);
            })
            .catch(function () { toast('Location search failed — check your connection', 'error'); })
            .then(function () { searchBusy = false; });
    }

    function initMap() {
        var el = $('#coMap');
        if (!el) return;
        if (!window.L) {
            el.innerHTML = '<div class="co-map-empty">Map unavailable offline — you can still place your order.</div>';
            return;
        }
        if (mapState.map) {
            [80, 240].forEach(function (d) { setTimeout(function () { mapState.map.invalidateSize(); }, d); });
            return;
        }
        el.innerHTML = '';

        var start = (form.lat != null && form.lng != null) ? [form.lat, form.lng] : [20.5937, 78.9629];
        var zoom = (form.lat != null && form.lng != null) ? 15 : 4;
        var map = window.L.map(el, { zoomControl: true, scrollWheelZoom: false, attributionControl: true })
            .setView(start, zoom);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        mapState.map = map;
        mapState.marker = null;

        map.on('click', function (e) {
            placeMarker(e.latlng.lat, e.latlng.lng);
            reverse(e.latlng.lat, e.latlng.lng);
        });

        if (form.lat != null && form.lng != null) placeMarker(form.lat, form.lng);
        [80, 240].forEach(function (d) { setTimeout(function () { map.invalidateSize(); }, d); });
    }

    /* ---------------- validation & submit ---------------- */

    function collect() {
        $$('[data-co-input]').forEach(function (input) {
            form[input.getAttribute('data-co-input')] = input.value.trim();
        });
    }

    function validate() {
        errors = {};
        if (!form.name || form.name.trim().length < 3) errors.name = 'Enter your full name';
        if (!NC.auth.isPhone(form.phone)) errors.phone = 'Enter a valid 10-digit mobile number';
        return Object.keys(errors).length === 0;
    }

    function paintErrors() {
        $$('[data-co-field]').forEach(function (wrap) {
            var name = wrap.getAttribute('data-co-field');
            var err = errors[name];
            wrap.classList.toggle('invalid', !!err);
            var existing = wrap.querySelector('.field-error');
            if (err) {
                if (!existing) {
                    existing = document.createElement('span');
                    existing.className = 'field-error';
                    wrap.appendChild(existing);
                }
                existing.textContent = err;
            } else if (existing) {
                existing.remove();
            }
        });
    }

    function place() {
        if (placing) return;
        collect();
        if (!validate()) {
            paintErrors();
            var first = $('.co-form .field.invalid .input');
            if (first) first.focus();
            toast('Please fix the highlighted fields', 'error');
            return;
        }
        placing = true;
        refreshPlaceBtn();

        var t = NC.store.totals();
        var res = NC.store.placeOrder({
            address: {
                fullName: form.name,
                phone: form.phone,
                address1: form.line1,
                address2: form.line2,
                city: form.city,
                state: form.state,
                pincode: form.pincode,
                lat: form.lat != null ? form.lat : null,
                lng: form.lng != null ? form.lng : null
            },
            payment: 'cod',
            delivery: { method: 'standard', slot: 'any' }
        });

        if (!res.ok) {
            placing = false;
            refreshPlaceBtn();
            toast(res.reason, 'error');
            return;
        }

        var order = res.order;
        order.totals.shipping = t.shipping;
        order.totals.total = t.total;

        if (NC.auth && NC.auth.saveAddress && (form.line1 || form.city || form.pincode || form.lat != null)) {
            NC.auth.saveAddress({
                label: 'Home',
                name: form.name,
                phone: form.phone,
                line1: form.line1,
                line2: form.line2,
                city: form.city,
                state: form.state,
                pincode: form.pincode,
                lat: form.lat,
                lng: form.lng
            }).catch(function () { });
        }

        placing = false;
        var id = order.id;
        toast('Order ' + id + ' placed', 'success');
        NC.ui.closeDrawer();
        close();
        NC.router.go('/order/' + id);
    }

    /* ---------------- open / close ---------------- */

    function open() {
        if (!NC.store.getItemCount()) {
            toast('Your cart is empty — add something first', 'error');
            return;
        }
        if (NC.auth && NC.auth.requireAuth) {
            NC.auth.requireAuth(function () { reallyOpen(); });
        } else {
            reallyOpen();
        }
    }

    function destroyMap() {
        if (mapState.map) {
            try { mapState.map.remove(); } catch (e) { }
        }
        mapState.map = null;
        mapState.marker = null;
    }

    function reallyOpen() {
        var modal = $('#checkoutModal');
        if (!modal) return;
        if (!NC.store.getItemCount()) { toast('Your cart is empty', 'error'); return; }

        prefill();
        errors = {};
        placing = false;
        destroyMap();

        var body = $('[data-checkout-body]', modal);
        body.innerHTML = bodyMarkup();

        modal.hidden = false;
        document.body.classList.add('no-scroll');
        bind();
        syncFields();
        refreshSummary();
        initMap();

        var first = $('[data-co-input="name"]');
        if (first && !form.name) setTimeout(function () { first.focus(); }, 60);
    }

    function close() {
        var modal = $('#checkoutModal');
        if (!modal) return;
        modal.hidden = true;
        destroyMap();
        var authModal = $('#authModal');
        if (!authModal || authModal.hidden) document.body.classList.remove('no-scroll');
    }

    function bind() {
        if (bound) return;
        bound = true;
        var modal = $('#checkoutModal');

        modal.addEventListener('input', function (e) {
            var input = e.target.closest('[data-co-input]');
            if (!input) return;
            var name = input.getAttribute('data-co-input');
            form[name] = input.value;
            if (errors[name]) { errors[name] = null; paintErrors(); }
        });

        modal.addEventListener('change', function (e) {
            var input = e.target.closest('[data-co-input]');
            if (!input) return;
            form[input.getAttribute('data-co-input')] = input.value;
        });

        modal.addEventListener('click', function (e) {
            var el = e.target.closest('[data-co]');
            if (el) {
                var action = el.getAttribute('data-co');
                if (action === 'search') { searchLocation(); return; }
                if (action === 'locate') { locate(); return; }
                if (action === 'place') { place(); return; }
                if (action === 'apply-coupon') {
                    var input = $('#coCoupon');
                    var res = NC.store.applyCoupon(input ? input.value : '');
                    if (!res.ok) { toast(res.reason, 'error'); return; }
                    toast(res.coupon.label + ' applied', 'success');
                    refreshSummary();
                    return;
                }
                if (action === 'clear-coupon') {
                    NC.store.clearCoupon();
                    toast('Coupon removed', 'info');
                    refreshSummary();
                    return;
                }
            }
            if (e.target.closest('[data-checkout-scrim]') || e.target.closest('[data-checkout-close]')) {
                close();
            }
        });

        modal.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target.id === 'coPlaceSearch') {
                e.preventDefault();
                searchLocation();
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !modal.hidden) close();
        });
    }

    /* ---------------- triggers ---------------- */

    document.addEventListener('click', function (e) {
        var trigger = e.target.closest('[data-action="open-checkout"]');
        if (!trigger) return;
        e.preventDefault();
        NC.ui.closeDrawer();
        open();
    });

    NC.router.add('/checkout', function (view) {
        if (NC.views.cart && NC.views.cart.render) NC.views.cart.render(view);
        open();
    });

    NC.views = NC.views || {};
    NC.views.checkout = { open: open, close: close };
})();
