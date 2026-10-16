// Orders Management - Google Sheet Orders Handler
class OrdersManager {
    constructor() {
        this.currentUser = null;
        this.shopId = null;
        this.orders = [];
        this.filteredOrders = [];
        this.googleSheetUrl = '';
        this.currency = 'INR';
        this.currentPage = 1;
        this.perPage = window.getStoredPerPage ? window.getStoredPerPage('orders', 50) : 50;
        this.selectedOrder = null;
        this.selectedIds = new Set();
        this.init();
    }

    async init() {
        // Check authentication
        if (typeof authManager === 'undefined' || !authManager.getCurrentUser()) {
            window.location.href = 'index.html';
            return;
        }

        this.currentUser = authManager.getCurrentUser();
        this.shopId = authManager.shopId || this.currentUser.shop_id;

        if (!this.shopId) {
            if (typeof showNotification === 'function') {
                showNotification('No shop assigned', 'error');
            }
            setTimeout(() => authManager.logout(), 2000);
            return;
        }

        this.updateHeaderUI();

        // Load Shop Config (Currency, google_sheet_url)
        await this.loadShopConfig();

        // Setup event listeners
        this.setupEventListeners();

        // Fetch Orders from Supabase (storefront orders table)
        await this.loadOrders();
    }

    updateHeaderUI() {
        const userNameEl = document.getElementById('userName');
        if (userNameEl) {
            userNameEl.textContent = this.currentUser.full_name || this.currentUser.username;
        }
        const userRoleEl = document.getElementById('userRole');
        if (userRoleEl) {
            userRoleEl.textContent = this.currentUser.role === 'shop_admin' ? 'Shop Admin' : (this.currentUser.role === 'super_admin' ? 'Super Admin' : 'Shop Staff');
        }
    }

    async loadShopConfig() {
        try {
            if (typeof initializeShopConfig === 'function') {
                await initializeShopConfig(this.shopId);
            }
            if (window.shopConfig && window.shopConfig.currency) {
                this.currency = window.shopConfig.currency;
            }

            // Fetch google_sheet_url from Supabase shop_settings
            if (typeof supabaseClient !== 'undefined') {
                const { data, error } = await supabaseClient
                    .from('shop_settings')
                    .select('google_sheet_url, currency')
                    .eq('shop_id', this.shopId)
                    .maybeSingle();

                if (data) {
                    this.googleSheetUrl = data.google_sheet_url || '';
                    if (data.currency) this.currency = data.currency;
                }
            }
        } catch (e) {
            console.error('Error loading shop settings for orders:', e);
        }
    }

    async loadShopProducts() {
        if (this.shopProducts) return;
        try {
            if (typeof supabaseClient !== 'undefined') {
                const { data: prods } = await supabaseClient
                    .from('products')
                    .select('id, product_name, sku, product_image, selling_price')
                    .eq('shop_id', this.shopId);
                
                const { data: dbVars } = await supabaseClient
                    .from('product_variants')
                    .select('id, product_id, variant_name, sku, image_url')
                    .eq('shop_id', this.shopId);

                this.shopProducts = prods || [];
                this.shopVariants = dbVars || [];
            }
        } catch (e) {
            this.shopProducts = [];
            this.shopVariants = [];
        }
    }

    getItemImage(line) {
        if (!line || !this.shopProducts || this.shopProducts.length === 0) return null;

        let clean = line.replace(/^\d+[\.\)]\s*/, '').trim();
        if (clean.includes('=')) {
            clean = clean.split('=')[0].trim();
        }
        clean = clean.replace(/\s+x\s*(\d+)$/i, '').replace(/\(x?(\d+)\)$/i, '').trim();

