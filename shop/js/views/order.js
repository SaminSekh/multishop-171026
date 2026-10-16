(function () {
    'use strict';

    function deliveryLabel(order) {
        var map = { standard: 'Standard delivery', express: 'Express delivery', sameday: 'Same-day delivery' };
        var method = order.delivery && order.delivery.method;
        var slot = order.delivery && order.delivery.slot;
        var slots = { any: 'Any time', morning: '9 am – 12 pm', afternoon: '12 pm – 4 pm', evening: '4 pm – 8 pm' };
        return (map[method] || 'Standard delivery') + ' · ' + (slots[slot] || 'Any time');
    }

    function paymentLabel(order) {
        var map = { cod: 'Cash on delivery' };
        return map[order.payment] || 'Cash on delivery';
    }

    function mapsUrl(a) {
        a = a || {};
        if (a.lat != null && a.lat !== '' && a.lng != null && a.lng !== '') {
            return 'https://www.google.com/maps?q=' + encodeURIComponent(a.lat + ',' + a.lng);
        }
        var text = [a.address1, a.address2, a.city, a.state, a.pincode].filter(Boolean).join(', ');
        return text ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(text) : '';
    }

    var STATUS_META = {
        pending: { label: 'Pending', cls: 'pill-status-pending', icon: 'i-info', step: 1, note: 'We have received your order and will confirm it shortly.' },
        processing: { label: 'Processing', cls: 'pill-status-processing', icon: 'i-package', step: 2, note: 'Your order is being packed and prepared for dispatch.' },
        completed: { label: 'Completed', cls: 'pill-status-completed', icon: 'i-check', step: 4, note: 'Delivered. Thanks for shopping with us!' },
        rejected: { label: 'Rejected', cls: 'pill-status-rejected', icon: 'i-close', step: 0, note: 'This order has been cancelled.' }
    };

    function statusMeta(order) {
        return STATUS_META[(order && order.status) || 'pending'] || STATUS_META.pending;
    }

    function statusPill(order) {
        var m = statusMeta(order);
        return '<span class="pill ' + m.cls + '">' + NC.ui.esc(m.label) + '</span>';
    }

    function etaText(iso) {
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
        if (!m) return '';
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return Number(m[3]) + ' ' + months[Number(m[2]) - 1] + ' ' + m[1];
    }

    function etaFor(order, index) {
        var placed = new Date(order.placedAt);
        if (index === 0) {
            return placed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' · ' +
                placed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        }
        var d = new Date(placed.getTime() + index * 86400000);
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }

    function timeline(order) {
        var m = statusMeta(order);
        if (order.status === 'rejected') {
            return '<div class="timeline">' +
                '<div class="timeline-item next">' +
                '<span class="timeline-dot">' + NC.ui.icon('i-close') + '</span>' +
                '<div class="timeline-body"><b>Order rejected</b>' +
                '<span>' + NC.ui.esc(new Date(order.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })) + '</span></div>' +
                '</div></div>';
        }
        var labels = ['Order placed', 'Processing', 'Out for delivery', 'Delivered'];
        var icons = ['i-check', 'i-package', 'i-truck', 'i-check'];
        return '<div class="timeline">' +
            labels.map(function (label, i) {
                var cls = i < m.step ? 'timeline-item done' : (i === m.step ? 'timeline-item next' : 'timeline-item');
                var when = (i === 3 && order.estimatedDelivery) ? etaText(order.estimatedDelivery) : etaFor(order, i);
                return '<div class="' + cls + '">' +
                    '<span class="timeline-dot">' + NC.ui.icon(icons[i]) + '</span>' +
                    '<div class="timeline-body"><b>' + NC.ui.esc(label) + '</b>' +
                    '<span>' + NC.ui.esc(when) + '</span></div>' +
                    '</div>';
            }).join('') + '</div>';
    }

    function orderCard(order) {
        var itemCount = order.items.reduce(function (sum, i) { return sum + i.qty; }, 0);
        return '<article class="cart-item" style="grid-template-columns:1fr">' +
            '<div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap">' +
            '<div style="flex:1;min-width:180px">' +
            '<p class="card-brand">' + NC.ui.esc(order.id) + '</p>' +
            '<p style="font-weight:600;font-size:.92rem">' + itemCount + ' item' + (itemCount === 1 ? '' : 's') + ' · ' +
            NC.ui.money(order.totals.total) + '</p>' +
            '<p class="cart-item-variants">' +
            new Date(order.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
            ' · ' + NC.ui.esc(deliveryLabel(order)) + '</p>' +
            '</div>' +
            statusPill(order) +
            '<a class="btn btn-outline btn-sm" href="#/order/' + NC.ui.esc(order.id) + '">View details</a>' +
            '</div>' +
            '<div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap">' +
            order.items.slice(0, 5).map(function (i) {
                return '<img src="' + NC.ui.esc(i.image) + '" alt="' + NC.ui.esc(i.name) + '" title="' +
                    NC.ui.esc(i.name) + '" loading="lazy" data-lightbox style="width:44px;height:44px;border-radius:8px;object-fit:cover;background:var(--surface-2);cursor:zoom-in" onerror="NC.ui.imgError(this)">';
            }).join('') +
            (order.items.length > 5 ? '<span style="align-self:center;font-size:.8rem;color:var(--muted)">+' +
                (order.items.length - 5) + ' more</span>' : '') +
            '</div>' +
            '</article>';
    }

    function renderOrders(view) {
        var orders = NC.store.getOrders();

        function paint() {
            orders = NC.store.getOrders();
            if (!orders.length) {
                view.innerHTML = '<div class="page">' +
                    NC.ui.breadcrumb([{ name: 'Home', href: '#/' }, { name: 'Orders', href: '#/orders' }]) +
                    NC.ui.emptyState({
                        icon: 'i-package',
                        title: 'No orders yet',
                        text: 'Once you place an order it will appear here with its live status.',
                        actionHref: '#/',
                        actionLabel: 'Start shopping'
                    }) + '</div>';
                return;
            }

            view.innerHTML = '<div class="page">' +
                NC.ui.breadcrumb([{ name: 'Home', href: '#/' }, { name: 'Orders', href: '#/orders' }]) +
                '<div class="page-head"><h1 class="page-title">My orders</h1>' +
                '<p class="page-sub">' + orders.length + ' order' + (orders.length === 1 ? '' : 's') + ' placed</p></div>' +
                '<div class="cart-list">' + orders.map(orderCard).join('') + '</div>' +
                '</div>';
        }

        paint();
        if (NC.store.syncOrders) {
            var before = orders.map(function (o) { return o.id + ':' + o.status; }).join('|');
            NC.store.syncOrders().then(function () {
                var after = NC.store.getOrders().map(function (o) { return o.id + ':' + o.status; }).join('|');
                if (after !== before) paint();
            });
        }
    }

    function itemSku(item) {
        if (!item) return '';
        if (item.sku) return item.sku;
        var p = (NC.data && NC.data.byId) ? NC.data.byId(item.id) : null;
        return (p && p.sku) || '';
    }

    function renderDetail(view, query, params) {
        var order = NC.store.getOrder(params.id);

        function paint() {
            order = NC.store.getOrder(params.id);
            if (!order) {
                view.innerHTML = '<div class="page">' + NC.ui.emptyState({
                    icon: 'i-package',
                    title: 'Order not found',
                    text: 'We could not find that order in your history. It may have been from another browser.',
                    actionHref: '#/orders',
                    actionLabel: 'View all orders'
                }) + '</div>';
                return;
            }

            var a = order.address || {};
            var t = order.totals;
            var m = statusMeta(order);
            var rejected = order.status === 'rejected';
            var firstName = (a.fullName || '').split(' ')[0] || 'friend';

            view.innerHTML = '<div class="page">' +
                NC.ui.breadcrumb([
                    { name: 'Home', href: '#/' },
                    { name: 'Orders', href: '#/orders' },
                    { name: order.id, href: '#/order/' + order.id }
                ]) +

                '<div class="confirm">' +
                '<span class="confirm-icon' + (rejected ? ' is-rejected' : '') + '">' + NC.ui.icon(m.icon) + '</span>' +
                '<h1>' + (rejected ? 'Order rejected' : 'Thank you, ' + NC.ui.esc(firstName) + '!') + '</h1>' +
                '<p>' + NC.ui.esc(m.note) + '</p>' +
                '<p class="order-id">' + NC.ui.esc(order.id) + ' · ' + statusPill(order) + '</p>' +
                (order.estimatedDelivery && !rejected && order.status !== 'completed'
                    ? '<p class="order-eta">' + NC.ui.icon('i-truck') +
                      ' Expected delivery by ' + NC.ui.esc(etaText(order.estimatedDelivery)) + '</p>'
                    : '') +
                '<div style="display:flex;gap:.75rem;flex-wrap:wrap;justify-content:center;margin-top:.5rem">' +
                '<a class="btn btn-primary" href="#/">Continue shopping</a>' +
                '<a class="btn btn-outline" href="#/orders">View all orders</a>' +
                '</div>' +
                '</div>' +

                timeline(order) +

                '<div class="cart-layout">' +
                '<div class="cart-list">' +
                order.items.map(function (i) {
                    return '<div class="cart-item">' +
                        '<a class="cart-item-media" href="#/product/' + NC.ui.esc(i.id) + '">' +
                        '<img src="' + NC.ui.esc(i.image) + '" alt="' + NC.ui.esc(i.name) + '" loading="lazy" data-lightbox onerror="NC.ui.imgError(this)"></a>' +
                        '<div class="cart-item-body">' +
                        '<span class="card-brand">' + NC.ui.esc(i.brand) + '</span>' +
                        '<a class="cart-item-name" href="#/product/' + NC.ui.esc(i.id) + '">' + NC.ui.esc(i.name) + '</a>' +
                        '<span class="cart-item-variants">Qty ' + i.qty +
                        (i.color ? ' · ' + NC.ui.esc(i.color) : '') +
                        (i.size ? ' · Size ' + NC.ui.esc(i.size) : '') +
                        (itemSku(i) ? ' · SKU ' + NC.ui.esc(itemSku(i)) : '') +
                        (i.id ? ' · Product ID ' + NC.ui.esc(i.id) : '') + '</span>' +
                        '<div class="cart-item-foot"><span class="price-now">' + NC.ui.money(i.price * i.qty) + '</span>' +
                        '</div></div></div>';
                }).join('') +
                '</div>' +

                '<div class="summary">' +
                '<h3>Payment summary</h3>' +
                '<div class="totals-row"><span>Subtotal</span><span>' + NC.ui.money(t.subtotal) + '</span></div>' +
                (t.couponDiscount ? '<div class="totals-row"><span>Coupon ' + NC.ui.esc(t.couponCode || '') +
                    '</span><span style="color:var(--success);font-weight:600">− ' + NC.ui.money(t.couponDiscount) + '</span></div>' : '') +
                (t.tax > 0 ? '<div class="totals-row"><span>GST</span><span>' + NC.ui.money(t.tax) + '</span></div>' : '') +
                '<div class="totals-row"><span>Delivery</span><span>' +
                (t.shipping === 0 ? 'FREE' : NC.ui.money(t.shipping)) + '</span></div>' +
                (t.savings ? '<div class="totals-row" style="color:var(--success);font-weight:600"><span>You saved</span><span>' +
                    NC.ui.money(t.savings) + '</span></div>' : '') +
                '<div class="totals-row grand"><span>Amount payable</span><span>' + NC.ui.money(t.total) + '</span></div>' +
                '<div style="display:grid;gap:.75rem;margin-top:.5rem">' +
                '<div><p class="opt-label">Delivering to</p><p style="font-size:.88rem;color:var(--text-soft)">' +
                NC.ui.esc(a.fullName || '') + '<br>' + NC.ui.esc(a.address1 || '') +
                (a.address2 ? ', ' + NC.ui.esc(a.address2) : '') + '<br>' +
                NC.ui.esc(a.city || '') + ', ' + NC.ui.esc(a.state || '') + ' ' + NC.ui.esc(a.pincode || '') + '</p>' +
                (mapsUrl(a) ? '<a class="map-link" href="' + NC.ui.esc(mapsUrl(a)) + '" target="_blank" rel="noopener">' +
                    NC.ui.icon('i-pin') + 'Open in Google Maps</a>' : '') +
                '</div>' +
                '<div><p class="opt-label">Payment method</p><p style="font-size:.88rem;color:var(--text-soft)">' +
                NC.ui.esc(paymentLabel(order)) + '</p></div>' +
                '<div><p class="opt-label">Delivery option</p><p style="font-size:.88rem;color:var(--text-soft)">' +
                NC.ui.esc(deliveryLabel(order)) + '</p></div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>';
        }

        paint();
        if (NC.store.syncOrders) {
            var before = order ? order.status : '';
            NC.store.syncOrders().then(function () {
                var fresh = NC.store.getOrder(params.id);
                if (fresh && fresh.status !== before) paint();
            });
        }
    }

    NC.router.add('/orders', renderOrders);
    NC.router.add('/order/:id', renderDetail);

    NC.views = NC.views || {};
    NC.views.order = { render: renderOrders, renderDetail: renderDetail };
})();