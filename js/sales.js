// Sales Reporting - Complete Implementation
class SalesManager {
    constructor() {
        window.salesManager = this;
        this.currentUser = null;
        this.shopId = null;
        this.sales = [];
        this.filteredSales = [];
        this.currentPage = 1;
        this.itemsPerPage = window.getStoredPerPage ? window.getStoredPerPage('sales', 50) : 50;
        this.salesChart = null;
        this.paymentChart = null;
        this.selectedSales = new Set(); // Selection tracking
        this.costsRevealed = false;
        this.currentRefundSale = null;
        this.currentRefundItems = [];
        // Receipt wording from Settings > POS, with safe defaults until loaded
        this.receiptHeader = 'Thank you for shopping with us!';
        this.receiptFooter = 'Please visit again!';
        this.receiptQrImageUrl = '';
        this.init();
    }

    async init() {
        // Check authentication
        this.currentUser = authManager.getCurrentUser();

        if (!this.currentUser) {
            window.location.href = 'index.html';
            return;
        }

        // Use shopId from authManager (Visitor Mode support)
        this.shopId = authManager.shopId || this.currentUser.shop_id;

        if (!this.shopId) {
            showNotification('No shop assigned', 'error');
            setTimeout(() => authManager.logout(), 2000);
            return;
        }

        // Update UI
        this.updateUI();

        // Load Shop Config (Currency, etc.)
        await initializeShopConfig(this.shopId);

        // Receipt wording for printed invoices
        await this.loadReceiptWording();

        // Setup event listeners
        this.setupEventListeners();

        // Initialize date pickers
        this.initDatePickers();

        // Load sales data
        await this.loadSalesData();
    }

    updateUI() {
        // Update user info
        const userNameEl = document.getElementById('userName');
        const userRoleEl = document.getElementById('userRole');

        if (userNameEl) {
            userNameEl.textContent = this.currentUser.full_name || this.currentUser.username;
        }

        if (userRoleEl) {
            userRoleEl.textContent = this.currentUser.role === 'shop_admin' ? 'Shop Admin' : 'Shop Staff';
        }

        // Set default dates (Today)
        this.setTodayRange();
    }

    setTodayRange() {
        const today = new Date();
        const start = new Date(today);
        start.setHours(0, 0, 0, 0);
        const end = new Date(today);
        end.setHours(23, 59, 59, 999);

        const fromDateInput = document.getElementById('fromDate');
        const toDateInput = document.getElementById('toDate');

        if (fromDateInput) fromDateInput.value = start.toLocaleDateString('en-CA');
        if (toDateInput) toDateInput.value = end.toLocaleDateString('en-CA');
    }