        // 1. Extract SKU from parentheses e.g. "(6hm322)"
        const parenMatches = [];
        const regex = /\(([^\)]+)\)/g;
        let match;
        while ((match = regex.exec(clean)) !== null) {
            parenMatches.push(match[1].trim());
        }

        for (const candidateSku of parenMatches) {
            if (!candidateSku) continue;

            // Check base products by SKU
            const baseMatch = this.shopProducts.find(p => p.sku && p.sku.trim().toLowerCase() === candidateSku.toLowerCase());
            if (baseMatch && baseMatch.product_image) return baseMatch.product_image;

            // Check DB variants by SKU
            const varMatch = (this.shopVariants || []).find(v => v.sku && v.sku.trim().toLowerCase() === candidateSku.toLowerCase());
            if (varMatch) {
                if (varMatch.image_url) return varMatch.image_url;
                const parent = this.shopProducts.find(p => p.id === varMatch.product_id);
                if (parent && parent.product_image) return parent.product_image;
            }
        }

        // 2. Check DB variants by variant name / product name
        const itemLower = clean.toLowerCase();
        for (const v of (this.shopVariants || [])) {
            const p = this.shopProducts.find(prod => prod.id === v.product_id);
            if (!p) continue;

            const vName1 = `${p.product_name} (${v.variant_name})`.toLowerCase();
            const vName2 = `${p.product_name} - ${v.variant_name}`.toLowerCase();
            if (itemLower.includes(vName1) || itemLower.includes(vName2)) {
                return v.image_url || p.product_image || null;
            }
        }

        // 3. Check base product name match
        const matchedProd = this.shopProducts.find(p => p.product_name && itemLower.includes(p.product_name.toLowerCase().trim()));
        if (matchedProd && matchedProd.product_image) {
            return matchedProd.product_image;
        }

        return null;
    }

    showNotConfiguredState() {
        const notConfiguredBanner = document.getElementById('notConfiguredBanner');
        const ordersContent = document.getElementById('ordersContent');
        const loadingSpinner = document.getElementById('loadingSpinner');

        if (loadingSpinner) loadingSpinner.style.display = 'none';
        if (notConfiguredBanner) notConfiguredBanner.style.display = 'block';
        if (ordersContent) ordersContent.style.display = 'none';
    }

    setupEventListeners() {
        // Search Input
        const searchInput = document.getElementById('orderSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.selectedIds.clear();
                this.currentPage = 1;
                this.applyFilters();
            });
        }

        // Date Filter Select
        const dateFilter = document.getElementById('orderDateFilter');
        if (dateFilter) {
            dateFilter.addEventListener('change', () => {
                this.selectedIds.clear();
                this.currentPage = 1;
                this.applyFilters();
            });
        }

        // Status Filter Select
        const statusFilter = document.getElementById('orderStatusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                this.selectedIds.clear();
                this.currentPage = 1;
                this.applyFilters();
            });
        }

        // Select All checkbox
        const selectAll = document.getElementById('selectAllOrders');
        if (selectAll) {
            selectAll.addEventListener('change', () => {
                const pageChecks = document.querySelectorAll('.order-row-check');
                pageChecks.forEach(cb => {
                    cb.checked = selectAll.checked;
                    const id = cb.getAttribute('data-id');
                    if (selectAll.checked) this.selectedIds.add(id);
                    else this.selectedIds.delete(id);
                });
                this.updateBulkBar();
            });
        }

        // Bulk action buttons
        document.getElementById('bulkApplyStatusBtn')?.addEventListener('click', () => this.bulkApplyStatus());
        document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => this.bulkDeleteSelected());
        document.getElementById('bulkClearBtn')?.addEventListener('click', () => {
            this.selectedIds.clear();
            this.renderOrdersTable();
        });

        // Refresh Button
        const refreshBtn = document.getElementById('refreshOrdersBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadOrders(true);
            });
        }

        // Per Page Select
        const perPageSelect = document.getElementById('perPageSelect');
        if (perPageSelect) {
            perPageSelect.addEventListener('change', (e) => {
                this.perPage = parseInt(e.target.value, 10) || 25;
                this.currentPage = 1;
                this.renderOrdersTable();
            });
        }

        // Close Detail Modal
        const closeModalBtn = document.getElementById('closeOrderDetailModal');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                this.closeModal();
            });
        }

        // Click background to close modal
        const modal = document.getElementById('orderDetailModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal();
            });
        }
    }

    async loadOrders(isManualRefresh = false) {
        const loadingSpinner = document.getElementById('loadingSpinner');
        const notConfiguredBanner = document.getElementById('notConfiguredBanner');
        const ordersContent = document.getElementById('ordersContent');
        const refreshBtn = document.getElementById('refreshOrdersBtn');

        if (refreshBtn && isManualRefresh) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        }

        if (loadingSpinner) loadingSpinner.style.display = 'flex';
        if (notConfiguredBanner) notConfiguredBanner.style.display = 'none';
        if (ordersContent) ordersContent.style.display = 'block';

        try {
            // Load products and variants for item thumbnail matching
            await this.loadShopProducts();

            if (typeof supabaseClient === 'undefined') {
                throw new Error('Supabase client is not available');
            }

            const { data, error } = await supabaseClient
                .from('orders')
                .select('id, status, data, created_at')
                .eq('shop_id', this.shopId)
                .order('created_at', { ascending: false })
                .limit(500);

            if (error) throw error;

            this.orders = (data || []).map((row) => {
                const payload = (row.data && typeof row.data === 'object') ? row.data : {};
                const addr = payload.address || {};
                const items = Array.isArray(payload.items) ? payload.items : [];
                const currency = payload.currency || this.currency || 'INR';

                const itemsText = items.map((it, idx) => {
                    const sku = it.sku ? ` (${it.sku})` : '';
                    const opts = [it.color, it.size].filter(Boolean).join('/');
                    const optStr = opts ? ` [${opts}]` : '';
                    const lineTotal = (parseFloat(it.price) || 0) * (parseInt(it.qty, 10) || 0);
                    return `${idx + 1}. ${it.name || 'Item'}${sku}${optStr} x${it.qty || 1} = ${currency} ${lineTotal.toFixed(2)}`;
                }).join('\n');

                const locationParts = [addr.address1, addr.address2, addr.city, addr.state, addr.pincode].filter(Boolean);
                let location = locationParts.join(', ');
                if (!location && addr.lat != null && addr.lng != null) location = `${addr.lat}, ${addr.lng}`;

                const totals = payload.totals || {};
                const placedAt = payload.placedAt || row.created_at;
                let dateStr = 'N/A';
                try { dateStr = new Date(placedAt).toLocaleString(); } catch (e) { }

                const savedStatus = localStorage.getItem(`gs_order_status_${this.shopId}_${row.id}`);
                const status = (row.status || savedStatus || 'pending').toLowerCase();

                return {
                    id: row.id,
                    date: dateStr,
                    dateTime: dateStr,
                    name: addr.fullName || 'Guest Customer',
                    phone: addr.phone || '',
                    location: location,
                    items: itemsText,
                    total: parseFloat(totals.total) || 0,
                    currency: currency,
                    note: '',
                    status: status,
                    raw: row
                };
            });

            this.selectedIds.clear();
            this.applyFilters();
            this.updateSummaryCards();

            if (typeof showNotification === 'function' && isManualRefresh) {
                showNotification(`Successfully fetched ${this.orders.length} orders!`, 'success');
            }

        } catch (error) {
            console.error('Failed to load orders from Supabase:', error);
            if (typeof showNotification === 'function') {
                showNotification('Error fetching orders. Check console for details.', 'error');
            }
            const tbody = document.getElementById('ordersTableBody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" style="text-align:center;padding:30px;color:#dc2626;">
                            <i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:10px;display:block;"></i>
                            <b>Failed to fetch orders from the database.</b><br>
                            <span style="font-size:0.8rem;color:#64748b;">Make sure the <code>orders</code> table exists (run supabase-schema.sql).</span>
                        </td>
                    </tr>
                `;
            }
        } finally {
            if (loadingSpinner) loadingSpinner.style.display = 'none';
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Orders';
            }
        }
    }

    updateSummaryCards() {
        const totalOrdersEl = document.getElementById('totalOrdersCount');
        const totalRevenueEl = document.getElementById('totalOrdersRevenue');
        const todayOrdersEl = document.getElementById('todayOrdersCount');
        const latestOrderEl = document.getElementById('latestOrderTime');

        const totalCount = this.orders.length;
        const totalRev = this.orders
            .filter(o => o.status === 'completed')
            .reduce((sum, o) => sum + (o.total || 0), 0);

        // Calculate Today's orders
        const todayStr = new Date().toLocaleDateString();
        const todayCount = this.orders.filter(o => {
            if (!o.date) return false;
            try {
                return new Date(o.date).toLocaleDateString() === todayStr;
            } catch (e) {
                return o.date.includes(todayStr);
            }
        }).length;

        // Calculate Pending Orders count & update sidebar menu badge
        const pendingCount = this.orders.filter(o => o.status === 'pending').length;
        if (this.shopId) {
            localStorage.setItem(`gs_pending_orders_count_${this.shopId}`, pendingCount);
        }
        if (window.menuManager) {
            window.menuManager.updatePendingOrdersBadge(pendingCount);
        }

        const latestDate = totalCount > 0 ? this.orders[0].date : 'No orders yet';

        if (totalOrdersEl) totalOrdersEl.textContent = totalCount;
        if (totalRevenueEl) totalRevenueEl.textContent = this.formatCurrency(totalRev);
        if (todayOrdersEl) todayOrdersEl.textContent = todayCount;
        if (latestOrderEl) latestOrderEl.textContent = latestDate;
    }

    applyFilters() {
        const searchInput = document.getElementById('orderSearchInput')?.value.trim().toLowerCase() || '';
        const dateFilter = document.getElementById('orderDateFilter')?.value || 'all';
        const statusFilter = document.getElementById('orderStatusFilter')?.value || 'pending';

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        this.filteredOrders = this.orders.filter(o => {
            // Status filtering
            if (statusFilter !== 'all' && o.status !== statusFilter) {
                return false;
            }

            // Search text matching
            const matchText = !searchInput || 
                o.name.toLowerCase().includes(searchInput) ||
                o.phone.toLowerCase().includes(searchInput) ||
                o.items.toLowerCase().includes(searchInput) ||
                o.location.toLowerCase().includes(searchInput) ||
                o.note.toLowerCase().includes(searchInput);

            if (!matchText) return false;

            // Date filtering
            if (dateFilter === 'today') {
                const orderTime = new Date(o.date).getTime();
                if (isNaN(orderTime)) return true;
                return orderTime >= todayStart;
            } else if (dateFilter === 'week') {
                const weekStart = todayStart - (7 * 24 * 60 * 60 * 1000);
                const orderTime = new Date(o.date).getTime();
                if (isNaN(orderTime)) return true;
                return orderTime >= weekStart;
            } else if (dateFilter === 'month') {
                const monthStart = todayStart - (30 * 24 * 60 * 60 * 1000);
                const orderTime = new Date(o.date).getTime();
                if (isNaN(orderTime)) return true;
                return orderTime >= monthStart;
            }

            return true;
        });

        this.renderOrdersTable();
    }

    async updateOrderStatus(orderId, newStatus) {
        const order = this.orders.find(o => String(o.id) === String(orderId));
        if (!order) return;

        order.status = newStatus;
        localStorage.setItem(`gs_order_status_${this.shopId}_${orderId}`, newStatus);
        if (typeof showNotification === 'function') {
            showNotification(`Order #${orderId} status set to ${newStatus.toUpperCase()}`, 'success');
        }
        this.updateSummaryCards();
        this.applyFilters();
        if (this.selectedOrder && String(this.selectedOrder.id) === String(orderId)) {
            this.openModal(order);
        }

        // Sync status update to Supabase orders table
        if (typeof supabaseClient !== 'undefined') {
            try {
                await supabaseClient
                    .from('orders')
                    .update({ status: newStatus, updated_at: new Date().toISOString() })
                    .eq('id', orderId);
            } catch (err) {
                console.warn('Failed to sync status update to Supabase:', err);
            }
        }
    }

    renderOrdersTable() {
        const tbody = document.getElementById('ordersTableBody');
        const countInfo = document.getElementById('ordersCountInfo');
        const paginationEl = document.getElementById('ordersPagination');

        if (!tbody) return;

        if (this.filteredOrders.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align:center;padding:40px;color:#64748b;">
                        <i class="fas fa-inbox" style="font-size:2.2rem;margin-bottom:10px;color:#cbd5e1;display:block;"></i>
                        No received orders found.
                    </td>
                </tr>
            `;
            this.renderPagination(1);
            this.updateBulkBar();
            return;
        }

        const totalItems = this.filteredOrders.length;
        const totalPages = Math.ceil(totalItems / this.perPage);
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        const startIdx = (this.currentPage - 1) * this.perPage;
        const endIdx = Math.min(startIdx + this.perPage, totalItems);
        const pageItems = this.filteredOrders.slice(startIdx, endIdx);

        let html = '';
        pageItems.forEach((order) => {
            const cleanPhone = order.phone.replace(/[^0-9+]/g, '');
            const waUrl = cleanPhone ? `https://wa.me/${cleanPhone.replace('+', '')}` : '#';
            const isChecked = this.selectedIds.has(String(order.id));

            // Items line break preview with product thumbnail images
            const itemsFormatted = (order.items || 'No items listed')
                .split('\n')
                .filter(i => i.trim())
                .map(i => {
                    const imgUrl = this.getItemImage(i);
                    const imgHtml = imgUrl ? `<img src="${imgUrl}" alt="item" style="width:26px;height:26px;border-radius:4px;object-fit:cover;flex-shrink:0;border:1px solid #e2e8f0;">` : `<span style="width:26px;height:26px;border-radius:4px;background:#f1f5f9;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.7rem;flex-shrink:0;"><i class="fas fa-box"></i></span>`;
                    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px;">${this.escapeHtml(i)}</span>${imgHtml}</div>`;
                })
                .join('');

            const mapLink = order.location ? 
                `https://www.google.com/maps?q=${encodeURIComponent(order.location)}` : '#';

            html += `
                <tr style="border-bottom:1px solid #f1f5f9;transition:background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
                    <td style="text-align:center;">
                        <input type="checkbox" class="order-row-check" data-id="${this.escapeHtml(order.id)}" ${isChecked ? 'checked' : ''} style="cursor:pointer;width:16px;height:16px;vertical-align:middle;">
                    </td>
                    <td style="font-weight:700;color:#64748b;font-size:0.8rem;">#${this.escapeHtml(order.id)}</td>
                    <td style="white-space:nowrap;font-size:0.8rem;color:#334155;">
                        <i class="far fa-clock" style="color:#94a3b8;margin-right:4px;"></i>${this.escapeHtml(order.dateTime || order.date || '—')}
                    </td>
                    <td>
                        <div style="font-weight:700;color:#0f172a;font-size:0.85rem;">${this.escapeHtml(order.name || 'Unnamed')}</div>
                        <div style="font-size:0.75rem;color:#64748b;display:flex;align-items:center;gap:6px;margin-top:2px;">
                            <a href="tel:${cleanPhone}" style="color:#0284c7;text-decoration:none;"><i class="fas fa-phone-alt"></i> ${this.escapeHtml(order.phone)}</a>
                            ${cleanPhone ? `<a href="${waUrl}" target="_blank" style="color:#16a34a;text-decoration:none;font-size:0.85rem;" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>` : ''}
                        </div>
                    </td>
                    <td style="font-size:0.8rem;color:#334155;max-width:240px;">
                        ${itemsFormatted}
                    </td>
                    <td style="font-size:0.8rem;color:#475569;max-width:200px;">
                        ${order.location ? `<a href="${mapLink}" target="_blank" style="color:#0284c7;text-decoration:none;display:inline-flex;align-items:center;gap:4px;" title="Open in Maps"><i class="fas fa-map-marker-alt" style="color:#ef4444;"></i> <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">${this.escapeHtml(order.location)}</span></a>` : '—'}
                    </td>
                    <td style="font-weight:800;color:#0f172a;font-size:0.9rem;white-space:nowrap;">
                        ${this.formatCurrency(order.totalAmount !== undefined ? order.totalAmount : order.total, order.currency)}
                    </td>
                    <td>
                        ${this.renderStatusBadge(order.status, order.id)}
                    </td>
                    <td style="text-align:right;white-space:nowrap;">
                        <button class="btn btn-sm btn-outline-primary view-order-btn" data-id="${this.escapeHtml(order.id)}" style="padding:6px 12px;font-size:0.75rem;border-radius:6px;min-height:30px;">
                            <i class="fas fa-eye"></i> Details
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // Bind row selection checkboxes
        tbody.querySelectorAll('.order-row-check').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-id');
                if (e.target.checked) this.selectedIds.add(id);
                else this.selectedIds.delete(id);
                this.updateBulkBar();
            });
        });

        // Bind Status Changes
        tbody.querySelectorAll('.order-status-select').forEach(sel => {
            sel.addEventListener('change', async (e) => {
                const orderId = e.target.getAttribute('data-id');
                const newStatus = e.target.value;
                await this.updateOrderStatus(orderId, newStatus);
            });
        });

        // Bind View Details buttons
        tbody.querySelectorAll('.view-order-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.closest('.view-order-btn');
                const orderId = target ? target.getAttribute('data-id') : null;
                const orderObj = this.orders.find(o => String(o.id) === String(orderId));
                if (orderObj) {
                    this.openModal(orderObj);
                }
            });
        });

        // Render Pagination controls
        this.renderPagination(totalPages);
        this.updateBulkBar();
    }

    updateBulkBar() {
        const bar = document.getElementById('ordersBulkBar');
        const countEl = document.getElementById('bulkSelectedCount');
        const n = this.selectedIds.size;

        if (bar) bar.style.display = n > 0 ? 'flex' : 'none';
        if (countEl) countEl.textContent = `${n} selected`;

        const selectAll = document.getElementById('selectAllOrders');
        if (selectAll) {
            const pageChecks = Array.from(document.querySelectorAll('.order-row-check'));
            const checkedOnPage = pageChecks.filter(c => c.checked).length;
            selectAll.checked = pageChecks.length > 0 && checkedOnPage === pageChecks.length;
            selectAll.indeterminate = checkedOnPage > 0 && checkedOnPage < pageChecks.length;
        }
    }

    async bulkApplyStatus() {
        if (this.selectedIds.size === 0) return;
        const status = document.getElementById('bulkStatusSelect')?.value || 'pending';
        const ids = Array.from(this.selectedIds);

        this.orders.forEach(o => {
            if (ids.includes(String(o.id))) o.status = status;
        });
        ids.forEach(id => localStorage.setItem(`gs_order_status_${this.shopId}_${id}`, status));

        if (typeof supabaseClient !== 'undefined') {
            try {
                const { error } = await supabaseClient
                    .from('orders')
                    .update({ status: status, updated_at: new Date().toISOString() })
                    .in('id', ids);
                if (error) throw error;
                if (typeof showNotification === 'function') {
                    showNotification(`${ids.length} order(s) set to ${status.toUpperCase()}`, 'success');
                }
            } catch (err) {
                console.error('Failed to bulk update status:', err);
                if (typeof showNotification === 'function') {
                    showNotification('Failed to update some orders.', 'error');
                }
            }
        }

        this.selectedIds.clear();
        this.updateSummaryCards();
        this.applyFilters();
    }

    async bulkDeleteSelected() {
        if (this.selectedIds.size === 0) return;
        const ids = Array.from(this.selectedIds);

        if (!confirm(`Delete ${ids.length} selected order(s)? This cannot be undone.`)) return;

        if (typeof supabaseClient !== 'undefined') {
            try {
                const { error } = await supabaseClient
                    .from('orders')
                    .delete()
                    .in('id', ids);
                if (error) throw error;
            } catch (err) {
                console.error('Failed to bulk delete orders:', err);
                if (typeof showNotification === 'function') {
                    showNotification('Failed to delete orders. Check console for details.', 'error');
                }
                return;
            }
        }

        ids.forEach(id => localStorage.removeItem(`gs_order_status_${this.shopId}_${id}`));
        this.orders = this.orders.filter(o => !ids.includes(String(o.id)));
        this.selectedIds.clear();

        if (typeof showNotification === 'function') {
            showNotification(`Deleted ${ids.length} order(s).`, 'success');
        }
        this.updateSummaryCards();
        this.applyFilters();
    }

    renderStatusBadge(status, orderId) {
        const s = (status || 'pending').toLowerCase();
        const styles = {
            completed: 'background:#dcfce7;color:#15803d;border-color:#86efac;',
            processing: 'background:#e0f2fe;color:#0369a1;border-color:#7dd3fc;',
            rejected: 'background:#fee2e2;color:#b91c1c;border-color:#fca5a5;',
            pending: 'background:#fef3c7;color:#b45309;border-color:#fde047;'
        };
        return `
            <select class="order-status-select" data-id="${this.escapeHtml(orderId)}" style="padding:5px 8px;border-radius:8px;font-size:0.75rem;font-weight:700;border:1px solid #cbd5e1;cursor:pointer;outline:none;min-height:30px;${styles[s] || styles.pending}">
                <option value="pending" ${s === 'pending' ? 'selected' : ''}>⏳ Pending</option>
                <option value="processing" ${s === 'processing' ? 'selected' : ''}>⚙️ Processing</option>
                <option value="completed" ${s === 'completed' ? 'selected' : ''}>✅ Completed</option>
                <option value="rejected" ${s === 'rejected' ? 'selected' : ''}>❌ Rejected</option>
            </select>
        `;
    }

    renderPagination(totalPages) {
        const paginationEl = document.getElementById('ordersPagination');
        if (!paginationEl) return;

        const totalItems = this.filteredOrders.length;
        const perPage = this.perPage || 50;
        const currentPage = this.currentPage || 1;
        const perPageHtml = window.renderPerPageControlHTML ? window.renderPerPageControlHTML('orders', perPage) : '';
        const showStart = totalItems > 0 ? (currentPage - 1) * perPage + 1 : 0;
        const showEnd = Math.min(currentPage * perPage, totalItems);

        paginationEl.innerHTML = `
            <div class="orders-pagination-wrap" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:white;border:1px solid #e2e8f0;border-radius:10px;margin-top:12px;flex-wrap:wrap;gap:10px;">
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                    <span style="font-size:0.8rem;color:#64748b;">Showing ${showStart}-${showEnd} of ${totalItems}</span>
                    ${perPageHtml}
                </div>
                <div class="orders-pagination-nav" style="display:flex;gap:4px;align-items:center;">
                    <button id="ordersFirstPage" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-left"></i></button>
                    <button id="ordersPrevPage" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-left"></i></button>
                    <span style="padding:6px 12px;background:var(--primary,#0f6425);color:white;border-radius:6px;font-size:0.75rem;font-weight:700;">${currentPage} / ${totalPages || 1}</span>
                    <button id="ordersNextPage" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-right"></i></button>
                    <button id="ordersLastPage" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-right"></i></button>
                </div>
            </div>
        `;

        document.getElementById('ordersFirstPage')?.addEventListener('click', () => {
            this.currentPage = 1;
            this.renderOrdersTable();
        });

        document.getElementById('ordersPrevPage')?.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderOrdersTable();
            }
        });

        document.getElementById('ordersNextPage')?.addEventListener('click', () => {
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderOrdersTable();
            }
        });

        document.getElementById('ordersLastPage')?.addEventListener('click', () => {
            this.currentPage = totalPages;
            this.renderOrdersTable();
        });

        const selectEl = paginationEl.querySelector('#perPageSelect_orders');
        const customInputEl = paginationEl.querySelector('#perPageCustomInput_orders');

        if (selectEl) {
            selectEl.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val === 'custom') {
                    if (customInputEl) {
                        customInputEl.style.display = 'inline-block';
                        customInputEl.focus();
                    }
                } else {
                    if (customInputEl) customInputEl.style.display = 'none';
                    const num = parseInt(val, 10);
                    if (!isNaN(num) && num > 0) {
                        this.perPage = num;
                        if (window.saveStoredPerPage) window.saveStoredPerPage('orders', num);
                        this.currentPage = 1;
                        this.renderOrdersTable();
                    }
                }
            });
        }

        if (customInputEl) {
            const handleCustom = (e) => {
                const num = parseInt(e.target.value, 10);
                if (!isNaN(num) && num > 0) {
                    this.perPage = num;
                    if (window.saveStoredPerPage) window.saveStoredPerPage('orders', num);
                    this.currentPage = 1;
                    this.renderOrdersTable();
                }
            };
            customInputEl.addEventListener('change', handleCustom);
            customInputEl.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleCustom(e); });
        }
    }

    openModal(order) {
        this.selectedOrder = order;
        const modal = document.getElementById('orderDetailModal');
        const modalBody = document.getElementById('orderDetailModalBody');

        if (!modal || !modalBody) return;

        const cleanPhone = order.phone.replace(/[^0-9+]/g, '');
        const waUrl = cleanPhone ? `https://wa.me/${cleanPhone.replace('+', '')}` : '#';
        const mapLink = order.location ? `https://www.google.com/maps?q=${encodeURIComponent(order.location)}` : '#';

        // Parse item list into cards with thumbnails
        const itemsList = (order.items || 'No items listed')
            .split('\n')
            .filter(i => i.trim())
            .map(i => {
                const imgUrl = this.getItemImage(i);
                const imgHtml = imgUrl ? `
                    <img src="${imgUrl}" alt="item" style="width:44px;height:44px;border-radius:8px;object-fit:cover;border:1px solid #e2e8f0;flex-shrink:0;cursor:pointer;" onclick="(function(e){var lb=document.createElement('div');lb.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer;';lb.innerHTML='<img src=&quot;'+e.target.src+'&quot; style=&quot;max-width:90%;max-height:90%;object-fit:contain;border-radius:12px;&quot;>';lb.onclick=function(){lb.remove();};document.body.appendChild(lb);})(event)" title="Click to zoom">
                ` : `
                    <div style="width:44px;height:44px;border-radius:8px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:1.1rem;flex-shrink:0;">
                        <i class="fas fa-box"></i>
                    </div>
                `;
                return `
                    <li style="padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;display:flex;align-items:center;gap:12px;background:#ffffff;box-shadow:0 1px 2px rgba(0,0,0,0.02);">
                        ${imgHtml}
                        <div style="flex:1;min-width:0;font-size:0.86rem;color:#1e293b;font-weight:600;line-height:1.35;word-break:break-word;">
                            ${this.escapeHtml(i)}
                        </div>
                    </li>
                `;
            })
            .join('');

        modalBody.innerHTML = `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                    <div>
                        <h4 style="margin:0 0 4px;color:#0f172a;font-size:1.05rem;">${this.escapeHtml(order.name)}</h4>
                        <div style="font-size:0.78rem;color:#64748b;">
                            <i class="far fa-clock"></i> ${this.escapeHtml(order.date)}
                        </div>
                    </div>
                    <span style="background:#e0f2fe;color:#0369a1;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;">
                        Order #${order.id}
                    </span>
                </div>
                ${cleanPhone ? `
                    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
                        <a href="${waUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;background:#16a34a;color:white;padding:7px 14px;border-radius:8px;text-decoration:none;font-size:0.8rem;font-weight:600;min-height:36px;">
                            <i class="fab fa-whatsapp"></i> WhatsApp (${this.escapeHtml(order.phone)})
                        </a>
                        <a href="tel:${cleanPhone}" style="display:inline-flex;align-items:center;gap:6px;background:#e2e8f0;color:#334155;padding:7px 14px;border-radius:8px;text-decoration:none;font-size:0.8rem;font-weight:600;min-height:36px;">
                            <i class="fas fa-phone"></i> Call
                        </a>
                    </div>
                ` : ''}
            </div>

            <!-- Status Control -->
            <div style="margin-bottom:16px;">
                <label style="font-size:0.74rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Set Order Status</label>
                <div class="order-status-grid">
                    <button class="btn change-status-btn" data-id="${order.id}" data-status="pending" style="padding:8px 6px;font-size:0.78rem;font-weight:700;border-radius:8px;border:1px solid #fde047;background:${order.status === 'pending' ? '#fef3c7' : '#ffffff'};color:#b45309;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;min-height:36px;">
                        ⏳ Pending
                    </button>
                    <button class="btn change-status-btn" data-id="${order.id}" data-status="processing" style="padding:8px 6px;font-size:0.78rem;font-weight:700;border-radius:8px;border:1px solid #7dd3fc;background:${order.status === 'processing' ? '#e0f2fe' : '#ffffff'};color:#0369a1;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;min-height:36px;">
                        ⚙️ Processing
                    </button>
                    <button class="btn change-status-btn" data-id="${order.id}" data-status="completed" style="padding:8px 6px;font-size:0.78rem;font-weight:700;border-radius:8px;border:1px solid #86efac;background:${order.status === 'completed' ? '#dcfce7' : '#ffffff'};color:#15803d;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;min-height:36px;">
                        ✅ Complete
                    </button>
                    <button class="btn change-status-btn" data-id="${order.id}" data-status="rejected" style="padding:8px 6px;font-size:0.78rem;font-weight:700;border-radius:8px;border:1px solid #fca5a5;background:${order.status === 'rejected' ? '#fee2e2' : '#ffffff'};color:#b91c1c;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;min-height:36px;">
                        ❌ Reject
                    </button>
                </div>
            </div>

            <!-- Delivery Location -->
            <div style="margin-bottom:16px;">
                <label style="font-size:0.74rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">Delivery Address / Location</label>
                <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:0.84rem;color:#334155;line-height:1.4;">
                    ${order.location ? `
                        <i class="fas fa-map-marker-alt" style="color:#ef4444;margin-right:6px;"></i>
                        ${this.escapeHtml(order.location)}
                        <div style="margin-top:6px;">
                            <a href="${mapLink}" target="_blank" style="color:#0284c7;font-size:0.76rem;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:4px;">
                                <i class="fas fa-external-link-alt"></i> Open in Google Maps
                            </a>
                        </div>
                    ` : '<span style="color:#94a3b8;">No address provided</span>'}
                </div>
            </div>

            <!-- Items -->
            <div style="margin-bottom:16px;">
                <label style="font-size:0.74rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">Ordered Items</label>
                <ul style="list-style:none;padding:0;margin:0;font-size:0.88rem;color:#1e293b;">
                    ${itemsList}
                </ul>
            </div>

            <!-- Note if any -->
            ${order.note ? `
                <div style="margin-bottom:16px;">
                    <label style="font-size:0.74rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">Customer Note</label>
                    <div style="background:#fffbebf0;border:1px solid #fef08a;color:#854d0e;border-radius:10px;padding:10px 12px;font-size:0.82rem;line-height:1.4;">
                        <i class="fas fa-comment-alt" style="margin-right:6px;"></i> ${this.escapeHtml(order.note)}
                    </div>
                </div>
            ` : ''}

            <!-- Total Amount Header -->
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <span style="font-weight:700;color:#166534;font-size:0.88rem;">Total Amount:</span>
                <span style="font-weight:800;color:#15803d;font-size:1.25rem;">${this.formatCurrency(order.total, order.currency)}</span>
            </div>

            <!-- Proceed to POS Action -->
            <button class="btn btn-primary modal-proceed-pos-btn" style="width:100%;height:44px;min-height:44px;padding:0 16px;border-radius:10px;font-weight:700;font-size:0.95rem;background:var(--primary,#0f6425);color:white;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 12px rgba(15,100,37,0.25);">
                <i class="fas fa-cash-register"></i> Proceed to POS Checkout
            </button>
        `;

        modalBody.querySelectorAll('.change-status-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.closest('.change-status-btn');
                const orderId = target.getAttribute('data-id');
                const newStatus = target.getAttribute('data-status');
                this.updateOrderStatus(orderId, newStatus);
            });
        });

        modalBody.querySelector('.modal-proceed-pos-btn')?.addEventListener('click', () => {
            this.closeModal();
            this.proceedToPOS(order);
        });

        modal.style.display = 'flex';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    proceedToPOS(order) {
        if (!order) return;
        const posOrderData = {
            id: order.id,
            date: order.date,
            name: order.name,
            phone: order.phone,
            location: order.location,
            items: order.items,
            total: order.total,
            note: order.note
        };
        localStorage.setItem('pending_pos_order', JSON.stringify(posOrderData));
        window.location.href = 'pos.html';
    }

    closeModal() {
        const modal = document.getElementById('orderDetailModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
        this.selectedOrder = null;
    }

    formatCurrency(amount, curr = null) {
        const symbol = curr || this.currency || 'INR';
        const num = parseFloat(amount) || 0;
        return `${symbol} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.ordersManager = new OrdersManager();
});
