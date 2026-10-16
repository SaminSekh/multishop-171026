(function () {
    'use strict';

    var state = {
        id: null,
        color: null,
        size: null,
        qty: 1,
        image: 0,
        openPanel: 'highlights',
        reviewStars: null,
        reviewText: null
    };

    function availableSizes(product, name) {
        for (var i = 0; i < product.colors.length; i++) {
            if (product.colors[i][0] === name) {
                var sizes = product.colors[i][3];
                if (sizes && sizes.length) return sizes;
            }
        }
        return product.sizes;
    }

    function variantStock(product, name) {
        for (var i = 0; i < product.colors.length; i++) {
            if (product.colors[i][0] === name) {
                var stock = product.colors[i][4];
                return (stock === null || stock === undefined) ? null : stock;
            }
        }
        return null;
    }

    function sizeStock(product, color, size) {
        if (size == null) return null;
        for (var i = 0; i < product.colors.length; i++) {
            if (product.colors[i][0] === color) {
                var map = product.colors[i][5];
                if (map && Object.prototype.hasOwnProperty.call(map, size)) return map[size];
                return null;
            }
        }
        return null;
    }

    function effectiveStock(product, color, size) {
        var bySize = sizeStock(product, color, size);
        if (bySize != null) return bySize;
        var stock = variantStock(product, color);
        return stock == null ? product.stock : stock;
    }

    function isSizeSoldOut(product, color, size) {
        return effectiveStock(product, color, size) < 1;
    }

    function shipNote() {
        var min = (NC.store && NC.store.getFreeShippingMin) ? NC.store.getFreeShippingMin() : 999;
        var fee = (NC.store && NC.store.getShippingFee) ? NC.store.getShippingFee() : 49;
        if (!fee) return 'Free delivery on all orders';
        if (!min) return 'Delivery ' + NC.ui.money(fee);
        return 'Free delivery over ' + NC.ui.money(min) + ', else ' + NC.ui.money(fee);
    }

    function isSoldOut(product, color) {
        var sizes = availableSizes(product, color);
        var map = null;
        for (var i = 0; i < product.colors.length; i++) {
            if (product.colors[i][0] === color) map = product.colors[i][5];
        }
        if (map && sizes.length) {
            for (var j = 0; j < sizes.length; j++) {
                if (effectiveStock(product, color, sizes[j]) > 0) return false;
            }
            return true;
        }
        var stock = variantStock(product, color);
        return stock != null && stock < 1;
    }

    function firstAvailableColor(product) {
        for (var i = 0; i < product.colors.length; i++) {
            if (!isSoldOut(product, product.colors[i][0])) return product.colors[i][0];
        }
        return product.colors[0] ? product.colors[0][0] : null;
    }

    function firstAvailableSize(product, color) {
        var sizes = availableSizes(product, color);
        for (var i = 0; i < sizes.length; i++) {
            if (!isSizeSoldOut(product, color, sizes[i])) return sizes[i];
        }
        return sizes[0] || null;
    }

    function selection(product) {
        var color = state.color;
        var known = product.colors.some(function (c) { return c[0] === color; });
        if (!color || !known || isSoldOut(product, color)) color = firstAvailableColor(product);
        var sizes = availableSizes(product, color);
        var size = state.size;
        if (!size || sizes.indexOf(size) === -1 || isSizeSoldOut(product, color, size)) {
            size = firstAvailableSize(product, color);
        }
        return { color: color, size: size };
    }

    function maxQty(product) {
        var sel = selection(product);
        var stock = effectiveStock(product, sel.color, sel.size);
        return Math.max(1, Math.min(NC.store.MAX_QTY, stock));
    }

    function stockLine(product, color, size) {
        var stock = effectiveStock(product, color, size);
        if (stock < 1) {
            return '<p class="stock-line stock-out">' + NC.ui.icon('i-info') + 'Currently out of stock</p>';
        }
        if (stock <= 8) {
            return '<p class="stock-line stock-low">' + NC.ui.icon('i-bolt') + 'Hurry — only ' +
                stock + ' left in stock</p>';
        }
        return '<p class="stock-line stock-in">' + NC.ui.icon('i-check-circle') + 'In stock, ready to ship</p>';
    }

    function colorImage(product, name) {
        if (!name) return null;
        for (var i = 0; i < product.colors.length; i++) {
            if (product.colors[i][0] === name) return product.colors[i][2] || null;
        }
        return null;
    }

    function colorForImage(product, src) {
        if (!src) return null;
        for (var i = 0; i < product.colors.length; i++) {
            if (product.colors[i][2] === src) return product.colors[i][0];
        }
        return null;
    }

    function galleryImages(product) {
        var list = (product.images || []).slice();
        product.colors.forEach(function (c) {
            if (c[2] && list.indexOf(c[2]) === -1) list.push(c[2]);
        });
        return list.length ? list : (product.images || []);
    }

    function selectedImageIndex(product) {
        var variant = colorImage(product, selection(product).color);
        if (!variant) return 0;
        var idx = galleryImages(product).indexOf(variant);
        return idx === -1 ? 0 : idx;
    }

    function galleryMarkup(product) {
        var imgs = galleryImages(product);
        if (state.image >= imgs.length) state.image = 0;

        var thumbs = imgs.map(function (src, i) {
            return '<button class="thumb' + (i === state.image ? ' active' : '') + '" type="button" data-action="pdp-img" data-index="' +
                i + '" aria-label="View image ' + (i + 1) + '"><img src="' + NC.ui.esc(src) + '" alt="" loading="lazy" onerror="NC.ui.imgError(this)"></button>';
        }).join('');

        var off = NC.ui.discountPct ? NC.ui.discountPct(product) : 0;
        return '<div class="gallery">' +
            '<div class="gallery-main">' +
            '<img src="' + NC.ui.esc(imgs[state.image]) + '" alt="' + NC.ui.esc(product.name) + '" data-lightbox onerror="NC.ui.imgError(this)">' +
            (off > 0 ? '<div class="card-badges"><span class="pill pill-sale">' + off + '% off</span></div>' : '') +
            '<button class="card-fav gallery-fav' + (NC.store.isWishlisted(product.id) ? ' on' : '') + '" type="button" data-action="pdp-wish" data-id="' +
            product.id + '" aria-label="Toggle wishlist">' + NC.ui.icon(NC.store.isWishlisted(product.id) ? 'i-heart-fill' : 'i-heart') + '</button>' +
            '</div>' +
            '<div class="gallery-thumbs">' + thumbs + '</div>' +
            '</div>';
    }

    function optionsMarkup(product) {
        var sel = selection(product);
        var out = '';

        if (product.colors.length) {
            out += '<div class="opt-group"><span class="opt-label">Colour: <b>' + NC.ui.esc(sel.color || '—') + '</b></span>' +
                '<div class="color-list">' + product.colors.map(function (c) {
                    var out = isSoldOut(product, c[0]);
                    return '<button class="color-opt' + (c[0] === sel.color ? ' active' : '') + (c[2] ? ' has-image' : '') + (out ? ' sold-out' : '') +
                        '" type="button" data-action="pdp-color" data-color="' + NC.ui.esc(c[0]) + '"' + (out ? ' disabled' : '') +
                        ' title="' + NC.ui.esc(out ? c[0] + ' — sold out' : (c[2] ? 'Preview ' + c[0] : c[0])) + '">' +
                        '<span class="dot" style="background:' + NC.ui.esc(c[1]) + '"></span>' +
                        NC.ui.esc(c[0]) + (c[2] && !out ? ' <span class="color-cam" aria-hidden="true">' + NC.ui.icon('i-image') + '</span>' : '') +
                        (out ? ' <span class="color-sold">Sold out</span>' : '') + '</button>';
                }).join('') + '</div></div>';
        }

        var sizes = availableSizes(product, sel.color);
        if (sizes.length) {
            out += '<div class="opt-group"><span class="opt-label">Size: <b>' + NC.ui.esc(sel.size || '—') + '</b></span>' +
                '<div class="size-list">' + sizes.map(function (s) {
                    var sold = isSizeSoldOut(product, sel.color, s);
                    return '<button class="size-opt' + (s === sel.size ? ' active' : '') + (sold ? ' sold-out' : '') +
                        '" type="button" data-action="pdp-size" data-size="' + NC.ui.esc(s) + '"' + (sold ? ' disabled' : '') +
                        ' title="' + NC.ui.esc(sold ? s + ' — sold out' : s) + '">' + NC.ui.esc(s) +
                        (sold ? ' <span class="size-sold">Sold out</span>' : '') + '</button>';
                }).join('') + '</div></div>';
        }

        return out;
    }

    function qtyMarkup(product) {
        var max = maxQty(product);
        if (state.qty > max) state.qty = max;
        if (state.qty < 1) state.qty = 1;
        return '<div class="opt-group"><span class="opt-label">Quantity</span>' +
            '<div class="pdp-actions-row">' +
            '<div class="qty">' +
            '<button type="button" data-action="pdp-dec" aria-label="Decrease quantity"' + (state.qty <= 1 ? ' disabled' : '') + '>' +
            NC.ui.icon('i-minus') + '</button>' +
            '<output aria-live="polite">' + state.qty + '</output>' +
            '<button type="button" data-action="pdp-inc" aria-label="Increase quantity"' + (state.qty >= max ? ' disabled' : '') + '>' +
            NC.ui.icon('i-plus') + '</button>' +
            '</div>' +
            '<span class="tax-note">' + NC.ui.money(product.price * state.qty) + ' total</span>' +
            '</div></div>';
    }

    function reviewDate(value) {
        var d = new Date(value);
        if (isNaN(d.getTime())) return String(value || '');
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function reviewCard(review, mine) {
        return '<article class="review">' +
            '<div class="review-head">' +
            '<span class="review-avatar" aria-hidden="true">' + NC.ui.esc(String(review.name || 'S').charAt(0).toUpperCase()) + '</span>' +
            '<div class="review-who"><b>' + NC.ui.esc(review.name || 'Shopper') +
            (mine ? ' <span class="pill pill-new" style="font-size:.6rem">You</span>' : '') + '</b>' +
            '<span><span class="stars" aria-hidden="true">' + NC.ui.stars(review.stars) + '</span> · ' + NC.ui.esc(reviewDate(review.createdAt)) + '</span></div>' +
            '</div>' +
            '<p>' + NC.ui.esc(review.text) + '</p>' +
            '</article>';
    }

    function starPicker(value) {
        var out = '';
        for (var i = 1; i <= 5; i++) {
            out += '<button type="button" class="star-pick' + (i <= value ? ' on' : '') + '" data-action="pdp-review-star" data-star="' + i +
                '" aria-label="Rate ' + i + ' star' + (i === 1 ? '' : 's') + '">' + NC.ui.icon('i-star') + '</button>';
        }
        return out;
    }

    function reviewForm(product, summary) {
        if (!NC.auth || !NC.auth.isSignedIn()) {
            return '<div class="review-cta">' +
                '<div><b>Share your experience</b><p class="tax-note">Sign in with your mobile number to rate and review this product.</p></div>' +
                '<button class="btn btn-primary" type="button" data-action="pdp-review-login">' + NC.ui.icon('i-user') + 'Sign in to review</button>' +
                '</div>';
        }
        var existing = summary.userReview;
        var stars = state.reviewStars == null ? (existing ? existing.stars : 0) : state.reviewStars;
        var text = state.reviewText == null ? (existing ? existing.text : '') : state.reviewText;
        return '<form class="review-form" data-review-form data-product="' + NC.ui.esc(product.id) + '">' +
            '<b>' + (existing ? 'Update your review' : 'Write a review') + '</b>' +
            '<div class="star-picker" role="radiogroup" aria-label="Your rating">' + starPicker(stars) + '</div>' +
            '<textarea class="input" data-review-text rows="3" maxlength="600" placeholder="What did you like or dislike about this product?">' + NC.ui.esc(text) + '</textarea>' +
            '<button class="btn btn-primary" type="submit">' + (existing ? 'Update review' : 'Submit review') + '</button>' +
            '</form>';
    }

    function reviewsMarkup(product, summary) {
        var sum = summary || { avg: product.rating, count: product.reviewCount, breakdown: product.breakdown, reviews: [], userReview: null };

        var summaryHtml = '<div class="review-summary"><div class="review-score">' +
            '<b>' + sum.avg.toFixed(1) + '</b>' +
            '<div><div class="stars" aria-hidden="true">' + NC.ui.stars(sum.avg) + '</div>' +
            '<p class="tax-note">' + NC.ui.num(sum.count) + ' rating' + (sum.count === 1 ? '' : 's') + '</p></div></div>' +
            '<div style="flex:1;display:grid;gap:.4rem">' +
            sum.breakdown.map(function (row) {
                return '<div class="bar-row"><span>' + row.stars + ' star</span>' +
                    '<span class="bar"><i style="width:' + row.pct + '%"></i></span>' +
                    '<span>' + row.pct + '%</span></div>';
            }).join('') +
            '</div></div>';

        var mine = sum.userReview;
        var others = sum.reviews.filter(function (r) { return !mine || r.id !== mine.id; });
        var seeded = product.reviews.map(function (r) {
            return '<article class="review">' +
                '<div class="review-head">' +
                '<span class="review-avatar" aria-hidden="true">' + NC.ui.esc(r.user.charAt(0)) + '</span>' +
                '<div class="review-who"><b>' + NC.ui.esc(r.user) + (r.verified ? ' <span class="pill pill-new" style="font-size:.6rem">Verified</span>' : '') + '</b>' +
                '<span><span class="stars" aria-hidden="true">' + NC.ui.stars(r.stars) + '</span> · ' + NC.ui.esc(r.date) + '</span></div>' +
                '</div>' +
                '<p>' + NC.ui.esc(r.text) + '</p>' +
                '</article>';
        }).join('');

        var list = (mine ? reviewCard(mine, true) : '') +
            others.map(function (r) { return reviewCard(r, false); }).join('') + seeded;

        return summaryHtml + reviewForm(product, sum) + list;
    }

    function accordion(id, title, bodyHtml, open) {
        return '<div class="accordion' + (open ? ' open' : '') + '" data-panel="' + id + '">' +
            '<button class="accordion-head" type="button" data-action="pdp-panel" data-panel="' + id + '" aria-expanded="' + open + '">' +
            NC.ui.esc(title) + NC.ui.icon('i-chevron-down') + '</button>' +
            '<div class="accordion-body">' + bodyHtml + '</div>' +
            '</div>';
    }

    function specsTable(product) {
        return '<table class="spec-table"><tbody>' + product.specs.map(function (row) {
            return '<tr><th scope="row">' + NC.ui.esc(row[0]) + '</th><td>' + NC.ui.esc(row[1]) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }

    function paint(product) {
        var view = document.getElementById('view');
        var sel = selection(product);
        var wish = NC.store.isWishlisted(product.id);
        var outOfStock = effectiveStock(product, sel.color, sel.size) < 1;
        var related = NC.data.related(product, 4);
        var reviewSummary = (NC.reviews && NC.reviews.summary)
            ? NC.reviews.summary(product)
            : { avg: product.rating, count: product.reviewCount, breakdown: product.breakdown, reviews: [], userReview: null };

        view.innerHTML = '<div class="page">' +
            NC.ui.breadcrumb([
                { name: 'Home', href: '#/' },
                { name: product.category, href: '#/?cat=' + product.categorySlug },
                { name: product.name, href: '#/product/' + product.id }
            ]) +

            '<div class="pdp">' +

            '<div>' + galleryMarkup(product) +
            '<div class="assurance" style="margin-top:1rem">' +
            '<div class="assurance-row">' + NC.ui.icon('i-truck') + NC.ui.esc(shipNote()) + '</div>' +
            '<div class="assurance-row">' + NC.ui.icon('i-card') + 'Cash on delivery only</div>' +
            '<div class="assurance-row">' + NC.ui.icon('i-tag') + 'SKU ' + NC.ui.esc(product.sku) + '</div>' +
            '</div></div>' +

            '<div class="pdp-info">' +
            '<div>' +
            '<span class="pdp-brand">' + NC.ui.esc(product.brand) + '</span>' +
            '<h1 class="pdp-title">' + NC.ui.esc(product.name) + '</h1>' +
            '</div>' +

            '<div class="pdp-meta">' +
            '<span class="rating-pill">' + reviewSummary.avg.toFixed(1) + ' ★</span>' +
            '<span class="stars" aria-hidden="true">' + NC.ui.stars(reviewSummary.avg) + '</span>' +
            '<a href="#reviews" style="color:var(--brand);font-weight:600">' + NC.ui.num(reviewSummary.count) + ' ratings</a>' +
            '<span>·</span><span>' + NC.ui.esc(product.category) + '</span>' +
            '</div>' +

            '<div class="pdp-price">' +
            '<span class="price-now">' + NC.ui.money(product.price) + '</span>' +
            (product.mrp > product.price ? '<span class="price-was">' + NC.ui.money(product.mrp) + '</span>' : '') +
            ((NC.ui.discountPct ? NC.ui.discountPct(product) : product.discountPct) > 0 ? '<span class="price-off">' + (NC.ui.discountPct ? NC.ui.discountPct(product) : product.discountPct) + '% off</span>' : '') +
            '</div>' +
            '<p class="tax-note">Inclusive of all taxes · SKU ' + NC.ui.esc(product.sku) + '</p>' +

            stockLine(product, sel.color, sel.size) +

            optionsMarkup(product) +
            qtyMarkup(product) +

            '<div class="pdp-actions">' +
            '<div class="pdp-actions-row">' +
            '<button class="btn btn-ghost btn-lg" type="button" data-action="pdp-wish" data-id="' + product.id + '" aria-pressed="' + wish + '">' +
            NC.ui.icon(wish ? 'i-heart-fill' : 'i-heart') + (wish ? 'Saved' : 'Save') + '</button>' +
            '<button class="btn btn-primary btn-lg" type="button" data-action="pdp-add"' + (outOfStock ? ' disabled' : '') + '>' +
            NC.ui.icon('i-cart') + (outOfStock ? 'Out of stock' : 'Add to cart') + '</button>' +
            '<button class="btn btn-outline btn-lg" type="button" data-action="pdp-buy"' + (outOfStock ? ' disabled' : '') + '>' +
            'Buy now</button>' +
            '</div></div>' +

            accordion('highlights', 'Highlights',
                '<ul>' + product.highlights.map(function (h) {
                    return '<li><span>' + NC.ui.esc(h) + '</span></li>';
                }).join('') + '</ul>', state.openPanel === 'highlights') +

            accordion('description', 'Description',
                '<p>' + NC.ui.esc(product.description) + '</p>', state.openPanel === 'description') +

            accordion('specs', 'Specifications', specsTable(product), state.openPanel === 'specs') +

            '<div class="accordion open" id="reviews"><div class="accordion-body" style="display:block;padding-top:1rem">' +
            reviewsMarkup(product, reviewSummary) + '</div></div>' +
            '</div>' +
            '</div>' +

            (related.length ? '<section><div class="section-head"><h2 class="section-title">' +
                NC.ui.icon('i-grid') + 'You might also like</h2></div>' + NC.ui.grid(related) + '</section>' : '') +
            '</div>';
    }

    function focusMarker() {
        var el = document.activeElement;
        if (!el || !el.getAttribute) return null;
        var action = el.getAttribute('data-action');
        if (!action || action.indexOf('pdp-') !== 0) return null;
        return {
            action: action,
            value: el.getAttribute('data-color') || el.getAttribute('data-size') ||
                el.getAttribute('data-panel') || el.getAttribute('data-index') || ''
        };
    }

    function restoreFocus(marker) {
        if (!marker) return;
        var candidates = document.querySelectorAll('#view [data-action="' + marker.action + '"]');
        for (var i = 0; i < candidates.length; i++) {
            var node = candidates[i];
            var value = node.getAttribute('data-color') || node.getAttribute('data-size') ||
                node.getAttribute('data-panel') || node.getAttribute('data-index') || '';
            if (value === marker.value) {
                node.focus();
                return;
            }
        }
    }

    function repaint(product) {
        var marker = focusMarker();
        paint(product);
        restoreFocus(marker);
    }

    function render(view, query, params) {
        var product = NC.data.byId(params.id);

        if (!product) {
            view.dataset.page = 'product';
            view.innerHTML = '<div class="page">' + NC.ui.emptyState({
                icon: 'i-search',
                title: 'Product not found',
                text: 'This product may have been removed or the link is incorrect.',
                actionHref: '#/',
                actionLabel: 'Back to shop'
            }) + '</div>';
            return;
        }

        if (state.id !== product.id) {
            state.id = product.id;
            state.color = product.colors[0] ? product.colors[0][0] : null;
            state.size = null;
            state.qty = 1;
            state.image = selectedImageIndex(product);
            state.openPanel = 'highlights';
        }

        view.dataset.page = 'product';
        paint(product);
        bind(view);
    }

    var bound = false;

    function submitReview(form) {
        var productId = form.getAttribute('data-product') || state.id;
        var field = form.querySelector('[data-review-text]');
        var existing = (NC.reviews && NC.reviews.userReview) ? NC.reviews.userReview(productId) : null;
        var stars = state.reviewStars == null ? (existing ? existing.stars : 0) : state.reviewStars;
        var text = field ? field.value : '';

        NC.reviews.submit(productId, stars, text).then(function () {
            state.reviewStars = null;
            state.reviewText = null;
            NC.ui.toast('Thanks! Your review is live', 'success');
            NC.ui.announce('Review submitted');
            var anchor = document.getElementById('reviews');
            if (anchor && anchor.scrollIntoView) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }).catch(function (err) {
            NC.ui.toast((err && err.message) || 'Could not save your review', 'error');
        });
    }

    function refreshReviews() {
        if (!state.id || !document.querySelector('#view[data-page="product"]')) return;
        var product = NC.data.byId(state.id);
        if (product) repaint(product);
    }

    function bind(view) {
        if (bound) return;
        bound = true;

        view.addEventListener('click', function (e) {
            var el = e.target.closest('[data-action]');
            if (!el) return;
            var action = el.getAttribute('data-action');

            if (action.indexOf('pdp-') !== 0) return;

            var product = NC.data.byId(state.id);
            if (!product) return;

            if (action === 'pdp-review-star') {
                state.reviewStars = parseInt(el.getAttribute('data-star'), 10) || 0;
                var picker = el.closest('.star-picker');
                if (picker) {
                    Array.prototype.forEach.call(picker.querySelectorAll('.star-pick'), function (btn) {
                        btn.classList.toggle('on', (parseInt(btn.getAttribute('data-star'), 10) || 0) <= state.reviewStars);
                    });
                }
                return;
            }
            if (action === 'pdp-review-login') {
                if (NC.auth && NC.auth.requireAuth) {
                    NC.auth.requireAuth(function () { refreshReviews(); });
                }
                return;
            }

            if (action === 'pdp-img') {
                var index = parseInt(el.getAttribute('data-index'), 10);
                var picked = galleryImages(product)[index];
                var matched = colorForImage(product, picked);
                if (matched && matched !== selection(product).color && !isSoldOut(product, matched)) {
                    state.color = matched;
                    state.size = null;
                    state.qty = 1;
                }
                state.image = index;
                repaint(product);
                return;
            }
            if (action === 'pdp-color') {
                state.color = el.getAttribute('data-color');
                state.size = null;
                state.qty = 1;
                state.image = selectedImageIndex(product);
                repaint(product);
                return;
            }
            if (action === 'pdp-size') {
                state.size = el.getAttribute('data-size');
                state.qty = 1;
                repaint(product);
                return;
            }
            if (action === 'pdp-inc') {
                state.qty = Math.min(state.qty + 1, maxQty(product));
                repaint(product);
                return;
            }
            if (action === 'pdp-dec') {
                state.qty = Math.max(state.qty - 1, 1);
                repaint(product);
                return;
            }
            if (action === 'pdp-panel') {
                var panel = el.getAttribute('data-panel');
                state.openPanel = state.openPanel === panel ? null : panel;
                repaint(product);
                return;
            }
            if (action === 'pdp-wish') {
                var id = el.getAttribute('data-id') || state.id;
                var added = NC.store.toggleWishlist(id);
                NC.ui.toast(added ? 'Saved to your wishlist' : 'Removed from wishlist', added ? 'success' : 'info');
                NC.ui.announce(added ? 'Added to wishlist' : 'Removed from wishlist');
                repaint(product);
                return;
            }
            if (action === 'pdp-add' || action === 'pdp-buy') {
                var sel = selection(product);
                var res = NC.store.addToCart(product.id, state.qty, sel.color, sel.size);
                if (!res.ok) {
                    NC.ui.toast(res.reason, 'error');
                    return;
                }
                if (action === 'pdp-buy') {
                    NC.ui.closeDrawer();
                    if (NC.views.checkout && NC.views.checkout.open) NC.views.checkout.open();
                    else NC.router.go('/checkout');
                    return;
                }
                NC.ui.toast('Added ' + res.qty + ' × ' + product.name, 'success');
                NC.ui.announce(res.qty + ' ' + product.name + ' added to cart');
                NC.ui.openDrawer('cartDrawer');
            }
        });

        view.addEventListener('submit', function (e) {
            var form = e.target.closest('[data-review-form]');
            if (!form) return;
            e.preventDefault();
            if (NC.reviews) submitReview(form);
        });

        view.addEventListener('input', function (e) {
            if (e.target && e.target.matches && e.target.matches('[data-review-text]')) {
                state.reviewText = e.target.value;
            }
        });

        if (NC.reviews && NC.reviews.onChange) NC.reviews.onChange(refreshReviews);
        if (NC.auth && NC.auth.onChange) NC.auth.onChange(refreshReviews);
    }

NC.views = NC.views || {};
NC.views.product = { render: render };
NC.router.add('/product/:id', render);
})();