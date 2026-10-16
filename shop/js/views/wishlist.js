(function () {
    'use strict';

    var bound = false;

    function paint(view) {
        var items = NC.store.getWishlist();

        if (!items.length) {
            view.innerHTML = '<div class="page">' +
                NC.ui.breadcrumb([{ name: 'Home', href: '#/' }, { name: 'Wishlist', href: '#/wishlist' }]) +
                NC.ui.emptyState({
                    icon: 'i-heart',
                    title: 'Your wishlist is empty',
                    text: 'Tap the heart on any product to save it here for later.',
                    actionHref: '#/',
                    actionLabel: 'Browse products'
                }) +
                '<section><div class="section-head"><h2 class="section-title">' + NC.ui.icon('i-bolt') +
                'Top rated this week</h2></div>' +
                NC.ui.grid(NC.data.products.slice().sort(function (a, b) {
                    return b.rating - a.rating;
                }).slice(0, 4)) + '</section>' +
                '</div>';
            return;
        }

        var inStock = items.filter(function (p) { return p.stock > 0; }).length;
        var total = items.reduce(function (sum, p) { return sum + p.price; }, 0);

        view.innerHTML = '<div class="page">' +
            NC.ui.breadcrumb([{ name: 'Home', href: '#/' }, { name: 'Wishlist', href: '#/wishlist' }]) +

            '<div class="page-head">' +
            '<h1 class="page-title">Wishlist</h1>' +
            '<p class="page-sub">' + items.length + ' saved item' + (items.length === 1 ? '' : 's') +
            ' · ' + inStock + ' in stock · ' + NC.ui.money(total) + ' total</p>' +
            '</div>' +

            '<div class="cart-layout">' +
            '<div class="cart-list">' +
            items.map(function (p) {
                return '<article class="cart-item" data-line="' + NC.ui.esc(p.id) + '">' +
                    '<a class="cart-item-media" href="#/product/' + p.id + '">' +
                    '<img src="' + NC.ui.esc(p.images[0]) + '" alt="' + NC.ui.esc(p.name) + '" loading="lazy" onerror="NC.ui.imgError(this)"></a>' +
                    '<div class="cart-item-body">' +
                    '<span class="card-brand">' + NC.ui.esc(p.brand) + '</span>' +
                    '<a href="#/product/' + p.id + '"><span class="cart-item-name">' + NC.ui.esc(p.name) + '</span></a>' +
                    '<span class="cart-item-variants">' + NC.ui.esc(p.category) +
                    (p.stock > 0 ? '' : ' · Out of stock') + '</span>' +
                    '<div class="card-rating"><span class="stars" aria-hidden="true">' + NC.ui.stars(p.rating) + '</span>' +
                    '<span>' + p.rating.toFixed(1) + ' · ' + NC.ui.num(p.reviewCount) + ' ratings</span></div>' +
                    '<div class="cart-item-foot">' +
                    '<span class="price-now">' + NC.ui.money(p.price) + '</span>' +
                    (p.mrp > p.price ? '<span class="price-was">' + NC.ui.money(p.mrp) + '</span>' : '') +
                    '<button class="btn btn-primary btn-sm" type="button" data-action="wish-add" data-id="' + p.id + '"' +
                    (p.stock < 1 ? ' disabled' : '') + '>' + NC.ui.icon('i-cart') + 'Add to cart</button>' +
                    '<button class="link-danger" type="button" data-action="toggle-wish" data-id="' + p.id + '">' +
                    NC.ui.icon('i-trash') + 'Remove</button>' +
                    '</div>' +
                    '</div>' +
                    '</article>';
            }).join('') +
            '</div>' +

            '<div class="summary">' +
            '<h3>Wishlist summary</h3>' +
            '<div class="totals-row"><span>Saved items</span><span>' + items.length + '</span></div>' +
            '<div class="totals-row"><span>Combined value</span><span>' + NC.ui.money(total) + '</span></div>' +
            '<div class="totals-row free"><span>In stock now</span><span>' + inStock + ' of ' + items.length + '</span></div>' +
            '<div class="totals-row grand"><span>Potential savings</span><span>' +
            NC.ui.money(items.reduce(function (sum, p) { return sum + (p.mrp - p.price); }, 0)) + '</span></div>' +
            '<a class="btn btn-primary btn-lg btn-block" href="#/">Continue shopping</a>' +
            '<div class="trust-row">' +
            '<span>' + NC.ui.icon('i-shield') + 'Prices update in real time</span>' +
            '<span>' + NC.ui.icon('i-refresh') + 'We will alert you when prices drop</span>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>';
    }

    function render(view) {
        view.dataset.page = 'wishlist';
        paint(view);

        if (!bound) {
            bound = true;
            document.addEventListener('click', function (e) {
                var el = e.target.closest('[data-action="wish-add"]');
                if (!el) return;
                var id = el.getAttribute('data-id');
                var res = NC.store.addToCart(id, 1, null, null);
                if (!res.ok) {
                    NC.ui.toast(res.reason, 'error');
                    return;
                }
                var product = NC.data.byId(id);
                NC.ui.toast('Added ' + product.name + ' to cart', 'success');
                NC.ui.announce(product.name + ' added to cart');
                NC.ui.openDrawer('cartDrawer');
            });
        }
    }

    NC.router.add('/wishlist', render);

    NC.views = NC.views || {};
    NC.views.wishlist = { render: render };
})();