    setupEventListeners() {
        // Export buttons
        const exportExcelBtn = document.getElementById('exportExcelBtn');
        if (exportExcelBtn) {
            exportExcelBtn.addEventListener('click', () => {
                this.exportToExcel();
            });
        }

        const exportPdfBtn = document.getElementById('exportPdfBtn');
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => {
                this.exportToPDF();
            });
        }

        // Date filter buttons
        const applyDateFilter = document.getElementById('applyDateFilter');
        if (applyDateFilter) {
            applyDateFilter.addEventListener('click', () => {
                this.applyDateFilter();
            });
        }

        const resetDateFilter = document.getElementById('resetDateFilter');
        if (resetDateFilter) {
            resetDateFilter.addEventListener('click', () => {
                this.resetDateFilter();
            });
        }

        // Time Range Filter
        const timeRangeFilter = document.getElementById('timeRangeFilter');
        const customDateRange = document.getElementById('customDateRange');

        if (timeRangeFilter) {
            timeRangeFilter.addEventListener('change', (e) => {
                const value = e.target.value;
                if (value === 'custom') {
                    if (customDateRange) customDateRange.style.display = 'flex';
                } else {
                    if (customDateRange) customDateRange.style.display = 'none';
                    this.applyQuickFilter(value);
                }
            });
        }

        // Chart metric change
        const chartMetric = document.getElementById('chartMetric');
        if (chartMetric) {
            chartMetric.addEventListener('change', (e) => {
                this.updateSalesChart();
            });
        }

        // Search input
        const salesSearch = document.getElementById('salesSearch');
        if (salesSearch) {
            salesSearch.addEventListener('input', (e) => {
                this.filterSales(e.target.value);
            });
        }

        // Refresh button
        const refreshSales = document.getElementById('refreshSales');
        if (refreshSales) {
            refreshSales.addEventListener('click', () => {
                this.loadSalesData();
            });
        }

        // Refund / Restock modal
        const confirmRefundBtn = document.getElementById('confirmRefund');
        if (confirmRefundBtn) {
            confirmRefundBtn.addEventListener('click', () => {
                this.confirmRefund();
            });
        }
        const refundModalEl = document.getElementById('refundModal');
        if (refundModalEl) {
            refundModalEl.addEventListener('click', (e) => {
                if (e.target === refundModalEl) this.closeRefundModal();
            });
        }
        const closeRefundModalBtns = refundModalEl ? refundModalEl.querySelectorAll('.close-modal') : [];
        closeRefundModalBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeRefundModal();
            });
        });

        // Reveal/hide all buy prices button
        const toggleAllCostsBtn = document.getElementById('toggleAllCosts');
        if (toggleAllCostsBtn) {
            toggleAllCostsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleAllCostPrices();
            });
            window.toggleAllCostPrices = () => this.toggleAllCostPrices();
            this.syncCostToggleButton();
        }

        // Pagination buttons
        const prevPage = document.getElementById('prevPage');
        if (prevPage) {
            prevPage.addEventListener('click', () => {
                this.previousPage();
            });
        }

        const nextPage = document.getElementById('nextPage');
        if (nextPage) {
            nextPage.addEventListener('click', () => {
                this.nextPage();
            });
        }

        // Print sale button
        const printSaleBtn = document.getElementById('printSaleBtn');
        if (printSaleBtn) {
            printSaleBtn.addEventListener('click', () => {
                this.printSaleDetails();
            });
        }

        // Modal close buttons
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeAllModals();
            });
        });

        // Close modal when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeAllModals();
                }
            });
        });

        // View sale details event delegation - FIXED
        const salesTable = document.getElementById('salesTable');
        if (salesTable) {
            salesTable.addEventListener('click', (e) => {
                const spoiler = e.target.closest('.cost-spoiler');
                if (spoiler) {
                    spoiler.classList.toggle('revealed');
                    this.syncCostToggleButton();
                    return;
                }

                const viewBtn = e.target.closest('.view-sale-btn');
                if (viewBtn) {
                    const saleId = viewBtn.dataset.id;
                    this.showSaleDetails(saleId);
                    return;
                }

                const refundBtn = e.target.closest('.refund-sale-btn');
                if (refundBtn) {
                    const saleId = refundBtn.dataset.id;
                    this.openRefundModal(saleId);
                    return;
                }

                const deleteBtn = e.target.closest('.delete-sale-btn');
                if (deleteBtn) {
                    const saleId = deleteBtn.dataset.id;
                    this.handleDelete(saleId);
                    return;
                }
            });
        }


        // Bulk selection listeners
        const selectAllSales = document.getElementById('selectAllSales');
        if (selectAllSales) {
            selectAllSales.addEventListener('change', (e) => {
                this.toggleSelectAll(e.target.checked);
            });
        }

        // Bulk action buttons
        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', () => {
                this.handleBulkDelete();
            });
        }

        const cancelSelection = document.getElementById('cancelSelection');
        if (cancelSelection) {
            cancelSelection.addEventListener('click', () => {
                this.clearSelection();
            });
        }

        // Row checkbox delegation
        if (salesTable) {
            salesTable.addEventListener('change', (e) => {
                if (e.target.classList.contains('sale-checkbox')) {
                    this.toggleSaleSelection(e.target.dataset.id, e.target.checked);
                }
            });
        }
    }

    initDatePickers() {
        // Initialize flatpickr if available
        if (typeof flatpickr !== 'undefined') {
            flatpickr('.datepicker', {
                dateFormat: 'Y-m-d',
                maxDate: 'today'
            });
        }
    }

    async loadSalesData() {
        showLoading(true);

        try {
            const fromDate = document.getElementById('fromDate').value;
            const toDate = document.getElementById('toDate').value;



            // First, get sales with basic info
            let query = supabaseClient
                .from('sales')
                .select('*')
                .eq('shop_id', this.shopId)
                .order('created_at', { ascending: false });

            // Apply date filter if dates are set
            if (fromDate && toDate) {
                query = query.gte('created_at', fromDate + 'T00:00:00')
                    .lte('created_at', toDate + 'T23:59:59');
            }

            const { data: sales, error } = await query;

            if (error) {

                throw error;
            }



            // If no sales found
            if (!sales || sales.length === 0) {
                this.sales = [];
                this.filteredSales = [];
                this.renderSalesTable();
                this.updateSalesStats();
                this.updateSalesChart();
                this.updatePaymentChart();
                showNotification('No sales found for selected period', 'info');
                return;
            }

            // Get sale items for each sale in batch
            const saleIds = sales.map(sale => sale.id);

            // Get all sale items in one query
            const { data: allSaleItems, error: itemsError } = await supabaseClient
                .from('sale_items')
                .select('*')
                .in('sale_id', saleIds);

            if (itemsError) {

            }

            // Fetch products manually (Step 2: Bypass potentially missing FK join issues)
            const productIds = [...new Set((allSaleItems || []).map(item => item.product_id).filter(id => id))];
            let productsMap = {};

            if (productIds.length > 0) {
                const { data: productsData, error: productsError } = await supabaseClient
                    .from('products')
                    .select('id, product_name, sku, product_image, cost_price')
                    .in('id', productIds);

                if (productsError) {

                }

                if (productsData) {
                    productsData.forEach(p => {
                        productsMap[p.id] = p;
                    });
                }
            }

            // Group sale items by sale_id and attach product info
            const saleItemsMap = {};
            if (allSaleItems) {
                allSaleItems.forEach(item => {
                    // Attach product manually
                    if (item.product_id) {
                        item.products = productsMap[item.product_id];
                    }

                    if (!saleItemsMap[item.sale_id]) {
                        saleItemsMap[item.sale_id] = [];
                    }
                    saleItemsMap[item.sale_id].push(item);
                });
            }

            // NOTE: sold_by column contains the username string, not the UUID.
            // So we don't need to fetch profiles to resolve names.
            // We can use sale.sold_by directly.

            // Process sales data
            const salesWithItems = sales.map(sale => {
                let saleItems = saleItemsMap[sale.id] || [];

                // Determine staff name
                // POS saves the username directly in sold_by column, so we use it directly.
                let staffName = sale.sold_by || 'Unknown';

                let totalQuantity = 0;
                let totalCost = 0;
                let productNames = '';

                if (saleItems.length === 0) {
                    // Handle sales with no items (Custom Sales)
                    totalQuantity = 1;
                    totalCost = 0;
                    productNames = 'Custom Sale (No Items)';
                } else {
                    // Calculate total quantity and total cost
                    totalQuantity = saleItems.reduce((sum, item) =>
                        sum + (parseInt(item.quantity) || 0), 0);

                    totalCost = saleItems.reduce((sum, item) => {
                        const cost = parseFloat(item.cost_price || item.products?.cost_price || 0);
                        return sum + (cost * (parseInt(item.quantity) || 0));
                    }, 0);

                    // Get product names for display
                    productNames = saleItems.slice(0, 2).map(item =>
                        item.products?.product_name || 'Product'
                    ).join(', ');
                }

                return {
                    ...sale,
                    sale_items: saleItems,
                    staff_name: staffName,
                    total_quantity: totalQuantity,
                    total_cost: totalCost,
                    product_names: productNames
                };
            });

            this.sales = salesWithItems;
            this.filteredSales = [...this.sales];



            // Update stats and charts
            this.updateSalesStats();
            this.updateSalesChart();
            this.updatePaymentChart();
            this.renderSalesTable();
            this.updatePagination();

            showNotification(`Loaded ${this.sales.length} sales records`, 'success');

        } catch (error) {

            showNotification('Failed to load sales data. Please check console for details.', 'error');
        } finally {
            showLoading(false);
        }
    }

    updateSalesStats() {
        // Calculate stats for the filtered date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        // Filter out refunded sales for stats
        const activeSales = this.sales.filter(sale => sale.sale_status !== 'refunded');

        // Period totals (from filtered range)
        const periodTotal = activeSales.reduce((sum, sale) => sum + parseFloat(sale.total_amount || 0), 0);
        const periodOrders = activeSales.length;
        const periodCost = activeSales.reduce((sum, sale) => sum + parseFloat(sale.total_cost || 0), 0);
        const periodProfit = periodTotal - periodCost;
        // Markup = Profit ÷ Cost × 100 (same formula as dashboard)
        const periodMargin = periodCost > 0 ? (periodProfit / periodCost * 100) : (periodTotal > 0 ? 100 : 0);

        // Today's sales (for the change indicators)
        const todaySales = activeSales.filter(sale => {
            const saleDate = new Date(sale.created_at);
            return saleDate >= today;
        });

        const todayTotal = todaySales.reduce((sum, sale) => sum + parseFloat(sale.total_amount || 0), 0);
        const todayOrders = todaySales.length;
        const todayCost = todaySales.reduce((sum, sale) => sum + parseFloat(sale.total_cost || 0), 0);
        const todayProfit = todayTotal - todayCost;

        // Yesterday's sales (for the change indicators)
        const yesterdaySales = activeSales.filter(sale => {
            const saleDate = new Date(sale.created_at);
            return saleDate >= yesterday && saleDate < today;
        });

        const yesterdayTotal = yesterdaySales.reduce((sum, sale) => sum + parseFloat(sale.total_amount || 0), 0);
        const yesterdayOrders = yesterdaySales.length;
        const yesterdayCost = yesterdaySales.reduce((sum, sale) => sum + parseFloat(sale.total_cost || 0), 0);
        const yesterdayProfit = yesterdayTotal - yesterdayCost;

        // Credit sales
        const creditSales = activeSales.filter(sale => sale.payment_method === 'credit');
        const creditTotal = creditSales.reduce((sum, sale) => sum + parseFloat(sale.total_amount || 0), 0);

        // Cash sales
        const cashSales = activeSales.filter(sale => sale.payment_method === 'cash');
        const cashTotal = cashSales.reduce((sum, sale) => sum + parseFloat(sale.total_amount || 0), 0);

        // Calculate changes (Today vs Yesterday)
        const calculateChange = (today, yesterday) => {
            if (yesterday > 0) return ((today - yesterday) / yesterday * 100);
            if (today > 0) return 100;
            return 0;
        };

        const salesChange = calculateChange(todayTotal, yesterdayTotal);
        const ordersChange = calculateChange(todayOrders, yesterdayOrders);
        const cashChange = calculateChange(
            todaySales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0),
            yesterdaySales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0)
        );
        const costChange = calculateChange(todayCost, yesterdayCost);
        const profitChange = calculateChange(todayProfit, yesterdayProfit);

        // Average order value
        const avgOrder = activeSales.length > 0 ? periodTotal / activeSales.length : 0;

        // Update display
        const totalSalesAmountEl = document.getElementById('totalSalesAmount');
        const totalOrdersEl = document.getElementById('totalOrders');
        const creditSalesEl = document.getElementById('creditSales');
        const cashSalesEl = document.getElementById('cashSales');
        const totalCostEl = document.getElementById('totalCost');
        const totalProfitEl = document.getElementById('totalProfit');
        const profitMarginEl = document.getElementById('profitMargin');
        const averageOrderEl = document.getElementById('averageOrder');

        // Set period totals
        if (totalSalesAmountEl) totalSalesAmountEl.textContent = formatCurrency(periodTotal);
        if (totalOrdersEl) totalOrdersEl.textContent = periodOrders;
        if (creditSalesEl) creditSalesEl.textContent = formatCurrency(creditTotal);
        if (cashSalesEl) cashSalesEl.textContent = formatCurrency(cashTotal);
        if (totalCostEl) totalCostEl.textContent = formatCurrency(periodCost);
        if (totalProfitEl) totalProfitEl.textContent = formatCurrency(periodProfit);
        if (profitMarginEl) profitMarginEl.textContent = `${periodMargin.toFixed(1)}%`;
        if (averageOrderEl) averageOrderEl.textContent = formatCurrency(avgOrder);

        // Attach breakdown tooltips to each stat card
        const bd = (id, rows) => {
            const el = document.getElementById(id);
            if (el) el.closest('.stat-card')?.setAttribute('data-breakdown', JSON.stringify(rows));
        };

        bd('totalSalesAmount', [
            { label: 'Orders in period', value: periodOrders },
            { label: 'Revenue', value: formatCurrency(periodTotal) },
            { label: '− Cost of goods', value: formatCurrency(periodCost) },
            { label: '− Discounts', value: formatCurrency(periodTotal - periodProfit - periodCost) },
            { label: 'Profit', value: formatCurrency(periodProfit) },
        ]);
        bd('totalOrders', [
            { label: 'Orders in period', value: periodOrders },
            { label: 'Revenue', value: formatCurrency(periodTotal) },
            { label: 'Avg per order', value: formatCurrency(avgOrder) },
            { label: 'Credit orders', value: creditSales.length },
            { label: 'Cash orders', value: cashSales.length },
        ]);
        bd('creditSales', [
            { label: 'Credit orders', value: creditSales.length },
            { label: 'Credit total', value: formatCurrency(creditTotal) },
            { label: 'Cash orders', value: cashSales.length },
            { label: 'Cash total', value: formatCurrency(cashTotal) },
            { label: 'Credit % of total', value: periodTotal > 0 ? (creditTotal / periodTotal * 100).toFixed(1) + '%' : '0%' },
        ]);
        bd('averageOrder', [
            { label: 'Total revenue', value: formatCurrency(periodTotal) },
            { label: '÷ Orders', value: periodOrders },
            { label: 'Avg order value', value: formatCurrency(avgOrder) },
            { label: 'Highest single order', value: formatCurrency(Math.max(...activeSales.map(s => parseFloat(s.total_amount || 0)), 0)) },
        ]);
        bd('cashSales', [
            { label: 'Cash orders', value: cashSales.length },
            { label: 'Cash total', value: formatCurrency(cashTotal) },
            { label: 'Credit orders', value: creditSales.length },
            { label: 'Credit total', value: formatCurrency(creditTotal) },
            { label: 'Cash % of total', value: periodTotal > 0 ? (cashTotal / periodTotal * 100).toFixed(1) + '%' : '0%' },
        ]);
        bd('totalCost', [
            { label: 'Orders', value: periodOrders },
            { label: 'Total cost of goods', value: formatCurrency(periodCost) },
            { label: 'Total revenue', value: formatCurrency(periodTotal) },
            { label: 'Gross profit', value: formatCurrency(periodProfit) },
            { label: 'Avg cost per order', value: periodOrders > 0 ? formatCurrency(periodCost / periodOrders) : '—' },
        ]);
        bd('totalProfit', [
            { label: 'Orders', value: periodOrders },
            { label: 'Revenue', value: formatCurrency(periodTotal) },
            { label: '− Cost of goods', value: formatCurrency(periodCost) },
            { label: 'Gross profit', value: formatCurrency(periodProfit) },
            { label: 'Profit margin', value: periodMargin.toFixed(1) + '%' },
        ]);
        bd('profitMargin', [
            { label: 'Profit', value: formatCurrency(periodProfit) },
            { label: '÷ Cost of Goods', value: formatCurrency(periodCost) },
            { label: '× 100 = Markup %', value: periodMargin.toFixed(1) + '%' },
            { label: 'Revenue', value: formatCurrency(periodTotal) },
            { label: 'Margin (Profit ÷ Revenue)', value: periodTotal > 0 ? (periodProfit / periodTotal * 100).toFixed(1) + '%' : '0%' },
        ]);

        // Update changes
        const salesChangeEl = document.getElementById('salesChange');
        if (salesChangeEl) {
            salesChangeEl.textContent = `${salesChange >= 0 ? '+' : ''}${salesChange.toFixed(1)}%`;
            salesChangeEl.className = `change ${salesChange >= 0 ? 'positive' : 'negative'}`;
        }

        const ordersChangeEl = document.getElementById('ordersChange');
        if (ordersChangeEl) {
            ordersChangeEl.textContent = `${ordersChange >= 0 ? '+' : ''}${ordersChange.toFixed(1)}%`;
            ordersChangeEl.className = `change ${ordersChange >= 0 ? 'positive' : 'negative'}`;
        }

        const cashChangeEl = document.getElementById('cashChange');
        if (cashChangeEl) {
            cashChangeEl.textContent = `${cashChange >= 0 ? '+' : ''}${cashChange.toFixed(1)}%`;
            cashChangeEl.className = `change ${cashChange >= 0 ? 'positive' : 'negative'}`;
        }

        const costChangeEl = document.getElementById('costChange');
        if (costChangeEl) {
            costChangeEl.textContent = `${costChange >= 0 ? '+' : ''}${costChange.toFixed(1)}%`;
            costChangeEl.className = `change ${costChange >= 0 ? 'negative' : 'positive'}`; // Cost up is usually negative in context of sales
        }

        const profitChangeEl = document.getElementById('profitChange');
        if (profitChangeEl) {
            profitChangeEl.textContent = `${profitChange >= 0 ? '+' : ''}${profitChange.toFixed(1)}%`;
            profitChangeEl.className = `change ${profitChange >= 0 ? 'positive' : 'negative'}`;
        }

        const marginChangeEl = document.getElementById('marginChange');
        if (marginChangeEl) {
            const todayCostVal = todaySales.reduce((sum, s) => sum + parseFloat(s.total_cost || 0), 0);
            const todayMargin = todayCostVal > 0 ? (todayProfit / todayCostVal * 100) : (todayTotal > 0 ? 100 : 0);
            const yesterdayCostVal = yesterdaySales.reduce((sum, s) => sum + parseFloat(s.total_cost || 0), 0);
            const yesterdayMargin = yesterdayCostVal > 0 ? (yesterdayProfit / yesterdayCostVal * 100) : (yesterdayTotal > 0 ? 100 : 0);
            const marginChange = todayMargin - yesterdayMargin;
            marginChangeEl.textContent = `${marginChange >= 0 ? '+' : ''}${marginChange.toFixed(1)}%`;
            marginChangeEl.className = `change ${marginChange >= 0 ? 'positive' : 'negative'}`;
        }
    }

    updateSalesChart() {
        const ctx = document.getElementById('salesChart');
        if (!ctx) return;

        // Destroy existing chart
        if (this.salesChart) {
            this.salesChart.destroy();
        }

        const metricSelect = document.getElementById('chartMetric');
        const metric = metricSelect ? metricSelect.value : 'total_amount';

        const fromDateInput = document.getElementById('fromDate');
        const toDateInput = document.getElementById('toDate');

        if (!fromDateInput || !toDateInput) return;

        const fromDate = new Date(fromDateInput.value);
        const toDate = new Date(toDateInput.value);

        // Ensure accurate range
        fromDate.setHours(0, 0, 0, 0);
        toDate.setHours(23, 59, 59, 999);

        // Generate date labels
        const labels = [];
        const dataPoints = [];

        // Map data by date
        const salesByDate = {};
        const activeSales = this.sales.filter(sale => sale.sale_status !== 'refunded');

        activeSales.forEach(sale => {
            const dateKey = new Date(sale.created_at).toLocaleDateString('en-CA');
            if (!salesByDate[dateKey]) {
                salesByDate[dateKey] = {
                    total_amount: 0,
                    total_orders: 0,
                    total_cost: 0,
                    total_profit: 0,
                    credit_sales: 0,
                    count: 0
                };
            }

            const amount = parseFloat(sale.total_amount || 0);
            const cost = parseFloat(sale.total_cost || 0);
            salesByDate[dateKey].total_amount += amount;
            salesByDate[dateKey].total_cost += cost;
            salesByDate[dateKey].total_profit += (amount - cost);
            salesByDate[dateKey].total_orders += 1;
            salesByDate[dateKey].count += 1;

            if (sale.payment_method === 'credit') {
                salesByDate[dateKey].credit_sales += amount;
            }
        });

        // Loop through date range
        // Limit to reasonable number of points (e.g. if > 60 days, maybe we should group? keeping simple for now)
        let currDate = new Date(fromDate);
        while (currDate <= toDate) {
            const dateKey = currDate.toLocaleDateString('en-CA');
            const displayDate = currDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

            labels.push(displayDate);

            const dayData = salesByDate[dateKey] || { total_amount: 0, total_orders: 0, credit_sales: 0, count: 0 };

            let value = 0;
            switch (metric) {
                case 'total_amount':
                    value = dayData.total_amount;
                    break;
                case 'total_orders':
                    value = dayData.total_orders;
                    break;
                case 'profit_amount':
                    value = dayData.total_profit;
                    break;
                case 'cost_amount':
                    value = dayData.total_cost;
                    break;
                case 'profit_margin':
                    value = dayData.total_amount > 0 ? (dayData.total_profit / dayData.total_amount * 100) : 0;
                    break;
                case 'credit_sales':
                    value = dayData.credit_sales;
                    break;
                case 'average_order':
                    value = dayData.count > 0 ? (dayData.total_amount / dayData.count) : 0;
                    break;
            }

            dataPoints.push(value);
            currDate.setDate(currDate.getDate() + 1);
        }

        // Configure styles based on metric
        let label = 'Sales Amount';
        let borderColor = '#4361ee';
        let bgColorStart = 'rgba(67, 97, 238, 0.3)';
        let bgColorEnd = 'rgba(67, 97, 238, 0.05)';
        let isCurrency = true;

        if (metric === 'total_orders') {
            label = 'Total Orders';
            borderColor = '#f72585';
            bgColorStart = 'rgba(247, 37, 133, 0.3)';
            bgColorEnd = 'rgba(247, 37, 133, 0.05)';
            isCurrency = false;
        } else if (metric === 'profit_amount') {
            label = 'Total Profit';
            borderColor = '#2ec4b6';
            bgColorStart = 'rgba(46, 196, 182, 0.3)';
            bgColorEnd = 'rgba(46, 196, 182, 0.05)';
            isCurrency = true;
        } else if (metric === 'cost_amount') {
            label = 'Total Cost';
            borderColor = '#ef476f';
            bgColorStart = 'rgba(239, 71, 111, 0.3)';
            bgColorEnd = 'rgba(239, 71, 111, 0.05)';
            isCurrency = true;
        } else if (metric === 'profit_margin') {
            label = 'Profit Margin %';
            borderColor = '#ffbc42';
            bgColorStart = 'rgba(255, 188, 66, 0.3)';
            bgColorEnd = 'rgba(255, 188, 66, 0.05)';
            isCurrency = false;
        } else if (metric === 'credit_sales') {
            label = 'Credit Sales';
            borderColor = '#f8961e';
            bgColorStart = 'rgba(248, 150, 30, 0.3)';
            bgColorEnd = 'rgba(248, 150, 30, 0.05)';
            isCurrency = true;
        } else if (metric === 'average_order') {
            label = 'Avg Order Value';
            borderColor = '#4cc9f0';
            bgColorStart = 'rgba(76, 201, 240, 0.3)';
            bgColorEnd = 'rgba(76, 201, 240, 0.05)';
            isCurrency = true;
        }

        // Create gradient
        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, bgColorStart);
        gradient.addColorStop(1, bgColorEnd);

        this.salesChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: dataPoints,
                    borderColor: borderColor,
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: borderColor,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let val = context.raw;
                                if (metric === 'profit_margin') return `${label}: ${val.toFixed(1)}%`;
                                if (isCurrency) val = formatCurrency(val);
                                return `${label}: ${val}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        ticks: {
                            callback: function (value) {
                                if (metric === 'profit_margin') return value + '%';
                                return isCurrency ? formatCurrency(value) : value;
                            }
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }



    updatePaymentChart() {
        const ctx = document.getElementById('paymentChart');
        if (!ctx) {

            return;
        }

        // Destroy existing chart
        if (this.paymentChart) {
            this.paymentChart.destroy();
        }

        // Calculate payment method distribution (only active sales)
        const paymentMethods = {};
        const activeSales = this.sales.filter(sale => sale.sale_status !== 'refunded');

        activeSales.forEach(sale => {
            const method = sale.payment_method || 'unknown';
            paymentMethods[method] = (paymentMethods[method] || 0) + 1;
        });

        // If no payment data, create empty chart
        if (Object.keys(paymentMethods).length === 0) {
            paymentMethods.cash = 0;
            paymentMethods.card = 0;
            paymentMethods.credit = 0;
        }

        // Prepare chart data
        const labels = Object.keys(paymentMethods);
        const data = Object.values(paymentMethods);
        const colors = ['#4cc9f0', '#f72585', '#f8961e', '#4895ef', '#3a0ca3'];

        // Chart will fill the responsive .chart-wrapper container via CSS

        // Create chart
        this.paymentChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    renderSalesTable() {
        const tableBody = document.getElementById('salesTable');
        if (!tableBody) return;

        // Calculate pagination
        const perPage = this.itemsPerPage || 50;
        this.currentPage = this.currentPage || 1;
        const totalItems = this.filteredSales.length;
        const totalPages = Math.ceil(totalItems / perPage) || 1;
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        const startIndex = (this.currentPage - 1) * perPage;
        const endIndex = startIndex + perPage;
        const pageSales = this.filteredSales.slice(startIndex, endIndex);

        if (pageSales.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center">
                        <div class="empty-state">
                            <i class="fas fa-receipt fa-2x"></i>
                            <p>No sales found</p>
                            <small>Try adjusting your filters</small>
                        </div>
                    </td>
                </tr>
            `;
            this.updatePagination();
            return;
        }

        tableBody.innerHTML = pageSales.map(sale => {
            // Calculate product count and names
            const productCount = sale.sale_items?.length || 0;
            const isSelected = this.selectedSales.has(sale.id);

            return `
                <tr class="${isSelected ? 'selected-row' : ''}">
                    <td>
                        ${sale.sale_status === 'refunded'
                            ? `<input type="checkbox" class="sale-checkbox" data-id="${sale.id}" ${isSelected ? 'checked' : ''}>`
                            : `<input type="checkbox" disabled title="Only refunded sales can be deleted" style="opacity:0.3;cursor:not-allowed;">`
                        }
                    </td>
                    <td>
                        <strong>${sale.invoice_number || 'N/A'}</strong>
                    </td>
                    <td>${formatDate(sale.created_at)}</td>
                    <td>${sale.buyer_name || 'Walk-in Customer'}</td>
                    <td>
                        <div class="product-list">
                            ${sale.sale_items && sale.sale_items.length > 0 ?
                                sale.sale_items.slice(0, 3).map(item => `
                                    <div class="product-item-mini">
                                        <img src="${item.products?.product_image || 'https://via.placeholder.com/40?text=No+Img'}" 
                                             alt="${item.products?.product_name || 'Product'}" 
                                             class="product-thumb-sm">
                                        <div class="product-info-mini">
                                            <span class="product-name-mini" title="${item.products?.product_name || 'Product'}">
                                                ${item.products?.product_name || 'Product'}
                                            </span>
                                            <span class="product-meta-mini">
                                                SKU: ${item.products?.sku || 'N/A'} | Qty: ${item.quantity}
                                            </span>
                                        </div>
                                    </div>
                                `).join('')
                                : `
                                <div class="custom-sale-placeholder">
                                    <i class="fas fa-tag"></i>
                                    <span>Custom Sale</span>
                                </div>
                                `
                            }
                            ${productCount > 3 ? `<small style="color: #666; font-size: 0.8em; margin-left: 5px;">+${productCount - 3} more items</small>` : ''}
                        </div>
                    </td>
                    <td>${sale.total_quantity || 0}</td>
                    <td><span class="cost-spoiler${this.costsRevealed ? ' revealed' : ''}" onclick="event.stopPropagation(); this.classList.toggle('revealed'); window.salesManager?.syncCostToggleButton();" title="Click to reveal buy price">${formatCurrency(sale.total_cost || 0)}</span></td>
                    <td>${formatCurrency(sale.total_amount)}</td>
                    <td>
                        <span class="payment-method-badge ${sale.payment_method}">
                            ${(sale.payment_method || 'N/A').toUpperCase()}
                        </span>
                    </td>
                    <td>
                        <span class="status-badge ${sale.sale_status || 'completed'}">
                            ${sale.sale_status === 'refunded' ? 'Refunded'
                                : sale.sale_status === 'partially_refunded' ? 'Partial Refund'
                                : sale.sale_status === 'credit' ? 'Credit'
                                : (sale.sale_status || 'Completed')}
                        </span>
                    </td>
                    <td>${sale.staff_name || 'N/A'}</td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-primary view-sale-btn" data-id="${sale.id}" title="View Details">
                                <i class="fas fa-eye"></i>
                            </button>
                            ${sale.sale_status !== 'refunded' ? `
                                <button class="btn btn-sm btn-warning refund-sale-btn" data-id="${sale.id}" title="Refund & Restock">
                                    <i class="fas fa-undo"></i>
                                </button>
                            ` : `
                                <button class="btn btn-sm btn-danger delete-sale-btn" data-id="${sale.id}" title="Delete record">
                                    <i class="fas fa-trash"></i>
                                </button>
                            `}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        this.updatePagination();
        this.syncCostToggleButton();
    }

    getCostSpoilers() {
        return Array.from(document.querySelectorAll('#salesTable .cost-spoiler'));
    }

    syncCostToggleButton() {
        const btn = document.getElementById('toggleAllCosts');
        if (!btn) return;

        const spoilers = this.getCostSpoilers();
        if (spoilers.length === 0) {
            btn.classList.remove('active');
            const icon = btn.querySelector('i');
            const label = btn.querySelector('.cost-toggle-label');
            if (icon) icon.className = this.costsRevealed ? 'fas fa-eye' : 'fas fa-eye-slash';
            if (label) label.textContent = this.costsRevealed ? 'Hide Buy Price' : 'Show Buy Price';
            btn.classList.toggle('active', this.costsRevealed);
            return;
        }
        const allRevealed = spoilers.every(el => el.classList.contains('revealed'));

        // Keep the persisted intent unless every single spoiler was hidden again
        this.costsRevealed = allRevealed;

        const icon = btn.querySelector('i');
        const label = btn.querySelector('.cost-toggle-label');
        if (icon) icon.className = allRevealed ? 'fas fa-eye' : 'fas fa-eye-slash';
        if (label) label.textContent = allRevealed ? 'Hide Buy Price' : 'Show Buy Price';
        btn.classList.toggle('active', allRevealed);
        btn.title = allRevealed ? 'Hide all buy prices' : 'Reveal all buy prices at once';
    }

    setAllCostPricesRevealed(revealed) {
        this.costsRevealed = !!revealed;
        document.querySelectorAll('.cost-spoiler').forEach(el => el.classList.toggle('revealed', this.costsRevealed));
        this.syncCostToggleButton();
    }

    toggleAllCostPrices() {
        const spoilers = this.getCostSpoilers();
        const allRevealed = spoilers.length > 0 && spoilers.every(el => el.classList.contains('revealed'));
        this.setAllCostPricesRevealed(!allRevealed);
    }

    updatePagination() {
        let paginationEl = document.getElementById('salesPagination');
        if (!paginationEl) {
            paginationEl = document.createElement('div');
            paginationEl.id = 'salesPagination';
            const tableContainer = document.querySelector('.table-container');
            if (tableContainer) tableContainer.after(paginationEl);
        }

        const perPage = this.itemsPerPage || 50;
        const totalSales = this.filteredSales.length;
        const totalPages = Math.ceil(totalSales / perPage) || 1;
        const currentPage = this.currentPage || 1;
        const perPageHtml = window.renderPerPageControlHTML ? window.renderPerPageControlHTML('sales', perPage) : '';

        paginationEl.className = '';
        paginationEl.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:white;border:1px solid #e2e8f0;border-radius:10px;margin-top:12px;flex-wrap:wrap;gap:10px;';

        paginationEl.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <span style="font-size:0.8rem;color:#64748b;">Showing ${totalSales > 0 ? (currentPage-1)*perPage+1 : 0}-${Math.min(currentPage*perPage, totalSales)} of ${totalSales}</span>
                ${perPageHtml}
            </div>
            <div style="display:flex;gap:4px;align-items:center;">
                <button onclick="window.salesManager.currentPage=1;window.salesManager.renderSalesTable();" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-left"></i></button>
                <button onclick="window.salesManager.previousPage();" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-left"></i></button>
                <span style="padding:6px 12px;background:var(--primary);color:white;border-radius:6px;font-size:0.75rem;font-weight:700;">${currentPage} / ${totalPages}</span>
                <button onclick="window.salesManager.nextPage();" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-right"></i></button>
                <button onclick="window.salesManager.currentPage=${totalPages};window.salesManager.renderSalesTable();" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-right"></i></button>
            </div>
        `;

        const selectEl = paginationEl.querySelector('#perPageSelect_sales');
        const customInputEl = paginationEl.querySelector('#perPageCustomInput_sales');

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
                    const num = parseInt(val);
                    if (!isNaN(num) && num > 0) {
                        this.itemsPerPage = num;
                        if (window.saveStoredPerPage) window.saveStoredPerPage('sales', num);
                        this.currentPage = 1;
                        this.renderSalesTable();
                    }
                }
            });
        }

        if (customInputEl) {
            const handleCustom = (e) => {
                const num = parseInt(e.target.value);
                if (!isNaN(num) && num > 0) {
                    this.itemsPerPage = num;
                    if (window.saveStoredPerPage) window.saveStoredPerPage('sales', num);
                    this.currentPage = 1;
                    this.renderSalesTable();
                }
            };
            customInputEl.addEventListener('change', handleCustom);
            customInputEl.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleCustom(e); });
        }
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderSalesTable();
            this.updatePagination();
        }
    }

    nextPage() {
        const totalPages = Math.ceil(this.filteredSales.length / this.itemsPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.renderSalesTable();
            this.updatePagination();
        }
    }

    applyDateFilter() {
        const fromDate = document.getElementById('fromDate').value;
        const toDate = document.getElementById('toDate').value;

        if (!fromDate || !toDate) {
            showNotification('Please select both from and to dates', 'error');
            return;
        }

        if (new Date(fromDate) > new Date(toDate)) {
            showNotification('From date cannot be after to date', 'error');
            return;
        }

        this.currentPage = 1;
        this.loadSalesData();
    }

    resetDateFilter() {
        // Reset to last 30 days
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);

        document.getElementById('fromDate').value = thirtyDaysAgo.toLocaleDateString('en-CA');
        document.getElementById('toDate').value = today.toLocaleDateString('en-CA');

        this.currentPage = 1;
        this.loadSalesData();
    }

    applyQuickFilter(range) {
        const now = new Date();
        let fromDate = new Date();
        let toDate = new Date();

        switch (range) {
            case 'today':
                fromDate = new Date(now);
                toDate = new Date(now);
                break;
            case 'yesterday':
                fromDate = new Date(now);
                fromDate.setDate(now.getDate() - 1);
                toDate = new Date(fromDate);
                break;
            case 'week':
                const day = now.getDay();
                const diff = now.getDate() - day + (day === 0 ? -6 : 1);
                fromDate = new Date(now);
                fromDate.setDate(diff);
                toDate = new Date(now);
                break;
            case 'month':
                fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
                toDate = new Date(now);
                break;
            case 'year':
                fromDate = new Date(now.getFullYear(), 0, 1);
                toDate = new Date(now);
                break;
            case 'all':
                fromDate = new Date(2020, 0, 1);
                toDate = new Date(now);
                break;
        }

        fromDate.setHours(0, 0, 0, 0);
        toDate.setHours(23, 59, 59, 999);

        document.getElementById('fromDate').value = fromDate.toLocaleDateString('en-CA');
        document.getElementById('toDate').value = toDate.toLocaleDateString('en-CA');

        this.currentPage = 1;
        this.loadSalesData();
    }

    filterSales(searchTerm) {
        if (!searchTerm.trim()) {
            this.filteredSales = [...this.sales];
        } else {
            this.filteredSales = this.sales.filter(sale =>
                sale.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (sale.buyer_name && sale.buyer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (sale.buyer_phone && sale.buyer_phone.includes(searchTerm)) ||
                sale.staff_name?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        this.currentPage = 1;
        this.renderSalesTable();
        this.updatePagination();
    }

    async showSaleDetails(saleId) {
        showLoading(true);


        try {
            // Get sale details

            const { data: sale, error } = await supabaseClient
                .from('sales')
                .select('*')
                .eq('id', saleId)
                .single();

            if (error) {

                throw error;
            }


            // Get sale items (Step 1: Raw items)

            const { data: saleItems, error: itemsError } = await supabaseClient
                .from('sale_items')
                .select('*')
                .eq('sale_id', saleId);

            if (itemsError) {

                throw itemsError;
            }


            // Step 2: Fetch associated products manually (since FK might be missing)
            const productIds = [...new Set(saleItems.map(item => item.product_id).filter(id => id))];
            let productsMap = {};

            if (productIds.length > 0) {
                const { data: productsData, error: productsError } = await supabaseClient
                    .from('products')
                    .select('id, product_name, sku, product_image, cost_price, selling_price, stock, updated_at')
                    .in('id', productIds);

                if (!productsError && productsData) {
                    productsData.forEach(p => {
                        productsMap[p.id] = p;
                    });
                }
            }

            // Get staff name
            // Determine staff name
            let staffName = sale.sold_by || 'Unknown';
            if (sale.sold_by && typeof sale.sold_by === 'string' && sale.sold_by.includes('-')) {
                // If it looks like a UUID, try to resolve it
                try {
                    const { data: staff } = await supabaseClient
                        .from('profiles')
                        .select('full_name, username')
                        .eq('id', sale.sold_by)
                        .single();
                    if (staff) staffName = staff.full_name || staff.username;
                } catch (e) { }
            } else if (sale.sold_by === this.currentUser?.id) {
                staffName = this.currentUser.full_name || this.currentUser.username || 'Me';
            }

            // Fetch Credit info if applicable
            let creditData = null;
            if (sale.payment_method === 'credit') {
                const { data: credit } = await supabaseClient
                    .from('credits')
                    .select('*')
                    .eq('sale_id', saleId)
                    .single();
                creditData = credit;
            }

            // Enrich items
            const enrichedItems = await Promise.all(saleItems.map(async (item, idx) => {
                const dbProduct = productsMap[item.product_id];
                const product = {
                    product_name: item.product_name || dbProduct?.product_name || 'Removed Product',
                    sku: item.sku || dbProduct?.sku || 'N/A',
                    product_image: item.product_image || dbProduct?.product_image || null,
                    cost_price: item.cost_price || dbProduct?.cost_price || 0,
                    updated_at: dbProduct?.updated_at || null
                };
                item.products = product;

                try {
                    // 1. Frequency (Only if product exists)
                    let frequency = 0;
                    if (item.product_id) {
                        const { count } = await supabaseClient
                            .from('sale_items')
                            .select('id', { count: 'exact', head: true })
                            .eq('product_id', item.product_id);
                        frequency = count || 0;
                    }

                    // 2. Days from Last Update to Sell
                    let daysToSell = 'N/A';
                    if (product.updated_at) {
                        const productDate = new Date(product.updated_at);
                        const saleDate = new Date(sale.created_at);
                        const diffTime = Math.abs(saleDate - productDate);
                        daysToSell = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + ' days';
                    }

                    // 3. Profit Calculation - USE ITEM COST IF AVAILABLE (Price at time of sale)
                    const costPricePerUnit = parseFloat(item.cost_price || product.cost_price || 0);
                    const sellPricePerUnit = parseFloat(item.unit_price || 0);
                    const profitPerUnit = sellPricePerUnit - costPricePerUnit;
                    const totalProfit = profitPerUnit * item.quantity;
                    const profitPercent = costPricePerUnit > 0 ? ((profitPerUnit / costPricePerUnit) * 100).toFixed(1) : '100.0';

                    return {
                        ...item,
                        stats: {
                            frequency: frequency,
                            daysToSell: daysToSell,
                            profit: totalProfit,
                            profitPercent: profitPercent,
                            costPrice: costPricePerUnit
                        }
                    };
                } catch (calcError) {
                    return { ...item, stats: { frequency: 0, daysToSell: 'Error', profit: 0, profitPercent: 0, costPrice: 0 } };
                }
            }));

            // Update modal title
            const invEl = document.getElementById('invoiceNumber');
            if (invEl) invEl.textContent = sale.invoice_number || 'N/A';

            // Build rich HTML
            const itemsHtml = enrichedItems.map((item, index) => {
                const p = item.products || {};
                const stats = item.stats || { frequency: 0, daysToSell: 0, profit: 0, profitPercent: 0, costPrice: 0 };
                const isProfit = stats.profit >= 0;

                return `
            <div class="sale-item-modern mb-3">
                <div class="d-flex align-items-center gap-3 p-3 bg-white rounded-3 border shadow-sm">
                    <div class="product-img-wrapper" style="width: 70px; height: 70px; flex-shrink: 0; background: #f8f9fa; border-radius: 8px; border: 1px solid #eee; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                        ${p.product_image ?
                        `<img src="${p.product_image}" alt="${p.product_name}" style="width: 100%; height: 100%; object-fit: cover;">` :
                        `<i class="fas fa-box text-muted fa-lg"></i>`
                    }
                    </div>
                    
                    <div class="flex-grow-1" style="min-width: 0;">
                        <div class="d-flex justify-content-between align-items-start mb-2 mob-column">
                            <div style="min-width: 0; flex: 1;">
                                <h6 class="mb-0 fw-bold text-dark text-truncate">${p.product_name}</h6>
                                <span class="text-muted extra-small d-block">SKU: ${p.sku} • Qty: <strong>x${item.quantity}</strong></span>
                            </div>
                            <div class="text-md-end item-badges">
                                <div class="profit-badge ${isProfit ? 'profit-up' : 'profit-down'}">
                                    <i class="fas fa-trending-${isProfit ? 'up' : 'down'} me-1"></i>
                                    ${isProfit ? '+' : ''}${formatCurrency(stats.profit)}
                                </div>
                                <div class="extra-small text-muted mt-1 margin-label">${stats.profitPercent}% margin</div>
                            </div>
                        </div>
                        
                        <hr class="my-2 opacity-10">
                        
                        <div class="d-flex justify-content-between align-items-center mob-column gap-2">
                            <div class="price-steps">
                                <span class="step-label">Buy:</span>
                                <span class="cost-spoiler${this.costsRevealed ? ' revealed' : ''} step-value" onclick="event.stopPropagation(); this.classList.toggle('revealed');" title="Click to reveal buy price">${formatCurrency(stats.costPrice)}</span>
                                <span class="step-separator">→</span>
                                <span class="step-label">Sell:</span>
                                <span class="step-value fw-bold text-primary">${formatCurrency(item.unit_price)}</span>
                            </div>
                            <div class="item-total-price fw-bold text-dark">
                                ${formatCurrency(item.total_price)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            `;
            }).join('');

            const totalItems = (saleItems || []).reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
            const totalProfit = enrichedItems.reduce((sum, item) => sum + (item.stats?.profit || 0), 0);

            const contentHtml = `
            <div class="sale-details-modern">
                <!-- Quick Summary Header (3 Cards) -->
                <div class="row g-3 mb-4">
                    <div class="col-4">
                        <div class="info-card-modern p-3 rounded-3 text-center border bg-light h-100 shadow-sm">
                            <i class="fas fa-calendar-day text-success mb-2"></i>
                            <div class="text-muted extra-small text-uppercase fw-bold">Date</div>
                            <div class="fw-bold fs-7">${formatDate(sale.created_at).split(',')[0]}</div>
                        </div>
                    </div>
                    <div class="col-4">
                        <div class="info-card-modern p-3 rounded-3 text-center border bg-light h-100 shadow-sm">
                            <i class="fas fa-credit-card text-warning mb-2"></i>
                            <div class="text-muted extra-small text-uppercase fw-bold">Payment</div>
                            <div class="fw-bold text-uppercase fs-7">${sale.payment_method || 'Cash'}</div>
                        </div>
                    </div>
                    <div class="col-4">
                        <div class="info-card-modern p-3 rounded-3 text-center border bg-light h-100 shadow-sm">
                            <i class="fas fa-user-tie text-info mb-2"></i>
                            <div class="text-muted extra-small text-uppercase fw-bold">Staff</div>
                            <div class="fw-bold fs-7">${staffName}</div>
                        </div>
                    </div>
                </div>

                <!-- Customer & Credit Info -->
                <div class="customer-info-modern p-3 bg-white rounded-3 border mb-4 shadow-sm">
                    <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
                        <div class="d-flex align-items-center">
                            <div class="customer-avatar me-3">
                                <div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center" style="width: 45px; height: 45px; font-size: 1.2rem; box-shadow: 0 2px 8px rgba(var(--primary-rgb), 0.3);">
                                    <i class="fas fa-user"></i>
                                </div>
                            </div>
                            <div>
                                <h6 class="mb-0 fw-bold text-dark">${sale.buyer_name || 'Walk-in Customer'}</h6>
                                <p class="text-muted extra-small mb-0">${sale.buyer_phone ? `<i class="fas fa-phone-alt me-1"></i> ${sale.buyer_phone}` : 'No contact info provided'}</p>
                                ${sale.buyer_address && sale.payment_method !== 'credit' ? `<p class="text-muted extra-small mb-0 mt-1" style="font-style:italic;"><i class="fas fa-sticky-note me-1"></i> ${sale.buyer_address}</p>` : ''}
                            </div>
                        </div>
                        <div class="text-md-end">
                            ${creditData ? `
                                <div class="credit-split-card shadow-sm" style="min-width: 200px;">
                                    <div class="credit-side paid">
                                        <div class="credit-label-sm">Paid</div>
                                        <div class="credit-value-lg text-success-dark">${formatCurrency(creditData.amount_paid)}</div>
                                    </div>
                                    <div class="credit-side pending">
                                        <div class="credit-label-sm">Pending</div>
                                        <div class="credit-value-lg text-danger-dark">${formatCurrency(creditData.pending_amount)}</div>
                                    </div>
                                </div>
                            ` : `
                                <div class="p-2 px-3 rounded-pill bg-success-light border d-inline-flex align-items-center">
                                    <i class="fas fa-check-circle me-2"></i>
                                    <span class="extra-small fw-bold text-uppercase ls-1">Fully Paid</span>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
                
                <div class="items-section">
                    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                        <h6 class="fw-bold mb-0 text-uppercase small ls-1 text-primary">
                            <i class="fas fa-shopping-basket me-2"></i>Items Purchased (${totalItems})
                        </h6>
                        <div class="badge bg-light text-muted border py-1 px-2" style="font-size: 0.65rem;">Sold by: <strong>${staffName}</strong></div>
                    </div>
                    <div class="items-list-modern">
                        ${itemsHtml}
                    </div>
                </div>
                
                <!-- Final Totals -->
                <div class="totals-section-modern p-4 rounded-3 mt-4" style="background: #f8f9fa; border: 1px dashed #dee2e6;">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="text-muted small">Net Profit for this sale</span>
                        <span class="fw-bold ${totalProfit >= 0 ? 'text-success' : 'text-danger'}">
                            ${formatCurrency(totalProfit)}
                        </span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center pt-3 mt-2 border-top border-2">
                        <span class="h5 fw-bold mb-0 text-dark">Total Bill</span>
                        <span class="h5 fw-bold mb-1 text-primary" style="font-size: 1.5rem;">${formatCurrency(sale.total_amount)}</span>
                    </div>
                </div>
            </div>
        `;

            document.getElementById('saleDetailsContent').innerHTML = contentHtml;

            // Store sale data for printing
            const printBtn = document.getElementById('printSaleBtn');
            if (printBtn) printBtn.dataset.saleId = saleId;

            // Show modal
            // Check if using Bootstrap Modal or custom CSS modal
            const modalEl = document.getElementById('saleDetailsModal');
            if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                const saleDetailsModal = new bootstrap.Modal(modalEl);
                saleDetailsModal.show();
            } else {
                modalEl.classList.add('active');
            }

            // Show modal
            document.getElementById('saleDetailsModal').classList.add('active');

        } catch (error) {

            showNotification('Failed to load details: ' + (error.message || error), 'error');
        } finally {
            showLoading(false);
        }
    }

    async loadReceiptWording() {
        try {
            if (!this.shopId || typeof supabaseClient === 'undefined') return;
            const { data, error } = await supabaseClient
                .from('shop_settings')
                .select('receipt_header, receipt_footer')
                .eq('shop_id', this.shopId)
                .maybeSingle();
            if (error) {
                console.warn('Receipt wording load skipped:', error.message);
                return;
            }
            if (data) {
                this.receiptHeader = data.receipt_header || 'Thank you for shopping with us!';
                this.receiptFooter = data.receipt_footer || 'Please visit again!';
            }

            // Receipt QR is optional and its column may not exist yet on older
            // installs, so a failure here must never break the wording above.
            this.receiptQrImageUrl = '';
            try {
                const { data: qrData, error: qrError } = await supabaseClient
                    .from('shop_settings')
                    .select('receipt_qr_image_url')
                    .eq('shop_id', this.shopId)
                    .maybeSingle();
                if (qrError) {
                    console.warn('Receipt QR load skipped:', qrError.message);
                } else if (qrData) {
                    this.receiptQrImageUrl = qrData.receipt_qr_image_url || '';
                }
            } catch (e) {
                console.warn('Receipt QR load skipped:', e);
            }
        } catch (e) {
            console.warn('Receipt wording load skipped:', e);
        }
    }

    printSaleDetails() {
        const saleId = document.getElementById('printSaleBtn').dataset.saleId;
        if (!saleId) {
            showNotification('No sale selected for printing', 'error');
            return;
        }

        const sale = this.sales.find(s => s.id === saleId);
        if (!sale) return;

        const shopName = document.getElementById('shopNameHeader')?.textContent || 'Shop Management System';
        const saleItems = sale.sale_items || [];

        // Receipt wording comes from Settings > POS so the shop owner controls it
        const receiptHeader = String(this.receiptHeader || '').trim() || 'Thank you for shopping with us!';
        const receiptFooter = String(this.receiptFooter || '').trim() || 'Please visit again!';

        // Optional QR image uploaded in Settings > POS, printed below the receipt
        const receiptQrUrl = String(this.receiptQrImageUrl || '').trim();
        const qrHtml = receiptQrUrl ? `
                <div class="qr-section text-center">
                    <img src="${escapeHtml(receiptQrUrl)}" alt="QR Code" crossorigin="anonymous">
                </div>` : '';

        const itemsHtml = saleItems.map(item => `
            <tr>
                <td style="padding: 5px 0;">${item.product_name || 'Product'}<br><small style="color: #666;">${item.quantity} x ${formatCurrency(item.unit_price)}</small></td>
                <td style="text-align: right; vertical-align: top; padding: 5px 0;">${formatCurrency(item.total_price)}</td>
            </tr>
        `).join('');

        const printableHtml = `
            <html>
            <head>
                <title>Invoice - ${sale.invoice_number}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap');
                    body { font-family: 'Courier Prime', monospace; margin: 0; padding: 10px; color: #000; font-size: 12px; background: #fff; }
                    .invoice-wrapper { width: 300px; max-width: 300px; margin: 0 auto; position: relative; }
                    .text-center { text-align: center; }
                    .header { margin-bottom: 20px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
                    .shop-name { font-size: 18px; font-weight: bold; text-transform: uppercase; margin-bottom: 5px; }
                    .info-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
                    table { width: 100%; border-collapse: collapse; margin: 15px 0; border-bottom: 1px dashed #000; }
                    .totals { margin-top: 10px; }
                    .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 5px; }
                    .footer { margin-top: 30px; font-size: 10px; border-top: 1px dashed #000; padding-top: 10px; }
                    .qr-section { margin-top: 12px; }
                    .qr-section img { width: 110px; height: 110px; object-fit: contain; display: block; margin: 0 auto; }
                    @media print { 
                        @page { margin: 0; size: 80mm auto; }
                        body { padding: 0 !important; margin: 0 !important; text-align: left !important; }
                        .invoice-wrapper { width: 300px !important; max-width: 300px !important; margin: 0 !important; padding: 10px !important; display: inline-block !important; } 
                        .no-print { display: none !important; } 
                    }
                </style>
            </head>
            <body>
                <div class="invoice-wrapper">
                <div class="header text-center">
                    <div class="shop-name">${shopName}</div>
                    <div>INVOICE / RECEIPT</div>
                </div>

                <div class="info-section">
                    <div class="info-row"><span>Date:</span> <span>${formatDate(sale.created_at)}</span></div>
                    <div class="info-row"><span>Invoice:</span> <span>${sale.invoice_number}</span></div>
                    <div class="info-row"><span>Payment:</span> <span style="text-transform: uppercase;">${sale.payment_method}</span></div>
                    ${sale.buyer_name ? `<div class="info-row"><span>Customer:</span> <span>${sale.buyer_name}</span></div>` : ''}
                </div>

                <table>
                    <thead>
                        <tr style="border-bottom: 1px dashed #000;">
                            <th style="text-align: left; padding-bottom: 5px;">Item</th>
                            <th style="text-align: right; padding-bottom: 5px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div class="totals">
                    <div class="info-row"><span>Subtotal:</span> <span>${formatCurrency(parseFloat(sale.total_amount) + parseFloat(sale.discount_amount || 0))}</span></div>
                    <div class="info-row"><span>Discount:</span> <span>-${formatCurrency(sale.discount_amount || 0)}</span></div>
                    <div class="total-row"><span>TOTAL:</span> <span>${formatCurrency(sale.total_amount)}</span></div>
                </div>

                <div class="footer text-center">
                    <p>${receiptHeader}</p>
                    <p>${receiptFooter}</p>
                    <button class="no-print" onclick="window.print()" style="margin-top: 20px; padding: 10px 20px; background: #000; color: #fff; border: none; cursor: pointer; border-radius: 4px;">Print Now</button>
                    <button class="no-print" onclick="window.close()" style="margin-top: 10px; padding: 8px 15px; background: #666; color: #fff; border: none; cursor: pointer; border-radius: 4px; margin-left:10px;">Close</button>
                </div>
                ${qrHtml}
                </div>
            </body>
            </html>
        `;

        // Warm the cache for the receipt's remote images before printing
        const remoteImages = [this.receiptQrImageUrl]
            .filter(Boolean)
            .map(url => this.preloadImage(url));

        Promise.all(remoteImages).finally(() => this.writeReceiptForPrint(printableHtml, receiptQrUrl));
    }

    preloadImage(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = img.onerror = () => resolve();
            img.src = url;
            setTimeout(resolve, 2500);
        });
    }

    writeReceiptForPrint(printableHtml, receiptQrUrl = '') {
        let printWindow = null;
        try {
            printWindow = window.open('', '_blank');
        } catch (e) {
            printWindow = null;
        }

        if (printWindow && printWindow.document) {
            try {
                printWindow.document.open();
                printWindow.document.write(printableHtml);
                printWindow.document.close();
                return;
            } catch (e) {
                console.warn('Direct print window write failed, falling back to iframe:', e);
            }
        }

        // Fallback to hidden iframe
        try {
            let iframe = document.getElementById('salesPrintIframe');
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.id = 'salesPrintIframe';
                iframe.style.position = 'fixed';
                iframe.style.right = '0';
                iframe.style.bottom = '0';
                iframe.style.width = '0';
                iframe.style.height = '0';
                iframe.style.border = '0';
                document.body.appendChild(iframe);
            }
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(printableHtml);
            doc.close();
            const printNow = () => {
                try {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                } catch (err) {
                    console.warn('Iframe print error:', err);
                }
            };
            // Wait for the QR image to settle before printing, so it is not cut off
            const qrImg = receiptQrUrl ? doc.querySelector('.qr-section img') : null;
            if (!qrImg || qrImg.complete) {
                setTimeout(printNow, 300);
            } else {
                qrImg.addEventListener('load', () => setTimeout(printNow, 100), { once: true });
                qrImg.addEventListener('error', () => setTimeout(printNow, 100), { once: true });
                setTimeout(printNow, 2500);
            }
        } catch (err) {
            console.error('Failed to print sale details:', err);
            showNotification('Unable to open print preview. Please check browser popups.', 'warning');
        }
    }

    async exportToExcel() {
        showLoading(true);

        try {
            const perPage = this.itemsPerPage || 50;
            const currentPage = this.currentPage || 1;
            const start = (currentPage - 1) * perPage;
            const exportSales = (this.filteredSales || []).slice(start, start + perPage);

            if (exportSales.length === 0) {
                showNotification('No data to export', 'warning');
                return;
            }

            // Prepare CSV content
            let csv = 'Invoice Number,Date,Customer,Phone,Products,Quantity,Buy Price,Total Amount,Payment Method,Status,Sold By\n';

            exportSales.forEach(sale => {
                const products = sale.sale_items?.map(item =>
                    `${item.products?.product_name || 'Product'} x${item.quantity}`
                ).join('; ') || 'N/A';

                const totalItems = sale.sale_items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

                csv += `"${sale.invoice_number || 'N/A'}","${formatDate(sale.created_at)}","${sale.buyer_name || 'Walk-in'}","${sale.buyer_phone || 'N/A'}","${products}",${totalItems},${sale.total_cost || 0},${sale.total_amount || 0},"${sale.payment_method || 'N/A'}","${sale.sale_status || 'completed'}","${sale.staff_name || 'N/A'}"\n`;
            });

            // Create download link
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `sales_report_page_${currentPage}_${new Date().toLocaleDateString('en-CA')}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showNotification(`Exported ${exportSales.length} sale(s) (Page ${currentPage})`, 'success');

        } catch (error) {

            showNotification('Failed to export sales report', 'error');
        } finally {
            showLoading(false);
        }
    }

    async exportToPDF() {
        showLoading(true);

        try {
            const perPage = this.itemsPerPage || 50;
            const currentPage = this.currentPage || 1;
            const start = (currentPage - 1) * perPage;
            const exportSales = (this.filteredSales || []).slice(start, start + perPage);

            if (exportSales.length === 0) {
                showNotification('No data to export', 'warning');
                return;
            }

            try {
                await window.loadJsPDF();
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('l', 'mm', 'a4');

                doc.setFontSize(16);
                doc.text('Sales Report', 14, 15);
                doc.setFontSize(10);
                doc.text(`Shop: ${this.shopName || 'Shop'} | Page ${currentPage} | Generated: ${new Date().toLocaleDateString()}`, 14, 22);

                const tableColumn = ["Invoice Number", "Date", "Customer", "Phone", "Products", "Qty", "Total", "Method", "Status"];
                const tableRows = [];

                exportSales.forEach(sale => {
                    const products = sale.sale_items?.map(item =>
                        `${item.products?.product_name || 'Product'} x${item.quantity}`
                    ).join('; ') || 'N/A';

                    const totalItems = sale.sale_items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

                    tableRows.push([
                        sale.invoice_number || 'N/A',
                        typeof formatDate === 'function' ? formatDate(sale.created_at) : new Date(sale.created_at).toLocaleDateString(),
                        sale.buyer_name || 'Walk-in',
                        sale.buyer_phone || 'N/A',
                        products,
                        totalItems,
                        typeof formatCurrency === 'function' ? formatCurrency(sale.total_amount || 0) : `₹${sale.total_amount || 0}`,
                        sale.payment_method || 'N/A',
                        sale.sale_status || 'completed'
                    ]);
                });

                if (typeof doc.autoTable === 'function') {
                    doc.autoTable({
                        head: [tableColumn],
                        body: tableRows,
                        startY: 28,
                        theme: 'grid',
                        styles: { fontSize: 8 },
                        headStyles: { fillColor: [37, 99, 235] }
                    });
                } else {
                    let y = 30;
                    doc.setFontSize(9);
                    tableRows.forEach(row => {
                        doc.text(row.join(' | '), 14, y);
                        y += 7;
                    });
                }

                doc.save(`sales_report_page_${currentPage}_${new Date().toISOString().split('T')[0]}.pdf`);
                showNotification(`Exported ${exportSales.length} sale(s) to PDF (Page ${currentPage})`, 'success');
            } catch (jsPdfErr) {
                console.warn('jsPDF load failed, using print view fallback:', jsPdfErr);
                // Fallback: Open printable report window
                const printWin = window.open('', '_blank');
                let rowsHtml = exportSales.map(sale => `
                    <tr>
                        <td>${sale.invoice_number || 'N/A'}</td>
                        <td>${new Date(sale.created_at).toLocaleDateString()}</td>
                        <td>${sale.buyer_name || 'Walk-in'}</td>
                        <td>${sale.buyer_phone || 'N/A'}</td>
                        <td>${sale.total_amount || 0}</td>
                        <td>${sale.payment_method || 'N/A'}</td>
                        <td>${sale.sale_status || 'completed'}</td>
                    </tr>
                `).join('');

                printWin.document.write(`
                    <html><head><title>Sales Report</title><style>
                    table { width: 100%; border-collapse: collapse; font-family: sans-serif; }
                    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 12px; }
                    th { background: #f4f4f4; }
                    </style></head><body>
                    <h2>Sales Report (Page ${currentPage})</h2>
                    <table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Phone</th><th>Total</th><th>Method</th><th>Status</th></tr></thead>
                    <tbody>${rowsHtml}</tbody></table>
                    <script>window.onload = function() { window.print(); window.close(); }</script>
                    </body></html>
                `);
                printWin.document.close();
            }
        } catch (error) {
            console.error('Error generating PDF:', error);
            showNotification('Failed to export sales PDF', 'error');
        } finally {
            showLoading(false);
        }
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    // --- Bulk Action Methods ---

    toggleSaleSelection(saleId, isSelected) {
        if (isSelected) {
            this.selectedSales.add(saleId);
        } else {
            this.selectedSales.delete(saleId);
            const selectAllCheck = document.getElementById('selectAllSales');
            if (selectAllCheck) selectAllCheck.checked = false;
        }
        this.updateBulkActionBar();
        this.renderSalesTable();
    }

    toggleSelectAll(isSelected) {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageSales = this.filteredSales.slice(startIndex, endIndex);

        pageSales.forEach(sale => {
            // Only refunded sales can be selected for deletion
            if (sale.sale_status === 'refunded') {
                if (isSelected) {
                    this.selectedSales.add(sale.id);
                } else {
                    this.selectedSales.delete(sale.id);
                }
            }
        });

        this.updateBulkActionBar();
        this.renderSalesTable();
    }

    updateBulkActionBar() {
        const bar = document.getElementById('bulkActionBar');
        const count = document.getElementById('selectedCount');

        if (this.selectedSales.size > 0) {
            bar.classList.add('active');
            count.textContent = this.selectedSales.size;
        } else {
            bar.classList.remove('active');
            count.textContent = '0';
        }
    }

    clearSelection() {
        this.selectedSales.clear();
        const selectAllCheck = document.getElementById('selectAllSales');
        if (selectAllCheck) selectAllCheck.checked = false;
        this.updateBulkActionBar();
        this.renderSalesTable();
    }

    async handleDelete(saleId) {
        if (!confirm('Delete this refunded sale record? This only removes the record — stock was already restored during refund.')) {
            return;
        }

        showLoading(true);
        try {
            // Delete sale_items first, then the sale record — no stock changes
            await supabaseClient.from('sale_items').delete().eq('sale_id', saleId);

            const { error } = await supabaseClient
                .from('sales').delete().eq('id', saleId).eq('shop_id', this.shopId);
            if (error) throw error;

            if (window.authManager) {
                await window.authManager.createAuditLog('delete', 'sales', saleId, null, { sale_id: saleId, action: 'delete_refunded_record' });
            }

            localStorage.setItem('shopDataChanged', Date.now().toString());
            showNotification('Sale record removed', 'success');
            await this.loadSalesData();
        } catch (error) {
            console.error('Error deleting sale:', error);
            showNotification('Failed to delete: ' + (error.message || error), 'error');
        } finally {
            showLoading(false);
        }
    }

    getRestockMap(saleId) {
        try {
            const raw = localStorage.getItem(`pos_restock_sale_${this.shopId}_${saleId}`);
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }

    saveRestockMap(saleId, map) {
        try { localStorage.setItem(`pos_restock_sale_${this.shopId}_${saleId}`, JSON.stringify(map)); } catch (e) { }
    }

    async openRefundModal(saleId) {
        if (!saleId) return;

        const [saleRes, itemsRes] = await Promise.all([
            supabaseClient.from('sales').select('id, invoice_number, total_amount, payment_method, buyer_name, sale_status').eq('id', saleId).maybeSingle(),
            supabaseClient.from('sale_items').select('id, product_id, product_name, sku, quantity, unit_price, total_price').eq('sale_id', saleId)
        ]);

        if (itemsRes.error) throw itemsRes.error;
        const sale = saleRes.data;
        const items = itemsRes.data || [];

        if (!sale) { showNotification('Sale not found', 'error'); return; }
        if (sale.sale_status === 'refunded') {
            showNotification('This sale has already been restocked', 'warning');
            return;
        }

        const restockMap = this.getRestockMap(sale.id);
        this.currentRefundSale = sale;
        this.currentRefundItems = items.map(item => ({
            ...item,
            done: restockMap[item.id] || 0
        }));

        const modal = document.getElementById('refundModal');
        if (!modal) return;

        document.getElementById('refundInvoice').textContent = sale.invoice_number || 'N/A';
        const customerEl = document.getElementById('refundCustomer');
        customerEl.textContent = sale.buyer_name ? `Customer: ${sale.buyer_name}` : (sale.total_amount ? `Total: ${formatCurrency(sale.total_amount)}` : '');
        this.renderRefundItems();
        this.updateRefundTotal();

        modal.classList.add('active');
    }

    renderRefundItems() {
        const container = document.getElementById('refundItems');
        if (!container) return;

        container.innerHTML = this.currentRefundItems.map(item => {
            const remaining = Math.max(0, item.quantity - (item.done || 0));
            const fullyRestocked = remaining <= 0;
            return `
                <div class="restock-item ${fullyRestocked ? 'restocked' : ''}" data-item-id="${item.id}">
                    <input type="checkbox" class="restock-check" data-item-id="${item.id}" ${fullyRestocked ? 'checked disabled' : ''}>
                    <div class="restock-item-info">
                        <div class="restock-item-name">${item.product_name || 'Product'}</div>
                        <div class="restock-item-meta">
                            ${item.sku ? `<span>${item.sku}</span>` : ''}
                            <span>${formatCurrency(item.unit_price)}</span>
                            <span>Sold: ${item.quantity}${item.done > 0 ? ` · Restocked: ${item.done}` : ''}</span>
                        </div>
                    </div>
                    ${fullyRestocked ?
                        `<span class="restock-fully-badge"><i class="fas fa-check"></i> Restocked</span>` :
                        `<div class="restock-qty-wrap">
                            <label>Qty</label>
                            <input type="number" class="restock-qty" data-item-id="${item.id}" value="${remaining}" min="1" max="${remaining}">
                        </div>`
                    }
                    <div class="restock-item-total" data-item-id="${item.id}">${formatCurrency(0)}</div>
                </div>
            `;
        }).join('');

        const selectAll = document.getElementById('refundSelectAll');
        if (selectAll) {
            const checkboxes = [...container.querySelectorAll('.restock-check:not(:disabled)')];
            selectAll.checked = checkboxes.length > 0 && checkboxes.every(cb => cb.checked);
            selectAll.onchange = () => {
                checkboxes.forEach(cb => cb.checked = selectAll.checked);
                this.updateRefundTotal();
            };
        }

        container.querySelectorAll('.restock-check').forEach(cb => {
            cb.addEventListener('change', () => {
                const qty = container.querySelector(`.restock-qty[data-item-id="${cb.getAttribute('data-item-id')}"]`);
                if (qty) qty.disabled = !cb.checked;
                this.updateRefundTotal();
            });
        });

        container.querySelectorAll('.restock-qty').forEach(input => {
            input.addEventListener('input', () => {
                this.updateRefundTotal();
            });
        });

        this.updateRefundTotal();
    }

    updateRefundTotal() {
        const container = document.getElementById('refundItems');
        if (!container) return;

        let total = 0;
        this.currentRefundItems.forEach(item => {
            const remaining = Math.max(0, item.quantity - (item.done || 0));
            const cb = container.querySelector(`.restock-check[data-item-id="${item.id}"]`);
            const totalEl = container.querySelector(`.restock-item-total[data-item-id="${item.id}"]`);

            let qty = 0;
            if (remaining > 0 && cb && cb.checked) {
                const qtyInput = container.querySelector(`.restock-qty[data-item-id="${item.id}"]`);
                qty = parseInt(qtyInput ? qtyInput.value : '0') || 0;
                if (qty > remaining) qty = remaining;
                if (qty < 1) qty = 0;
            }

            if (totalEl) totalEl.textContent = formatCurrency(qty * item.unit_price);
            total += qty * item.unit_price;
        });

        const totalEl = document.getElementById('refundTotal');
        if (totalEl) totalEl.textContent = formatCurrency(total);
    }

    closeRefundModal() {
        const modal = document.getElementById('refundModal');
        if (modal) modal.classList.remove('active');
        this.currentRefundSale = null;
        this.currentRefundItems = [];
    }

    async confirmRefund() {
        const sale = this.currentRefundSale;
        if (!sale) return;

        const container = document.getElementById('refundItems');
        if (!container) return;

        const selections = [];
        this.currentRefundItems.forEach(item => {
            const remaining = Math.max(0, item.quantity - (item.done || 0));
            if (remaining <= 0) return;
            const cb = container.querySelector(`.restock-check[data-item-id="${item.id}"]`);
            if (!cb || !cb.checked) return;
            const qtyInput = container.querySelector(`.restock-qty[data-item-id="${item.id}"]`);
            let qty = parseInt(qtyInput ? qtyInput.value : '0') || 0;
            if (qty > remaining) qty = remaining;
            if (qty < 1) qty = 0;
            if (qty > 0) selections.push({ item, qty });
        });

        if (selections.length === 0) {
            showNotification('Select at least one item to restock', 'warning');
            return;
        }

        showLoading(true);
        try {
            let refundedTotal = 0;
            for (const sel of selections) {
                const ok = await this.applyRestockToItem(sel.item, sel.qty);
                if (ok) {
                    const map = this.getRestockMap(sale.id);
                    map[sel.item.id] = (map[sel.item.id] || 0) + sel.qty;
                    this.saveRestockMap(sale.id, map);
                    refundedTotal += sel.qty * sel.item.unit_price;
                }
            }

            if (refundedTotal <= 0) {
                showNotification('Could not restock the selected items', 'error');
                return;
            }

            // Mark sale as fully or partially refunded
            const map = this.getRestockMap(sale.id);
            let allDone = true;
            this.currentRefundItems.forEach(item => {
                if ((item.quantity - (map[item.id] || 0)) > 0) allDone = false;
            });
            const newStatus = allDone ? 'refunded' : 'partially_refunded';

            const { error: saleError } = await supabaseClient
                .from('sales').update({ sale_status: newStatus }).eq('id', sale.id);
            if (saleError) throw saleError;

            // If it was a credit sale — reduce the outstanding debt by the refunded amount
            if (sale && sale.payment_method === 'credit') {
                const { data: linkedCredit } = await supabaseClient
                    .from('credits')
                    .select('id, pending_amount')
                    .eq('sale_id', sale.id)
                    .eq('shop_id', this.shopId)
                    .maybeSingle();

                if (linkedCredit) {
                    const newPending = Math.max(0, (parseFloat(linkedCredit.pending_amount) || 0) - refundedTotal);
                    await supabaseClient.from('credits')
                        .update({ pending_amount: newPending, status: newPending <= 0 ? 'completed' : 'pending' })
                        .eq('id', linkedCredit.id);
                } else {
                    // Fallback: match by buyer_name if sale_id link is missing
                    const { data: fallbackCredits } = await supabaseClient
                        .from('credits')
                        .select('id, pending_amount')
                        .eq('shop_id', this.shopId)
                        .eq('buyer_name', sale.buyer_name || '')
                        .gt('pending_amount', 0)
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (fallbackCredits && fallbackCredits.length > 0) {
                        const newPending = Math.max(0, (parseFloat(fallbackCredits[0].pending_amount) || 0) - refundedTotal);
                        await supabaseClient.from('credits')
                            .update({ pending_amount: newPending, status: newPending <= 0 ? 'completed' : 'partial' })
                            .eq('id', fallbackCredits[0].id);
                    }
                }
            }

            if (window.authManager) {
                const summary = selections.map(s => `${s.item.product_name} x${s.qty}`).join(', ');
                await window.authManager.createAuditLog('refund', 'sales', sale.id, null, {
                    sale_id: sale.id,
                    action: 'refund',
                    items: summary,
                    refund_amount: refundedTotal,
                    status: newStatus
                }).catch(e => console.warn('Audit log failed:', e));
            }

            this.closeRefundModal();
            localStorage.setItem('shopDataChanged', Date.now().toString());
            showNotification(`Refunded ${selections.length} item${selections.length > 1 ? 's' : ''} · Restocked · ${formatCurrency(refundedTotal)}`, 'success');
            await this.loadSalesData();

        } catch (error) {
            console.error('Error refunding sale:', error);
            showNotification('Failed to refund sale: ' + (error.message || error), 'error');
        } finally {
            showLoading(false);
        }
    }

    async applyRestockToItem(item, quantity) {
        if (!item || !item.product_id) return false;
        const qty = parseFloat(quantity) || 0;
        if (qty <= 0) return false;

        let isVariant = false;
        let sizeKey = null;

        const sizeMatch = item.product_name ? item.product_name.match(/\(Size (.*?)\)$/) : null;
        if (sizeMatch) sizeKey = sizeMatch[1].trim();

        // Try to find if it's a variant by looking up product_variants
        const { data: variants } = await supabaseClient
            .from('product_variants')
            .select('id, stock, variant_name, attributes')
            .eq('product_id', item.product_id);
        if (variants && variants.length > 0 && item.product_name) {
            const pName = item.product_name.toLowerCase();
            const matchedVariant = variants.find(v => {
                const vName = v.variant_name ? v.variant_name.toLowerCase().trim() : 'null';
                return pName.includes(`- ${vName}`) || pName.includes(`(${vName})`) || pName.includes(vName);
            });

            if (matchedVariant) {
                isVariant = true;

                let updatedAttrs = matchedVariant.attributes || {};
                if (typeof updatedAttrs === 'string') { try { updatedAttrs = JSON.parse(updatedAttrs); } catch(e) { updatedAttrs = {}; } }

                if (sizeKey) {
                    let sizeStock = updatedAttrs.size_stock || {};
                    const currentSizeStock = parseInt(sizeStock[sizeKey] ?? matchedVariant.stock) || 0;
                    sizeStock[sizeKey] = currentSizeStock + qty;
                    updatedAttrs.size_stock = sizeStock;
                }

                await supabaseClient.from('product_variants')
                    .update({
                        stock: (parseFloat(matchedVariant.stock) || 0) + qty,
                        attributes: updatedAttrs
                    })
                    .eq('id', matchedVariant.id);
            }
        }

        // Restock the base product ONLY if it's not a variant (variant sales don't deduct base stock)
        if (!isVariant) {
            const { data: product, error: pError } = await supabaseClient
                .from('products').select('stock, metadata').eq('id', item.product_id).single();

            if (!pError && product) {
                let meta = product.metadata || {};
                if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e) { meta = {}; } }

                if (sizeKey) {
                    let sizeStock = meta.size_stock || {};
                    const currentSizeStock = parseInt(sizeStock[sizeKey] ?? product.stock) || 0;
                    sizeStock[sizeKey] = currentSizeStock + qty;
                    meta.size_stock = sizeStock;
                    if (meta.attributes) meta.attributes.size_stock = sizeStock;
                }

                await supabaseClient.from('products')
                    .update({
                        stock: (parseFloat(product.stock) || 0) + qty,
                        metadata: meta
                    })
                    .eq('id', item.product_id);
            }
        }

        return true;
    }

    async handleBulkDelete() {
        const count = this.selectedSales.size;
        if (count === 0) return;

        if (!confirm(`Delete ${count} refunded sale record${count > 1 ? 's' : ''}? This only removes the records — stock was already restored during refund.`)) {
            return;
        }

        showLoading(true);
        let successCount = 0;
        let failCount = 0;

        try {
            const saleIds = Array.from(this.selectedSales);

            for (const saleId of saleIds) {
                try {
                    // Delete sale_items then sale — no stock changes
                    await supabaseClient.from('sale_items').delete().eq('sale_id', saleId);
                    const { error } = await supabaseClient
                        .from('sales').delete().eq('id', saleId).eq('shop_id', this.shopId);
                    if (error) throw error;
                    successCount++;
                } catch (err) {
                    console.error('Error deleting sale ' + saleId, err);
                    failCount++;
                }
            }

            if (successCount > 0) {
                localStorage.setItem('shopDataChanged', Date.now().toString());
                showNotification(`${successCount} record${successCount > 1 ? 's' : ''} removed`, 'success');
            }
            if (failCount > 0) {
                showNotification(`Failed to delete ${failCount} record${failCount > 1 ? 's' : ''}`, 'error');
            }

            this.selectedSales.clear();
            await this.loadSalesData();

        } catch (error) {
            console.error('Bulk delete error:', error);
            showNotification('An error occurred during bulk deletion.', 'error');
        } finally {
            showLoading(false);
            this.updateBulkActionBar();
        }
    }

    async deleteSaleRecord(saleId) {
        const { data: items, error: itemsError } = await supabaseClient
            .from('sale_items')
            .select('product_id, quantity')
            .eq('sale_id', saleId);

        if (itemsError) throw itemsError;

        if (items && items.length > 0) {
            for (const item of items) {
                if (item.product_id) {
                    const { data: product, error: pError } = await supabaseClient
                        .from('products')
                        .select('stock')
                        .eq('id', item.product_id)
                        .single();

                    if (!pError && product) {
                        const currentStock = parseFloat(product.stock) || 0;
                        const soldQty = parseFloat(item.quantity) || 0;
                        const newStock = currentStock + soldQty;

                        await supabaseClient
                            .from('products')
                            .update({ stock: newStock })
                            .eq('id', item.product_id);
                    }
                }
            }
        }

        await supabaseClient
            .from('sale_items')
            .delete()
            .eq('sale_id', saleId);

        const { error: saleError } = await supabaseClient
            .from('sales')
            .delete()
            .eq('id', saleId)
            .eq('shop_id', this.shopId);

        if (saleError) throw saleError;

        if (window.authManager) {
            await window.authManager.createAuditLog('delete', 'sales', saleId, null, { sale_id: saleId, action: 'bulk_delete' });
        }
    }
}

// Initialize on sales page
if (window.location.pathname.includes('sales.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        new SalesManager();
    });
}
