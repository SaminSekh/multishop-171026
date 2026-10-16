(function () {
    'use strict';

    var unsubscribe = null;

    function recommendations(excludeIds, limit) {
        return NC.data.products
            .filter(function (p) { return excludeIds.indexOf(p.id) === -1; })
            .sort(function (a, b) { return b.rating - a.rating; })
            .slice(0, limit || 4);
    }

    function paint(view) {
        var t = NC.store.totals();

        if (!t.lines.length) {
            view.innerHTML = '<div class="page">' +
                NC.ui.breadcrumb([{ name: 'Home', href: '#/' }, { name: 'Cart', href: '#/cart' }]) +
                NC.ui.emptyState({
                    icon: 'i-cart',
                    title: 'Your cart is empty',
                    text: 'Once you add something it will show up here, and it will still be here when you come back.',
                    actionHref: '#/',
                    actionLabel: 'Start shopping'
                }) +
                '<section><div class="section-head"><h2 class="section-title">' + NC.ui.icon('i-bolt') +
                'Popular right now</h2></div>' + NC.ui.grid(recommendations([], 4)) + '</section>' +
                '</div>';
            return;
        }

        var ids = t.lines.map(function (l) { return l.id; });

        view.innerHTML = '<div class="page">' +
            NC.ui.breadcrumb([{ name: 'Home', href: '#/' }, { name: 'Cart', href: '#/cart' }]) +

            '<div class="page-head">' +
            '<h1 class="page-title">Shopping cart</h1>' +
            '<p class="page-sub">' + t.itemCount + ' item' + (t.itemCount === 1 ? '' : 's') + ' · ' +
            t.lines.length + ' product' + (t.lines.length === 1 ? '' : 's') +
            (t.shippingFree ? ' · <span style="color:var(--success);font-weight:600">Free delivery unlocked</span>' : '') +
            '</p>' +
            '</div>' +

            '<div class="cart-layout">' +
            '<div>' +
            '<div class="cart-list">' + t.lines.map(function (line) {
                return NC.ui.lineItem(line);
            }).join('') + '</div>' +
            '<div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem">' +
            '<a class="btn btn-outline" href="#/">Continue shopping</a>' +
            '<button class="btn btn-ghost" type="button" data-action="clear-cart">Empty cart</button>' +
            '</div>' +
            '</div>' +

            '<div>' + NC.ui.summary(t) +
            '<button class="btn btn-primary btn-lg btn-block" type="button" data-action="open-checkout" style="margin-top:1rem">Proceed to checkout' +
            NC.ui.icon('i-arrow-right') + '</button>' +
            '</div>' +
            '</div>' +

            '<section><div class="section-head"><h2 class="section-title">' + NC.ui.icon('i-bolt') +
            'You might also like</h2></div>' + NC.ui.grid(recommendations(ids, 4)) + '</section>' +
            '</div>';
    }

    function render(view) {
        view.dataset.page = 'cart';
        paint(view);

        if (!unsubscribe) {
            unsubscribe = NC.store.subscribe(function (reason) {
                if (reason.indexOf('cart') !== 0 && reason.indexOf('coupon') !== 0) return;
                if (NC.router.current().path === '/cart') paint(document.getElementById('view'));
            });
        }
    }

    document.addEventListener('click', function (e) {
        var el = e.target.closest('[data-action="clear-cart"]');
        if (!el) return;
        if (!NC.store.getItemCount()) return;
        NC.store.clearCart();
        NC.ui.toast('Cart emptied', 'info');
    });

    NC.router.add('/cart', render);

    NC.views = NC.views || {};
    NC.views.cart = { render: render };
})();