/* ============================================================
   NovaCart — admin panel controller
   ============================================================ */
(function () {
    'use strict';

    var AUTH_KEY = 'novacart_admin_auth';
    var backend = NC.backend;
    var userModalId = '';
    var userListModal = { userId: '', kind: 'cart', q: '', filter: 'all', page: 1, size: 5 };

    var state = {
        records: [],
        editing: null,
        editingOriginalId: null,
        search: '',
        productFilter: { category: 'all', stock: 'all', min: '', max: '', sort: 'default' },
        orders: [],
        orderFilter: 'pending',
        orderSearch: '',
        orderDate: 'all',
        orderMin: '',
        orderMax: '',
        orderSort: 'newest',
        users: [],
        userSearch: '',
        userDate: 'all',
        userOrders: 'all',
        userSort: 'newest',
        bans: [],
        pages: {
            orders: { page: 1, size: 50 },
            users: { page: 1, size: 50 },
            products: { page: 1, size: 50 }
        },
        lastPage: { orders: [], users: [], products: [] },
        selected: { orders: {}, users: {}, products: {} }
    };

    var PAGE_SIZES = [50, 100];

    var ORDER_STATUSES = [
        { id: 'pending', label: 'Pending' },
        { id: 'processing', label: 'Processing' },
        { id: 'completed', label: 'Completed' },
        { id: 'rejected', label: 'Rejected' }
    ];

    function $(sel, root) { return (root || document).querySelector(sel); }
    function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function icon(id) {
        return '<svg class="icon" aria-hidden="true"><use href="#' + id + '"></use></svg>';
    }

    function adminAuth() {
        return backend.adminAuth || null;
    }

    function statusMeta(id) {
        var found = ORDER_STATUSES[0];
        ORDER_STATUSES.forEach(function (s) { if (s.id === id) found = s; });
        return found;
    }

    function statusBadge(id) {
        var meta = statusMeta(id);
        return '<span class="status-badge ' + esc(meta.id) + '">' + esc(meta.label) + '</span>';
    }

    function timeAgo(iso) {
        var then = new Date(iso).getTime();
        if (isNaN(then)) return '';
        var diff = Math.max(0, Date.now() - then);
        var mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        var hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        var days = Math.floor(hrs / 24);
        if (days < 7) return days + 'd ago';
        return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function orderItemCount(order) {
        return (order.items || []).reduce(function (sum, i) { return sum + (i.qty || 0); }, 0);
    }

    function orderTotal(order) {
        return (order.totals && order.totals.total) || 0;
    }

    var FREE_SHIPPING_MIN = 999;
    var SHIPPING_FEE = 49;
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

    function lineKey(item) {
        return [item.id, item.color || '-', item.size || '-'].join('::');
    }

    function mapsUrl(a) {
        a = a || {};
        if (a.lat != null && a.lat !== '' && a.lng != null && a.lng !== '') {
            return 'https://www.google.com/maps?q=' + encodeURIComponent(a.lat + ',' + a.lng);
        }
        var text = [a.address1 || a.line1, a.address2 || a.line2, a.city, a.state, a.pincode]
            .filter(Boolean).join(', ');
        return text ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(text) : '';
    }

    function mapLink(a, label) {
        var url = mapsUrl(a);
        if (!url) return '';
        return '<a class="map-link" href="' + esc(url) + '" target="_blank" rel="noopener">' +
            icon('ai-pin') + '<span>' + esc(label || 'Open in Google Maps') + '</span></a>';
    }

    function dateThreshold(key) {
        var now = new Date();
        if (key === 'today') {
            return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        }
        if (key === 'month') {
            return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        }
        var days = parseInt(key, 10);
        if (!isNaN(days)) return Date.now() - days * 86400000;
        return null;
    }

    function matchesDate(iso, key) {
        var threshold = dateThreshold(key);
        if (threshold == null) return true;
        var t = new Date(iso).getTime();
        return !isNaN(t) && t >= threshold;
    }

    function numberOrNull(value) {
        if (value === '' || value == null) return null;
        var n = Number(value);
        return isNaN(n) ? null : n;
    }

    function resetPage(key) {
        state.pages[key].page = 1;
    }

    function paginate(rows, key) {
        var p = state.pages[key];
        var total = rows.length;
        var size = Math.max(1, p.size);
        var pages = Math.max(1, Math.ceil(total / size));
        if (p.page > pages) p.page = pages;
        if (p.page < 1) p.page = 1;
        var start = (p.page - 1) * size;
        var end = Math.min(start + size, total);
        return {
            rows: rows.slice(start, end),
            total: total,
            page: p.page,
            pages: pages,
            size: size,
            start: total ? start + 1 : 0,
            end: end
        };
    }

    function buildPager(container, key, info) {
        if (!container) return;
        container.hidden = false;
        container.setAttribute('data-pager', key);

        var isCustom = PAGE_SIZES.indexOf(info.size) === -1;
        var sizeOptions = PAGE_SIZES.map(function (s) {
            return '<option value="' + s + '"' + (s === info.size ? ' selected' : '') + '>' + s + '</option>';
        }).join('') +
            '<option value="custom"' + (isCustom ? ' selected' : '') + '>Custom</option>';

        container.innerHTML =
            '<div class="pager-info">Showing <b>' + info.start + '–' + info.end + '</b> of <b>' + info.total + '</b></div>' +
            '<div class="pager-controls">' +
            '<label class="pager-size">Rows per page' +
            '<select class="pager-select" data-page-size>' + sizeOptions + '</select>' +
            '</label>' +
            '<input class="pager-custom" type="number" min="1" max="1000" value="' + info.size + '"' +
            (isCustom ? '' : ' hidden') + ' data-page-custom aria-label="Custom rows per page">' +
            '<div class="pager-nav">' +
            '<button class="pager-btn" type="button" data-page="prev"' + (info.page <= 1 ? ' disabled' : '') + ' aria-label="Previous page">‹</button>' +
            '<span class="pager-pages">Page ' + info.page + ' of ' + info.pages + '</span>' +
            '<button class="pager-btn" type="button" data-page="next"' + (info.page >= info.pages ? ' disabled' : '') + ' aria-label="Next page">›</button>' +
            '</div>' +
            '</div>';
    }

    function bindPager(container, key) {
        if (!container) return;
        container.addEventListener('change', function (e) {
            var select = e.target.closest('[data-page-size]');
            if (select) {
                var p = state.pages[key];
                if (select.value === 'custom') {
                    var input = $('[data-page-custom]', container);
                    if (input) { input.hidden = false; input.focus(); input.select(); }
                    return;
                }
                p.size = parseInt(select.value, 10) || 50;
                p.page = 1;
                if (key === 'orders') renderOrders();
                else if (key === 'users') renderUsers();
                else renderList();
                return;
            }
            var custom = e.target.closest('[data-page-custom]');
            if (custom) {
                var size = parseInt(custom.value, 10);
                if (!size || size < 1) size = 1;
                if (size > 1000) size = 1000;
                state.pages[key].size = size;
                state.pages[key].page = 1;
                if (key === 'orders') renderOrders();
                else if (key === 'users') renderUsers();
                else renderList();
            }
        });
        container.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-page]');
            if (!btn || btn.disabled) return;
            var p = state.pages[key];
            if (btn.getAttribute('data-page') === 'prev') p.page = Math.max(1, p.page - 1);
            else p.page = p.page + 1;
            if (key === 'orders') renderOrders();
            else if (key === 'users') renderUsers();
            else renderList();
            container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }

    /* ---------------- bulk selection ---------------- */

    function isSelected(key, id) { return !!state.selected[key][id]; }

    function toggleSelected(key, id, on) {
        if (on) state.selected[key][id] = true;
        else delete state.selected[key][id];
    }

    function selectedIds(key) { return Object.keys(state.selected[key]); }

    function clearSelection(key) { state.selected[key] = {}; }

    function pruneSelection(key) {
        var pool = key === 'products' ? state.records : (key === 'orders' ? state.orders : state.users);
        var exists = {};
        pool.forEach(function (r) { exists[r.id] = true; });
        Object.keys(state.selected[key]).forEach(function (id) {
            if (!exists[id]) delete state.selected[key][id];
        });
    }

    function rowCheckbox(key, id) {
        return '<label class="row-check" title="Select">' +
            '<input type="checkbox" data-select="' + key + '" value="' + esc(id) + '"' +
            (isSelected(key, id) ? ' checked' : '') + ' aria-label="Select row"></label>';
    }

    function selectionList(key) {
        return key === 'products' ? $('#productList') : (key === 'orders' ? $('#orderList') : $('#userList'));
    }

    function rerender(key) {
        if (key === 'products') renderList();
        else if (key === 'orders') renderOrders();
        else renderUsers();
    }

    function updateSelectionUI(key) {
        pruneSelection(key);
        var count = selectedIds(key).length;
        var del = $('[data-bulk-delete="' + key + '"]');
        if (del) {
            del.hidden = count === 0;
            del.textContent = 'Delete selected (' + count + ')';
        }
        var all = $('[data-select-all="' + key + '"]');
        if (all) {
            var rows = state.lastPage[key] || [];
            var sel = rows.filter(function (r) { return isSelected(key, r.id); }).length;
            all.checked = rows.length > 0 && sel === rows.length;
            all.indeterminate = sel > 0 && sel < rows.length;
            all.disabled = rows.length === 0;
        }
        if (key === 'products') {
            var priceBtn = $('[data-bulk-price="products"]');
            if (priceBtn) {
                priceBtn.hidden = count === 0;
                priceBtn.textContent = 'Adjust prices (' + count + ')';
            }
            var countEl = $('#bulkPriceCount');
            if (countEl) countEl.textContent = count ? count + ' selected' : '';
            if (count === 0) {
                var bar = $('#bulkPriceBar');
                if (bar) bar.hidden = true;
            }
        }
    }

    function bulkDelete(key) {
        var ids = selectedIds(key);
        if (!ids.length) return;
        if (!window.confirm('Delete ' + ids.length + ' selected ' + key + '? This cannot be undone.')) return;
        var remove = key === 'products' ? backend.deleteProduct
            : (key === 'orders' ? backend.deleteOrder : backend.deleteUser);
        var btn = $('[data-bulk-delete="' + key + '"]');
        if (btn) btn.disabled = true;
        Promise.all(ids.map(function (id) { return remove(id); })).then(function () {
            if (key === 'products') {
                state.records = state.records.filter(function (r) { return ids.indexOf(r.id) === -1; });
                loadCategoryOptions();
            } else if (key === 'orders') {
                state.orders = state.orders.filter(function (o) { return ids.indexOf(o.id) === -1; });
            } else {
                state.users = state.users.filter(function (u) { return ids.indexOf(u.id) === -1; });
            }
            clearSelection(key);
            rerender(key);
            toast(ids.length + ' ' + key + ' deleted', 'info');
        }).catch(function (err) {
            toast(err.message, 'error');
        }).then(function () { if (btn) btn.disabled = false; });
    }

    function bulkPriceAdjusted(current, op, type, raw) {
        var cur = Number(current) || 0;
        if (op === 'set') return Math.max(0, Math.round(raw));
        var delta = type === 'percent' ? cur * raw / 100 : raw;
        var next = op === 'decrease' ? cur - delta : cur + delta;
        return Math.max(0, Math.round(next));
    }

    function hideBulkPriceBar() {
        var bar = $('#bulkPriceBar');
        if (bar) bar.hidden = true;
    }

    function applyBulkPrice() {
        var ids = selectedIds('products');
        if (!ids.length) { toast('Select products first', 'error'); return; }

        var field = $('#bulkPriceField').value;
        var op = $('#bulkPriceOp').value;
        var type = $('#bulkPriceType').value;
        var rawStr = String($('#bulkPriceValue').value).trim();
        if (rawStr === '') { toast('Enter a value to apply', 'error'); return; }
        var raw = Number(rawStr);
        if (!isFinite(raw) || raw < 0) { toast('Enter a valid value', 'error'); return; }

        var touched = [];
        state.records.forEach(function (r) {
            if (ids.indexOf(r.id) === -1) return;
            var rec = Object.assign({}, r);
            if (field === 'price' || field === 'both') rec.price = bulkPriceAdjusted(rec.price, op, type, raw);
            if (field === 'mrp' || field === 'both') rec.mrp = bulkPriceAdjusted(rec.mrp, op, type, raw);
            touched.push(rec);
        });
        if (!touched.length) return;

        var btn = $('#bulkPriceApply');
        if (btn) btn.disabled = true;
        Promise.all(touched.map(function (rec) { return backend.saveProduct(rec); })).then(function (saved) {
            var byId = {};
            (saved || []).forEach(function (rec) { if (rec && rec.id) byId[rec.id] = rec; });
            state.records = state.records.map(function (r) { return byId[r.id] || r; });
            if (NC.data && NC.data.setProducts) {
                NC.data.setProducts(state.records.map(function (r, i) { return NC.data.normalize(r, i); }));
            }
            clearSelection('products');
            hideBulkPriceBar();
            renderList();
            toast(touched.length + ' product' + (touched.length === 1 ? '' : 's') + ' updated', 'success');
        }).catch(function (err) {
            toast(err.message, 'error');
        }).then(function () { if (btn) btn.disabled = false; });
    }

    function bindBulkPrice() {
        var openBtn = $('[data-bulk-price="products"]');
        if (openBtn) openBtn.addEventListener('click', function () {
            var bar = $('#bulkPriceBar');
            if (bar) bar.hidden = !bar.hidden;
        });
        var apply = $('#bulkPriceApply');
        if (apply) apply.addEventListener('click', applyBulkPrice);
        var cancel = $('#bulkPriceCancel');
        if (cancel) cancel.addEventListener('click', function () { hideBulkPriceBar(); });
    }

    function bindSelection(key) {
        var list = selectionList(key);
        if (list) {
            list.addEventListener('change', function (e) {
                var cb = e.target.closest('[data-select]');
                if (!cb) return;
                toggleSelected(key, cb.value, cb.checked);
                var row = cb.closest('.p-row, .o-row, .u-row');
                if (row) row.classList.toggle('selected', cb.checked);
                updateSelectionUI(key);
            });
        }
        var all = $('[data-select-all="' + key + '"]');
        if (all) {
            all.addEventListener('change', function () {
                var rows = state.lastPage[key] || [];
                rows.forEach(function (r) { toggleSelected(key, r.id, all.checked); });
                if (list) {
                    $$('[data-select="' + key + '"]', list).forEach(function (cb) {
                        cb.checked = all.checked;
                        var row = cb.closest('.p-row, .o-row, .u-row');
                        if (row) row.classList.toggle('selected', all.checked);
                    });
                }
                updateSelectionUI(key);
            });
        }
        var del = $('[data-bulk-delete="' + key + '"]');
        if (del) del.addEventListener('click', function () { bulkDelete(key); });
    }

    function csvCell(value) {
        var s = value == null ? '' : String(value);
        if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
    }

    function downloadCsv(filename, header, rows) {
        var lines = [header].concat(rows).map(function (r) {
            return r.map(csvCell).join(',');
        });
        var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }

    var EXPORTS = {
        products: {
            file: 'products',
            header: ['ID', 'Name', 'Brand', 'Category', 'Price', 'MRP', 'Stock', 'Rating', 'Reviews', 'Visible'],
            row: function (r) {
                return [r.id, r.name, r.brand, r.category, r.price, r.mrp, r.stock,
                    r.rating, r.reviewCount, r.visible === false ? 'No' : 'Yes'];
            }
        },
        orders: {
            file: 'orders',
            header: ['Order ID', 'Date', 'Status', 'Customer', 'Phone', 'Email', 'City', 'State', 'Pincode', 'Items', 'Total'],
            row: function (o) {
                var a = o.address || {};
                return [o.id, o.placedAt ? new Date(o.placedAt).toISOString() : '', statusMeta(o.status).label,
                    a.fullName, a.phone, a.email, a.city, a.state, a.pincode, orderItemCount(o), Math.round(orderTotal(o))];
            }
        },
        users: {
            file: 'users',
            header: ['ID', 'Name', 'Phone', 'Joined', 'Visits', 'Last visit', 'Last IP', 'Banned', 'Orders', 'Cart items'],
            row: function (u) {
                var cartCount = (u.cart || []).reduce(function (s, l) { return s + (l.qty || 0); }, 0);
                return [u.id, u.name, u.phone, u.createdAt ? new Date(u.createdAt).toISOString() : '',
                    u.visits || 0, u.lastVisit ? new Date(u.lastVisit).toISOString() : '',
                    u.lastIp || '', isUserBanned(u) ? 'Yes' : 'No',
                    userOrders(u).length, cartCount];
            }
        }
    };

    function exportVisible(key) {
        var rows = state.lastPage[key] || [];
        if (!rows.length) {
            toast('Nothing to export on this page', 'error');
            return;
        }
        var spec = EXPORTS[key];
        var page = state.pages[key].page;
        downloadCsv('novacart-' + spec.file + '-page' + page + '.csv', spec.header, rows.map(spec.row));
        toast('Exported ' + rows.length + ' ' + key + ' from this page', 'success');
    }

    function downloadJson(filename, data) {
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }

    function exportProductsJson() {
        return backend.listProducts().then(function (records) {
            downloadJson('novacart-products.json', records || []);
            toast('Exported ' + (records ? records.length : 0) + ' products', 'success');
        }).catch(function (err) {
            toast(err.message, 'error');
        });
    }

    function readJsonFile(file, cb) {
        var reader = new FileReader();
        reader.onload = function () {
            var data;
            try {
                data = JSON.parse(reader.result);
            } catch (e) {
                toast('That file is not valid JSON', 'error');
                return;
            }
            cb(data);
        };
        reader.readAsText(file);
    }

    function applyProductImport(data) {
        if (!Array.isArray(data)) {
            toast('Expected an array of products', 'error');
            return;
        }
        backend.importRecords(data).then(function (res) {
            var msg = res.added + ' added';
            if (res.skipped) msg += ', ' + res.skipped + ' skipped (already exists)';
            toast('Import complete — ' + msg, 'success');
            refreshProducts();
        }).catch(function (err) {
            toast(err.message, 'error');
        });
    }

    /* -------- product CSV (spreadsheet friendly, full fidelity) -------- */

    var PRODUCT_CSV_HEADER = [
        'id', 'name', 'brand', 'category', 'price', 'mrp', 'stock', 'rating', 'reviewCount',
        'visible', 'badges', 'images', 'sizes', 'highlights', 'keywords', 'description', 'colors', 'sortOrder'
    ];

    function splitPipes(value) {
        if (value == null) return [];
        return String(value).split(/[|\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
    }

    function colorsToCsv(colors) {
        if (!Array.isArray(colors) || !colors.length) return '';
        return colors.map(function (c) {
            var name = c[0] || '';
            var hex = c[1] || '';
            var image = c[2] || '';
            var sizes = (c[3] || []).join(',');
            var qty = (c[4] == null) ? '' : c[4];
            var bySize = '';
            if (c[5] && typeof c[5] === 'object') {
                bySize = Object.keys(c[5]).map(function (k) { return k + '=' + c[5][k]; }).join(',');
            }
            return [name, hex, image, sizes, qty, bySize].join('|');
        }).join(';');
    }

    function csvToColors(value) {
        if (!value) return [];
        return String(value).split(';').map(function (chunk) {
            chunk = chunk.trim();
            if (!chunk) return null;
            var parts = chunk.split('|');
            var name = (parts[0] || '').trim();
            if (!name) return null;
            var hex = (parts[1] || '').trim() || '#cccccc';
            var image = (parts[2] || '').trim();
            var sizes = (parts[3] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            var qtyRaw = (parts[4] || '').trim();
            var qty = qtyRaw === '' ? null : Math.max(0, parseInt(qtyRaw, 10) || 0);
            var bySize = null;
            var bsRaw = (parts[5] || '').trim();
            if (bsRaw) {
                bySize = {};
                bsRaw.split(',').forEach(function (pair) {
                    var kv = pair.split('=');
                    var key = (kv[0] || '').trim();
                    var val = (kv[1] || '').trim();
                    if (key && val !== '') bySize[key] = Math.max(0, parseInt(val, 10) || 0);
                });
                if (!Object.keys(bySize).length) bySize = null;
            }
            return [name, hex, image, sizes, qty, bySize];
        }).filter(Boolean);
    }

    function productToCsvRow(r) {
        return [
            r.id,
            r.name,
            r.brand,
            r.category,
            r.price,
            r.mrp,
            r.stock,
            r.rating,
            r.reviewCount,
            r.visible === false ? 'no' : 'yes',
            (r.badges || []).join('|'),
            (r.images || []).join('|'),
            (r.sizes || []).join('|'),
            (r.highlights || []).join('|'),
            r.keywords || '',
            r.description || '',
            colorsToCsv(r.colors),
            r.sortOrder
        ];
    }

    function parseCsv(text) {
        text = String(text || '').replace(/^\ufeff/, '');
        var rows = [];
        var row = [];
        var field = '';
        var inQuotes = false;
        for (var i = 0; i < text.length; i++) {
            var ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (text[i + 1] === '"') { field += '"'; i++; }
                    else inQuotes = false;
                } else {
                    field += ch;
                }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(field); field = '';
            } else if (ch === '\r') {
                /* skip */
            } else if (ch === '\n') {
                row.push(field); rows.push(row); row = []; field = '';
            } else {
                field += ch;
            }
        }
        if (field.length || row.length) { row.push(field); rows.push(row); }
        return rows;
    }

    function csvField(row, map, names) {
        for (var i = 0; i < names.length; i++) {
            var idx = map[names[i]];
            if (idx != null && row[idx] != null) return String(row[idx]).trim();
        }
        return '';
    }

    function csvRowsToProducts(rows) {
        if (!rows.length) return [];
        var map = {};
        rows[0].forEach(function (h, i) { map[String(h || '').trim().toLowerCase()] = i; });
        var out = [];
        for (var i = 1; i < rows.length; i++) {
            var row = rows[i];
            if (!row || !row.some(function (v) { return String(v == null ? '' : v).trim() !== ''; })) continue;
            var name = csvField(row, map, ['name', 'title', 'product name']);
            var id = csvField(row, map, ['id', 'product id']);
            if (!name && !id) continue;
            var visibleRaw = csvField(row, map, ['visible', 'visibility']).toLowerCase();
            out.push({
                id: id,
                name: name,
                brand: csvField(row, map, ['brand']),
                category: csvField(row, map, ['category']),
                price: Number(csvField(row, map, ['price', 'selling price', 'sellingprice'])) || 0,
                mrp: Number(csvField(row, map, ['mrp'])) || 0,
                stock: parseInt(csvField(row, map, ['stock', 'qty', 'quantity']), 10) || 0,
                rating: Number(csvField(row, map, ['rating'])) || 4.5,
                reviewCount: parseInt(csvField(row, map, ['reviewcount', 'reviews', 'review count']), 10) || 0,
                visible: !(visibleRaw === 'no' || visibleRaw === 'false' || visibleRaw === '0' || visibleRaw === 'hidden'),
                badges: splitPipes(csvField(row, map, ['badges', 'badge'])).map(function (b) { return b.toLowerCase(); }),
                images: splitPipes(csvField(row, map, ['images', 'image', 'image url', 'imageurl'])),
                sizes: splitPipes(csvField(row, map, ['sizes', 'size'])),
                highlights: splitPipes(csvField(row, map, ['highlights', 'highlight'])),
                keywords: csvField(row, map, ['keywords', 'keyword', 'tags']),
                description: csvField(row, map, ['description', 'desc']),
                colors: csvToColors(csvField(row, map, ['colors', 'colours', 'variants', 'color variants'])),
                sortOrder: parseInt(csvField(row, map, ['sortorder', 'sort order', 'order', 'position']), 10) || 0
            });
        }
        return out;
    }

    function exportProductsCsv() {
        return backend.listProducts().then(function (records) {
            records = records || [];
            downloadCsv('novacart-products.csv', PRODUCT_CSV_HEADER, records.map(productToCsvRow));
            toast('Exported ' + records.length + ' products to CSV', 'success');
        }).catch(function (err) {
            toast(err.message, 'error');
        });
    }

    function applyProductCsv(text) {
        var products = csvRowsToProducts(parseCsv(text));
        if (!products.length) {
            toast('No product rows found in that CSV', 'error');
            return;
        }
        backend.importRecords(products).then(function (res) {
            var msg = res.added + ' added';
            if (res.skipped) msg += ', ' + res.skipped + ' skipped (already exists)';
            toast('Import complete — ' + msg, 'success');
            refreshProducts();
        }).catch(function (err) {
            toast(err.message, 'error');
        });
    }

    function readTextFile(file, cb) {
        var reader = new FileReader();
        reader.onload = function () { cb(String(reader.result || '')); };
        reader.readAsText(file);
    }

    var toastTimer;
    function toast(message, type) {
        var stack = $('[data-toasts]');
        if (!stack) return;
        var el = document.createElement('div');
        el.className = 'toast ' + (type || 'success');
        el.setAttribute('role', 'status');
        el.textContent = message;
        stack.appendChild(el);
        clearTimeout(toastTimer);
        setTimeout(function () {
            el.classList.add('out');
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
        }, 2800);
    }

    /* ---------------- auth ---------------- */

    function bindLogin() {
        var form = $('#loginForm');
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var input = $('#loginPassword');
            var error = $('#loginError');
            var btn = form.querySelector('button[type="submit"]');
            var auth = adminAuth();
            if (btn) btn.disabled = true;
            Promise.resolve(auth ? auth.verify(input.value) : false).then(function (ok) {
                if (ok) {
                    try { sessionStorage.setItem(AUTH_KEY, '1'); } catch (err) { }
                    input.value = '';
                    error.hidden = true;
                    showApp();
                } else {
                    error.textContent = 'Incorrect password. Try again.';
                    error.hidden = false;
                    input.select();
                }
            }).catch(function () {
                error.textContent = 'Could not check the password. Try again.';
                error.hidden = false;
            }).then(function () {
                if (btn) btn.disabled = false;
            });
        });

        $('#logoutBtn').addEventListener('click', function () {
            try { sessionStorage.removeItem(AUTH_KEY); } catch (e) { }
            location.reload();
        });
    }

    function showLogin() {
        $('#adminLogin').hidden = false;
        $('#adminApp').hidden = true;
    }

    function showApp() {
        $('#adminLogin').hidden = true;
        $('#adminApp').hidden = false;
        updateStatus();
        applyBrandToAdmin();
        loadCategoryOptions();
        loadSettingsForm();
        showSecurityForm();
        refreshProducts();
        refreshOrders();
        refreshUsers();
    }

    /* ---------------- admin password (security tab) ---------------- */

    function showSecurityForm() {
        var form = $('#adminPwForm');
        if (!form) return;
        var auth = adminAuth();
        var set = !!(auth && auth.isSet());
        var status = $('#adminPwStatus');
        if (status) {
            status.textContent = set
                ? 'A custom admin password is set and stored in your Supabase settings.'
                : 'No custom password yet — the default (admin123) is active. Set your own below.';
        }
        var wrap = $('#adminPwCurrentWrap');
        if (wrap) wrap.hidden = !set;
        ['#adminPwCurrent', '#adminPwNew', '#adminPwConfirm'].forEach(function (sel) {
            var el = $(sel);
            if (el) el.value = '';
        });
        var resetBtn = $('#adminPwReset');
        if (resetBtn) resetBtn.hidden = !set;
    }

    function bindSecurity() {
        var form = $('#adminPwForm');
        if (!form) return;

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var auth = adminAuth();
            if (!auth) { toast('Backend not ready', 'error'); return; }
            var current = $('#adminPwCurrent') ? $('#adminPwCurrent').value : '';
            var nw = $('#adminPwNew') ? $('#adminPwNew').value : '';
            var cf = $('#adminPwConfirm') ? $('#adminPwConfirm').value : '';
            var btn = form.querySelector('button[type="submit"]');
            if (nw.length < 4) { toast('New password must be at least 4 characters', 'error'); return; }
            if (nw !== cf) { toast('New passwords do not match', 'error'); return; }

            var proceed = function () {
                if (btn) btn.disabled = true;
                auth.set(nw).then(function () {
                    showSecurityForm();
                    toast('Admin password updated', 'success');
                }).catch(function (err) {
                    toast(err.message || 'Could not update the password', 'error');
                }).then(function () { if (btn) btn.disabled = false; });
            };

            if (auth.isSet()) {
                if (btn) btn.disabled = true;
                auth.verify(current).then(function (ok) {
                    if (btn) btn.disabled = false;
                    if (!ok) { toast('Current password is incorrect', 'error'); return; }
                    proceed();
                }).catch(function () {
                    if (btn) btn.disabled = false;
                    toast('Could not verify the current password', 'error');
                });
            } else {
                proceed();
            }
        });

        var resetBtn = $('#adminPwReset');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                var auth = adminAuth();
                if (!auth) return;
                if (!window.confirm('Remove the custom admin password and go back to the default (admin123)?')) return;
                auth.clear().then(function () {
                    showSecurityForm();
                    toast('Custom password removed', 'success');
                }).catch(function (err) {
                    toast(err.message, 'error');
                });
            });
        }
    }

    /* ---------------- chrome ---------------- */

    function bindTabs() {
        $$('.admin-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                var name = tab.getAttribute('data-tab');
                $$('.admin-tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
                $$('.admin-panel').forEach(function (p) {
                    p.classList.toggle('active', p.getAttribute('data-panel') === name);
                });
            });
        });
    }

    function updateStatus() {
        var pill = $('#backendStatus');
        if (backend.isConfigured()) {
            pill.textContent = 'Cloud · Supabase';
            pill.classList.remove('local');
        } else {
            pill.textContent = 'Local · this browser';
            pill.classList.add('local');
        }
        var hint = $('#storageHint');
        if (hint) {
            hint.textContent = backend.isConfigured()
                ? 'Connected to Supabase. Products and settings are saved to your database and mirrored to the storefront.'
                : 'Supabase is not configured, so changes are saved in this browser only. Add your keys in js/config.js to sync to the cloud.';
        }
    }

    function applyBrandToAdmin() {
        var s = backend.getSettings();
        $$('[data-brand-name]').forEach(function (el) {
            el.textContent = s.storeName || 'NovaCart';
        });
        $$('[data-brand-logo]').forEach(function (el) {
            el.textContent = '';
            if (s.logoUrl) {
                var img = document.createElement('img');
                img.src = s.logoUrl;
                img.alt = s.storeName || '';
                el.appendChild(img);
            } else {
                el.textContent = (s.storeName || 'N').trim().charAt(0).toUpperCase();
            }
        });
    }

    function loadCategoryOptions() {
        var list = $('#categoryOptions');
        if (!list) return;
        var names = [];
        NC.data.categories().forEach(function (c) { if (names.indexOf(c.name) === -1) names.push(c.name); });
        state.records.forEach(function (r) {
            if (r.category && names.indexOf(r.category) === -1) names.push(r.category);
        });
        names.sort();
        list.innerHTML = names.map(function (n) {
            return '<option value="' + esc(n) + '"></option>';
        }).join('');

        var filter = $('#productCategoryFilter');
        if (filter) {
            var current = state.productFilter.category;
            filter.innerHTML = '<option value="all">All categories</option>' + names.map(function (n) {
                return '<option value="' + esc(n) + '">' + esc(n) + '</option>';
            }).join('');
            filter.value = names.indexOf(current) !== -1 ? current : 'all';
            state.productFilter.category = filter.value;
        }
    }

    /* ---------------- products list ---------------- */

    function bindProducts() {
        $('#newProductBtn').addEventListener('click', function () { openEditor(null); });

        var search = $('#productSearch');
        search.addEventListener('input', function () {
            state.search = search.value.trim().toLowerCase();
            resetPage('products');
            renderList();
        });

        var f = state.productFilter;
        $('#productCategoryFilter').addEventListener('change', function () { f.category = this.value; resetPage('products'); renderList(); });
        $('#productStockFilter').addEventListener('change', function () { f.stock = this.value; resetPage('products'); renderList(); });
        $('#productMinAmount').addEventListener('input', function () { f.min = this.value; resetPage('products'); renderList(); });
        $('#productMaxAmount').addEventListener('input', function () { f.max = this.value; resetPage('products'); renderList(); });
        $('#productSort').addEventListener('change', function () { f.sort = this.value; resetPage('products'); renderList(); });
        $('[data-clear="product"]').addEventListener('click', function () { clearProductFilters(); });

        $('#productExportBtn').addEventListener('click', function () { exportProductsCsv(); });

        $('#productImportBtn').addEventListener('click', function () { $('#productImportInput').click(); });
        $('#productImportInput').addEventListener('change', function () {
            var file = this.files && this.files[0];
            this.value = '';
            if (!file) return;
            readTextFile(file, function (text) {
                var head = text.replace(/^\ufeff/, '').trim().charAt(0);
                if (head === '[' || head === '{') {
                    try { applyProductImport(JSON.parse(text)); }
                    catch (e) { toast('That file is not valid JSON', 'error'); }
                    return;
                }
                applyProductCsv(text);
            });
        });

        bindPager($('#productPager'), 'products');
        bindBulkPrice();
        bindSelection('products');
    }

    function clearProductFilters() {
        state.productFilter = { category: 'all', stock: 'all', min: '', max: '', sort: 'default' };
        $('#productCategoryFilter').value = 'all';
        $('#productStockFilter').value = 'all';
        $('#productMinAmount').value = '';
        $('#productMaxAmount').value = '';
        $('#productSort').value = 'default';
        resetPage('products');
        renderList();
    }

    function sortProducts(rows, sort) {
        var collator = function (a, b) { return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }); };
        if (sort === 'name-asc') rows.sort(function (a, b) { return collator(a.name || '', b.name || ''); });
        else if (sort === 'name-desc') rows.sort(function (a, b) { return collator(b.name || '', a.name || ''); });
        else if (sort === 'price-asc') rows.sort(function (a, b) { return (a.price || 0) - (b.price || 0); });
        else if (sort === 'price-desc') rows.sort(function (a, b) { return (b.price || 0) - (a.price || 0); });
        else if (sort === 'stock-asc') rows.sort(function (a, b) { return (a.stock || 0) - (b.stock || 0); });
        else if (sort === 'stock-desc') rows.sort(function (a, b) { return (b.stock || 0) - (a.stock || 0); });
        return rows;
    }

    function refreshProducts() {
        return backend.listProducts().then(function (records) {
            state.records = records || [];
            if (NC.data && NC.data.setProducts) {
                NC.data.setProducts(state.records.map(function (r, i) { return NC.data.normalize(r, i); }));
            }
            loadCategoryOptions();
            renderList();
        }).catch(function (err) {
            toast(err.message, 'error');
        });
    }

    function renderList() {
        var wrap = $('#productList');
        var q = state.search;
        var f = state.productFilter;
        var min = numberOrNull(f.min);
        var max = numberOrNull(f.max);
        var rows = state.records.filter(function (r) {
            if (f.category !== 'all' && (r.category || '') !== f.category) return false;
            if (f.stock === 'in' && !(r.stock > 0)) return false;
            if (f.stock === 'out' && (r.stock > 0)) return false;
            if (f.stock === 'hidden' && r.visible !== false) return false;
            var price = r.price || 0;
            if (min != null && price < min) return false;
            if (max != null && price > max) return false;
            if (!q) return true;
            return (r.name + ' ' + r.brand + ' ' + r.category).toLowerCase().indexOf(q) !== -1;
        });
        sortProducts(rows, f.sort);

        $('#productCount').textContent = rows.length + ' of ' + state.records.length + ' products';

        var info = paginate(rows, 'products');
        buildPager($('#productPager'), 'products', info);
        state.lastPage.products = info.rows;
        rows = info.rows;
        updateSelectionUI('products');

        if (!rows.length) {
            wrap.innerHTML = '<div class="admin-empty">' +
                (state.records.length
                    ? 'No products match your filters.'
                    : 'No products yet. Add one with “New product”, or import a JSON file.') +
                '</div>';
            return;
        }

        wrap.innerHTML = rows.map(function (r) {
            var img = (r.images && r.images[0]) || NC.data.placeholder;
            var price = '₹' + Math.round(r.price || 0);
            var stockLabel = (r.stock || 0) > 0 ? ((r.stock) + ' in stock') : 'Out of stock';
            return '<div class="p-row' + (isSelected('products', r.id) ? ' selected' : '') + '" data-id="' + esc(r.id) + '">' +
                rowCheckbox('products', r.id) +
                '<img class="p-thumb" src="' + esc(img) + '" alt="" loading="lazy" onerror="NC.ui && NC.ui.imgError ? NC.ui.imgError(this) : (this.src=\'' + NC.data.placeholder + '\')">' +
                '<div class="p-info">' +
                '<div class="p-name">' + esc(r.name || 'Untitled') + '</div>' +
                '<div class="p-meta">' +
                '<span class="tag">' + esc(r.category || 'Uncategorised') + '</span>' +
                '<span>' + price + '</span>' +
                '<span>' + esc(stockLabel) + '</span>' +
                (r.visible === false ? '<span class="tag hidden-tag">Hidden</span>' : '') +
                '</div></div>' +
                '<div class="p-actions">' +
                '<button class="icon-btn" type="button" data-stock="' + esc(r.id) + '" aria-label="Quick stock for ' + esc(r.name) + '" title="Quick stock">' + icon('ai-box') + '</button>' +
                '<button class="icon-btn" type="button" data-edit="' + esc(r.id) + '" aria-label="Edit ' + esc(r.name) + '">' + icon('ai-edit') + '</button>' +
                '<button class="icon-btn danger" type="button" data-delete="' + esc(r.id) + '" aria-label="Delete ' + esc(r.name) + '">' + icon('ai-trash') + '</button>' +
                '</div></div>';
        }).join('');

        $$('[data-stock]', wrap).forEach(function (btn) {
            btn.addEventListener('click', function () { openStockModal(btn.getAttribute('data-stock')); });
        });
        $$('[data-edit]', wrap).forEach(function (btn) {
            btn.addEventListener('click', function () { openEditor(btn.getAttribute('data-edit')); });
        });
        $$('[data-delete]', wrap).forEach(function (btn) {
            btn.addEventListener('click', function () { removeProduct(btn.getAttribute('data-delete')); });
        });
    }

    function findRecord(id) {
        var found = null;
        state.records.forEach(function (r) { if (r.id === id) found = r; });
        return found;
    }

    function removeProduct(id) {
        var rec = findRecord(id);
        if (!rec) return;
        if (!window.confirm('Delete “' + (rec.name || id) + '”? This cannot be undone.')) return;
        backend.deleteProduct(id).then(function () {
            state.records = state.records.filter(function (r) { return r.id !== id; });
            renderList();
            loadCategoryOptions();
            toast('Product deleted', 'info');
        }).catch(function (err) {
            toast(err.message, 'error');
        });
    }

    /* ---------------- orders ---------------- */

    function bindOrders() {
        var search = $('#orderSearch');
        search.addEventListener('input', function () {
            state.orderSearch = search.value.trim().toLowerCase();
            resetPage('orders');
            renderOrders();
        });

        $('#orderRefreshBtn').addEventListener('click', function () {
            refreshOrders(true);
        });

        $$('#orderFilters [data-filter]').forEach(function (chip) {
            chip.addEventListener('click', function () {
                state.orderFilter = chip.getAttribute('data-filter');
                $$('#orderFilters [data-filter]').forEach(function (c) {
                    c.classList.toggle('active', c === chip);
                });
                resetPage('orders');
                renderOrders();
            });
        });

        $('#orderDate').addEventListener('change', function () { state.orderDate = this.value; resetPage('orders'); renderOrders(); });
        $('#orderMinAmount').addEventListener('input', function () { state.orderMin = this.value; resetPage('orders'); renderOrders(); });
        $('#orderMaxAmount').addEventListener('input', function () { state.orderMax = this.value; resetPage('orders'); renderOrders(); });
        $('#orderSort').addEventListener('change', function () { state.orderSort = this.value; resetPage('orders'); renderOrders(); });
        $('[data-clear="order"]').addEventListener('click', function () { clearOrderFilters(); });

        $('#orderExportBtn').addEventListener('click', function () { exportVisible('orders'); });

        bindPager($('#orderPager'), 'orders');
        bindSelection('orders');

        var list = $('#orderList');
        list.addEventListener('change', function (e) {
            var select = e.target.closest('[data-status]');
            if (!select) return;
            changeStatus(select.getAttribute('data-status'), select.value, select);
        });
        list.addEventListener('click', function (e) {
            var view = e.target.closest('[data-view]');
            if (!view) return;
            openOrderModal(view.getAttribute('data-view'));
        });

        $$('[data-close-order]').forEach(function (el) {
            el.addEventListener('click', closeOrderModal);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !$('#orderModal').hidden) closeOrderModal();
        });

        var modalBody = $('#orderModalBody');
        modalBody.addEventListener('change', function (e) {
            var select = e.target.closest('[data-modal-status]');
            if (select) {
                changeStatus(select.getAttribute('data-modal-status'), select.value, select);
                return;
            }
            var eta = e.target.closest('[data-modal-eta]');
            if (eta) {
                var ord = findOrder(eta.getAttribute('data-modal-eta'));
                if (ord) {
                    ord.estimatedDelivery = eta.value || null;
                    setOrderEstimate(ord);
                }
            }
        });

        modalBody.addEventListener('click', function (e) {
            if ($('#orderModal').hidden) return;
            var order = findOrder(openOrderId);
            if (!order) return;
            var inc = e.target.closest('[data-oi-inc]');
            var dec = e.target.closest('[data-oi-dec]');
            var rem = e.target.closest('[data-oi-remove]');
            var add = e.target.closest('[data-oi-add]');
            if (inc) { changeOrderItemQty(order, Number(inc.getAttribute('data-oi-inc')), 1); return; }
            if (dec) { changeOrderItemQty(order, Number(dec.getAttribute('data-oi-dec')), -1); return; }
            if (rem) { removeOrderItem(order, Number(rem.getAttribute('data-oi-remove'))); return; }
            if (add) { addOrderItem(order, add.getAttribute('data-oi-add')); }
        });

        modalBody.addEventListener('input', function (e) {
            if (e.target.id !== 'oiSearch') return;
            var results = $('#oiResults');
            if (results) results.innerHTML = oiResultsMarkup(e.target.value);
        });
    }

    function refreshOrders(explicit) {
        return backend.listOrders().then(function (orders) {
            state.orders = orders || [];
            renderOrders();
            if (explicit) toast('Orders refreshed', 'info');
        }).catch(function (err) {
            if (explicit) toast(err.message, 'error');
            renderOrders();
        });
    }

    function renderOrders() {
        var wrap = $('#orderList');
        if (!wrap) return;

        var counts = { all: state.orders.length, pending: 0, processing: 0, completed: 0, rejected: 0 };
        state.orders.forEach(function (o) {
            var st = statusMeta(o.status).id;
            counts[st] = (counts[st] || 0) + 1;
        });
        $$('#orderFilters [data-count]').forEach(function (el) {
            var key = el.getAttribute('data-count');
            el.textContent = counts[key] || 0;
        });

        var q = state.orderSearch;
        var filter = state.orderFilter;
        var min = numberOrNull(state.orderMin);
        var max = numberOrNull(state.orderMax);
        var rows = state.orders.filter(function (o) {
            if (filter !== 'all' && statusMeta(o.status).id !== filter) return false;
            if (!matchesDate(o.placedAt, state.orderDate)) return false;
            var total = orderTotal(o);
            if (min != null && total < min) return false;
            if (max != null && total > max) return false;
            if (!q) return true;
            var a = o.address || {};
            var hay = [o.id, a.fullName, a.phone, a.email, a.city, a.pincode, o.payment]
                .join(' ').toLowerCase();
            return hay.indexOf(q) !== -1;
        });
        sortOrders(rows, state.orderSort);

        $('#orderCount').textContent = rows.length + ' of ' + state.orders.length + ' orders';

        var info = paginate(rows, 'orders');
        buildPager($('#orderPager'), 'orders', info);
        state.lastPage.orders = info.rows;
        rows = info.rows;
        updateSelectionUI('orders');

        if (!rows.length) {
            wrap.innerHTML = '<div class="admin-empty">' +
                (state.orders.length
                    ? 'No orders match this filter.'
                    : 'No orders yet. New orders placed on the store will appear here in real time.') +
                '</div>';
            return;
        }

        wrap.innerHTML = rows.map(orderRow).join('');
    }

    function sortOrders(rows, sort) {
        var time = function (o) { var t = new Date(o.placedAt).getTime(); return isNaN(t) ? 0 : t; };
        if (sort === 'oldest') rows.sort(function (a, b) { return time(a) - time(b); });
        else if (sort === 'amount-desc') rows.sort(function (a, b) { return orderTotal(b) - orderTotal(a); });
        else if (sort === 'amount-asc') rows.sort(function (a, b) { return orderTotal(a) - orderTotal(b); });
        else rows.sort(function (a, b) { return time(b) - time(a); });
        return rows;
    }

    function clearOrderFilters() {
        state.orderFilter = 'all';
        state.orderSearch = '';
        state.orderDate = 'all';
        state.orderMin = '';
        state.orderMax = '';
        state.orderSort = 'newest';
        $('#orderSearch').value = '';
        $('#orderDate').value = 'all';
        $('#orderMinAmount').value = '';
        $('#orderMaxAmount').value = '';
        $('#orderSort').value = 'newest';
        $$('#orderFilters [data-filter]').forEach(function (c) {
            c.classList.toggle('active', c.getAttribute('data-filter') === 'all');
        });
        resetPage('orders');
        renderOrders();
    }

    function orderRow(order) {
        var a = order.address || {};
        var items = order.items || [];
        var count = orderItemCount(order);
        var status = statusMeta(order.status).id;
        var itemLines = items.length
            ? '<div class="o-items">' + items.map(function (it) {
                return '<div class="o-item">' +
                    '<img src="' + esc(it.image || NC.data.placeholder) +
                    '" alt="" loading="lazy" onerror="NC.ui && NC.ui.imgError ? NC.ui.imgError(this) : (this.src=\'' +
                    NC.data.placeholder + '\')">' +
                    '<div class="o-item-body">' +
                    '<b>' + esc(it.name || 'Item') + '</b>' +
                    (it.brand ? '<span class="muted">' + esc(it.brand) + '</span>' : '') +
                    '<span class="odi-variants">' + itemVariantText(it) + '</span>' +
                    '</div>' +
                    '<strong>' + '₹' + Math.round((it.price || 0) * (it.qty || 0)) + '</strong>' +
                    '</div>';
            }).join('') + '</div>'
            : '';
        var options = ORDER_STATUSES.map(function (s) {
            return '<option value="' + s.id + '"' + (s.id === status ? ' selected' : '') + '>' + esc(s.label) + '</option>';
        }).join('');

        return '<div class="o-row' + (isSelected('orders', order.id) ? ' selected' : '') + '" data-id="' + esc(order.id) + '">' +
            '<div class="o-row-header">' +
            rowCheckbox('orders', order.id) +
            '<div class="o-info">' +
            '<div class="o-head"><b>' + esc(order.id) + '</b>' + statusBadge(order.status) + '</div>' +
            '<div class="o-customer">' + esc(a.fullName || 'Guest') +
            (a.phone ? ' · ' + esc(a.phone) : '') + '</div>' +
            '<div class="o-meta">' +
            '<span class="tag">' + count + ' item' + (count === 1 ? '' : 's') + '</span>' +
            '<span>₹' + Math.round(orderTotal(order)) + '</span>' +
            '<span>' + esc(timeAgo(order.placedAt)) + '</span>' +
            '</div>' +
            '</div>' +
            '<div class="o-actions">' +
            '<label class="o-status-field"><span>Status</span>' +
            '<select class="input o-status-select" data-status="' + esc(order.id) + '">' + options + '</select></label>' +
            '<button class="btn btn-outline btn-sm" type="button" data-view="' + esc(order.id) + '">' +
            icon('ai-eye') + 'Details</button>' +
            '</div>' +
            '</div>' +
            itemLines +
            '</div>';
    }

    function findOrder(id) {
        var found = null;
        state.orders.forEach(function (o) { if (o.id === id) found = o; });
        return found;
    }

    function changeStatus(id, status, source) {
        if (source) source.disabled = true;
        var order = findOrder(id);
        var prev = order ? order.status : null;
        backend.updateOrderStatus(id, status).then(function () {
            if (order) order.status = status;
            return adjustInventoryForStatus(order, prev, status);
        }).then(function () {
            state.orders.forEach(function (o) { if (o.id === id) o.status = status; });
            state.orders.sort(function (a, b) {
                return new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime();
            });
            renderOrders();
            if (!$('#orderModal').hidden) openOrderModal(id);
            toast('Order ' + id + ' → ' + statusMeta(status).label, 'success');
        }).catch(function (err) {
            toast(err.message, 'error');
        }).then(function () {
            if (source) source.disabled = false;
        });
    }

    function recomputeOrderTotals(order) {
        var prev = order.totals || {};
        var items = order.items || [];
        var subtotal = 0;
        var mrpTotal = 0;
        var tax = 0;
        var gst = (NC.store && NC.store.getGstPercent) ? NC.store.getGstPercent()
            : (NC.settings && typeof NC.settings.gstPercent === 'number' ? NC.settings.gstPercent : 18);
        var freeMin = (NC.store && NC.store.getFreeShippingMin) ? NC.store.getFreeShippingMin()
            : (NC.settings && typeof NC.settings.freeShippingMin === 'number' ? NC.settings.freeShippingMin : FREE_SHIPPING_MIN);
        var shippingFee = (NC.store && NC.store.getShippingFee) ? NC.store.getShippingFee()
            : (NC.settings && typeof NC.settings.shippingFee === 'number' ? NC.settings.shippingFee : SHIPPING_FEE);
        items.forEach(function (i) {
            var lineSub = (i.price || 0) * (i.qty || 0);
            subtotal += lineSub;
            var p = (NC.data && NC.data.byId) ? NC.data.byId(i.id) : null;
            tax += lineSub * (gst / 100);
            mrpTotal += ((p && p.mrp != null ? p.mrp : i.price) || 0) * (i.qty || 0);
        });
        var couponDiscount = Math.max(0, Math.min(Number(prev.couponDiscount) || 0, subtotal));
        var afterDiscount = Math.max(subtotal - couponDiscount, 0);
        var shipping = (items.length === 0 || afterDiscount >= freeMin || shippingFee <= 0) ? 0 : shippingFee;
        order.totals = {
            subtotal: subtotal,
            savings: Math.max(mrpTotal - subtotal, 0),
            couponDiscount: couponDiscount,
            couponCode: prev.couponCode || null,
            tax: Math.round(tax),
            shipping: shipping,
            total: Math.round(afterDiscount + tax + shipping)
        };
    }

    function setOrderEstimate(order) {
        if (!order) return;
        backend.saveOrder(order).then(function (saved) {
            var next = saved || order;
            state.orders = (state.orders || []).map(function (o) {
                return o.id === next.id ? next : o;
            });
            renderOrders();
            if (!$('#orderModal').hidden) openOrderModal(next.id);
            toast(next.estimatedDelivery ? 'Estimated delivery set' : 'Estimated delivery cleared', 'success');
        }).catch(function (err) {
            toast(err.message, 'error');
        });
    }

    function commitOrder(order, msg) {
        if (!order) return Promise.resolve();
        recomputeOrderTotals(order);
        return backend.saveOrder(order).then(function (saved) {
            var next = saved || order;
            state.orders = (state.orders || []).map(function (o) {
                return o.id === next.id ? next : o;
            });
            renderOrders();
            if (!$('#orderModal').hidden) openOrderModal(next.id);
            toast(msg || 'Order updated', 'success');
        }).catch(function (err) {
            toast(err.message, 'error');
        });
    }

    function adjustItemStock(item, qty, dir) {
        if (!item || !qty) return Promise.resolve();
        return backend.listProducts().then(function (records) {
            state.records = records || state.records || [];
            var rec = null;
            state.records.forEach(function (r) { if (r.id === item.id) rec = r; });
            if (!rec) return null;
            applyOrderQty(rec, item.color, item.size, qty, dir);
            return backend.saveProduct(rec);
        }).then(function () {
            if ($('#productList')) renderList();
        });
    }

    function addOrderItem(order, productId) {
        var p = (NC.data && NC.data.byId) ? NC.data.byId(productId) : null;
        if (!p) return;
        var color = (p.colors && p.colors[0] && p.colors[0][0]) || null;
        var item = {
            id: p.id,
            name: p.name,
            brand: p.brand,
            sku: p.sku || '',
            image: (NC.data.variantImage)
                ? NC.data.variantImage(p, color)
                : ((p.images && p.images[0]) || NC.data.placeholder),
            qty: 1,
            color: color,
            size: (p.sizes && p.sizes.length) ? p.sizes[0] : null,
            price: p.price
        };
        var existing = null;
        (order.items || []).forEach(function (i) { if (lineKey(i) === lineKey(item)) existing = i; });
        var apply = function () {
            if (existing) existing.qty = (existing.qty || 0) + 1;
            else { order.items = order.items || []; order.items.push(item); }
            commitOrder(order, 'Item added to order');
        };
        if (order.stockApplied) adjustItemStock(item, 1, -1).then(apply);
        else apply();
    }

    function removeOrderItem(order, index) {
        var item = (order.items || [])[index];
        if (!item) return;
        var apply = function () {
            order.items.splice(index, 1);
            commitOrder(order, 'Item removed from order');
        };
        if (order.stockApplied) adjustItemStock(item, item.qty || 0, 1).then(apply);
        else apply();
    }

    function changeOrderItemQty(order, index, delta) {
        var item = (order.items || [])[index];
        if (!item) return;
        var current = item.qty || 1;
        var next = Math.max(1, current + delta);
        var d = next - current;
        if (!d) return;
        var apply = function () {
            item.qty = next;
            commitOrder(order, 'Quantity updated');
        };
        if (order.stockApplied) adjustItemStock(item, Math.abs(d), d > 0 ? -1 : 1).then(apply);
        else apply();
    }

    function oiResultsMarkup(query) {
        var q = String(query || '').trim();
        if (!q) {
            return '<p class="muted oi-hint">Type a product name or brand to add it to this order.</p>';
        }
        var found = (NC.data && NC.data.search) ? NC.data.search(q).slice(0, 6) : [];
        if (!found.length) {
            return '<p class="muted oi-hint">No products match &ldquo;' + esc(q) + '&rdquo;.</p>';
        }
        return found.map(function (p) {
            return '<div class="oi-result">' +
                '<img src="' + esc((p.images && p.images[0]) || NC.data.placeholder) + '" alt="" loading="lazy" onerror="NC.ui && NC.ui.imgError ? NC.ui.imgError(this) : (this.src=\'' + NC.data.placeholder + '\')">' +
                '<div class="oi-result-body"><b>' + esc(p.name) + '</b>' +
                '<span class="muted">' + esc(p.brand) + ' · ' + '₹' + Math.round(p.price) + '</span></div>' +
                '<button class="btn btn-outline btn-sm" type="button" data-oi-add="' + esc(p.id) + '">' +
                icon('ai-plus') + 'Add</button>' +
                '</div>';
        }).join('');
    }

    // Prefer the SKU captured on the order line; fall back to the catalog.
    function itemSku(item) {
        if (!item) return '';
        if (item.sku) return item.sku;
        var p = (NC.data && NC.data.byId) ? NC.data.byId(item.id) : null;
        return (p && p.sku) || '';
    }

    // "Qty 1 · Storm Grey · Size UK 6 · SKU NC001-ST · Product ID p001"
    function itemVariantText(item) {
        var sku = itemSku(item);
        return 'Qty ' + (item.qty || 0) +
            (item.color ? ' · ' + esc(item.color) : '') +
            (item.size ? ' · Size ' + esc(item.size) : '') +
            (sku ? ' · SKU ' + esc(sku) : '') +
            (item.id ? ' · Product ID ' + esc(item.id) : '');
    }

    // Read-only product row (image · name/brand/variant/time · line total).
    function itemDetailCard(item, timeLabel) {
        return '<div class="order-detail-item odi-readonly">' +
            '<img src="' + esc(item.image || NC.data.placeholder) + '" alt="" loading="lazy" onerror="NC.ui && NC.ui.imgError ? NC.ui.imgError(this) : (this.src=\'' + NC.data.placeholder + '\')">' +
            '<div class="odi-body">' +
            '<b>' + esc(item.name || 'Item') + '</b>' +
            (item.brand ? '<span class="muted">' + esc(item.brand) + '</span>' : '') +
            '<span class="odi-variants">' + itemVariantText(item) + '</span>' +
            (timeLabel ? '<span class="muted">' + esc(timeLabel) + '</span>' : '') +
            '</div>' +
            '<strong>' + '₹' + Math.round((item.price || 0) * (item.qty || 0)) + '</strong>' +
            '</div>';
    }

    function orderItemRow(item, index, order) {
        return '<div class="order-detail-item">' +
            '<img src="' + esc(item.image || NC.data.placeholder) + '" alt="" loading="lazy" onerror="NC.ui && NC.ui.imgError ? NC.ui.imgError(this) : (this.src=\'' + NC.data.placeholder + '\')">' +
            '<div class="odi-body">' +
            '<b>' + esc(item.name || 'Item') + '</b>' +
            (item.brand ? '<span class="muted">' + esc(item.brand) + '</span>' : '') +
            '<span class="odi-variants">' + itemVariantText(item) + '</span>' +
            (order && order.placedAt ? '<span class="muted">Placed ' + esc(timeAgo(order.placedAt)) + '</span>' : '') +
            '</div>' +
            '<div class="stepper odi-qty">' +
            '<button type="button" data-oi-dec="' + index + '" aria-label="Decrease quantity">' + icon('ai-minus') + '</button>' +
            '<output>' + (item.qty || 0) + '</output>' +
            '<button type="button" data-oi-inc="' + index + '" aria-label="Increase quantity">' + icon('ai-plus') + '</button>' +
            '</div>' +
            '<strong>' + '₹' + Math.round((item.price || 0) * (item.qty || 0)) + '</strong>' +
            '<button class="icon-btn odi-remove" type="button" data-oi-remove="' + index + '" aria-label="Remove item">' + icon('ai-trash') + '</button>' +
            '</div>';
    }

    function openOrderModal(id) {
        var order = findOrder(id);
        if (!order) return;
        openOrderId = id;
        var a = order.address || {};
        var t = order.totals || {};
        var items = order.items || [];

        $('#orderModalTitle').textContent = 'Order ' + order.id;

        var options = ORDER_STATUSES.map(function (s) {
            return '<option value="' + s.id + '"' + (statusMeta(order.status).id === s.id ? ' selected' : '') + '>' +
                esc(s.label) + '</option>';
        }).join('');

        var metaLabels = {
            cod: 'Cash on delivery'
        };
        var deliveryLabels = {
            standard: 'Standard delivery', express: 'Express delivery', sameday: 'Same-day delivery'
        };
        var slotLabels = { any: 'Any time', morning: '9 am – 12 pm', afternoon: '12 pm – 4 pm', evening: '4 pm – 8 pm' };
        var delivery = order.delivery || {};
        var etaVal = order.estimatedDelivery ? String(order.estimatedDelivery).slice(0, 10) : '';

        $('#orderModalBody').innerHTML =
            '<div class="order-detail-head">' +
            statusBadge(order.status) +
            '<span class="muted">' + esc(new Date(order.placedAt).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            })) + '</span>' +
            '</div>' +

            '<div class="order-detail-grid">' +
            '<div class="order-detail-card">' +
            '<h3>Customer</h3>' +
            '<p><b>' + esc(a.fullName || 'Guest') + '</b></p>' +
            (a.phone ? '<p>' + esc(a.phone) + '</p>' : '') +
            (a.email ? '<p>' + esc(a.email) + '</p>' : '') +
            '</div>' +
            '<div class="order-detail-card">' +
            '<h3>Shipping address</h3>' +
            '<p>' + esc(a.address1 || '') + (a.address2 ? ', ' + esc(a.address2) : '') + '</p>' +
            '<p>' + esc(a.city || '') + ', ' + esc(a.state || '') + ' ' + esc(a.pincode || '') + '</p>' +
            mapLink(a) +
            '</div>' +
            '<div class="order-detail-card">' +
            '<h3>Payment &amp; delivery</h3>' +
            '<p>' + esc(metaLabels[order.payment] || order.payment || 'Cash on delivery') + '</p>' +
            '<p>' + esc(deliveryLabels[delivery.method] || 'Standard delivery') + ' · ' +
            esc(slotLabels[delivery.slot] || 'Any time') + '</p>' +
            '</div>' +
            '<div class="order-detail-card">' +
            '<h3>Update status</h3>' +
            '<select class="input" data-modal-status="' + esc(order.id) + '">' + options + '</select>' +
            (etaVal || order.status === 'processing'
                ? '<label style="display:block;margin-top:.85rem;font-size:.8rem;font-weight:600;color:var(--text-soft)">' +
                  'Estimated delivery <span style="font-weight:400;color:var(--muted)">(shown to the customer)</span></label>' +
                  '<input class="input" type="date" data-modal-eta="' + esc(order.id) + '" value="' + esc(etaVal) + '">'
                : '') +
            '</div>' +
            '</div>' +

            '<div class="order-detail-items">' +
            '<h3>Items (' + orderItemCount(order) + ')</h3>' +
            (items.length
                ? items.map(function (it, i) { return orderItemRow(it, i, order); }).join('')
                : '<p class="muted admin-empty">No items in this order.</p>') +
            '<div class="order-add-items">' +
            '<div class="oi-search">' + icon('ai-search') +
            '<input class="input" id="oiSearch" type="search" placeholder="Search products to add to this order…" autocomplete="off">' +
            '</div>' +
            '<div class="oi-results" id="oiResults">' + oiResultsMarkup('') + '</div>' +
            '</div>' +
            '</div>' +

            '<div class="order-detail-totals">' +
            '<div class="totals-line"><span>Subtotal</span><span>' + '₹' + Math.round(t.subtotal || 0) + '</span></div>' +
            (t.couponDiscount ? '<div class="totals-line"><span>Coupon ' + esc(t.couponCode || '') + '</span><span>− ' +
                '₹' + Math.round(t.couponDiscount) + '</span></div>' : '') +
            ((t.tax || 0) > 0 ? '<div class="totals-line"><span>GST</span><span>' + '₹' + Math.round(t.tax || 0) + '</span></div>' : '') +
            '<div class="totals-line"><span>Delivery</span><span>' +
            ((t.shipping || 0) === 0 ? 'FREE' : '₹' + Math.round(t.shipping)) + '</span></div>' +
            '<div class="totals-line grand"><span>Total</span><span>' + '₹' + Math.round(t.total || 0) + '</span></div>' +
            '</div>';

        $('#orderModal').hidden = false;
        document.body.classList.add('no-scroll');
    }

    function closeOrderModal() {
        $('#orderModal').hidden = true;
        openOrderId = null;
        if ($('#editorModal').hidden) document.body.classList.remove('no-scroll');
    }

    /* ---------------- users ---------------- */

    function bindUsers() {
        var search = $('#userSearch');
        search.addEventListener('input', function () {
            state.userSearch = search.value.trim().toLowerCase();
            resetPage('users');
            renderUsers();
        });

        $('#userRefreshBtn').addEventListener('click', function () {
            refreshUsers(true);
        });

        $('#userDate').addEventListener('change', function () { state.userDate = this.value; resetPage('users'); renderUsers(); });
        $('#userOrders').addEventListener('change', function () { state.userOrders = this.value; resetPage('users'); renderUsers(); });
        $('#userSort').addEventListener('change', function () { state.userSort = this.value; resetPage('users'); renderUsers(); });
        $('[data-clear="user"]').addEventListener('click', function () { clearUserFilters(); });

        $('#userExportBtn').addEventListener('click', function () { exportVisible('users'); });

        bindPager($('#userPager'), 'users');
        bindSelection('users');

        var list = $('#userList');
        list.addEventListener('click', function (e) {
            var view = e.target.closest('[data-user-view]');
            if (view) { openUserModal(view.getAttribute('data-user-view')); return; }
            var ban = e.target.closest('[data-user-ban]');
            if (ban) { banUser(ban.getAttribute('data-user-ban')); return; }
            var unban = e.target.closest('[data-user-unban]');
            if (unban) { unbanUser(unban.getAttribute('data-user-unban')); return; }
            var del = e.target.closest('[data-user-delete]');
            if (del) { removeUser(del.getAttribute('data-user-delete')); }
        });

        $$('[data-close-user]').forEach(function (el) {
            el.addEventListener('click', closeUserModal);
        });
        $$('[data-close-userlist]').forEach(function (el) {
            el.addEventListener('click', closeUserListModal);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (!$('#userListModal').hidden) { closeUserListModal(); return; }
            if (!$('#userModal').hidden) closeUserModal();
        });
        bindUserListView();

        var modalBody = $('#userModalBody');
        modalBody.addEventListener('click', function (e) {
            var reveal = e.target.closest('[data-user-reveal]');
            if (reveal) { togglePasswordField(reveal); return; }

            var ban = e.target.closest('[data-user-ban]');
            if (ban) { banUser(ban.getAttribute('data-user-ban')); return; }

            var unban = e.target.closest('[data-user-unban]');
            if (unban) { unbanUser(unban.getAttribute('data-user-unban')); return; }

            var open = e.target.closest('[data-um-open]');
            if (open) { openUserListModal(userModalId, open.getAttribute('data-um-open')); return; }

            var exp = e.target.closest('[data-um-export]');
            if (exp) {
                var kind = exp.getAttribute('data-um-export');
                var user = findUser(userModalId);
                if (user) exportUserSection(user.id, kind, userListModalRaw(user, kind));
            }
        });
        modalBody.addEventListener('submit', function (e) {
            var form = e.target.closest('[data-user-password]');
            if (!form) return;
            e.preventDefault();
            savePassword(form);
        });
    }

    function refreshUsers(explicit) {
        var usersP = backend.listUsers ? backend.listUsers() : Promise.resolve([]);
        var bansP = backend.listBans ? backend.listBans() : Promise.resolve([]);
        return Promise.all([usersP, bansP]).then(function (res) {
            state.users = res[0] || [];
            state.bans = res[1] || [];
            renderUsers();
            if (explicit) toast('Users refreshed', 'info');
        }).catch(function (err) {
            if (explicit) toast(err.message, 'error');
            renderUsers();
        });
    }

    function renderUsers() {
        var wrap = $('#userList');
        if (!wrap) return;

        var q = state.userSearch;
        var rows = state.users.filter(function (u) {
            if (!matchesDate(u.createdAt, state.userDate)) return false;
            if (state.userOrders !== 'all') {
                var has = userOrders(u).length > 0;
                if (state.userOrders === 'yes' && !has) return false;
                if (state.userOrders === 'no' && has) return false;
            }
            if (!q) return true;
            return [u.name, u.phone, u.id].join(' ').toLowerCase().indexOf(q) !== -1;
        });
        sortUsers(rows, state.userSort);

        var countEl = $('#userCount');
        if (countEl) countEl.textContent = rows.length + ' of ' + state.users.length + ' users';

        var info = paginate(rows, 'users');
        buildPager($('#userPager'), 'users', info);
        state.lastPage.users = info.rows;
        rows = info.rows;
        updateSelectionUI('users');

        if (!rows.length) {
            wrap.innerHTML = '<div class="admin-empty">' +
                (state.users.length
                    ? 'No users match your filters.'
                    : 'No registered users yet. Accounts created on the store will appear here.') +
                '</div>';
            return;
        }

        wrap.innerHTML = rows.map(userRow).join('');
    }

    function userCartQty(user) {
        return (user.cart || []).reduce(function (sum, l) { return sum + (l.qty || 0); }, 0);
    }

    function userRemovedCount(user) {
        return (user.cartRemoved || []).length;
    }

    function sortUsers(rows, sort) {
        var collator = function (a, b) { return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }); };
        var time = function (u) { var t = new Date(u.createdAt).getTime(); return isNaN(t) ? 0 : t; };
        if (sort === 'oldest') rows.sort(function (a, b) { return time(a) - time(b); });
        else if (sort === 'name-asc') rows.sort(function (a, b) { return collator(a.name || '', b.name || ''); });
        else if (sort === 'orders') rows.sort(function (a, b) { return userOrders(b).length - userOrders(a).length; });
        else if (sort === 'visits') rows.sort(function (a, b) { return (b.visits || 0) - (a.visits || 0); });
        else if (sort === 'cart') rows.sort(function (a, b) { return userCartQty(b) - userCartQty(a); });
        else if (sort === 'removed') rows.sort(function (a, b) { return userRemovedCount(b) - userRemovedCount(a); });
        else rows.sort(function (a, b) { return time(b) - time(a); });
        return rows;
    }

    function clearUserFilters() {
        state.userSearch = '';
        state.userDate = 'all';
        state.userOrders = 'all';
        state.userSort = 'newest';
        $('#userSearch').value = '';
        $('#userDate').value = 'all';
        $('#userOrders').value = 'all';
        $('#userSort').value = 'newest';
        resetPage('users');
        renderUsers();
    }

    function userRow(user) {
        var initial = (user.name || user.phone || 'U').trim().charAt(0).toUpperCase();
        var orders = userOrders(user).length;
        var visits = user.visits || 0;
        var cartCount = userCartQty(user);
        var removedCount = userRemovedCount(user);
        var addr = (user.addresses && user.addresses[0]) || null;
        var place = addr ? [addr.city, addr.state].filter(Boolean).join(', ') : '';
        var banned = isUserBanned(user);

        return '<div class="u-row' + (isSelected('users', user.id) ? ' selected' : '') +
            (banned ? ' is-banned' : '') + '" data-id="' + esc(user.id) + '">' +
            rowCheckbox('users', user.id) +
            '<span class="u-avatar">' + esc(initial) + '</span>' +
            '<div class="u-info">' +
            '<div class="u-name">' + esc(user.name || 'Guest shopper') +
            (banned ? '<span class="tag ban">Banned</span>' : '') +
            '<span class="u-id">' + esc(user.id) + '</span></div>' +
            '<div class="u-meta">' +
            (user.phone ? '<span class="tag">' + esc(user.phone) + '</span>' : '<span class="tag">no mobile</span>') +
            '<span>' + orders + ' order' + (orders === 1 ? '' : 's') + '</span>' +
            '<span>' + visits + ' visit' + (visits === 1 ? '' : 's') + '</span>' +
            '<span>' + cartCount + ' in cart</span>' +
            (removedCount ? '<span>' + removedCount + ' removed</span>' : '') +
            (user.lastIp ? '<span class="u-ip">' + esc(user.lastIp) + '</span>' : '') +
            (place ? '<span>' + esc(place) + '</span>' : '') +
            '</div></div>' +
            '<div class="u-actions">' +
            '<button class="btn btn-outline btn-sm" type="button" data-user-view="' + esc(user.id) + '">' +
            icon('ai-eye') + 'Details</button>' +
            (banned
                ? '<button class="btn btn-outline btn-sm" type="button" data-user-unban="' + esc(user.id) + '">' +
                    icon('ai-check') + 'Unban</button>'
                : '<button class="btn btn-outline btn-danger btn-sm" type="button" data-user-ban="' + esc(user.id) + '">' +
                    icon('ai-ban') + 'Ban</button>') +
            '<button class="icon-btn danger" type="button" data-user-delete="' + esc(user.id) +
            '" aria-label="Delete ' + esc(user.name || user.phone || user.id) + '">' + icon('ai-trash') + '</button>' +
            '</div>' +
            '</div>';
    }

    function userBan(user) {
        var hit = null;
        (state.bans || []).forEach(function (b) {
            if (hit) return;
            if (b.userId && b.userId === user.id) hit = b;
            else if (b.phone && user.phone && b.phone === user.phone) hit = b;
        });
        return hit;
    }

    function isUserBanned(user) {
        return user.banned === true || !!userBan(user);
    }

    function findUser(id) {
        var found = null;
        state.users.forEach(function (u) { if (u.id === id) found = u; });
        return found;
    }

    function userOrders(user) {
        var phone = String(user.phone || '').replace(/\D/g, '');
        return state.orders.filter(function (o) {
            var a = o.address || {};
            if (o.userId && o.userId === user.id) return true;
            var oPhone = String(a.phone || '').replace(/\D/g, '');
            return !!phone && oPhone === phone;
        });
    }

    function removeUser(id) {
        var user = findUser(id);
        if (!user) return;
        if (!window.confirm('Delete “' + (user.name || user.phone || id) + '”? This cannot be undone.')) return;
        backend.deleteUser(id).then(function () {
            state.users = state.users.filter(function (u) { return u.id !== id; });
            renderUsers();
            toast('User deleted', 'info');
        }).catch(function (err) {
            toast(err.message, 'error');
        });
    }

    function banUser(id) {
        var user = findUser(id);
        if (!user) return;
        var name = user.name || user.phone || id;
        var ipNote = user.lastIp ? 'IP ' + user.lastIp : 'no IP on record yet';
        if (!window.confirm('Ban “' + name + '”?\n\nThey will be blocked by account' +
            (user.phone ? ', mobile ' + user.phone : '') + ' and ' + ipNote + '.')) return;

        var reason = window.prompt('Reason (optional):', '') || '';
        var tasks = [];
        if (backend.setUserBanned) tasks.push(backend.setUserBanned(id, true));
        if (backend.saveBan) {
            tasks.push(backend.saveBan({
                userId: id,
                phone: user.phone || '',
                ip: user.lastIp || '',
                reason: reason
            }));
        }
        Promise.all(tasks).then(function () {
            user.banned = true;
            return refreshUsers(false);
        }).then(function () {
            refreshUserModal(user);
            toast('“' + name + '” banned', 'success');
        }).catch(function (err) {
            toast(err.message || 'Could not ban user', 'error');
        });
    }

    function unbanUser(id) {
        var user = findUser(id);
        if (!user) return;
        var name = user.name || user.phone || id;
        if (!window.confirm('Remove the ban on “' + name + '”?')) return;

        var tasks = [];
        if (backend.setUserBanned) tasks.push(backend.setUserBanned(id, false));
        if (backend.clearBansForUser) tasks.push(backend.clearBansForUser(id, user.phone || ''));
        Promise.all(tasks).then(function () {
            user.banned = false;
            return refreshUsers(false);
        }).then(function () {
            refreshUserModal(user);
            toast('“' + name + '” unbanned', 'success');
        }).catch(function (err) {
            toast(err.message || 'Could not unban user', 'error');
        });
    }

    function refreshUserModal(user) {
        if (!user || userModalId !== user.id) return;
        var modal = $('#userModal');
        if (!modal || modal.hidden) return;
        $('#userModalBody').innerHTML = userModalBody(user);
    }

    function openUserModal(id) {
        var user = findUser(id);
        if (!user) return;
        userModalId = user.id;
        $('#userModalTitle').textContent = user.name || user.phone || 'User details';
        $('#userModalBody').innerHTML = userModalBody(user);
        $('#userModal').hidden = false;
        document.body.classList.add('no-scroll');
    }

    function closeUserModal() {
        $('#userModal').hidden = true;
        userModalId = '';
        if ($('#editorModal').hidden && $('#orderModal').hidden) {
            document.body.classList.remove('no-scroll');
        }
    }

    // Preview the first 3 rows; when there are more, offer a button that opens
    // the full list in its own lightbox (filters + export + pagination).
    function previewList(items, key, renderItem, emptyText) {
        if (!items.length) return '<p class="muted">' + emptyText + '</p>';
        var html = items.slice(0, 3).map(renderItem).join('');
        var actions = '';
        if (items.length > 3) {
            actions += '<button class="btn btn-outline btn-sm" type="button" data-um-open="' + key + '">' +
                'Show all ' + items.length + '</button>';
        }
        actions += '<button class="btn btn-outline btn-sm" type="button" data-um-export="' + key + '">' +
            icon('ai-download') + 'Export CSV</button>';
        return html + '<div class="um-actions">' + actions + '</div>';
    }

    function cartLineCard(line, showRemoved) {
        var prod = NC.data && NC.data.byId ? NC.data.byId(line.id) : null;
        var name = (prod && prod.name) || line.name || line.id;
        var brand = (prod && prod.brand) || line.brand || '';
        var sku = line.sku || (prod && prod.sku) || '';
        var price = (prod && prod.price) || Number(line.price) || 0;
        var image = line.image
            || ((prod && NC.data.variantImage) ? NC.data.variantImage(prod, line.color) : '')
            || NC.data.placeholder;
        return '<div class="order-detail-item odi-readonly">' +
            '<img src="' + esc(image) +
            '" alt="" loading="lazy" onerror="NC.ui && NC.ui.imgError ? NC.ui.imgError(this) : (this.src=\'' + NC.data.placeholder + '\')">' +
            '<div class="odi-body">' +
            '<b>' + esc(name) + '</b>' +
            (brand ? '<span class="muted">' + esc(brand) + '</span>' : '') +
            '<span class="odi-variants">Qty ' + (line.qty || 0) +
            (line.color ? ' · ' + esc(line.color) : '') +
            (line.size ? ' · Size ' + esc(line.size) : '') +
            (sku ? ' · SKU ' + esc(sku) : '') +
            ' · Product ID ' + esc(line.id) + '</span>' +
            (showRemoved ? '<span class="muted">Removed ' + esc(line.removedAt ? timeAgo(line.removedAt) : 'recently') + '</span>' : '') +
            '</div>' +
            '<strong>₹' + Math.round(price * (line.qty || 0)) + '</strong>' +
            '</div>';
    }

    function userOrderGroup(order) {
        var a = order.address || {};
        var items = order.items || [];
        var t = order.totals || {};
        var totalsHtml =
            '<div class="order-detail-totals user-order-totals">' +
            '<div class="totals-line"><span>Subtotal</span><span>' + '₹' + Math.round(t.subtotal || 0) + '</span></div>' +
            ((t.couponDiscount || 0) > 0
                ? '<div class="totals-line"><span>Coupon' + (t.couponCode ? ' ' + esc(t.couponCode) : '') + '</span><span>− ' +
                    '₹' + Math.round(t.couponDiscount) + '</span></div>'
                : '') +
            ((t.tax || 0) > 0
                ? '<div class="totals-line"><span>GST</span><span>' + '₹' + Math.round(t.tax || 0) + '</span></div>'
                : '') +
            '<div class="totals-line"><span>Delivery</span><span>' +
            ((t.shipping || 0) === 0 ? 'FREE' : '₹' + Math.round(t.shipping)) + '</span></div>' +
            '<div class="totals-line grand"><span>Total</span><span>' + '₹' + Math.round(orderTotal(order)) + '</span></div>' +
            '</div>';
        return '<div class="user-order-group" data-user-order="' + esc(order.id) + '">' +
            '<div class="user-order-head">' +
            '<b>' + esc(order.id) + '</b> ' + statusBadge(order.status) +
            '<span class="tag">' + orderItemCount(order) + ' item' + (orderItemCount(order) === 1 ? '' : 's') + '</span>' +
            '<span class="muted">' + esc(timeAgo(order.placedAt)) +
            (a.city ? ' · ' + esc(a.city) : '') + (a.pincode ? ' ' + esc(a.pincode) : '') + '</span>' +
            '<strong>₹' + Math.round(orderTotal(order)) + '</strong>' +
            '</div>' +
            '<div class="user-order-items">' +
            (items.length
                ? items.map(function (it) { return itemDetailCard(it, 'Ordered ' + timeAgo(order.placedAt)); }).join('')
                : '<p class="muted">No items in this order.</p>') +
            '</div>' +
            totalsHtml +
            '</div>';
    }

    function userModalBody(user) {
        var p = user; // user already has name/phone/password/addresses/cart
        var orders = userOrders(user);
        var addresses = user.addresses || [];
        var cart = user.cart || [];
        var removed = user.cartRemoved || [];

        var joined = p.createdAt ? new Date(p.createdAt).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : 'Unknown';
        var visits = p.visits || 0;
        var lastVisit = p.lastVisit ? new Date(p.lastVisit).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : 'No visits recorded yet';
        var banned = isUserBanned(p);

        return '<div class="order-detail-grid">' +
            '<div class="order-detail-card">' +
            '<h3>Account</h3>' +
            '<p><b>' + esc(p.name || 'Guest shopper') + '</b>' +
            (banned ? ' <span class="tag ban">Banned</span>' : '') + '</p>' +
            '<p>' + (p.phone ? 'Mobile ' + esc(p.phone) : 'No mobile on file') + '</p>' +
            '<p class="muted">ID ' + esc(p.id) + '</p>' +
            '<p class="muted">Joined ' + esc(joined) + '</p>' +
            '<p class="muted">' + visits + ' visit' + (visits === 1 ? '' : 's') + '</p>' +
            '<p class="muted">Last visit: ' + esc(lastVisit) + '</p>' +
            '<p class="muted">Last IP: ' + esc(p.lastIp || 'unknown') + '</p>' +
            (banned
                ? '<button class="btn btn-outline btn-sm" type="button" data-user-unban="' + esc(p.id) + '">Unban this user</button>'
                : '<button class="btn btn-outline btn-danger btn-sm" type="button" data-user-ban="' + esc(p.id) + '">' +
                    icon('ai-ban') + 'Ban this user</button>') +
            '</div>' +
            '<div class="order-detail-card">' +
            '<h3>Password</h3>' +
            '<form class="user-pw-form" data-user-password="' + esc(p.id) + '">' +
            '<div class="user-pw-row">' +
            '<input class="input" type="password" data-user-pw-input value="' + esc(p.password || '') +
            '" autocomplete="off" aria-label="Password">' +
            '<button class="icon-btn" type="button" data-user-reveal aria-label="Show or hide password">' +
            icon('ai-eye') + '</button>' +
            '</div>' +
            '<button class="btn btn-primary btn-sm" type="submit">Update password</button>' +
            '</form>' +
            '</div>' +
            '<div class="order-detail-card">' +
            '<h3>Saved addresses</h3>' +
            (addresses.length
                ? addresses.map(function (a) {
                    return '<p><b>' + esc(a.label || 'Address') + '</b><br>' +
                        esc([a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')) +
                        (mapsUrl(a) ? '<br>' + mapLink(a, 'View on map') : '') + '</p>';
                }).join('')
                : '<p class="muted">No saved addresses.</p>') +
            '</div>' +
            '</div>' +

            '<div class="order-detail-items">' +
            '<h3>In cart — not purchased (' + cart.reduce(function (s, l) { return s + (l.qty || 0); }, 0) + ')</h3>' +
            previewList(cart, 'cart', function (l) { return cartLineCard(l, false); },
                'Nothing in the cart right now.') +
            '</div>' +

            '<div class="order-detail-items">' +
            '<h3>Added then removed from cart (' + removed.length + ')</h3>' +
            previewList(removed, 'removed', function (l) { return cartLineCard(l, true); },
                'Nothing removed from the cart.') +
            '</div>' +

            '<div class="order-detail-items">' +
            '<h3>Orders (' + orders.length + ')</h3>' +
            previewList(orders, 'orders', userOrderGroup, 'No orders placed yet.') +
            '</div>';
    }

    /* ---------------- user list lightbox ---------------- */

    var ULM_SIZES = [5, 10, 25, 50];
    var ULM_TITLES = { cart: 'In cart — not purchased', removed: 'Added then removed from cart', orders: 'Orders' };

    function openUserListModal(userId, kind) {
        var user = findUser(userId);
        if (!user || !ULM_TITLES[kind]) return;
        userListModal = { userId: userId, kind: kind, q: '', filter: 'all', page: 1, size: 5 };
        $('#userListModal').hidden = false;
        document.body.classList.add('no-scroll');
        renderUserListModal();
    }

    function closeUserListModal() {
        $('#userListModal').hidden = true;
        var modal = $('#userModal').hidden;
        if (!$('#editorModal').hidden || !$('#orderModal').hidden || !modal) return;
        document.body.classList.remove('no-scroll');
    }

    function userListModalRaw(user, kind) {
        if (kind === 'cart') return user.cart || [];
        if (kind === 'removed') return user.cartRemoved || [];
        return userOrders(user);
    }

    function userListModalRows(user) {
        var kind = userListModal.kind;
        var q = userListModal.q;
        var filter = userListModal.filter;
        var rows = userListModalRaw(user, kind).filter(function (item) {
            if (kind === 'orders') {
                if (filter !== 'all' && statusMeta(item.status).id !== filter) return false;
                if (!q) return true;
                var a = item.address || {};
                var text = [item.id, a.city, a.state, statusMeta(item.status).label,
                    (item.items || []).map(function (i) { return i.name; }).join(' ')].join(' ').toLowerCase();
                return text.indexOf(q) !== -1;
            }
            var prod = NC.data && NC.data.byId ? NC.data.byId(item.id) : null;
            var brand = (prod && prod.brand) || '';
            if (filter !== 'all' && brand !== filter) return false;
            if (!q) return true;
            return [item.id, prod ? prod.name : '', brand, item.color || '', item.size || '']
                .join(' ').toLowerCase().indexOf(q) !== -1;
        });
        if (kind === 'orders') {
            rows.sort(function (a, b) { return String(b.placedAt).localeCompare(String(a.placedAt)); });
        }
        return rows;
    }

    function userListModalToolbar(user, rows) {
        var kind = userListModal.kind;
        var options;
        if (kind === 'orders') {
            options = '<option value="all">All statuses</option>' + ORDER_STATUSES.map(function (s) {
                return '<option value="' + s.id + '"' + (userListModal.filter === s.id ? ' selected' : '') + '>' +
                    esc(s.label) + '</option>';
            }).join('');
        } else {
            var seen = {};
            var brands = [];
            userListModalRaw(user, kind).forEach(function (item) {
                var prod = NC.data && NC.data.byId ? NC.data.byId(item.id) : null;
                var brand = (prod && prod.brand) || '';
                if (brand && !seen[brand]) { seen[brand] = true; brands.push(brand); }
            });
            brands.sort();
            options = '<option value="all">All brands</option>' + brands.map(function (b) {
                return '<option value="' + esc(b) + '"' + (userListModal.filter === b ? ' selected' : '') + '>' +
                    esc(b) + '</option>';
            }).join('');
        }

        $('#userListModalToolbar').innerHTML =
            '<div class="admin-search">' + icon('ai-search') +
            '<input class="input" type="search" data-ulm-q placeholder="Search…" autocomplete="off" value="' +
            esc(userListModal.q) + '"></div>' +
            '<label class="filter-field"><span>' + (kind === 'orders' ? 'Status' : 'Brand') + '</span>' +
            '<select class="input" data-ulm-filter>' + options + '</select></label>' +
            '<div class="admin-toolbar-right">' +
            '<span class="muted" data-ulm-count>' + rows.length + ' item' + (rows.length === 1 ? '' : 's') + '</span>' +
            '<button class="btn btn-outline btn-sm" type="button" data-ulm-export>' + icon('ai-download') + 'Export CSV</button>' +
            '</div>';
    }

    function userListModalPager(info) {
        var pager = $('#userListModalPager');
        if (!pager) return;
        pager.hidden = false;
        var isCustom = ULM_SIZES.indexOf(info.size) === -1;
        var sizes = ULM_SIZES.map(function (s) {
            return '<option value="' + s + '"' + (s === info.size ? ' selected' : '') + '>' + s + '</option>';
        }).join('') + '<option value="custom"' + (isCustom ? ' selected' : '') + '>Custom</option>';
        pager.innerHTML =
            '<div class="pager-info">Showing <b>' + info.start + '–' + info.end + '</b> of <b>' + info.total + '</b></div>' +
            '<div class="pager-controls">' +
            '<label class="pager-size">Rows per page<select class="pager-select" data-ulm-size>' + sizes + '</select></label>' +
            '<input class="pager-custom" type="number" min="1" max="1000" value="' + info.size + '"' +
            (isCustom ? '' : ' hidden') + ' data-ulm-custom aria-label="Custom rows per page">' +
            '<div class="pager-nav">' +
            '<button class="pager-btn" type="button" data-ulm-page="prev"' + (info.page <= 1 ? ' disabled' : '') + ' aria-label="Previous page">‹</button>' +
            '<span class="pager-pages">Page ' + info.page + ' of ' + info.pages + '</span>' +
            '<button class="pager-btn" type="button" data-ulm-page="next"' + (info.page >= info.pages ? ' disabled' : '') + ' aria-label="Next page">›</button>' +
            '</div></div>';
    }

    function renderUserListModal() {
        var user = findUser(userListModal.userId);
        if (!user) { closeUserListModal(); return; }

        var kind = userListModal.kind;
        $('#userListModalTitle').textContent = (ULM_TITLES[kind] || 'List') + ' — ' + (user.name || user.phone || user.id);

        var rows = userListModalRows(user);
        userListModalToolbar(user, rows);

        var total = rows.length;
        var size = Math.max(1, userListModal.size);
        var pages = Math.max(1, Math.ceil(total / size));
        if (userListModal.page > pages) userListModal.page = pages;
        if (userListModal.page < 1) userListModal.page = 1;
        var start = (userListModal.page - 1) * size;
        var slice = rows.slice(start, start + size);
        var info = { total: total, page: userListModal.page, pages: pages, size: size, start: total ? start + 1 : 0, end: start + slice.length };

        var body = $('#userListModalBody');
        body.innerHTML = total
            ? slice.map(function (item) {
                return kind === 'orders' ? userOrderGroup(item) : cartLineCard(item, kind === 'removed');
            }).join('')
            : '<div class="admin-empty">Nothing to show here.</div>';

        userListModalPager(info);
        userListModal._rows = rows;
    }

    function userSectionCsv(kind, rows) {
        if (!rows.length) return null;
        if (kind === 'orders') {
            return {
                header: ['Order ID', 'Date', 'Status', 'Items', 'Total', 'City', 'Pincode'],
                body: rows.map(function (o) {
                    var a = o.address || {};
                    return [o.id, o.placedAt ? new Date(o.placedAt).toISOString() : '', statusMeta(o.status).label,
                        orderItemCount(o), Math.round(orderTotal(o)), a.city, a.pincode];
                })
            };
        }
        var header = ['Product ID', 'Name', 'Brand', 'Qty', 'Color', 'Size', 'Line total'];
        if (kind === 'removed') header.push('Removed at');
        return {
            header: header,
            body: rows.map(function (l) {
                var prod = NC.data && NC.data.byId ? NC.data.byId(l.id) : null;
                var price = prod ? prod.price : 0;
                var row = [l.id, prod ? prod.name : '', (prod && prod.brand) || '', l.qty || 0,
                    l.color || '', l.size || '', Math.round(price * (l.qty || 0))];
                if (kind === 'removed') row.push(l.removedAt ? new Date(l.removedAt).toISOString() : '');
                return row;
            })
        };
    }

    function exportUserSection(userId, kind, rows) {
        var user = findUser(userId);
        if (!user) return;
        var csv = userSectionCsv(kind, rows);
        if (!csv) { toast('Nothing to export', 'error'); return; }
        var name = (user.name || user.phone || user.id).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        downloadCsv('novacart-user-' + kind + '-' + name + '.csv', csv.header, csv.body);
        toast('Exported ' + rows.length + ' row' + (rows.length === 1 ? '' : 's'), 'success');
    }

    function exportUserList() {
        var user = findUser(userListModal.userId);
        if (!user) return;
        exportUserSection(user.id, userListModal.kind, userListModal._rows || userListModalRows(user));
    }

    function bindUserListView() {
        var toolbar = $('#userListModalToolbar');
        if (toolbar) {
            toolbar.addEventListener('input', function (e) {
                var q = e.target.closest('[data-ulm-q]');
                if (!q) return;
                userListModal.q = q.value.trim().toLowerCase();
                userListModal.page = 1;
                renderUserListModal();
            });
            toolbar.addEventListener('change', function (e) {
                var f = e.target.closest('[data-ulm-filter]');
                if (!f) return;
                userListModal.filter = f.value;
                userListModal.page = 1;
                renderUserListModal();
            });
            toolbar.addEventListener('click', function (e) {
                if (e.target.closest('[data-ulm-export]')) exportUserList();
            });
        }

        var pager = $('#userListModalPager');
        if (pager) {
            pager.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-ulm-page]');
                if (!btn || btn.disabled) return;
                userListModal.page = btn.getAttribute('data-ulm-page') === 'prev'
                    ? Math.max(1, userListModal.page - 1)
                    : userListModal.page + 1;
                renderUserListModal();
            });
            pager.addEventListener('change', function (e) {
                var sel = e.target.closest('[data-ulm-size]');
                if (sel) {
                    if (sel.value === 'custom') {
                        var input = $('[data-ulm-custom]', pager);
                        if (input) { input.hidden = false; input.focus(); input.select(); }
                        return;
                    }
                    userListModal.size = parseInt(sel.value, 10) || 5;
                    userListModal.page = 1;
                    renderUserListModal();
                    return;
                }
                var custom = e.target.closest('[data-ulm-custom]');
                if (custom) {
                    var size = parseInt(custom.value, 10);
                    if (!size || size < 1) size = 1;
                    if (size > 1000) size = 1000;
                    userListModal.size = size;
                    userListModal.page = 1;
                    renderUserListModal();
                }
            });
        }
    }

    function togglePasswordField(btn) {
        var row = btn.closest('.user-pw-row');
        if (!row) return;
        var input = $('[data-user-pw-input]', row);
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
    }

    function savePassword(form) {
        var id = form.getAttribute('data-user-password');
        var input = $('[data-user-pw-input]', form);
        if (!input) return;
        var value = input.value;
        if (!value || value.length < 4) { toast('Password must be at least 4 characters', 'error'); return; }

        var user = findUser(id);
        if (!user) return;
        var updated = Object.assign({}, user, { password: value });
        var btn = $('button[type="submit"]', form);
        if (btn) btn.disabled = true;

        backend.saveUser(updated).then(function () {
            state.users = state.users.map(function (u) { return u.id === id ? updated : u; });
            renderUsers();
            toast('Password updated', 'success');
        }).catch(function (err) {
            toast(err.message, 'error');
        }).then(function () {
            if (btn) btn.disabled = false;
        });
    }

    /* ---------------- editor ---------------- */

    function bindModal() {
        $$('[data-close-modal]').forEach(function (el) {
            el.addEventListener('click', closeEditor);
        });
        $$('[data-close-stock]').forEach(function (el) {
            el.addEventListener('click', closeStockModal);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !$('#editorModal').hidden) closeEditor();
            if (e.key === 'Escape' && !$('#stockModal').hidden) closeStockModal();
        });

        $('#addColorBtn').addEventListener('click', function () {
            $('#colorList').appendChild(colorRow(['', '#4f46e5']));
        });

        $('#autoFillBtn').addEventListener('click', autoFillCopy);

        $('#productForm').addEventListener('submit', function (e) {
            e.preventDefault();
            saveProduct();
        });
    }

    function openEditor(id) {
        if (!window.NC) return;
        var form = $('#productForm');
        form.reset();

        var rec;
        if (id) {
            rec = findRecord(id);
        }
        if (!rec) {
            rec = {
                id: '',
                name: '', brand: '', category: '', price: '', mrp: '', stock: '',
                sortOrder: state.records.length, rating: 4.5, reviewCount: 0,
                badges: [], visible: true, sizes: '', keywords: '',
                highlights: '', description: '', colors: [], images: []
            };
        }

        $('#editorTitle').textContent = id ? 'Edit product' : 'New product';
        state.editing = rec;
        state.editingOriginalId = id || null;
        fillForm(rec);
        $('#editorModal').hidden = false;
        document.body.classList.add('no-scroll');
        form.elements.name.focus();
    }

    function closeEditor() {
        $('#editorModal').hidden = true;
        document.body.classList.remove('no-scroll');
    }

    /* ---------------- quick stock ---------------- */

    var stockSaveTimer = null;
    var stockId = null;
    var openOrderId = null;

    function findColor(rec, name) {
        var colors = rec.colors || [];
        for (var i = 0; i < colors.length; i++) {
            if (colors[i][0] === name) return colors[i];
        }
        return null;
    }

    function colorQty(rec, color, size) {
        var c = findColor(rec, color);
        if (!c) return 0;
        var map = c[5];
        if (size != null && map && typeof map === 'object') {
            return map[size] != null ? map[size] : 0;
        }
        if (c[4] != null) return c[4];
        return rec.stock != null ? rec.stock : 0;
    }

    function syncStock(rec, c) {
        var sizes = (c[3] && c[3].length) ? c[3] : [];
        if (c[5] && typeof c[5] === 'object' && sizes.length) {
            c[4] = sizes.reduce(function (sum, s) { return sum + (c[5][s] != null ? c[5][s] : 0); }, 0);
        }
        var colors = rec.colors || [];
        var all = colors.length > 0;
        var total = 0;
        colors.forEach(function (col) {
            if (col[4] != null) total += col[4];
            else all = false;
        });
        if (all) rec.stock = total;
    }

    function recomputeProductStock(rec) {
        var colors = rec.colors || [];
        var all = colors.length > 0;
        var total = 0;
        colors.forEach(function (col) {
            if (col[4] != null) total += col[4];
            else all = false;
        });
        if (all) rec.stock = total;
    }

    function applyOrderQty(rec, colorName, size, qty, dir) {
        var c = findColor(rec, colorName) || (rec.colors && rec.colors[0]);
        if (c && c[5] && typeof c[5] === 'object' && size != null &&
            Object.prototype.hasOwnProperty.call(c[5], size)) {
            c[5][size] = Math.max(0, (c[5][size] || 0) + dir * qty);
            syncStock(rec, c);
        } else if (c && c[4] != null) {
            c[4] = Math.max(0, (c[4] || 0) + dir * qty);
            recomputeProductStock(rec);
        } else {
            rec.stock = Math.max(0, (rec.stock || 0) + dir * qty);
        }
    }

    function applyStockToProducts(order, dir) {
        return backend.listProducts().then(function (records) {
            state.records = records || state.records || [];
            var touched = [];
            (order.items || []).forEach(function (item) {
                var rec = null;
                state.records.forEach(function (r) { if (r.id === item.id) rec = r; });
                if (!rec) return;
                applyOrderQty(rec, item.color, item.size, item.qty || 0, dir);
                touched.push(rec);
            });
            return Promise.all(touched.map(function (rec) { return backend.saveProduct(rec); }));
        }).then(function () {
            if ($('#productList')) renderList();
        });
    }

    function adjustInventoryForStatus(order, prev, status) {
        if (!order) return Promise.resolve();
        var completing = status === 'completed' && prev !== 'completed';
        var reopening = prev === 'completed' && status !== 'completed';
        if (completing && !order.stockApplied) {
            return applyStockToProducts(order, -1).then(function () {
                order.stockApplied = true;
                return backend.saveOrder(order);
            });
        }
        if (reopening && order.stockApplied) {
            return applyStockToProducts(order, 1).then(function () {
                order.stockApplied = false;
                return backend.saveOrder(order);
            });
        }
        return Promise.resolve();
    }

    function adjustVariant(rec, color, size, delta) {
        var c = findColor(rec, color);
        if (!c) return;
        if (size != null) {
            if (!c[5] || typeof c[5] !== 'object') c[5] = {};
            var base = colorQty(rec, color, size);
            c[5][size] = Math.max(0, base + delta);
        } else {
            c[4] = Math.max(0, colorQty(rec, color, null) + delta);
        }
        syncStock(rec, c);
    }

    function stockModalBody(rec) {
        var colors = rec.colors || [];
        if (!colors.length) {
            return '<p class="admin-empty">This product has no variants yet. Add colours in the product editor first.</p>';
        }
        return '<div class="stock-list">' + colors.map(function (c) {
            var map = c[5] && typeof c[5] === 'object' ? c[5] : null;
            var sizes = (c[3] && c[3].length) ? c[3] : [];
            var sub = '';
            if (map && sizes.length) {
                sub = '<div class="stock-subs">' + sizes.map(function (s) {
                    var qty = colorQty(rec, c[0], s);
                    return '<div class="stock-row stock-sub">' +
                        '<span class="stock-name">' + esc(s) + '</span>' +
                        stepper(rec.id, c[0], s, qty) +
                        '</div>';
                }).join('') + '</div>';
            }
            var total = map && sizes.length
                ? sizes.reduce(function (sum, s) { return sum + colorQty(rec, c[0], s); }, 0)
                : colorQty(rec, c[0], null);
            return '<div class="stock-group' + (map && sizes.length ? ' has-sizes' : '') + '">' +
                '<div class="stock-row stock-head">' +
                '<span class="stock-visual">' +
                (c[2]
                    ? '<img class="stock-thumb" src="' + esc(c[2]) + '" alt="" loading="lazy" onerror="NC.data && NC.data.placeholder ? (this.src=\'' + NC.data.placeholder + '\') : (this.style.visibility=\'hidden\')">'
                    : '') +
                '<span class="stock-swatch" style="background:' + esc(c[1] || '#ccc') + '"></span>' +
                '</span>' +
                '<span class="stock-name">' + esc(c[0] || 'Default') + '</span>' +
                (map && sizes.length
                    ? '<span class="stock-total">' + total + ' total</span>'
                    : stepper(rec.id, c[0], '', total)) +
                '</div>' + sub + '</div>';
        }).join('') + '</div>';
    }

    function stepper(id, color, size, qty) {
        return '<div class="stepper">' +
            '<button type="button" data-stock-dec data-id="' + esc(id) + '" data-color="' + esc(color) + '" data-size="' + esc(size || '') + '" aria-label="Decrease">' + icon('ai-minus') + '</button>' +
            '<output>' + qty + '</output>' +
            '<button type="button" data-stock-inc data-id="' + esc(id) + '" data-color="' + esc(color) + '" data-size="' + esc(size || '') + '" aria-label="Increase">' + icon('ai-plus') + '</button>' +
            '</div>';
    }

    function openStockModal(id) {
        var rec = findRecord(id);
        if (!rec) return;
        stockId = id;
        $('#stockModalTitle').textContent = (rec.name || 'Product') + ' — stock';
        $('#stockModalBody').innerHTML = stockModalBody(rec);
        $('#stockModal').hidden = false;
        document.body.classList.add('no-scroll');
        bindStockModal();
    }

    function bindStockModal() {
        var body = $('#stockModalBody');
        $$('[data-stock-inc], [data-stock-dec]', body).forEach(function (btn) {
            btn.addEventListener('click', function () {
                var rec = findRecord(btn.getAttribute('data-id'));
                if (!rec) return;
                var size = btn.getAttribute('data-size') || null;
                var delta = btn.hasAttribute('data-stock-inc') ? 1 : -1;
                adjustVariant(rec, btn.getAttribute('data-color'), size, delta);
                $('#stockModalBody').innerHTML = stockModalBody(rec);
                bindStockModal();
                scheduleStockSave(rec);
            });
        });
    }

    function scheduleStockSave(rec) {
        if (stockSaveTimer) clearTimeout(stockSaveTimer);
        stockSaveTimer = setTimeout(function () {
            stockSaveTimer = null;
            backend.saveProduct(rec).then(function (saved) {
                state.records = state.records.map(function (r) { return r.id === saved.id ? saved : r; });
                if (stockId === saved.id) {
                    $('#stockModalBody').innerHTML = stockModalBody(saved);
                    bindStockModal();
                }
                renderList();
            }).catch(function (err) {
                toast(err.message, 'error');
            });
        }, 300);
    }

    function closeStockModal() {
        if (stockSaveTimer) { clearTimeout(stockSaveTimer); stockSaveTimer = null; }
        $('#stockModal').hidden = true;
        stockId = null;
        if ($('#editorModal').hidden && $('#orderModal').hidden && $('#userModal').hidden) {
            document.body.classList.remove('no-scroll');
        }
    }

    function fillForm(rec) {
        var f = $('#productForm').elements;
        f.name.value = rec.name || '';
        f.brand.value = rec.brand || '';
        f.category.value = rec.category || '';
        f.id.value = rec.id || '';
        f.price.value = rec.price != null ? rec.price : '';
        f.mrp.value = rec.mrp != null ? rec.mrp : '';
        f.stock.value = rec.stock != null ? rec.stock : '';
        f.sortOrder.value = rec.sortOrder != null ? rec.sortOrder : 0;
        f.rating.value = rec.rating != null ? rec.rating : 4.5;
        f.reviewCount.value = rec.reviewCount != null ? rec.reviewCount : 0;
        f.badgeNew.checked = (rec.badges || []).indexOf('new') !== -1;
        f.badgeBestseller.checked = (rec.badges || []).indexOf('bestseller') !== -1;
        f.visible.checked = rec.visible !== false;
        f.keywords.value = Array.isArray(rec.keywords) ? rec.keywords.join(', ') : (rec.keywords || '');
        f.highlights.value = (rec.highlights || []).join('\n');
        f.description.value = rec.description || '';

        var colorList = $('#colorList');
        colorList.innerHTML = '';
        (rec.colors || []).forEach(function (c) { colorList.appendChild(colorRow(c)); });
        if (!rec.colors || !rec.colors.length) colorList.appendChild(colorRow(['', '#4f46e5']));
    }

    var COLOR_NAMES = [
        ['Black', '#000000'], ['White', '#ffffff'], ['Grey', '#808080'], ['Silver', '#c0c0c0'],
        ['Charcoal', '#36454f'], ['Graphite', '#383838'], ['Red', '#ff0000'], ['Crimson', '#dc143c'],
        ['Maroon', '#800000'], ['Wine', '#722f37'], ['Orange', '#ff8000'], ['Amber', '#ffbf00'],
        ['Yellow', '#ffd400'], ['Gold', '#d4af37'], ['Olive', '#808000'], ['Lime', '#8bc34a'],
        ['Green', '#008000'], ['Emerald', '#2ecc71'], ['Mint', '#98ff98'], ['Teal', '#008080'],
        ['Turquoise', '#40e0d0'], ['Cyan', '#00bcd4'], ['Sky Blue', '#87ceeb'], ['Blue', '#1e6fff'],
        ['Navy', '#000080'], ['Royal Blue', '#4169e1'], ['Indigo', '#4b0082'], ['Purple', '#800080'],
        ['Violet', '#8f00ff'], ['Lavender', '#b57edc'], ['Magenta', '#ff00ff'], ['Pink', '#ff6fa5'],
        ['Rose', '#ff2d78'], ['Brown', '#8b4513'], ['Tan', '#d2b48c'], ['Beige', '#e8dcc0'],
        ['Cream', '#fffdd0'], ['Khaki', '#c3b091'], ['Peach', '#ffdab9'], ['Coral', '#ff7f50'],
        ['Salmon', '#fa8072'], ['Rust', '#b7410e'], ['Burgundy', '#800020'], ['Plum', '#8e4585'],
        ['Chocolate', '#d2691e'], ['Sand', '#c2b280'], ['Mustard', '#e1ad01'], ['Sage', '#9caf88'],
        ['Slate', '#708090'], ['Ivory', '#fffff0']
    ];

    function hexToRgb(hex) {
        var h = String(hex || '').trim().replace('#', '');
        if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        if (!/^[0-9a-f]{6}$/i.test(h)) return null;
        return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) };
    }

    function srgbToLinear(c) {
        c /= 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    function hexToLab(hex) {
        var rgb = hexToRgb(hex);
        if (!rgb) return null;
        var r = srgbToLinear(rgb.r);
        var g = srgbToLinear(rgb.g);
        var b = srgbToLinear(rgb.b);
        var x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) * 100;
        var y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) * 100;
        var z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) * 100;
        function f(t) { return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116); }
        var fx = f(x / 95.047);
        var fy = f(y / 100.0);
        var fz = f(z / 108.883);
        return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
    }

    function deltaE(l1, l2) {
        var dL = l1.L - l2.L;
        var da = l1.a - l2.a;
        var db = l1.b - l2.b;
        return Math.sqrt(dL * dL + da * da + db * db);
    }

    function nearestColorName(hex) {
        var lab = hexToLab(hex);
        if (!lab) return '';
        var chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
        var hue = Math.atan2(lab.b, lab.a);
        var best = '';
        var bestScore = Infinity;
        COLOR_NAMES.forEach(function (c) {
            var t = hexToLab(c[1]);
            var tc = Math.sqrt(t.a * t.a + t.b * t.b);
            var score = deltaE(lab, t);
            if (chroma > 10) {
                if (tc <= 6) {
                    score += 30;
                } else {
                    var dh = Math.abs(hue - Math.atan2(t.b, t.a));
                    if (dh > Math.PI) dh = 2 * Math.PI - dh;
                    score += dh * 18;
                }
            }
            if (score < bestScore) { bestScore = score; best = c[0]; }
        });
        return best;
    }

    function colorRow(color) {
        color = color || ['', '#4f46e5'];
        var row = document.createElement('div');
        row.className = 'variant-row';
        row.innerHTML =
            '<input class="v-color" type="color" value="' + esc(color[1] || '#4f46e5') + '" aria-label="Color swatch">' +
            '<input class="input v-name" type="text" placeholder="Color name" value="' + esc(color[0] || '') + '">' +
            '<input class="input v-hex" type="text" placeholder="#hex" value="' + esc(color[1] || '') + '">' +
            '<button class="icon-mini danger v-remove" type="button" aria-label="Remove color">' + icon('ai-trash') + '</button>' +
            '<div class="v-image-wrap">' +
            '<img class="v-preview" alt="" loading="lazy">' +
            '<input class="input v-image" type="text" placeholder="Variant image URL (optional)" value="' + esc(color[2] || '') + '">' +
            '<button class="icon-mini v-upload" type="button" aria-label="Upload variant image">' + icon('ai-upload') + '</button>' +
            '<input type="file" accept="image/*" hidden>' +
            '</div>' +
            '<input class="input v-sizes" type="text" placeholder="Sizes (e.g. S, M, L)" value="' + esc(Array.isArray(color[3]) ? color[3].join(', ') : (color[3] || '')) + '">' +
            '<div class="v-qty-wrap"></div>';

        var sizeStock = color[5] || null;
        var sizeInput = $('.v-sizes', row);
        var qtyWrap = $('.v-qty-wrap', row);

        function readQty() {
            var map = { single: null };
            var single = $('.v-qty', qtyWrap);
            if (single) { map.single = single.value.trim(); return map; }
            $$('.v-sq-row', qtyWrap).forEach(function (r) {
                var key = $('.v-sq-name', r).getAttribute('data-size');
                map[key] = $('.v-sq', r).value.trim();
            });
            return map;
        }

        function renderQty(pre) {
            pre = pre || {};
            var sizes = sizeInput.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            qtyWrap.innerHTML = '';
            if (!sizes.length) {
                qtyWrap.innerHTML = '<input class="input v-qty" type="number" min="0" step="1" placeholder="Quantity" value="' +
                    esc(pre.single != null ? pre.single : (color[4] == null ? '' : color[4])) + '">';
            } else {
                qtyWrap.innerHTML = sizes.map(function (s) {
                    var value = pre[s] != null ? pre[s] : (sizeStock && sizeStock[s] != null ? sizeStock[s] : '');
                    return '<label class="v-sq-row"><span class="v-sq-name" data-size="' + esc(s) + '">' + esc(s) + '</span>' +
                        '<input class="input v-sq" type="number" min="0" step="1" placeholder="Qty" value="' + esc(value) + '"></label>';
                }).join('');
            }
        }

        sizeInput.addEventListener('input', function () { renderQty(readQty()); });
        renderQty();

        var picker = $('.v-color', row);
        var hex = $('.v-hex', row);
        var name = $('.v-name', row);
        var userNamed = false;

        function autoName() {
            if (userNamed) return;
            var n = nearestColorName(picker.value);
            if (n) name.value = n;
        }

        picker.addEventListener('input', function () { hex.value = picker.value; autoName(); });
        hex.addEventListener('input', function () {
            var v = hex.value.trim();
            if (v.charAt(0) !== '#') v = '#' + v;
            if (/^#[0-9a-f]{6}$/i.test(v)) { picker.value = v; autoName(); }
        });
        name.addEventListener('input', function () { userNamed = name.value.trim() !== ''; });
        $('.v-remove', row).addEventListener('click', function () { row.remove(); });

        var preview = $('.v-preview', row);
        var imageInput = $('.v-image', row);
        var file = $('input[type="file"]', row);

        function paint() {
            var v = imageInput.value.trim();
            if (v) {
                preview.src = v;
                preview.style.visibility = 'visible';
            } else {
                preview.removeAttribute('src');
                preview.style.visibility = 'hidden';
            }
        }
        imageInput.addEventListener('input', paint);
        paint();

        var uploadBtn = $('.v-upload', row);
        uploadBtn.addEventListener('click', function () { file.click(); });
        file.addEventListener('change', function () {
            var f = file.files && file.files[0];
            if (!f) return;
            uploadBtn.disabled = true;
            preview.style.visibility = 'visible';
            preview.src = URL.createObjectURL(f);
            backend.uploadImage(f).then(function (uploaded) {
                imageInput.value = uploaded;
                paint();
                toast('Variant image uploaded', 'success');
            }).catch(function (err) {
                paint();
                toast(err.message, 'error');
            }).then(function () {
                uploadBtn.disabled = false;
                file.value = '';
            });
        });

        return row;
    }

    function collectForm() {
        var f = $('#productForm').elements;
        var colors = [];
        $$('#colorList .variant-row').forEach(function (row) {
            var name = $('.v-name', row).value.trim();
            var hex = $('.v-hex', row).value.trim() || $('.v-color', row).value || '#cccccc';
            var image = $('.v-image', row).value.trim();
            var sizes = $('.v-sizes', row).value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            var qtyWrap = $('.v-qty-wrap', row);
            var qty = null;
            var sizeStock = null;
            var single = $('.v-qty', qtyWrap);
            if (single) {
                var qtyRaw = single.value.trim();
                qty = qtyRaw === '' ? null : Math.max(0, parseInt(qtyRaw, 10) || 0);
            } else {
                sizeStock = {};
                $$('.v-sq-row', qtyWrap).forEach(function (r) {
                    var key = $('.v-sq-name', r).getAttribute('data-size');
                    var raw = $('.v-sq', r).value.trim();
                    if (raw !== '') sizeStock[key] = Math.max(0, parseInt(raw, 10) || 0);
                });
                if (!Object.keys(sizeStock).length) {
                    sizeStock = null;
                } else {
                    qty = Object.keys(sizeStock).reduce(function (sum, k) { return sum + sizeStock[k]; }, 0);
                }
            }
            if (name) colors.push([name, hex, image, sizes, qty, sizeStock]);
        });

        var derivedSizes = [];
        var derivedImages = [];
        var derivedStock = 0;
        var hasVariantStock = false;
        colors.forEach(function (c) {
            (c[3] || []).forEach(function (s) { if (derivedSizes.indexOf(s) === -1) derivedSizes.push(s); });
            if (c[2] && derivedImages.indexOf(c[2]) === -1) derivedImages.push(c[2]);
            if (c[4] != null) { derivedStock += c[4]; hasVariantStock = true; }
        });

        var prev = state.editing || {};
        var prevSizes = Array.isArray(prev.sizes)
            ? prev.sizes
            : String(prev.sizes || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        var prevImages = Array.isArray(prev.images) ? prev.images : [];

        var badges = [];
        if (f.badgeNew.checked) badges.push('new');
        if (f.badgeBestseller.checked) badges.push('bestseller');

        return {
            id: f.id.value.trim() || ('p' + Date.now().toString(36)),
            name: f.name.value.trim(),
            brand: f.brand.value.trim(),
            category: f.category.value.trim(),
            price: Number(f.price.value) || 0,
            mrp: Number(f.mrp.value) || 0,
            stock: hasVariantStock ? derivedStock : (parseInt(f.stock.value, 10) || 0),
            sortOrder: parseInt(f.sortOrder.value, 10) || 0,
            rating: Number(f.rating.value) || 4.5,
            reviewCount: parseInt(f.reviewCount.value, 10) || 0,
            badges: badges,
            visible: f.visible.checked,
            sizes: derivedSizes.length ? derivedSizes : prevSizes,
            keywords: f.keywords.value,
            highlights: f.highlights.value,
            description: f.description.value,
            colors: colors,
            images: derivedImages.length ? derivedImages : prevImages
        };
    }

    // ---- auto-fill content generation ----
    var QUALITY_WORDS = {
        premium: ['Premium quality', 'Top-shelf craftsmanship', 'A premium pick', 'High-end quality'],
        standard: ['Quality you can trust', 'Reliably made', 'Solid, dependable quality', 'Well-crafted quality'],
        value: ['Smart value', 'Affordable quality', 'Budget-friendly quality', 'Easy-on-the-pocket quality']
    };

    var VALUE_LINES = [
        'Worth every rupee',
        'A valuable addition to your everyday essentials',
        'Great value for the price',
        'Good quality that lasts',
        'A smart buy you will not regret',
        'Premium feel without the premium price',
        'A dependable choice for daily use'
    ];

    var CATEGORY_TRAITS = [
        { re: /electron|tech|gadget|phone|laptop|audio|speaker|headphone|camera/i, traits: ['reliable performance', 'smart, user-friendly features', 'efficient power use'] },
        { re: /cloth|apparel|fashion|shirt|dress|jeans|saree|kurta|t-?shirt|\bwear\b|sportswear|activewear|outerwear|innerwear/i, traits: ['comfortable, breathable fabric', 'a flattering fit', 'easy-care material'] },
        { re: /shoe|footwear|sneaker|sandal|boot|heel/i, traits: ['cushioned support', 'a durable sole', 'all-day comfort'] },
        { re: /home|furniture|kitchen|decor|furnish|cookware/i, traits: ['a sturdy build', 'an elegant finish', 'a space-smart design'] },
        { re: /beauty|cosmetic|skin|hair|makeup|perfume|fragrance/i, traits: ['a gentle formula', 'long-lasting results', 'skin-friendly ingredients'] },
        { re: /toy|game|kid|child|baby/i, traits: ['child-safe materials', 'hours of engaging fun', 'a durable build'] },
        { re: /sport|fit|gym|outdoor|cycle|bike/i, traits: ['performance-ready design', 'durable construction', 'breathable comfort'] },
        { re: /bag|accessor|watch|jewel|wallet|belt/i, traits: ['a refined look', 'everyday practicality', 'lasting durability'] }
    ];

    function hashSeed(str) {
        var h = 0;
        str = String(str || '');
        for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
        return h;
    }

    function traitsFor(text) {
        for (var i = 0; i < CATEGORY_TRAITS.length; i++) {
            if (CATEGORY_TRAITS[i].re.test(text)) return CATEGORY_TRAITS[i].traits;
        }
        return ['thoughtful design', 'everyday reliability', 'lasting quality'];
    }

    // Build highlights & description for the editor from the current product details.
    function autoFillCopy() {
        var rec = collectForm();
        if (!rec.name) {
            toast('Add a product name first', 'error');
            return;
        }

        var name = rec.name;
        var brand = rec.brand || '';
        var category = rec.category || '';
        var price = Number(rec.price) || 0;
        var mrp = Number(rec.mrp) || 0;
        var rating = Number(rec.rating) || 0;
        var reviewCount = Number(rec.reviewCount) || 0;
        var stock = Number(rec.stock) || 0;
        var freeMin = (NC.store && NC.store.getFreeShippingMin) ? NC.store.getFreeShippingMin() : 999;
        var shipFee = (NC.store && NC.store.getShippingFee) ? NC.store.getShippingFee() : 49;
        var sizes = Array.isArray(rec.sizes) ? rec.sizes : [];
        var colors = (rec.colors || []).map(function (c) { return c[0]; }).filter(Boolean);
        var keywords = String(rec.keywords || '')
            .split(',').map(function (k) { return k.trim(); }).filter(Boolean);
        var badges = rec.badges || [];

        // Deterministic per-product variety: same product -> same copy, different products -> different copy.
        var tier = price >= 2000 ? 'premium' : (price >= 600 ? 'standard' : 'value');
        var seed = hashSeed([name, brand, category].join('|'));
        var pickAt = function (arr, salt) { return arr[Math.abs(seed + salt * 7 + arr.length) % arr.length]; };

        var trait = pickAt(traitsFor(category + ' ' + keywords.join(' ') + ' ' + name), 1);
        var quality = pickAt(QUALITY_WORDS[tier], 2);
        var valueLine = pickAt(VALUE_LINES, 3);

        var shipVariants = freeMin
            ? [
                'Free delivery on orders above ₹' + freeMin + ', else ₹' + shipFee,
                'Free shipping over ₹' + freeMin + ' — flat ₹' + shipFee + ' below that',
                'Enjoy free delivery on orders above ₹' + freeMin,
                'Ships free on orders over ₹' + freeMin
            ]
            : [
                'Free delivery on all orders',
                'Enjoy free shipping on every order',
                'Free shipping, always'
            ];
        var returnVariants = [
            '7-day easy returns & exchange',
            'Hassle-free 7-day returns and exchanges',
            'Easy 7-day return & exchange policy',
            'Not satisfied? 7-day easy returns & exchange'
        ];
        var shipNote = pickAt(shipVariants, 4);
        var returnNote = pickAt(returnVariants, 5);
        var shipNoteLower = shipNote.charAt(0).toLowerCase() + shipNote.slice(1);

        var h = [];
        if (keywords.length) h.push('Key features: ' + keywords.slice(0, 5).join(', '));
        if (sizes.length) h.push('Available sizes: ' + sizes.join(', '));
        if (colors.length > 1) h.push('Colour options: ' + colors.join(', '));
        else if (colors.length === 1) h.push('Colour: ' + colors[0]);

        // Generated, product-appropriate selling points.
        h.push(quality + ' — ' + trait);
        if (tier === 'premium') h.push('An investment piece you will enjoy for years');
        else if (tier === 'value') h.push('Looks and feels far more expensive than it costs');
        h.push(valueLine);

        if (mrp > price && price > 0) {
            h.push('Save ₹' + (mrp - price) + ' (' + Math.round((1 - price / mrp) * 100) + '% off) — MRP ₹' + mrp);
        } else if (price > 0) {
            h.push('Priced at ₹' + price);
        }
        if (reviewCount > 0) h.push('Rated ' + rating.toFixed(1) + '★ by ' + reviewCount + ' shoppers');
        else if (rating > 0) h.push('Rated ' + rating.toFixed(1) + '★');
        if (badges.indexOf('bestseller') !== -1) h.push('Bestseller — loved by our shoppers');
        if (badges.indexOf('new') !== -1) h.push('New arrival this season');
        h.push(stock > 0 ? 'In stock — dispatched within 24 hours' : 'Currently out of stock — back soon');
        h.push(shipNote);
        h.push(returnNote);
        if (/electronic/i.test(category)) h.push('1-year manufacturer warranty included');

        var d = [];
        d.push((brand ? brand + ' ' : '') + name +
            (category ? ' is a ' + category.toLowerCase() + ' pick built for everyday use.' : ' is a standout pick you will love.'));
        d.push('It delivers ' + quality.toLowerCase() + ' with ' + trait + '.');
        if (keywords.length) d.push('It stands out for ' + keywords.join(', ') + '.');
        if (sizes.length) d.push('Choose from sizes ' + sizes.join(', ') + '.');
        if (colors.length) d.push('Available in ' + colors.join(', ') + '.');
        if (mrp > price && price > 0) {
            d.push('Currently offered at ₹' + price + ', down from ₹' + mrp + ' (save ₹' + (mrp - price) + ').');
        }
        d.push(valueLine + '. Backed by our ' + returnNote.toLowerCase() + ', with ' + shipNoteLower + '.');

        var f = $('#productForm').elements;
        f.highlights.value = h.join('\n');
        f.description.value = d.join(' ');
        toast('Generated highlights & description for this product', 'info');
    }

    function saveProduct() {
        var record = collectForm();
        if (!record.name) {
            toast('Give the product a name first', 'error');
            return;
        }
        var originalId = state.editingOriginalId;
        var clash = null;
        state.records.forEach(function (r) {
            if (r.id === record.id && r.id !== originalId) clash = r;
        });
        if (clash) {
            toast('Product ID “' + record.id + '” is already used by “' + (clash.name || 'another product') + '”', 'error');
            return;
        }
        var renaming = originalId && originalId !== record.id;
        var btn = $('#saveProductBtn');
        btn.disabled = true;

        backend.saveProduct(record).then(function (saved) {
            if (renaming) {
                return backend.deleteProduct(originalId).then(function () {
                    state.records = state.records.filter(function (r) { return r.id !== originalId; });
                    return saved;
                });
            }
            return saved;
        }).then(function (saved) {
            var found = false;
            state.records = state.records.map(function (r) {
                if (r.id === saved.id) { found = true; return saved; }
                return r;
            });
            if (!found) state.records.push(saved);
            state.records.sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
            loadCategoryOptions();
            renderList();
            closeEditor();
            toast(renaming ? 'Product saved (ID changed)' : 'Product saved', 'success');
        }).catch(function (err) {
            toast(err.message, 'error');
        }).then(function () {
            btn.disabled = false;
        });
    }

    /* ---------------- settings ---------------- */

    function heroSlideRow(slide) {
        slide = slide || {};
        var row = document.createElement('div');
        row.className = 'slide-row';
        row.innerHTML =
            '<span class="slide-thumb">' + icon('ai-image') + '</span>' +
            '<div class="slide-main">' +
            '<div class="slide-media">' +
            '<input class="input s-image" type="text" placeholder="Image URL, or upload" value="' + esc(slide.image || '') + '">' +
            '<button class="icon-mini s-upload" type="button" aria-label="Upload slide image">' + icon('ai-upload') + '</button>' +
            '</div>' +
            '</div>' +
            '<button class="icon-mini s-remove" type="button" aria-label="Remove slide">' + icon('ai-trash') + '</button>' +
            '<input type="file" accept="image/*" hidden>';

        var thumb = $('.slide-thumb', row);
        var imageInput = $('.s-image', row);
        var file = $('input[type="file"]', row);
        var uploadBtn = $('.s-upload', row);

        function paint() {
            var v = imageInput.value.trim();
            thumb.innerHTML = v ? '<img src="' + esc(v) + '" alt="">' : icon('ai-image');
        }
        imageInput.addEventListener('input', paint);

        uploadBtn.addEventListener('click', function () { file.click(); });
        file.addEventListener('change', function () {
            var f = file.files && file.files[0];
            if (!f) return;
            uploadBtn.disabled = true;
            thumb.innerHTML = '<img src="' + URL.createObjectURL(f) + '" alt="">';
            backend.uploadImage(f).then(function (uploaded) {
                imageInput.value = uploaded;
                paint();
                toast('Slide image uploaded', 'success');
            }).catch(function (err) {
                paint();
                toast(err.message, 'error');
            }).then(function () {
                uploadBtn.disabled = false;
                file.value = '';
            });
        });

        $('.s-remove', row).addEventListener('click', function () { row.remove(); });

        return row;
    }

    function renderSlides(list) {
        var wrap = $('#heroSlides');
        if (!wrap) return;
        wrap.innerHTML = '';
        (list || []).forEach(function (slide) {
            if (slide && slide.image) wrap.appendChild(heroSlideRow(slide));
        });
    }

    function collectSlides() {
        var out = [];
        $$('#heroSlides .slide-row').forEach(function (row) {
            var image = $('.s-image', row).value.trim();
            if (!image) return;
            out.push({ image: image });
        });
        return out;
    }

    var CONTACT_TYPES = {
        call: { label: 'Call', icon: 'ai-phone', ph: 'Phone number, e.g. 9876543210' },
        whatsapp: { label: 'WhatsApp', icon: 'ai-whatsapp', ph: 'Phone number with country code' },
        telegram: { label: 'Telegram', icon: 'ai-telegram', ph: '@username or https://t.me/…' },
        email: { label: 'Email', icon: 'ai-mail', ph: 'name@example.com' },
        map: { label: 'Map', icon: 'ai-pin', ph: 'Google Maps link' },
        url: { label: 'Website', icon: 'ai-globe', ph: 'https://…' }
    };

    function contactTypeOptions(selected) {
        return Object.keys(CONTACT_TYPES).map(function (k) {
            return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' +
                CONTACT_TYPES[k].label + '</option>';
        }).join('');
    }

    function contactRow(contact) {
        contact = contact || {};
        var type = CONTACT_TYPES[contact.type] ? contact.type : 'call';
        var row = document.createElement('div');
        row.className = 'contact-row';
        row.setAttribute('data-type', type);
        row.innerHTML =
            '<span class="contact-thumb">' + icon(CONTACT_TYPES[type].icon) + '</span>' +
            '<div class="contact-main">' +
            '<div class="contact-top">' +
            '<select class="input c-type">' + contactTypeOptions(type) + '</select>' +
            '<input class="input c-label" type="text" placeholder="Label (optional)" value="' + esc(contact.label || '') + '">' +
            '</div>' +
            '<input class="input c-value" type="text" placeholder="' + esc(CONTACT_TYPES[type].ph) + '" value="' + esc(contact.value || '') + '">' +
            '</div>' +
            '<button class="icon-mini danger c-remove" type="button" aria-label="Remove contact">' + icon('ai-trash') + '</button>';

        var select = $('.c-type', row);
        var valueInput = $('.c-value', row);
        var thumb = $('.contact-thumb', row);

        select.addEventListener('change', function () {
            var meta = CONTACT_TYPES[select.value] || CONTACT_TYPES.url;
            row.setAttribute('data-type', select.value);
            thumb.innerHTML = icon(meta.icon);
            valueInput.placeholder = meta.ph;
        });

        $('.c-remove', row).addEventListener('click', function () { row.remove(); });

        return row;
    }

    function renderContacts(list) {
        var wrap = $('#contactList');
        if (!wrap) return;
        wrap.innerHTML = '';
        (list || []).forEach(function (c) {
            if (c && String(c.value || '').trim()) wrap.appendChild(contactRow(c));
        });
    }

    function collectContacts() {
        var out = [];
        $$('#contactList .contact-row').forEach(function (row) {
            var value = $('.c-value', row).value.trim();
            if (!value) return;
            out.push({
                type: $('.c-type', row).value,
                label: $('.c-label', row).value.trim(),
                value: value
            });
        });
        return out;
    }

    function linkRow(link) {
        link = link || {};
        var row = document.createElement('div');
        row.className = 'link-row';
        row.innerHTML =
            '<input class="input l-label" type="text" placeholder="Label" value="' + esc(link.label || '') + '">' +
            '<input class="input l-href" type="text" placeholder="#/orders or https://…" value="' + esc(link.href || '') + '">' +
            '<button class="icon-mini danger l-remove" type="button" aria-label="Remove link">' + icon('ai-trash') + '</button>';
        $('.l-remove', row).addEventListener('click', function () { row.remove(); });
        return row;
    }

    function renderLinkList(wrapId, list) {
        var wrap = $('#' + wrapId);
        if (!wrap) return;
        wrap.innerHTML = '';
        (list || []).forEach(function (l) {
            if (l && (l.label || l.href)) wrap.appendChild(linkRow(l));
        });
    }

    function collectLinkList(wrapId) {
        var out = [];
        var wrap = $('#' + wrapId);
        if (!wrap) return out;
        $$('.link-row', wrap).forEach(function (row) {
            var label = $('.l-label', row).value.trim();
            var href = $('.l-href', row).value.trim();
            if (!label && !href) return;
            out.push({ label: label, href: href });
        });
        return out;
    }

    function slugify(value) {
        return String(value || '').trim().toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    function pageRow(page) {
        page = page || {};
        var row = document.createElement('div');
        row.className = 'page-row';
        row.innerHTML =
            '<div class="page-top">' +
            '<input class="input p-slug" type="text" placeholder="slug (about)" value="' + esc(page.slug || '') + '">' +
            '<input class="input p-title" type="text" placeholder="Page title" value="' + esc(page.title || '') + '">' +
            '</div>' +
            '<textarea class="input p-body" rows="3" placeholder="Page content — one paragraph per line">' + esc(page.body || '') + '</textarea>' +
            '<button class="icon-mini danger p-remove" type="button" aria-label="Remove page">' + icon('ai-trash') + '</button>';

        var slugInput = $('.p-slug', row);
        var titleInput = $('.p-title', row);
        titleInput.addEventListener('input', function () {
            if (!slugInput.value.trim() || slugInput.dataset.auto === '1') {
                slugInput.value = slugify(titleInput.value);
                slugInput.dataset.auto = '1';
            }
        });
        slugInput.addEventListener('input', function () { slugInput.dataset.auto = '0'; });

        $('.p-remove', row).addEventListener('click', function () { row.remove(); });
        return row;
    }

    function renderPages(list) {
        var wrap = $('#infoPages');
        if (!wrap) return;
        wrap.innerHTML = '';
        (list || []).forEach(function (p) {
            if (p && (p.slug || p.title)) wrap.appendChild(pageRow(p));
        });
    }

    function collectPages() {
        var out = [];
        $$('#infoPages .page-row').forEach(function (row) {
            var title = $('.p-title', row).value.trim();
            var slug = slugify($('.p-slug', row).value.trim() || title);
            var body = $('.p-body', row).value.trim();
            if (!slug && !title) return;
            out.push({ slug: slug, title: title, body: body });
        });
        return out;
    }

    function bindLinkAdd(btnSel, listSel) {
        var btn = $(btnSel);
        if (!btn) return;
        btn.addEventListener('click', function () {
            var list = $(listSel);
            if (!list) return;
            var row = linkRow({});
            list.appendChild(row);
            var input = $('.l-label', row);
            if (input) input.focus();
        });
    }

    function bindSettings() {
        var form = $('#settingsForm');
        var fields = form.elements;

        fields.primaryColor.addEventListener('input', function () { fields.primaryColorText.value = fields.primaryColor.value; });
        fields.accentColor.addEventListener('input', function () { fields.accentColorText.value = fields.accentColor.value; });
        fields.logoUrl.addEventListener('input', function () {
            var val = fields.logoUrl.value.trim();
            paintLogoPreview(val);
            if (fields.apkIconUrl && !fields.apkIconUrl.value.trim()) {
                paintApkIconPreview(val);
            }
        });
        if (fields.apkIconUrl) {
            fields.apkIconUrl.addEventListener('input', function () {
                paintApkIconPreview(fields.apkIconUrl.value.trim() || fields.logoUrl.value.trim());
            });
        }

        $('#logoUploadBtn').addEventListener('click', function () { $('#logoUploadInput').click(); });
        $('#logoUploadInput').addEventListener('change', function () {
            var file = this.files && this.files[0];
            if (!file) return;
            backend.uploadImage(file).then(function (url) {
                fields.logoUrl.value = url;
                paintLogoPreview(url);
                if (fields.apkIconUrl && !fields.apkIconUrl.value.trim()) {
                    paintApkIconPreview(url);
                }
                toast('Logo uploaded', 'success');
            }).catch(function (err) {
                toast(err.message, 'error');
            }).then(function () { $('#logoUploadInput').value = ''; });
        });

        var apkBtn = $('#apkIconUploadBtn');
        var apkInput = $('#apkIconUploadInput');
        if (apkBtn && apkInput) {
            apkBtn.addEventListener('click', function () { apkInput.click(); });
            apkInput.addEventListener('change', function () {
                var file = this.files && this.files[0];
                if (!file) return;
                backend.uploadImage(file).then(function (url) {
                    if (fields.apkIconUrl) fields.apkIconUrl.value = url;
                    paintApkIconPreview(url);
                    toast('APK icon uploaded', 'success');
                }).catch(function (err) {
                    toast(err.message, 'error');
                }).then(function () { apkInput.value = ''; });
            });
        }

        $('#settingsResetBtn').addEventListener('click', function () {
            fillSettings(backend.defaultSettings());
            toast('Defaults loaded — remember to save', 'info');
        });

        var slideAdd = $('#heroSlideAdd');
        if (slideAdd) {
            slideAdd.addEventListener('click', function () {
                var list = $('#heroSlides');
                if (!list) return;
                var row = heroSlideRow({});
                list.appendChild(row);
                var input = $('.s-image', row);
                if (input) input.focus();
            });
        }

        var contactAdd = $('#contactAdd');
        if (contactAdd) {
            contactAdd.addEventListener('click', function () {
                var list = $('#contactList');
                if (!list) return;
                var row = contactRow({ type: 'call' });
                list.appendChild(row);
                var input = $('.c-value', row);
                if (input) input.focus();
            });
        }

        bindLinkAdd('#helpLinkAdd', '#helpLinks');
        bindLinkAdd('#companyLinkAdd', '#companyLinks');

        var pageAdd = $('#infoPageAdd');
        if (pageAdd) {
            pageAdd.addEventListener('click', function () {
                var list = $('#infoPages');
                if (!list) return;
                var row = pageRow({});
                list.appendChild(row);
                var input = $('.p-title', row);
                if (input) input.focus();
            });
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var data = collectSettings();
            backend.saveSettings(data).then(function () {
                if (NC.store) {
                    if (NC.store.setFreeShippingMin) NC.store.setFreeShippingMin(data.freeShippingMin);
                    if (NC.store.setShippingFee) NC.store.setShippingFee(data.shippingFee);
                    if (NC.store.setGstPercent) NC.store.setGstPercent(data.gstPercent);
                }
                applyBrandToAdmin();
                loadSettingsForm(data);
                toast('Appearance saved', 'success');
            }).catch(function (err) {
                toast(err.message, 'error');
            });
        });
    }

    function loadSettingsForm(overrides) {
        var s = overrides || backend.getSettings();
        fillSettings(s);
        backend.loadSettings().then(function (fresh) {
            fillSettings(fresh);
            applyBrandToAdmin();
        }).catch(function () { });
    }

    function fillSettings(s) {
        var f = $('#settingsForm').elements;
        ['storeName', 'brandAccent', 'logoUrl', 'apkIconUrl', 'tagline', 'metaDescription',
            'freeShippingMin', 'shippingFee', 'gstPercent', 'promoText', 'footerBlurb'].forEach(function (name) {
                if (f[name] != null) f[name].value = s[name] != null ? s[name] : '';
            });
        var primary = s.primaryColor || '#4f46e5';
        var accent = s.accentColor || '#f59e0b';
        f.primaryColor.value = primary;
        f.primaryColorText.value = primary;
        f.accentColor.value = accent;
        f.accentColorText.value = accent;
        paintLogoPreview(s.logoUrl);
        paintApkIconPreview(s.apkIconUrl || s.logoUrl);
        renderSlides(Array.isArray(s.heroSlides) ? s.heroSlides : []);
        renderContacts(Array.isArray(s.contacts) ? s.contacts : []);
        renderLinkList('helpLinks', Array.isArray(s.helpLinks) ? s.helpLinks : []);
        renderLinkList('companyLinks', Array.isArray(s.companyLinks) ? s.companyLinks : []);
        renderPages(Array.isArray(s.pages) ? s.pages : []);
    }

    function gstPercentValue(raw) {
        var n = parseFloat(raw);
        if (isNaN(n) || n < 0) n = 0;
        if (n > 100) n = 100;
        return Math.round(n * 100) / 100;
    }

    function collectSettings() {
        var f = $('#settingsForm').elements;
        return {
            storeName: f.storeName.value.trim(),
            brandAccent: f.brandAccent.value.trim(),
            logoUrl: f.logoUrl.value.trim(),
            apkIconUrl: f.apkIconUrl ? f.apkIconUrl.value.trim() : '',
            tagline: f.tagline.value.trim(),
            metaDescription: f.metaDescription.value.trim(),
            heroSlides: collectSlides(),
            contacts: collectContacts(),
            helpLinks: collectLinkList('helpLinks'),
            companyLinks: collectLinkList('companyLinks'),
            pages: collectPages(),
            freeShippingMin: parseInt(f.freeShippingMin.value, 10) || 0,
            shippingFee: Math.max(0, parseInt(f.shippingFee ? f.shippingFee.value : '', 10) || 0),
            gstPercent: gstPercentValue(f.gstPercent ? f.gstPercent.value : ''),
            promoText: f.promoText.value.trim(),
            footerBlurb: f.footerBlurb.value.trim(),
            primaryColor: f.primaryColor.value,
            accentColor: f.accentColor.value
        };
    }

    function paintLogoPreview(url) {
        var box = $('#logoPreview');
        if (!box) return;
        box.textContent = '';
        if (url) {
            var img = document.createElement('img');
            img.src = url;
            img.alt = 'Logo preview';
            box.appendChild(img);
        } else {
            box.textContent = (backend.getSettings().storeName || 'N').trim().charAt(0).toUpperCase();
        }
    }

    function paintApkIconPreview(url) {
        var box = $('#apkIconPreview');
        if (!box) return;
        box.textContent = '';
        var finalUrl = url || (backend.getSettings() && backend.getSettings().logoUrl) || '';
        if (finalUrl) {
            var img = document.createElement('img');
            img.src = finalUrl;
            img.alt = 'APK icon preview';
            box.appendChild(img);
        } else {
            box.textContent = 'APK';
        }
    }

    /* ---------------- data tools ---------------- */

    function bindData() {
        $('#exportBtn').addEventListener('click', function () { exportProductsJson(); });

        $('#importBtn').addEventListener('click', function () { $('#importInput').click(); });
        $('#importInput').addEventListener('change', function () {
            var file = this.files && this.files[0];
            this.value = '';
            if (!file) return;
            readJsonFile(file, applyProductImport);
        });

        $('#clearLocalBtn').addEventListener('click', function () {
            if (!window.confirm('Clear the locally cached catalog and settings on this browser?')) return;
            backend.resetLocal();
            toast('Local cache cleared', 'info');
            refreshProducts();
        });
    }

    /* ---------------- fullscreen image viewer ---------------- */

    function closeImageZoom() {
        var box = document.getElementById('adminImgZoom');
        if (!box || box.hidden) return;
        box.hidden = true;
        var img = box.querySelector('img');
        if (img) img.removeAttribute('src');
        document.body.classList.remove('no-scroll');
    }

    function openImageZoom(src, alt) {
        if (!src) return;
        var box = document.getElementById('adminImgZoom');
        if (!box) {
            box = document.createElement('div');
            box.id = 'adminImgZoom';
            box.className = 'img-zoom';
            box.hidden = true;
            box.innerHTML = '<button class="img-zoom-close" type="button" aria-label="Close image">' +
                icon('ai-close') + '</button><img alt="">';
            document.body.appendChild(box);
            box.addEventListener('click', function () { closeImageZoom(); });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') closeImageZoom();
            });
        }
        var img = box.querySelector('img');
        img.setAttribute('src', src);
        img.setAttribute('alt', alt || '');
        box.hidden = false;
        document.body.classList.add('no-scroll');
    }

    function bindImageZoom() {
        document.addEventListener('click', function (e) {
            var img = e.target.closest('img');
            if (!img || !img.getAttribute('src')) return;
            if (img.closest('#adminImgZoom')) return;
            if (!img.closest('#productList, #editorModal, #stockModalBody, #orderList, #orderModalBody')) return;
            e.preventDefault();
            e.stopPropagation();
            openImageZoom(img.getAttribute('src'), img.getAttribute('alt'));
        });
    }

    /* ---------------- boot ---------------- */

    function boot() {
        bindLogin();
        bindTabs();
        bindProducts();
        bindOrders();
        bindUsers();
        bindModal();
        bindSettings();
        bindSecurity();
        bindData();
        bindImageZoom();

        if (NC.store && NC.store.init) NC.store.init();

        // Load settings first so the login gate can check the password stored in
        // Supabase (falls back to remote/local defaults when unreachable).
        Promise.resolve(backend.loadSettings && backend.loadSettings()).catch(function () { }).then(function () {
            var authed = false;
            try { authed = sessionStorage.getItem(AUTH_KEY) === '1'; } catch (e) { }
            if (authed) showApp();
            else showLogin();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
