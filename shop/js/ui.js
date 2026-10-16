(function () {
    'use strict';

    var rupee = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    });

    var OPEN_DRAWER = null;
    var lastFocused = null;

    function money(value) {
        return rupee.format(Math.round(value || 0));
    }

    function num(value) {
        return new Intl.NumberFormat('en-IN').format(Math.round(value || 0));
    }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function icon(id, cls) {
        return '<svg class="' + (cls || 'icon') + '" aria-hidden="true"><use href="#' + id + '"></use></svg>';
    }

    function imgError(img) {
        if (img.dataset.fallbackApplied) return;
        img.dataset.fallbackApplied = '1';
        img.src = NC.data.placeholder;
    }

    function debounce(fn, wait) {
        var t;
        return function () {
            var ctx = this;
            var args = arguments;
            clearTimeout(t);
            t = setTimeout(function () {
                fn.apply(ctx, args);
            }, wait);
        };
    }

    function starsMarkup(rating) {
        var out = '';
        var full = Math.floor(rating);
        var half = rating - full >= 0.5;
        var i;
        for (i = 1; i <= 5; i++) {
            if (i <= full) {
                out += icon('i-star');
            } else if (i === full + 1 && half) {
                out += icon('i-star-half');
            } else {
                out += icon('i-star-half', 'icon star-off');
            }
        }
        return out;
    }

    function ratingMarkup(product, showCount) {
        return '<span class="card-rating"><span class="stars" aria-hidden="true">' + starsMarkup(product.rating) +
            '</span><span class="sr-only">Rated ' + product.rating + ' out of 5</span>' +
            (showCount === false ? '' : '<span>(' + num(product.reviewCount) + ')</span>') + '</span>';
    }

    function discountPct(product) {
        if (!product) return 0;
        var price = Number(product.price) || 0;
        var mrp = Number(product.mrp) || 0;
        if (mrp > price && mrp > 0) {
            return Math.round(((mrp - price) / mrp) * 100);
        }
        return Math.round(Number(product.discountPct)) || 0;
    }

    function badgesFor(product) {
        var out = '';
        var off = discountPct(product);
        if (off > 0) {
            out += '<span class="pill pill-sale">' + off + '% off</span>';
        }
        var tags = Array.isArray(product.tags) ? product.tags : [];
        var badges = Array.isArray(product.badges) ? product.badges : [];
        if (tags.indexOf('new') !== -1 || badges.indexOf('new') !== -1) {
            out += '<span class="pill pill-new">New</span>';
        }
        if (tags.indexOf('bestseller') !== -1 || badges.indexOf('bestseller') !== -1) {
            out += '<span class="pill pill-best">Bestseller</span>';
        }
        if (tags.indexOf('lowstock') !== -1 || (product.stock > 0 && product.stock <= 8)) {
            out += '<span class="pill pill-low">Only ' + product.stock + ' left</span>';
        }
        return out;
    }

    function card(product, opts) {
        opts = opts || {};
        var fav = NC.store.isWishlisted(product.id);
        var href = '#/product/' + product.id;
        var off = discountPct(product);

        var swatches = (product.colors || []).slice(0, 4).map(function (c) {
            return '<span class="swatch" style="background:' + esc(c[1]) + '" title="' + esc(c[0]) + '"></span>';
        }).join('');
        if (product.colors && product.colors.length > 4) {
            swatches += '<span class="swatch-more">+' + (product.colors.length - 4) + '</span>';
        }

        return '<article class="card" data-product="' + product.id + '">' +
            '<a class="card-media" href="' + href + '" aria-label="View ' + esc(product.name) + '">' +
            '<img src="' + esc(product.images[0]) + '" alt="' + esc(product.name) + '" loading="lazy" decoding="async" onerror="NC.ui.imgError(this)">' +
            (badgesFor(product) ? '<div class="card-badges">' + badgesFor(product) + '</div>' : '') +
            '</a>' +
            '<button class="card-fav' + (fav ? ' on' : '') + '" type="button" data-action="toggle-wish" data-id="' + product.id +
            '" aria-pressed="' + fav + '" aria-label="' + (fav ? 'Remove from wishlist' : 'Add to wishlist') + '">' +
            icon(fav ? 'i-heart-fill' : 'i-heart') +
            '</button>' +
            '<div class="card-body">' +
            '<span class="card-brand">' + esc(product.brand) + '</span>' +
            '<h3 class="card-name"><a href="' + href + '">' + esc(product.name) + '</a></h3>' +
            ratingMarkup(product) +
            '<div class="card-price"><span class="price-now">' + money(product.price) + '</span>' +
            (product.mrp > product.price ? '<span class="price-was">' + money(product.mrp) + '</span>' : '') +
            (off > 0 ? '<span class="price-off">' + off + '% off</span>' : '') +
            '</div>' +
            (product.colors && product.colors.length > 1 ? '<div class="swatches">' + swatches + '</div>' : '') +
            '</div>' +
            '</article>';
    }

    function grid(products, opts) {
        if (!products.length) return emptyState(opts);
        return '<div class="grid-products">' + products.map(function (p) {
            return card(p, opts);
        }).join('') + '</div>';
    }

    function emptyState(opts) {
        opts = opts || {};
        return '<div class="empty">' +
            '<span class="empty-icon">' + icon(opts.icon || 'i-cart') + '</span>' +
            '<h3>' + esc(opts.title || 'Nothing here yet') + '</h3>' +
            '<p>' + esc(opts.text || 'Try a different search or browse our categories.') + '</p>' +
            (opts.actionHref
                ? '<a class="btn btn-primary" href="' + opts.actionHref + '">' + esc(opts.actionLabel || 'Start shopping') + '</a>'
                : '') +
            '</div>';
    }

    function breadcrumb(trail) {
        if (!trail || !trail.length) return '';
        var parts = [];
        for (var i = 0; i < trail.length; i++) {
            var item = trail[i];
            var last = i === trail.length - 1;
            var label = last
                ? '<span aria-current="page">' + esc(item.name) + '</span>'
                : '<a href="' + (item.href || '#/') + '">' + esc(item.name) + '</a>';
            parts.push('<li class="breadcrumb-item">' + label + '</li>');
            if (!last) {
                parts.push('<li class="breadcrumb-separator" aria-hidden="true">' + icon('i-chevron-right') + '</li>');
            }
        }
        return '<nav class="breadcrumb" aria-label="Breadcrumb"><ol class="breadcrumb-list" style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;list-style:none;margin:0;padding:0">' +
            parts.join('') + '</ol></nav>';
    }

    function toast(message, type, duration) {
        var stack = document.querySelector('[data-toasts]');
        if (!stack) return;
        var kind = type || 'success';
        var iconId = kind === 'error' ? 'i-info' : kind === 'info' ? 'i-info' : 'i-check-circle';
        var el = document.createElement('div');
        el.className = 'toast ' + kind;
        el.setAttribute('role', 'status');
        el.innerHTML = icon(iconId) + '<span>' + esc(message) + '</span>';
        stack.appendChild(el);

        setTimeout(function () {
            el.classList.add('out');
            setTimeout(function () {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, 220);
        }, duration || 2800);
    }

    function announce(message) {
        var live = document.querySelector('[data-sr-live]');
        if (live) live.textContent = message;
    }

    function shipProgress(t) {
        var pct;
        var note;
        if (!t.lines.length) {
            return '<div class="ship-progress"><div class="ship-note">Add ' + money(t.freeShippingMin) +
                ' or more to unlock free delivery.</div><div class="ship-bar"><i style="width:0%"></i></div></div>';
        }
        if (t.shippingFree) {
            pct = 100;
            note = 'Nice — you have unlocked free delivery on this order.';
        } else {
            pct = Math.min(100, Math.round((t.subtotal - t.couponDiscount) / t.freeShippingMin * 100));
            note = 'Add ' + money(t.freeShippingGap) + ' more for free delivery.';
        }
        return '<div class="ship-progress"><div class="ship-note">' + esc(note) + '</div>' +
            '<div class="ship-bar"><i style="width:' + pct + '%"></i></div></div>';
    }

    function summaryMarkup(t, opts) {
        opts = opts || {};
        var rows = [];
        rows.push('<div class="totals-row"><span>Subtotal (' + t.itemCount + ' item' + (t.itemCount === 1 ? '' : 's') + ')</span><span>' +
            money(t.subtotal) + '</span></div>');

        if (t.couponDiscount > 0) {
            rows.push('<div class="totals-row"><span>Coupon ' + esc(t.couponCode) + '</span><span style="color:var(--success);font-weight:600">− ' +
                money(t.couponDiscount) + '</span></div>');
        }

        if (t.tax > 0) {
            rows.push('<div class="totals-row"><span>GST (included)</span><span>' + money(t.tax) + '</span></div>');
        }

        rows.push('<div class="totals-row' + (t.shippingFree ? ' free' : '') + '"><span>Delivery</span><span>' +
            (t.shippingFree ? 'FREE' : money(t.shipping)) + '</span></div>');

        if (t.savings > 0) {
            rows.push('<div class="totals-row" style="color:var(--success);font-weight:600"><span>You save</span><span>' +
                money(t.savings) + '</span></div>');
        }

        rows.push('<div class="totals-row grand"><span>Total</span><span>' + money(t.total) + '</span></div>');

        var trust = '<div class="trust-row">' +
            '<span>' + icon('i-card') + 'Cash on delivery available</span>' +
            '<span>' + icon('i-truck') + 'Delivery in 2-4 business days</span>' +
            '</div>';

        return '<div class="summary">' +
            '<h3>Order summary</h3>' +
            shipProgress(t) +
            rows.join('') +
            (opts.coupon === false ? '' : '<div class="coupon-row">' +
                '<input class="input" type="text" placeholder="Coupon code" data-coupon-input value="' +
                esc(t.couponCode || '') + '" aria-label="Coupon code">' +
                '<button class="btn btn-outline" type="button" data-action="apply-coupon">Apply</button>' +
                '</div>' +
                (t.coupon ? '<button class="link-danger" type="button" data-action="clear-coupon" style="margin-left:0">Remove coupon ' +
                    icon('i-close') + '</button>' : '') +
                '<p class="coupon-ok" data-coupon-msg>' + (t.coupon ? esc(t.coupon.label + ' applied') : 'Try NOVARC10 or WELCOME15') + '</p>') +
            trust +
            '</div>';
    }

    function lineItemMarkup(line, opts) {
        opts = opts || {};
        var product = line.product;
        var variants = [];
        if (line.color) variants.push('Colour: ' + line.color);
        if (line.size) variants.push('Size: ' + line.size);
        var canIncrease = line.qty < Math.min(NC.store.MAX_QTY, product.stock);

        return '<div class="cart-item" data-line="' + esc(line.key) + '">' +
            '<a class="cart-item-media" href="#/product/' + product.id + '">' +
            '<img src="' + esc(product.images[0]) + '" alt="' + esc(product.name) + '" loading="lazy" onerror="NC.ui.imgError(this)"></a>' +
            '<div class="cart-item-body">' +
            '<span class="card-brand">' + esc(product.brand) + '</span>' +
            '<a href="#/product/' + product.id + '"><span class="cart-item-name">' + esc(product.name) + '</span></a>' +
            (variants.length ? '<span class="cart-item-variants">' + esc(variants.join(' · ')) + '</span>' : '') +
            '<div class="cart-item-foot">' +
            '<div class="qty-sm">' +
            '<button type="button" data-action="dec" data-key="' + esc(line.key) + '" aria-label="Decrease quantity">' + icon('i-minus') + '</button>' +
            '<output>' + line.qty + '</output>' +
            '<button type="button" data-action="inc" data-key="' + esc(line.key) + '" aria-label="Increase quantity"' +
            (canIncrease ? '' : ' disabled') + '>' + icon('i-plus') + '</button>' +
            '</div>' +
            '<span class="price-now">' + money(line.lineTotal) + '</span>' +
            '<button class="link-danger" type="button" data-action="remove" data-key="' + esc(line.key) + '">' +
            icon('i-trash') + 'Remove</button>' +
            '</div>' +
            '</div>' +
            '</div>';
    }

    function updateBadges() {
        var cart = NC.store.getItemCount();
        var wish = NC.store.getWishlist().length;
        document.querySelectorAll('[data-badge="cart"]').forEach(function (el) {
            el.textContent = cart > 99 ? '99+' : cart;
            el.hidden = cart === 0;
        });
        document.querySelectorAll('[data-badge="wishlist"]').forEach(function (el) {
            el.textContent = wish > 99 ? '99+' : wish;
            el.hidden = wish === 0;
        });
        document.querySelectorAll('[data-cart-summary-count]').forEach(function (el) {
            el.textContent = cart ? '(' + cart + ')' : '';
        });
    }

    function renderCartDrawer() {
        var body = document.querySelector('[data-cart-drawer-body]');
        var foot = document.querySelector('[data-cart-drawer-foot]');
        if (!body || !foot) return;

        var t = NC.store.totals();

        document.querySelectorAll('[data-cart-summary-subtotal]').forEach(function (el) {
            el.textContent = money(t.subtotal);
        });

        var progress = document.querySelector('[data-ship-progress]');
        if (progress) progress.innerHTML = shipProgress(t);

        if (!t.lines.length) {
            body.innerHTML = emptyState({
                icon: 'i-cart',
                title: 'Your cart is empty',
                text: 'Browse our categories and add something you love.',
                actionHref: '#/',
                actionLabel: 'Start shopping'
            });
            foot.hidden = true;
            return;
        }

        foot.hidden = false;
        body.innerHTML = '<div class="cart-list">' + t.lines.map(function (line) {
            return lineItemMarkup(line, { compact: true });
        }).join('') + '</div>';
    }

    function trapFocus(container, event) {
        var focusables = container.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function openDrawer(name) {
        var el = document.getElementById(name);
        if (!el) return;
        if (OPEN_DRAWER && OPEN_DRAWER !== name) closeDrawer(true);

        lastFocused = document.activeElement;
        var scrim = document.querySelector('[data-scrim]');

        el.classList.add('open');
        el.setAttribute('aria-hidden', 'false');
        if (scrim) {
            scrim.hidden = false;
            requestAnimationFrame(function () { scrim.classList.add('show'); });
        }
        document.body.classList.add('no-scroll');
        OPEN_DRAWER = name;

        document.querySelectorAll('[aria-controls="' + name + '"]').forEach(function (btn) {
            btn.setAttribute('aria-expanded', 'true');
        });

        var focusTarget = el.querySelector('button, a[href]');
        if (focusTarget) focusTarget.focus();
    }

    function closeDrawer(silent) {
        if (!OPEN_DRAWER) return;
        var el = document.getElementById(OPEN_DRAWER);
        var scrim = document.querySelector('[data-scrim]');
        var name = OPEN_DRAWER;
        OPEN_DRAWER = null;

        if (el) {
            el.classList.remove('open');
            el.setAttribute('aria-hidden', 'true');
        }
        if (scrim) {
            scrim.classList.remove('show');
            setTimeout(function () { scrim.hidden = true; }, 200);
        }
        document.body.classList.remove('no-scroll');

        document.querySelectorAll('[aria-controls="' + name + '"]').forEach(function (btn) {
            btn.setAttribute('aria-expanded', 'false');
        });

        if (!silent && lastFocused && lastFocused.focus) lastFocused.focus();
        lastFocused = null;
    }

    function isDrawerOpen() {
        return !!OPEN_DRAWER;
    }

    function toggleWish(trigger) {
        var id = trigger.getAttribute('data-id');
        if (!id) return;
        var added = NC.store.toggleWishlist(id);
        var product = NC.data.byId(id);
        toast(added ? 'Saved ' + (product ? product.name : 'item') : 'Removed from wishlist', added ? 'success' : 'info');
        announce(added ? 'Added to wishlist' : 'Removed from wishlist');
        NC.router.render();
    }

    function quickAdd(id) {
        var product = NC.data.byId(id);
        if (!product) return;
        if (product.sizes.length) {
            NC.router.go('/product/' + id);
            return;
        }
        var res = NC.store.addToCart(id, 1, product.colors[0] ? product.colors[0][0] : null, null);
        if (!res.ok) {
            toast(res.reason, 'error');
            return;
        }
        toast('Added ' + product.name, 'success');
        announce(product.name + ' added to cart');
        openDrawer('cartDrawer');
    }

    function bumpQty(key, delta) {
        var line = null;
        NC.store.getLines().forEach(function (l) { if (l.key === key) line = l; });
        if (!line) return;
        if (line.qty + delta < 1) {
            removeLine(key);
            return;
        }
        NC.store.setQty(key, line.qty + delta);
    }

    function removeLine(key) {
        var removed = NC.store.removeLine(key);
        if (removed) {
            var product = NC.data.byId(removed.id);
            toast('Removed ' + (product ? product.name : 'item'), 'info');
        }
    }

    function applyCoupon() {
        var input = document.querySelector('[data-coupon-input]');
        if (!input) return;
        var res = NC.store.applyCoupon(input.value);
        if (!res.ok) {
            toast(res.reason, 'error');
            var msg = document.querySelector('[data-coupon-msg]');
            if (msg) {
                msg.textContent = res.reason;
                msg.classList.add('field-error');
            }
            return;
        }
        toast(res.coupon.label + ' applied', 'success');
        NC.router.render();
    }

    function clearCoupon() {
        NC.store.clearCoupon();
        toast('Coupon removed', 'info');
        NC.router.render();
    }

    function closeImageZoom() {
        var box = document.getElementById('imgZoom');
        if (!box || box.hidden) return;
        box.hidden = true;
        var img = box.querySelector('img');
        if (img) img.removeAttribute('src');
        document.body.classList.remove('no-scroll');
    }

    function openImageZoom(src, alt) {
        if (!src) return;
        var box = document.getElementById('imgZoom');
        if (!box) {
            box = document.createElement('div');
            box.id = 'imgZoom';
            box.className = 'img-zoom';
            box.hidden = true;
            box.innerHTML = '<button class="img-zoom-close" type="button" aria-label="Close image">' +
                icon('i-close') + '</button><img alt="">';
            document.body.appendChild(box);
            box.addEventListener('click', function () { closeImageZoom(); });
        }
        var img = box.querySelector('img');
        img.setAttribute('src', src);
        img.setAttribute('alt', alt || '');
        box.hidden = false;
        document.body.classList.add('no-scroll');
    }

    function bindGlobal() {
        var scrim = document.querySelector('[data-scrim]');
        if (scrim) {
            scrim.addEventListener('click', function () {
                closeDrawer();
                var filters = document.querySelector('[data-filters].open');
                if (filters) {
                    filters.classList.remove('open');
                    scrim.classList.remove('show');
                    setTimeout(function () { scrim.hidden = true; }, 200);
                    document.body.classList.remove('no-scroll');
                }
            });
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                var zoom = document.getElementById('imgZoom');
                if (zoom && !zoom.hidden) { closeImageZoom(); return; }
            }
            if (e.key === 'Escape') {
                var installModal = document.getElementById('installApkModal');
                if (installModal && !installModal.hidden) {
                    if (NC.pwa && NC.pwa.closePopup) NC.pwa.closePopup();
                    return;
                }
            }
            if (e.key === 'Escape' && OPEN_DRAWER) {
                closeDrawer();
                return;
            }
            if (e.key === 'Escape') {
                var openFilters = document.querySelector('[data-filters].open');
                if (openFilters) {
                    openFilters.classList.remove('open');
                    if (scrim) {
                        scrim.classList.remove('show');
                        setTimeout(function () { scrim.hidden = true; }, 200);
                    }
                    document.body.classList.remove('no-scroll');
                    return;
                }
            }
            if (e.key === 'Tab' && OPEN_DRAWER) {
                var el = document.getElementById(OPEN_DRAWER);
                if (el) trapFocus(el, e);
            }
        });

        document.addEventListener('click', function (e) {
            var zoomImg = e.target.closest('img[data-lightbox]');
            if (zoomImg) {
                e.preventDefault();
                e.stopPropagation();
                openImageZoom(zoomImg.getAttribute('src'), zoomImg.getAttribute('alt'));
                return;
            }
            var trigger = e.target.closest('[data-action]');
            if (!trigger) return;
            var action = trigger.getAttribute('data-action');

            if (action === 'open-nav') { openDrawer('navDrawer'); }
            else if (action === 'close-nav') { closeDrawer(); }
            else if (action === 'install-pwa') {
                if (NC.pwa && NC.pwa.openPopup) NC.pwa.openPopup();
                else if (NC.pwa && NC.pwa.install) NC.pwa.install();
            }
            else if (action === 'confirm-install') {
                closeDrawer();
                if (NC.pwa && NC.pwa.install) NC.pwa.install();
                if (NC.pwa && NC.pwa.closePopup) NC.pwa.closePopup();
            }
            else if (action === 'dismiss-install') {
                if (NC.pwa && NC.pwa.closePopup) NC.pwa.closePopup();
            }
            else if (action === 'open-cart') { openDrawer('cartDrawer'); }
            else if (action === 'close-cart') { closeDrawer(); }
            else if (action === 'toggle-theme') { NC.store.toggleTheme(); }
            else if (action === 'toggle-wish') { toggleWish(trigger); }
            else if (action === 'quick-add') {
                e.preventDefault();
                e.stopPropagation();
                quickAdd(trigger.getAttribute('data-id'));
            }
            else if (action === 'inc') { bumpQty(trigger.getAttribute('data-key'), 1); }
            else if (action === 'dec') { bumpQty(trigger.getAttribute('data-key'), -1); }
            else if (action === 'remove') { removeLine(trigger.getAttribute('data-key')); }
            else if (action === 'clear-line') { removeLine(trigger.getAttribute('data-key')); }
            else if (action === 'apply-coupon') { applyCoupon(); }
            else if (action === 'clear-coupon') { clearCoupon(); }
            else if (action === 'show-toast') {
                var label = (trigger.textContent || '').trim();
                toast(label ? label + ' is not available yet' : 'Coming soon', 'info');
            }
        });

        NC.store.subscribe(function (reason) {
            if (reason.indexOf('cart') === 0 || reason === 'coupon:apply' || reason === 'coupon:clear') {
                updateBadges();
                renderCartDrawer();
            }
            if (reason.indexOf('wishlist') === 0) updateBadges();
        });

        updateBadges();
        renderCartDrawer();
    }

    NC.ui = {
        money: money,
        num: num,
        esc: esc,
        icon: icon,
        imgError: imgError,
        debounce: debounce,
        stars: starsMarkup,
        discountPct: discountPct,
        badges: badgesFor,
        card: card,
        grid: grid,
        emptyState: emptyState,
        breadcrumb: breadcrumb,
        toast: toast,
        announce: announce,
        shipProgress: shipProgress,
        summary: summaryMarkup,
        lineItem: lineItemMarkup,
        updateBadges: updateBadges,
        renderCartDrawer: renderCartDrawer,
        openDrawer: openDrawer,
        closeDrawer: closeDrawer,
        isDrawerOpen: isDrawerOpen,
        openImageZoom: openImageZoom,
        closeImageZoom: closeImageZoom,
        bindGlobal: bindGlobal
    };
})();