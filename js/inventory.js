// Inventory Management - FIXED VERSION
class InventoryManager {
    constructor() {
        this.currentUser = null;
        this.shopId = null;
        this.products = [];
        this.categories = [];
        this.selectedProducts = new Set(); // Using Set for efficient selection tracking
        this.businessType = 'general';
        this.productImages = []; // Array of image objects { file: File|null, url: string|null }
        this.typeConfigs = {}; // Global type configurations
        this.selectedBuilderColors = new Set();
        this.selectedBuilderSizes = new Set();
        this.prodColors = new Set();
        this.prodSizes = new Set();
        this.perPage = window.getStoredPerPage ? window.getStoredPerPage('inventory', 50) : 50;
        this.costsRevealed = false;
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

        // Load low stock threshold from shop settings
        try {
            const { data: settings } = await supabaseClient
                .from('shop_settings')
                .select('low_stock_threshold')
                .eq('shop_id', this.shopId)
                .maybeSingle();
            this.lowStockThreshold = settings?.low_stock_threshold || 10;
        } catch (e) {
            this.lowStockThreshold = 10;
        }

        // Setup event listeners
        this.setupEventListeners();

        // Load type configurations
        await this.loadTypeConfigs();

        // Load Business Type
        await this.loadBusinessType();

        // Load inventory data
        await this.loadInventory();

        // Load categories - handle gracefully if table doesn't exist
        await this.loadCategories();
    }

    updateUI() {
        // Update user info
        document.getElementById('userName').textContent = this.currentUser.full_name || this.currentUser.username;
        document.getElementById('userRole').textContent = this.currentUser.role === 'shop_admin' ? 'Shop Admin' : 'Shop Staff';

    }

    setupEventListeners() {
        // Add product button
        const addProductBtn = document.getElementById('addProductBtn');
        if (addProductBtn) {
            addProductBtn.addEventListener('click', () => {
                this.showAddProductModal();
            });
        }

        // Auto-fill "all" size qty fields when base Stock Quantity changes
        const productStockInput = document.getElementById('productStock');
        if (productStockInput) {
            productStockInput.addEventListener('input', () => this.syncAllSizeQtyFields());
            productStockInput.addEventListener('change', () => this.syncAllSizeQtyFields());
        }

        // Export button
        const exportBtn = document.getElementById('exportInventoryBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportInventory();
            });
        }

        // Full Backup Data Export Button
        const exportFullBtn = document.getElementById('exportFullInventoryBtn');
        if (exportFullBtn) {
            exportFullBtn.addEventListener('click', () => {
                this.exportFullInventoryData();
            });
        }

        // Import Inventory Data Button & File Input
        const importBtn = document.getElementById('importInventoryDataBtn');
        const importFileInput = document.getElementById('importInventoryFileInput');
        if (importBtn && importFileInput) {
            importBtn.addEventListener('click', () => {
                importFileInput.click();
            });

            importFileInput.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (file) {
                    this.importInventoryData(file);
                    importFileInput.value = '';
                }
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshInventory');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadInventory();
            });
        }

        // Search input
        const searchInput = document.getElementById('inventorySearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterProducts(e.target.value);
            });
        }

        // Stock filter
        const stockFilter = document.getElementById('stockFilter');
        if (stockFilter) {
            stockFilter.addEventListener('change', (e) => {
                this.filterByStock(e.target.value);
            });
        }

        // Category filter
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.handleCategoryChange(e.target.value);
            });
        }

        // Type filter
        const typeFilter = document.getElementById('typeFilter');
        if (typeFilter) {
            typeFilter.addEventListener('change', () => {
                this.filterProductsCombined();
            });
        }

        const costSortFilter = document.getElementById('costSortFilter');
        if (costSortFilter) {
            costSortFilter.addEventListener('change', () => {
                this.inventoryPage = 1;
                this.renderProducts();
            });
        }

        // Save product button
        const saveProductBtn = document.getElementById('saveProductBtn');
        if (saveProductBtn) {
            saveProductBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.saveProduct();
            });
        }

        // Delete product button
        const deleteProductBtn = document.getElementById('deleteProductBtn');
        if (deleteProductBtn) {
            deleteProductBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.deleteProduct();
            });
        }

        // Reveal/hide all cost prices button
        const toggleAllCostsBtn = document.getElementById('toggleAllCosts');
        if (toggleAllCostsBtn) {
            toggleAllCostsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleAllCostPrices();
            });
            window.toggleAllCostPrices = () => this.toggleAllCostPrices();
            this.syncCostToggleButton();
        }

        // Generate SKU button
        const generateSKUBtn = document.getElementById('generateSKU');
        if (generateSKUBtn) {
            generateSKUBtn.addEventListener('click', () => {
                this.generateSKU(true); // Force generate new variation
            });
        }

        // Generate Description Highlights button
        const generateDescBtn = document.getElementById('generateDescriptionBtn');
        if (generateDescBtn) {
            generateDescBtn.addEventListener('click', () => {
                this.generateProductHighlights();
            });
        }

        // Auto-generate SKU from name
        const productNameInput = document.getElementById('productName');
        const skuInput = document.getElementById('productSKU');

        if (productNameInput) {
            productNameInput.addEventListener('input', (e) => {
                // Always update if not manually touched or empty
                if (!this.isManualSku || !skuInput.value) {
                    this.generateSKU();
                }
            });
        }

        if (skuInput) {
            skuInput.addEventListener('input', () => {
                this.isManualSku = true; // User manually typed, stop auto-generating
            });
        }

        // Cost Price -> auto-suggest Selling Price (+40% markup)
        const costPriceInput = document.getElementById('costPrice');
        const sellingPriceInput = document.getElementById('sellingPrice');
        const clearSellingPriceBtn = document.getElementById('clearSellingPrice');
        if (costPriceInput && sellingPriceInput) {
            const markupPercent = 40;
            const toggleSellingClearBtn = () => {
                if (clearSellingPriceBtn) {
                    clearSellingPriceBtn.classList.toggle('visible', sellingPriceInput.value.trim() !== '');
                }
            };
            this.updateSellingClearBtn = toggleSellingClearBtn;

            const suggestSellingPrice = () => {
                const cost = parseFloat(costPriceInput.value);
                const current = sellingPriceInput.value.trim();
                // Only auto-fill when empty or still showing our last suggestion
                if (!isNaN(cost) && cost > 0) {
                    const suggested = (cost * (1 + markupPercent / 100)).toFixed(2);
                    if (current === '' || current === this._lastSuggestedSellingPrice) {
                        this._lastSuggestedSellingPrice = suggested;
                        sellingPriceInput.value = suggested;
                    }
                } else if (current === this._lastSuggestedSellingPrice) {
                    sellingPriceInput.value = '';
                    this._lastSuggestedSellingPrice = '';
                }
                toggleSellingClearBtn();
            };
            costPriceInput.addEventListener('input', suggestSellingPrice);
            costPriceInput.addEventListener('change', suggestSellingPrice);
            sellingPriceInput.addEventListener('input', () => {
                // User manually changed the price, stop overriding it
                if (sellingPriceInput.value.trim() !== this._lastSuggestedSellingPrice) {
                    this._lastSuggestedSellingPrice = null;
                }
                toggleSellingClearBtn();
            });

            if (clearSellingPriceBtn) {
                clearSellingPriceBtn.addEventListener('click', () => {
                    sellingPriceInput.value = '';
                    this._lastSuggestedSellingPrice = null;
                    toggleSellingClearBtn();
                    sellingPriceInput.focus();
                });
            }
            toggleSellingClearBtn();
        }

        // Multi-Photo Upload handling
        const productImageFile = document.getElementById('productImageFile');
        if (productImageFile) {
            productImageFile.addEventListener('change', (e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                    for (let i = 0; i < files.length; i++) {
                        this.handlePhotoSelection(files[i]);
                    }
                    productImageFile.value = '';
                }
            });
        }

        // Camera file input
        const productCameraFile = document.getElementById('productCameraFile');
        if (productCameraFile) {
            productCameraFile.addEventListener('change', (e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                    this.handlePhotoSelection(files[0]);
                    productCameraFile.value = '';
                }
            });
        }

        // Category change (for dependent Type dropdown + dynamic attributes)
        const productCategoryEl = document.getElementById('productCategory');
        if (productCategoryEl) {
            productCategoryEl.addEventListener('change', (e) => {
                this.updateProductTypes(e.target.value);
                this.renderDynamicFields();
                // Refresh variant preview if variants section is open
                if (document.getElementById('variantsSection')?.style.display !== 'none') {
                    setTimeout(() => this.updateVariantBuilderPreview(), 50);
                }
            });
        }

        // Variants toggle
        const enableVariants = document.getElementById('enableVariants');
        if (enableVariants) {
            enableVariants.addEventListener('change', (e) => {
                const section = document.getElementById('variantsSection');
                if (section) {
                    section.style.display = e.target.checked ? 'block' : 'none';
                    if (e.target.checked) {
                        this.updateVariantBuilderPreview();
                        if (document.getElementById('variantsList').children.length === 0) {
                            // Don't auto-add a row — let the user either generate or add manually
                        }
                    }
                }
            });
        }

        document.querySelectorAll('#addVariantBtn, #addVariantBtnTop, .add-variant-btn-trigger').forEach(btn => {
            btn.addEventListener('click', () => {
                this.addVariantRow();
            });
        });

        const generateCombinationsBtn = document.getElementById('generateCombinationsBtn');
        if (generateCombinationsBtn) {
            generateCombinationsBtn.addEventListener('click', () => {
                this.generateVariantCombinations();
            });
        }

        // Primary Product Color & Size Handlers
        const pColorInput = document.getElementById('prodColorInput');
        const pAddColorBtn = document.getElementById('addProdColorBtn');
        if (pAddColorBtn && pColorInput) {
            const handleAddProdColor = () => {
                const val = pColorInput.value.trim();
                if (val) {
                    this.addProdColor(val);
                    pColorInput.value = '';
                }
            };
            pAddColorBtn.addEventListener('click', handleAddProdColor);
            pColorInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddProdColor();
                }
            });
        }

        document.querySelectorAll('.prod-color-preset').forEach(preset => {
            preset.addEventListener('click', () => {
                this.addProdColor(preset.dataset.val);
            });
        });

        const pSizeInput = document.getElementById('prodSizeInput');
        const pAddSizeBtn = document.getElementById('addProdSizeBtn');
        if (pAddSizeBtn && pSizeInput) {
            const handleAddProdSize = () => {
                const val = pSizeInput.value.trim();
                if (val) {
                    this.addProdSize(val);
                    pSizeInput.value = '';
                }
            };
            pAddSizeBtn.addEventListener('click', handleAddProdSize);
            pSizeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddProdSize();
                }
            });
        }

        document.querySelectorAll('.prod-size-preset').forEach(preset => {
            preset.addEventListener('click', () => {
                this.addProdSize(preset.dataset.val);
            });
        });

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

        // Edit product event delegation
        document.addEventListener('click', (e) => {
            if (e.target.closest('.edit-product-btn')) {
                const btn = e.target.closest('.edit-product-btn');
                const productId = btn.dataset.id;
                this.showEditProductModal(productId);
            }
        });

        // Select All toggle
        const selectAllBtn = document.getElementById('selectAllProducts');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('change', (e) => {
                this.toggleSelectAll(e.target.checked);
            });
        }

        // Bulk Action buttons
        const bulkEditBtn = document.getElementById('bulkEditBtn');
        if (bulkEditBtn) {
            bulkEditBtn.addEventListener('click', () => {
                this.showBulkEditModal();
            });
        }

        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', () => {
                this.handleBulkDelete();
            });
        }

        const cancelSelectionBtn = document.getElementById('cancelSelection');
        if (cancelSelectionBtn) {
            cancelSelectionBtn.addEventListener('click', () => {
                this.clearSelection();
            });
        }

        const applyBulkUpdateBtn = document.getElementById('applyBulkUpdateBtn');
        if (applyBulkUpdateBtn) {
            applyBulkUpdateBtn.addEventListener('click', () => {
                this.applyBulkUpdate();
            });
        }

        // Category change for bulk modal
        const bulkCategory = document.getElementById('bulkCategory');
        if (bulkCategory) {
            bulkCategory.addEventListener('change', (e) => {
                this.updateProductTypes(e.target.value, '', 'bulkType');
            });
        }

        // Delete product event delegation
        document.addEventListener('click', (e) => {
            if (e.target.closest('.delete-product-btn')) {
                const btn = e.target.closest('.delete-product-btn');
                const productId = btn.dataset.id;
                if (confirm('Are you sure you want to delete this product?')) {
                    this.deleteProductById(productId);
                }
            }
        });
    }

    async loadInventory() {
        showLoading(true);

        try {
            // Fetch shop logo first
            const { data: shop } = await supabaseClient
                .from('shops')
                .select('shop_logo')
                .eq('id', this.shopId)
                .single();

            this.shopLogo = shop?.shop_logo || null;

            // Set shop logo as favicon
            if (this.shopLogo) {
                setFavicon(this.shopLogo);
            }

            const { data: products, error } = await supabaseClient
                .from('products')
                .select('*')
                .eq('shop_id', this.shopId)
                .order('product_name');

            if (error) {
                // Handle specific error
                if (error.message.includes('column "category" does not exist')) {

                    this.products = products || [];
                } else {
                    throw error;
                }
            } else {
                this.products = products || [];
            }

            // Add variant stocks to product display totals
            if (this.products.length > 0) {
                const allIds = this.products.map(p => p.id);
                const { data: variantStocks } = await supabaseClient
                    .from('product_variants')
                    .select('product_id, stock, cost_price, price, attributes')
                    .in('product_id', allIds)
                    .eq('is_active', true);

                const stockTotals = {};
                const costTotals  = {};
                const sellTotals  = {};
                const minCost = {}; const maxCost = {};
                const minSell = {}; const maxSell = {};

                const productById = {};
                this.products.forEach(p => { productById[p.id] = p; });

                if (variantStocks && variantStocks.length > 0) {
                    variantStocks.forEach(v => {
                        const parentP = productById[v.product_id];
                        const parentCp = parentP ? (parseFloat(parentP.cost_price) || 0) : 0;
                        const parentSp = parentP ? (parseFloat(parentP.selling_price) || 0) : 0;
                        const vStock = parseInt(v.stock) || 0;
                        const rawVCost = parseFloat(v.cost_price);
                        const vCost  = (!isNaN(rawVCost) && rawVCost > 0) ? rawVCost : parentCp;
                        const rawVSell = parseFloat(v.price);
                        const vSell  = (!isNaN(rawVSell) && rawVSell > 0) ? rawVSell : parentSp;

                        // Check if variant has size stock / prices in attributes
                        let vAttrs = v.attributes || {};
                        if (typeof vAttrs === 'string') { try { vAttrs = JSON.parse(vAttrs); } catch(e) { vAttrs = {}; } }
                        let vSizeStock = vAttrs.size_stock || vAttrs.storage_stock || null;
                        let vSizePrice = vAttrs.size_price || vAttrs.size_prices || null;
                        let vSizeCost  = vAttrs.size_cost || null;

                        if (!vSizeStock) {
                            const vTagKeys = ['storage', 'pack', 'portion', 'volume', 'color', 'shade', 'model', 'edition'];
                            for (const vtk of vTagKeys) {
                                if (vAttrs[vtk+'_stock']) {
                                    vSizeStock = vAttrs[vtk+'_stock'];
                                    vSizePrice = vAttrs[vtk+'_price'] || vAttrs[vtk+'_prices'] || null;
                                    vSizeCost  = vAttrs[vtk+'_cost'] || null;
                                    break;
                                }
                            }
                        }

                        if (typeof vSizeStock === 'string') { try { vSizeStock = JSON.parse(vSizeStock); } catch(e) { vSizeStock = null; } }
                        if (typeof vSizePrice === 'string') { try { vSizePrice = JSON.parse(vSizePrice); } catch(e) { vSizePrice = null; } }
                        if (typeof vSizeCost === 'string') { try { vSizeCost = JSON.parse(vSizeCost); } catch(e) { vSizeCost = null; } }

                        let vSellTotal = 0;
                        let vCostTotal = 0;
                        let vUnitsTracked = 0;

                        if (vSizeStock && typeof vSizeStock === 'object' && Object.keys(vSizeStock).length > 0) {
                            for (const [tag, q] of Object.entries(vSizeStock)) {
                                const qty = parseInt(q) || 0;
                                if (qty <= 0) continue;
                                let effP = vSell;
                                if (vSizePrice && vSizePrice[tag] !== undefined && vSizePrice[tag] !== null && vSizePrice[tag] !== '') {
                                    const sp = parseFloat(vSizePrice[tag]);
                                    if (!isNaN(sp) && sp > 0) effP = sp;
                                }
                                let effC = vCost;
                                if (vSizeCost && vSizeCost[tag] !== undefined && vSizeCost[tag] !== null && vSizeCost[tag] !== '') {
                                    const cp = parseFloat(vSizeCost[tag]);
                                    if (!isNaN(cp) && cp > 0) effC = cp;
                                }
                                vSellTotal += qty * effP;
                                vCostTotal += qty * effC;
                                vUnitsTracked += qty;
                                if (effP > 0) {
                                    minSell[v.product_id] = Math.min(minSell[v.product_id] ?? Infinity, effP);
                                    maxSell[v.product_id] = Math.max(maxSell[v.product_id] ?? 0, effP);
                                }
                                if (effC > 0) {
                                    minCost[v.product_id] = Math.min(minCost[v.product_id] ?? Infinity, effC);
                                    maxCost[v.product_id] = Math.max(maxCost[v.product_id] ?? 0, effC);
                                }
                            }
                            if (vStock > vUnitsTracked) {
                                vSellTotal += (vStock - vUnitsTracked) * vSell;
                                vCostTotal += (vStock - vUnitsTracked) * vCost;
                                if (vSell > 0) {
                                    minSell[v.product_id] = Math.min(minSell[v.product_id] ?? Infinity, vSell);
                                    maxSell[v.product_id] = Math.max(maxSell[v.product_id] ?? 0, vSell);
                                }
                                if (vCost > 0) {
                                    minCost[v.product_id] = Math.min(minCost[v.product_id] ?? Infinity, vCost);
                                    maxCost[v.product_id] = Math.max(maxCost[v.product_id] ?? 0, vCost);
                                }
                            }
                        } else {
                            vSellTotal = vStock * vSell;
                            vCostTotal = vStock * vCost;
                            if (vCost > 0) {
                                minCost[v.product_id] = Math.min(minCost[v.product_id] ?? Infinity, vCost);
                                maxCost[v.product_id] = Math.max(maxCost[v.product_id] ?? 0, vCost);
                            }
                            if (vSell > 0) {
                                minSell[v.product_id] = Math.min(minSell[v.product_id] ?? Infinity, vSell);
                                maxSell[v.product_id] = Math.max(maxSell[v.product_id] ?? 0, vSell);
                            }
                        }

                        stockTotals[v.product_id] = (stockTotals[v.product_id] || 0) + vStock;
                        costTotals[v.product_id]  = (costTotals[v.product_id]  || 0) + vCostTotal;
                        sellTotals[v.product_id]  = (sellTotals[v.product_id]  || 0) + vSellTotal;
                    });
                }

                this.products.forEach(p => {
                    const rawStock = parseInt(p.stock) || 0;
                    p._baseStock = rawStock;
                    if (stockTotals[p.id]) {
                        p.stock = rawStock + stockTotals[p.id];
                    }
                    p._variantCostValue = costTotals[p.id] || 0;
                    p._variantSellValue = sellTotals[p.id] || 0;

                    // Parse base product metadata tag stock/prices (e.g. size_stock, size_price)
                    let meta = p.metadata || {};
                    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e) { meta = {}; } }
                    const attrs = meta.attributes || {};

                    let stockMap = meta.size_stock || attrs.size_stock || null;
                    let priceMap = meta.size_price || attrs.size_price || meta.size_prices || attrs.size_prices || null;
                    let costMap = meta.size_cost || attrs.size_cost || null;

                    if (!stockMap) {
                        const possibleKeys = ['storage', 'pack', 'portion', 'volume', 'color', 'shade'];
                        for (const k of possibleKeys) {
                            if (meta[`${k}_stock`] || attrs[`${k}_stock`]) {
                                stockMap = meta[`${k}_stock`] || attrs[`${k}_stock`];
                                priceMap = meta[`${k}_price`] || attrs[`${k}_price`] || meta[`${k}_prices`] || attrs[`${k}_prices`] || null;
                                costMap = meta[`${k}_cost`] || attrs[`${k}_cost`] || null;
                                break;
                            }
                        }
                    }

                    if (typeof stockMap === 'string') { try { stockMap = JSON.parse(stockMap); } catch(e) { stockMap = null; } }
                    if (typeof priceMap === 'string') { try { priceMap = JSON.parse(priceMap); } catch(e) { priceMap = null; } }
                    if (typeof costMap === 'string') { try { costMap = JSON.parse(costMap); } catch(e) { costMap = null; } }

                    let baseSellTotal = 0;
                    let baseCostTotal = 0;
                    const bCost = parseFloat(p.cost_price) || 0;
                    const bSell = parseFloat(p.selling_price) || 0;
                    let baseMinS = null, baseMaxS = null;
                    let baseMinC = null, baseMaxC = null;

                    if (stockMap && typeof stockMap === 'object' && Object.keys(stockMap).length > 0) {
                        let pTracked = 0;
                        for (const [tag, q] of Object.entries(stockMap)) {
                            const qty = parseInt(q) || 0;
                            if (qty <= 0) continue;
                            let effP = bSell;
                            if (priceMap && priceMap[tag] !== undefined && priceMap[tag] !== null && priceMap[tag] !== '') {
                                const sp = parseFloat(priceMap[tag]);
                                if (!isNaN(sp) && sp > 0) effP = sp;
                            }
                            let effC = bCost;
                            if (costMap && costMap[tag] !== undefined && costMap[tag] !== null && costMap[tag] !== '') {
                                const cp = parseFloat(costMap[tag]);
                                if (!isNaN(cp) && cp > 0) effC = cp;
                            }
                            baseSellTotal += qty * effP;
                            baseCostTotal += qty * effC;
                            pTracked += qty;
                            if (effP > 0) {
                                baseMinS = baseMinS === null ? effP : Math.min(baseMinS, effP);
                                baseMaxS = baseMaxS === null ? effP : Math.max(baseMaxS, effP);
                            }
                            if (effC > 0) {
                                baseMinC = baseMinC === null ? effC : Math.min(baseMinC, effC);
                                baseMaxC = baseMaxC === null ? effC : Math.max(baseMaxC, effC);
                            }
                        }
                        const unallocated = Math.max(0, rawStock - pTracked);
                        if (unallocated > 0) {
                            baseSellTotal += unallocated * bSell;
                            baseCostTotal += unallocated * bCost;
                            if (bSell > 0) {
                                baseMinS = baseMinS === null ? bSell : Math.min(baseMinS, bSell);
                                baseMaxS = baseMaxS === null ? bSell : Math.max(baseMaxS, bSell);
                            }
                            if (bCost > 0) {
                                baseMinC = baseMinC === null ? bCost : Math.min(baseMinC, bCost);
                                baseMaxC = baseMaxC === null ? bCost : Math.max(baseMaxC, bCost);
                            }
                        }
                        p._metaSellValue = baseSellTotal;
                        p._metaCostValue = baseCostTotal;
                        p._unassignedBaseStock = unallocated;
                    } else {
                        baseSellTotal = rawStock * bSell;
                        baseCostTotal = rawStock * bCost;
                        if (bSell > 0) { baseMinS = bSell; baseMaxS = bSell; }
                        if (bCost > 0) { baseMinC = bCost; baseMaxC = bCost; }
                    }

                    p._totalSellValue = baseSellTotal + (p._variantSellValue || 0);
                    p._totalCostValue = baseCostTotal + (p._variantCostValue || 0);

                    // Combine price ranges across base & variants
                    let finalMinS = baseMinS;
                    let finalMaxS = baseMaxS;
                    if (minSell[p.id] !== undefined) {
                        finalMinS = finalMinS === null ? minSell[p.id] : Math.min(finalMinS, minSell[p.id]);
                        finalMaxS = finalMaxS === null ? maxSell[p.id] : Math.max(finalMaxS, maxSell[p.id]);
                    }

                    let finalMinC = baseMinC;
                    let finalMaxC = baseMaxC;
                    if (minCost[p.id] !== undefined) {
                        finalMinC = finalMinC === null ? minCost[p.id] : Math.min(finalMinC, minCost[p.id]);
                        finalMaxC = finalMaxC === null ? maxCost[p.id] : Math.max(finalMaxC, maxCost[p.id]);
                    }

                    p._variantMinSell = finalMinS !== null ? finalMinS : bSell;
                    p._variantMaxSell = finalMaxS !== null ? finalMaxS : bSell;
                    p._variantMinCost = finalMinC !== null ? finalMinC : bCost;
                    p._variantMaxCost = finalMaxC !== null ? finalMaxC : bCost;
                });
            }

            this.populateTypeFilter();
            this.renderProducts();
            this.updateInventoryStats();

        } catch (error) {

            showNotification('Failed to load inventory', 'error');
        } finally {
            showLoading(false);
        }
    }

    async loadCategories() {
        try {
            // Load categories from database (Global + Shop Specific)
            const { data: categories, error } = await supabaseClient
                .from('categories')
                .select('*')
                .or(`shop_id.eq.${this.shopId},shop_id.is.null`)
                .order('category_name');

            if (error) {
                this.categories = this.getDefaultCategories();
            } else {
                this.categories = categories || [];

                // Ensure "Other" is always available as a utility category
                const hasOther = this.categories.some(c => (c.category_name || c) === 'Other');
                if (!hasOther) {
                    this.categories.unshift({ category_name: 'Other' });
                } else {
                    // Move "Other" to the top
                    this.categories = this.categories.filter(c => (c.category_name || c) !== 'Other');
                    this.categories.unshift({ category_name: 'Other' });
                }

                // If no categories exist, add defaults
                if (this.categories.length <= 1) {
                    this.categories = this.getDefaultCategories();
                }
            }

            this.populateCategoryFilter();

        } catch (error) {
            this.categories = this.getDefaultCategories();
            this.populateCategoryFilter();
        }
    }

    async loadTypeConfigs() {
        try {
            const { data } = await supabaseClient
                .from('system_configs')
                .select('key, value')
                .or('key.like.types_%,key.like.metadata_fields_%');

            this.typeConfigs = {};
            this.metadataConfigs = {};

            if (data) {
                data.forEach(config => {
                    if (config.key.startsWith('types_')) {
                        const category = config.key.replace('types_', '');
                        this.typeConfigs[category] = config.value.split(',').map(t => t.trim());
                    } else if (config.key.startsWith('metadata_fields_')) {
                        const category = config.key.replace('metadata_fields_', '');
                        try {
                            this.metadataConfigs[category] = JSON.parse(config.value);
                        } catch (e) {
                            console.error('Failed to parse metadata config', e);
                        }
                    }
                });
            }
        } catch (error) {
            console.warn('Flexible configurations not available, using defaults');
        }
    }

    getDefaultCategories() {
        return [
            { category_name: 'Other' },
            { category_name: 'Service' }
        ];
    }

    populateCategoryFilter() {
        const categoryFilter = document.getElementById('categoryFilter');
        const productCategory = document.getElementById('productCategory');

        if (!categoryFilter || !productCategory) return;

        // For Filter: Clear existing options except the first one (All Categories)
        while (categoryFilter.options.length > 1) {
            categoryFilter.remove(1);
        }

        // For Product Modal: Clear EVERYTHING
        while (productCategory.options.length > 0) {
            productCategory.remove(0);
        }

        // Add category options
        this.categories.forEach(category => {
            const categoryName = category.category_name || category;
            const isShopSpecific = !!category.shop_id;

            // Determine if this category should appear based on business type
            let shouldShowInFilter = false;
            let shouldShowInModal = false;

            if (this.businessType === 'general' || !this.businessType) {
                // General store: show everything
                shouldShowInFilter = true;
                shouldShowInModal = true;
            } else {
                // Specific Business Type (e.g. 'Cloth'):
                // - Show the category matching the business type name
                // - Show shop-specific (custom) categories created by this shop
                // - Show 'Other' and 'Service' as utility categories
                const matchesBusinessType = categoryName.toLowerCase() === this.businessType.toLowerCase();
                const isUtility = categoryName === 'Other' || categoryName === 'Service';

                if (matchesBusinessType || isShopSpecific || isUtility) {
                    shouldShowInFilter = true;
                    shouldShowInModal = true;
                }
            }

            // 1. Add to Filter dropdown
            if (shouldShowInFilter) {
                const option1 = document.createElement('option');
                option1.value = categoryName;
                option1.textContent = categoryName;
                categoryFilter.appendChild(option1);
            }

            // 2. Add to Product Modal dropdown
            if (shouldShowInModal) {
                const option2 = document.createElement('option');
                option2.value = categoryName;
                option2.textContent = categoryName;
                productCategory.appendChild(option2);
            }
        });
    }

    updateProductTypes(category, selectedType = '', targetId = 'productType') {
        const typeSelect = document.getElementById(targetId);
        if (!typeSelect) return;

        // Reset type options
        typeSelect.innerHTML = targetId === 'bulkType' ? '<option value="">No Change</option>' : '<option value="">Select Type</option>';

        if (!category) return;

        // Standardize category name for lookup (handle both lower and sentence case)
        const standardizedCategory = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();

        // Look up types from system_configs (set by Super Admin)
        // Try exact match first, then standardized, then business type match
        let types = this.typeConfigs[category] || this.typeConfigs[standardizedCategory] || [];

        // If no types found for this category AND shop has a specific business type,
        // try loading types configured for the business type category
        if (types.length === 0 && this.businessType && this.businessType !== 'general') {
            const bizTypeStd = this.businessType.charAt(0).toUpperCase() + this.businessType.slice(1).toLowerCase();
            types = this.typeConfigs[this.businessType] || this.typeConfigs[bizTypeStd] || [];
        }

        types.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            if (type === selectedType) option.selected = true;
            typeSelect.appendChild(option);
        });

        // Add 'Other' if not present and category selected
        if (category && !types.includes('Other')) {
            const otherOption = document.createElement('option');
            otherOption.value = 'Other';
            otherOption.textContent = 'Other';
            if ('Other' === selectedType) otherOption.selected = true;
            typeSelect.appendChild(otherOption);
        }
    }

    getInventoryFilterState() {
        return {
            searchTerm: (document.getElementById('inventorySearch')?.value || '').toLowerCase().trim(),
            stockFilter: document.getElementById('stockFilter')?.value || 'all',
            categoryFilter: document.getElementById('categoryFilter')?.value || '',
            typeFilter: document.getElementById('typeFilter')?.value || '',
            costSort: document.getElementById('costSortFilter')?.value || 'default'
        };
    }

    hasActiveInventoryFilter(state = this.getInventoryFilterState()) {
        return !!(state.searchTerm || (state.stockFilter && state.stockFilter !== 'all') || state.categoryFilter || state.typeFilter);
    }

    applyInventoryFilters(products = this.products) {
        const state = this.getInventoryFilterState();

        let filtered = (products || []).filter(product => {
            const name = (product.product_name || '').toLowerCase();
            const sku = (product.sku || '').toLowerCase();
            const description = (product.description || '').toLowerCase();
            const matchesSearch = !state.searchTerm ||
                name.includes(state.searchTerm) ||
                sku.includes(state.searchTerm) ||
                description.includes(state.searchTerm);

            let matchesStock = true;
            if (state.stockFilter === 'low') matchesStock = product.stock > 0 && product.stock < this.lowStockThreshold;
            else if (state.stockFilter === 'out') matchesStock = product.stock < 1;
            else if (state.stockFilter === 'in') matchesStock = product.stock >= this.lowStockThreshold;

            const matchesCategory = !state.categoryFilter || product.category === state.categoryFilter;
            const matchesType = !state.typeFilter || product.type === state.typeFilter;

            return matchesSearch && matchesStock && matchesCategory && matchesType;
        });

        if (state.costSort && state.costSort !== 'default') {
            filtered = [...filtered].sort((a, b) => {
                const hasVariantsA = (a._variantCostValue > 0 || a._variantSellValue > 0 || a._metaSellValue !== undefined);
                const hasVariantsB = (b._variantCostValue > 0 || b._variantSellValue > 0 || b._metaSellValue !== undefined);

                const totalCostA = a._totalCostValue !== undefined ? a._totalCostValue : ((parseInt(a.stock) || 0) * (parseFloat(a.cost_price) || 0));
                const totalCostB = b._totalCostValue !== undefined ? b._totalCostValue : ((parseInt(b.stock) || 0) * (parseFloat(b.cost_price) || 0));
                const totalSellA = a._totalSellValue !== undefined ? a._totalSellValue : ((parseInt(a.stock) || 0) * (parseFloat(a.selling_price) || 0));
                const totalSellB = b._totalSellValue !== undefined ? b._totalSellValue : ((parseInt(b.stock) || 0) * (parseFloat(b.selling_price) || 0));

                const cpA = hasVariantsA
                    ? (a._variantMinCost !== undefined ? a._variantMinCost : (parseFloat(a.cost_price) || 0))
                    : (parseFloat(a.cost_price) || 0);
                const cpB = hasVariantsB
                    ? (b._variantMinCost !== undefined ? b._variantMinCost : (parseFloat(b.cost_price) || 0))
                    : (parseFloat(b.cost_price) || 0);

                const spA = hasVariantsA
                    ? (a._variantMinSell !== undefined ? a._variantMinSell : (parseFloat(a.selling_price) || 0))
                    : (parseFloat(a.selling_price) || 0);
                const spB = hasVariantsB
                    ? (b._variantMinSell !== undefined ? b._variantMinSell : (parseFloat(b.selling_price) || 0))
                    : (parseFloat(b.selling_price) || 0);

                const profitA = getProfitLoss(cpA, spA).percent;
                const profitB = getProfitLoss(cpB, spB).percent;

                if (state.costSort === 'cost_asc') return cpA - cpB || spA - spB;
                if (state.costSort === 'cost_desc') return cpB - cpA || spB - spA;
                if (state.costSort === 'sell_asc') return spA - spB || cpA - cpB;
                if (state.costSort === 'sell_desc') return spB - spA || cpB - cpA;
                if (state.costSort === 'profit_asc') return profitA - profitB || cpA - cpB;
                if (state.costSort === 'profit_desc') return profitB - profitA || cpB - cpA;
                return 0;
            });
        }

        return filtered;
    }

    renderProducts() {
        const tableBody = document.getElementById('inventoryTable');
        if (!tableBody) return;

        if (this.products.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="11" class="text-center">
                        <div class="empty-state">
                            <i class="fas fa-box-open fa-2x"></i>
                            <p>No products found</p>
                            <small>Click "Add Product" to get started</small>
                        </div>
                    </td>
                </tr>
            `;
            this.renderInventoryPagination(0);
            return;
        }

        // Always honour the active search/filters so re-renders (save, delete,
        // bulk edit, per-page change) never fall back to the full list
        const activeList = this.applyInventoryFilters();
        this.filteredProducts = activeList;

        if (activeList.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="11" class="text-center">
                        <div class="empty-state">
                            <i class="fas fa-search fa-2x"></i>
                            <p>No products found</p>
                            <small>Try a different filter</small>
                        </div>
                    </td>
                </tr>
            `;
            this.renderInventoryPagination(0);
            this.bindRowCheckboxes();
            return;
        }

        // Pagination
        const perPage = this.perPage || 50;
        this.inventoryPage = this.inventoryPage || 1;
        const totalProducts = activeList.length;
        const totalPages = Math.ceil(totalProducts / perPage) || 1;
        if (this.inventoryPage > totalPages) this.inventoryPage = totalPages;
        const start = (this.inventoryPage - 1) * perPage;
        const pageProducts = activeList.slice(start, start + perPage);

        const productRows = pageProducts.map(product => {
            const hasVariants = (product._variantCostValue > 0 || product._variantSellValue > 0 || product._metaSellValue !== undefined);

            // Cost price display
            let costDisplay, sellDisplay, marginDisplay;
            let totalCostVal = product._totalCostValue !== undefined ? product._totalCostValue : ((parseInt(product.stock) || 0) * (parseFloat(product.cost_price) || 0));
            let totalSellVal = product._totalSellValue !== undefined ? product._totalSellValue : ((parseInt(product.stock) || 0) * (parseFloat(product.selling_price) || 0));

            if (hasVariants) {
                const minC = product._variantMinCost !== undefined ? product._variantMinCost : (parseFloat(product.cost_price) || 0);
                const maxC = product._variantMaxCost !== undefined ? product._variantMaxCost : (parseFloat(product.cost_price) || 0);
                const minS = product._variantMinSell !== undefined ? product._variantMinSell : (parseFloat(product.selling_price) || 0);
                const maxS = product._variantMaxSell !== undefined ? product._variantMaxSell : (parseFloat(product.selling_price) || 0);
                costDisplay = minC === maxC
                    ? formatCurrency(minC)
                    : `${formatCurrency(minC)} – ${formatCurrency(maxC)}`;
                sellDisplay = minS === maxS
                    ? formatCurrency(minS)
                    : `${formatCurrency(minS)} – ${formatCurrency(maxS)}`;
                marginDisplay = formatProfitLossPercent(totalCostVal, totalSellVal);
            } else {
                const cp = parseFloat(product.cost_price) || 0;
                const sp = parseFloat(product.selling_price) || 0;
                costDisplay = formatCurrency(cp);
                sellDisplay = formatCurrency(sp);
                marginDisplay = formatProfitLossPercent(cp, sp);
            }

            const profitMarginNum = hasVariants
                ? getProfitLoss(totalCostVal, totalSellVal).percent
                : getProfitLoss(product.cost_price, product.selling_price).percent;

            let status = 'success';
            let statusText = `In Stock (${product.stock})`;

            if (product.stock < 1) {
                status = 'danger';
                statusText = 'Out of Stock';
            } else if (product.stock < this.lowStockThreshold) {
                status = 'warning';
                statusText = `Low Stock (${product.stock})`;
            }

            // Get category
            let category = 'Uncategorized';
            if (typeof product.category === 'string') {
                category = product.category;
            } else if (product.category && product.category.category_name) {
                category = product.category.category_name;
            }

            const isHidden = product.show_in_store === false;

            return `
                <tr class="${this.selectedProducts.has(product.id) ? 'selected-row' : ''}" 
                    data-product-id="${product.id}"
                    style="cursor:pointer;"
                    title="Click for product details">
                    <td>
                        <input type="checkbox" class="product-checkbox" data-id="${product.id}" 
                               ${this.selectedProducts.has(product.id) ? 'checked' : ''}>
                    </td>
                    <td>
                        <div class="product-info-wrapper">
                            <img src="${product.product_image || this.shopLogo || 'https://via.placeholder.com/150?text=No+Image'}" 
                                 class="product-img-inventory" 
                                 alt="${product.product_name}">
                            <div class="product-info">
                                <strong class="inv-product-name" title="${product.product_name}">${product.product_name}</strong>
                                ${isHidden ? '<small style="color: #e74c3c;" title="Hidden from store"><i class="fas fa-eye-slash"></i></small>' : ''}
                            </div>
                        </div>
                    </td>
                    <td>${product.sku}</td>
                    <td>${category}</td>
                    <td>${product.type || 'N/A'}</td>
                    <td>
                        <span class="stock-badge ${status}">
                            ${product.stock}
                        </span>
                    </td>
                    <td><span class="cost-spoiler${this.costsRevealed ? ' revealed' : ''}" onclick="event.stopPropagation(); this.classList.toggle('revealed'); window.inventoryManager.syncCostToggleButton();" title="Click to reveal cost price">${costDisplay}</span></td>
                    <td>${sellDisplay}</td>
                    <td>
                        <span class="profit-badge ${profitMarginNum >= 0 ? 'positive' : 'negative'}">
                            ${marginDisplay}${hasVariants ? ' <small style="opacity:0.6;font-size:0.7em;">(avg)</small>' : ''}
                        </span>
                    </td>
                    <td>
                        <span class="status-badge ${status}">
                            ${statusText}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-sm btn-primary edit-product-btn" data-id="${product.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            ${this.currentUser.role === 'shop_admin' ? `
                            <button class="btn btn-sm btn-danger delete-product-btn" data-id="${product.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Update the table
        tableBody.innerHTML = productRows;

        // Render pagination
        this.renderInventoryPagination(totalProducts);

        // Re-bind row checkbox events
        this.bindRowCheckboxes();
    }

    renderInventoryPagination(totalProducts) {
        let paginationEl = document.getElementById('inventoryPagination');
        if (!paginationEl) {
            paginationEl = document.createElement('div');
            paginationEl.id = 'inventoryPagination';
            const tableContainer = document.querySelector('.table-container');
            if (tableContainer) tableContainer.after(paginationEl);
        }

        const perPage = this.perPage || 50;
        const totalPages = Math.ceil(totalProducts / perPage) || 1;
        const currentPage = this.inventoryPage || 1;
        const perPageHtml = window.renderPerPageControlHTML ? window.renderPerPageControlHTML('inventory', perPage) : '';

        paginationEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:white;border:1px solid #e2e8f0;border-radius:10px;margin-top:12px;flex-wrap:wrap;gap:10px;">
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                    <span style="font-size:0.8rem;color:#64748b;">Showing ${totalProducts > 0 ? (currentPage-1)*perPage+1 : 0}-${Math.min(currentPage*perPage, totalProducts)} of ${totalProducts}</span>
                    ${perPageHtml}
                </div>
                <div style="display:flex;gap:4px;align-items:center;">
                    <button onclick="window.inventoryManager.inventoryPage=1;window.inventoryManager.renderProducts();" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-left"></i></button>
                    <button onclick="window.inventoryManager.inventoryPage--;window.inventoryManager.renderProducts();" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-left"></i></button>
                    <span style="padding:6px 12px;background:var(--primary);color:white;border-radius:6px;font-size:0.75rem;font-weight:700;">${currentPage} / ${totalPages}</span>
                    <button onclick="window.inventoryManager.inventoryPage++;window.inventoryManager.renderProducts();" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-right"></i></button>
                    <button onclick="window.inventoryManager.inventoryPage=${totalPages};window.inventoryManager.renderProducts();" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-right"></i></button>
                </div>
            </div>
        `;

        const selectEl = paginationEl.querySelector('#perPageSelect_inventory');
        const customInputEl = paginationEl.querySelector('#perPageCustomInput_inventory');

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
                        this.perPage = num;
                        if (window.saveStoredPerPage) window.saveStoredPerPage('inventory', num);
                        this.inventoryPage = 1;
                        this.renderProducts();
                    }
                }
            });
        }

        if (customInputEl) {
            const handleCustom = (e) => {
                const num = parseInt(e.target.value);
                if (!isNaN(num) && num > 0) {
                    this.perPage = num;
                    if (window.saveStoredPerPage) window.saveStoredPerPage('inventory', num);
                    this.inventoryPage = 1;
                    this.renderProducts();
                }
            };
            customInputEl.addEventListener('change', handleCustom);
            customInputEl.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleCustom(e); });
        }
    }

    bindRowCheckboxes() {
        const checkboxes = document.querySelectorAll('.product-checkbox');
        checkboxes.forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                if (e.target.checked) {
                    this.selectedProducts.add(id);
                } else {
                    this.selectedProducts.delete(id);
                }
                this.updateBulkActionBar();

                // Update row highlight
                const row = e.target.closest('tr');
                if (row) row.classList.toggle('selected-row', e.target.checked);

                // Update Select All state
                const selectAll = document.getElementById('selectAllProducts');
                if (selectAll) {
                    const activeCount = this.getActiveList().length;
                    selectAll.checked = this.selectedProducts.size === activeCount && activeCount > 0;
                }
            });
        });
    }

    getActiveList() {
        return this.filteredProducts || this.products || [];
    }

    getCostSpoilers() {
        return Array.from(document.querySelectorAll('.cost-spoiler'));
    }

    syncCostToggleButton() {
        const btn = document.getElementById('toggleAllCosts');
        if (!btn) return;

        const spoilers = this.getCostSpoilers();
        if (spoilers.length === 0) {
            btn.classList.remove('active');
            return;
        }
        const allRevealed = spoilers.every(el => el.classList.contains('revealed'));

        // Keep the persisted intent unless every single spoiler was hidden again
        this.costsRevealed = allRevealed;

        const icon = btn.querySelector('i');
        const label = btn.querySelector('.cost-toggle-label');
        if (icon) icon.className = allRevealed ? 'fas fa-eye' : 'fas fa-eye-slash';
        if (label) label.textContent = allRevealed ? 'Hide Costs' : 'Show Costs';
        btn.classList.toggle('active', allRevealed);
        btn.title = allRevealed ? 'Hide all cost prices' : 'Reveal all cost prices at once';
    }

    setAllCostPricesRevealed(revealed) {
        this.costsRevealed = !!revealed;
        this.getCostSpoilers().forEach(el => el.classList.toggle('revealed', this.costsRevealed));
        this.syncCostToggleButton();
    }

    toggleAllCostPrices() {
        const spoilers = this.getCostSpoilers();
        const allRevealed = spoilers.length > 0 && spoilers.every(el => el.classList.contains('revealed'));
        this.setAllCostPricesRevealed(!allRevealed);
    }

    toggleSelectAll(checked) {
        if (checked) {
            this.getActiveList().forEach(p => this.selectedProducts.add(p.id));
        } else {
            this.selectedProducts.clear();
        }
        this.renderProducts();
        this.updateBulkActionBar();
    }

    clearSelection() {
        this.selectedProducts.clear();
        const selectAll = document.getElementById('selectAllProducts');
        if (selectAll) selectAll.checked = false;
        this.renderProducts();
        this.updateBulkActionBar();
    }

    updateBulkActionBar() {
        const bar = document.getElementById('bulkActionBar');
        const count = document.getElementById('selectedCount');
        if (!bar || !count) return;

        if (this.selectedProducts.size > 0) {
            count.textContent = this.selectedProducts.size;
            bar.classList.add('active');
        } else {
            bar.classList.remove('active');
        }
    }

    async showBulkEditModal() {
        const modal = document.getElementById('bulkEditModal');
        const count = document.getElementById('bulkEditCount');
        const form = document.getElementById('bulkEditForm');

        if (!modal || !form) return;

        count.textContent = this.selectedProducts.size;
        form.reset();

        const bulkCat = document.getElementById('bulkCategory');
        if (bulkCat) {
            bulkCat.innerHTML = '<option value="">No Change</option>';
            this.categories.forEach(cat => {
                const name = cat.category_name || cat;
                const isShopSpecific = !!cat.shop_id;

                let shouldShow = false;

                if (this.businessType === 'general' || !this.businessType) {
                    shouldShow = true;
                } else {
                    // Specific Business Type: show matching, shop-specific, and utility categories
                    const matchesBusinessType = name.toLowerCase() === this.businessType.toLowerCase();
                    const isUtility = name === 'Other' || name === 'Service';

                    if (matchesBusinessType || isShopSpecific || isUtility) {
                        shouldShow = true;
                    }
                }

                if (shouldShow) {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    bulkCat.appendChild(opt);
                }
            });
        }

        // Render dynamic metadata fields based on current category
        this.renderBulkDynamicFields();

        // Add event listener for category change to update dynamic fields
        const bulkCatSelect = document.getElementById('bulkCategory');
        if (bulkCatSelect) {
            bulkCatSelect.removeEventListener('change', this.handleBulkCategoryChange);
            this.handleBulkCategoryChange = () => {
                this.updateProductTypes(bulkCatSelect.value, '', 'bulkType');
                this.renderBulkDynamicFields();
            };
            bulkCatSelect.addEventListener('change', this.handleBulkCategoryChange);
        }

        modal.classList.add('active');
    }

    renderBulkDynamicFields() {
        const container = document.getElementById('bulkDynamicFields');
        if (!container) return;

        container.innerHTML = '';
        let fields = [];

        // Get current category from bulk edit form
        const categoryElem = document.getElementById('bulkCategory');
        const selectedCategory = categoryElem ? categoryElem.value : null;

        if (!selectedCategory) {
            container.style.display = 'none';
            return;
        }

        // Priority 1: Use custom metadata fields from system_configs
        if (this.metadataConfigs && this.metadataConfigs[selectedCategory]) {
            fields = this.metadataConfigs[selectedCategory];
        }

        if (fields.length > 0) {
            let row;
            fields.forEach((field, index) => {
                // Start a new row every 2 fields
                if (index % 2 === 0) {
                    row = document.createElement('div');
                    row.className = 'form-row';
                    container.appendChild(row);
                }

                const group = document.createElement('div');
                group.className = 'form-group';

                const label = document.createElement('label');

                // Add appropriate icon based on label/type
                let iconClass = 'fas fa-info-circle';
                const labelLower = field.label.toLowerCase();
                if (labelLower.includes('date') || labelLower.includes('expiry')) iconClass = 'fas fa-calendar-alt';
                else if (labelLower.includes('time')) iconClass = 'fas fa-clock';
                else if (labelLower.includes('weight') || labelLower.includes('unit') || labelLower.includes('volume')) iconClass = 'fas fa-weight';
                else if (labelLower.includes('size')) iconClass = 'fas fa-tag';
                else if (labelLower.includes('material')) iconClass = 'fas fa-layer-group';
                else if (labelLower.includes('color')) iconClass = 'fas fa-palette';
                else if (labelLower.includes('brand')) iconClass = 'fas fa-trademark';
                else if (labelLower.includes('warranty') || labelLower.includes('expiry')) iconClass = 'fas fa-shield-alt';
                else if (labelLower.includes('veg')) iconClass = 'fas fa-leaf';

                label.innerHTML = `<i class="${iconClass}"></i> ${field.label}`;
                group.appendChild(label);

                let input;
                if (field.type === 'select') {
                    input = document.createElement('select');
                    // Add empty/placeholder option
                    const placeholder = document.createElement('option');
                    placeholder.value = '';
                    placeholder.textContent = 'No Change';
                    input.appendChild(placeholder);

                    const options = Array.isArray(field.options) ? field.options : [];
                    options.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt;
                        option.textContent = opt;
                        input.appendChild(option);
                    });
                } else {
                    input = document.createElement('input');
                    input.type = field.type;
                    input.placeholder = 'Leave for no change';
                }
                input.id = 'bulk_dyn_' + (field.id || field.label.toLowerCase().replace(/\s+/g, '_'));
                input.className = 'bulk-dynamic-field-input';
                group.appendChild(input);
                row.appendChild(group);
            });
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    }

    async applyBulkUpdate() {
        const selectedIds = Array.from(this.selectedProducts);
        if (selectedIds.length === 0) return;

        const category = document.getElementById('bulkCategory').value;
        const type = document.getElementById('bulkType').value;
        const costPriceInput = document.getElementById('bulkCostPrice').value;
        const sellingPriceInput = document.getElementById('bulkSellingPrice').value;
        const description = document.getElementById('bulkDescription').value.trim();
        const lowStockAlertInput = document.getElementById('bulkLowStockAlert').value;
        const priorityInput = document.getElementById('bulkPriority').value;
        const showInStore = document.getElementById('bulkShowInStore').value;

        const stockValueInput = document.getElementById('bulkStockValue').value;
        const stockAction = document.getElementById('stockAction').value;

        // Get dynamic metadata field values
        const metadataValues = {};
        let hasMetadataChanges = false;
        document.querySelectorAll('.bulk-dynamic-field-input').forEach(input => {
            if (input.value && input.value !== '') {
                const id = input.id.replace('bulk_dyn_', '');
                metadataValues[id] = input.value;
                hasMetadataChanges = true;
            }
        });

        // Build update object only with changed fields
        const updates = {};
        if (category) updates.category = category;
        if (type && type !== 'No Change') updates.type = type;
        if (costPriceInput !== '') updates.cost_price = parseFloat(costPriceInput);
        if (sellingPriceInput !== '') updates.selling_price = parseFloat(sellingPriceInput);
        if (description) updates.description = description;
        if (lowStockAlertInput !== '') updates.low_stock_alert = parseInt(lowStockAlertInput);
        if (priorityInput !== '') updates.priority = parseInt(priorityInput);
        if (showInStore !== '') updates.show_in_store = showInStore === 'true';
        updates.updated_at = new Date().toISOString();

        showLoading(true);
        let successCount = 0;

        try {
            // Process updates
            for (const id of selectedIds) {
                const currentProduct = this.products.find(p => p.id === id);
                const finalUpdates = { ...updates };

                // Handle Stock Adjustment
                if (stockValueInput !== '') {
                    const stockValue = parseFloat(stockValueInput);
                    if (stockAction === 'set') {
                        finalUpdates.stock = stockValue;
                    } else if (stockAction === 'add') {
                        finalUpdates.stock = (currentProduct.stock || 0) + stockValue;
                    } else if (stockAction === 'sub') {
                        finalUpdates.stock = Math.max(0, (currentProduct.stock || 0) - stockValue);
                    }
                }

                // Handle Metadata Merge
                if (hasMetadataChanges) {
                    const currentMeta = typeof currentProduct.metadata === 'string'
                        ? JSON.parse(currentProduct.metadata || '{}')
                        : (currentProduct.metadata || {});

                    finalUpdates.metadata = { ...currentMeta, ...metadataValues };
                }

                if (Object.keys(finalUpdates).length > 1) { // More than just updated_at
                    const { error } = await supabaseClient
                        .from('products')
                        .update(finalUpdates)
                        .eq('id', id);

                    if (!error) successCount++;
                }
            }

            showNotification(`Updated ${successCount} products successfully`, 'success');
            await this.loadInventory();
            this.clearSelection();
            document.getElementById('bulkEditModal').classList.remove('active');

            // Audit logging
            if (window.authManager) {
                await window.authManager.createAuditLog('bulk_update', 'products', null, null, {
                    count: successCount,
                    fields: Object.keys(updates)
                });
            }

        } catch (error) {

            showNotification('Failed to apply bulk updates', 'error');
        } finally {
            showLoading(false);
        }
    }

    async handleBulkDelete() {
        const count = this.selectedProducts.size;
        if (count === 0) return;

        if (!confirm(`Are you sure you want to delete ${count} selected products? This action cannot be undone.`)) {
            return;
        }

        showLoading(true);
        const selectedIds = Array.from(this.selectedProducts);

        try {
            const { error } = await supabaseClient
                .from('products')
                .delete()
                .in('id', selectedIds);

            if (error) throw error;

            showNotification(`Deleted ${count} products`, 'success');
            await this.loadInventory();
            this.clearSelection();

            // Audit Log
            if (window.authManager) {
                await window.authManager.createAuditLog('bulk_delete', 'products', null, null, {
                    count: count,
                    product_ids: selectedIds
                });
            }

        } catch (error) {

            showNotification('Failed to delete products', 'error');
        } finally {
            showLoading(false);
        }
    }

    updateInventoryStats() {
        const totalProducts = this.products.length;
        const lowStockCount = this.products.filter(p => p.stock > 0 && p.stock < this.lowStockThreshold).length;
        const outOfStockCount = this.products.filter(p => p.stock < 1).length;
        const inStockCount = totalProducts - outOfStockCount;

        // Total stock units (product.stock already has base + variant stocks merged)
        const totalStockCount = this.products.reduce((sum, p) => sum + (parseInt(p.stock) || 0), 0);

        // Calculate inventory value + sell value
        let inventoryValue = 0;
        let inventorySellValue = 0;
        this.products.forEach(p => {
            if (p._totalCostValue !== undefined) {
                inventoryValue     += p._totalCostValue;
                inventorySellValue += p._totalSellValue;
            } else if (p._metaSellValue !== undefined) {
                inventorySellValue += p._metaSellValue;
                inventoryValue     += (p._metaCostValue !== undefined ? p._metaCostValue : (parseInt(p.stock) || 0) * (parseFloat(p.cost_price) || 0));
            } else {
                const baseStock = parseInt(p._baseStock !== undefined ? p._baseStock : p.stock) || 0;
                const baseCost  = parseFloat(p.cost_price) || 0;
                const baseSell  = parseFloat(p.selling_price) || 0;
                inventoryValue     += baseStock * baseCost;
                inventorySellValue += baseStock * baseSell;
                if (p._variantCostValue)  inventoryValue     += p._variantCostValue;
                if (p._variantSellValue)  inventorySellValue += p._variantSellValue;
            }
        });

        const potentialProfit = inventorySellValue - inventoryValue;
        const avgCost = totalStockCount > 0 ? inventoryValue / totalStockCount : 0;
        const avgSell = totalStockCount > 0 ? inventorySellValue / totalStockCount : 0;

        // Helper to set breakdown
        const setBreakdown = (id, rows) => {
            const el = document.getElementById(id);
            if (el) el.closest('.stat-card')?.setAttribute('data-breakdown', JSON.stringify(rows));
        };

        // Update display + attach breakdowns
        document.getElementById('totalProducts').textContent = totalProducts;
        setBreakdown('totalProducts', [
            { label: 'Unique products', value: totalProducts },
            { label: 'Total units in stock', value: totalStockCount },
            { label: 'In stock products', value: inStockCount },
            { label: 'Out of stock products', value: outOfStockCount },
            { label: 'Low stock products', value: lowStockCount },
            { label: '─────────────', value: '' },
            { label: 'Inventory cost value', value: formatCurrency(inventoryValue) },
            { label: 'Inventory sell value', value: formatCurrency(inventorySellValue) },
        ]);

        document.getElementById('lowStockCount').textContent = lowStockCount;
        setBreakdown('lowStockCount', [
            { label: 'Low stock products', value: lowStockCount },
            { label: 'Low stock threshold', value: this.lowStockThreshold + ' units' },
            { label: 'Out of stock products', value: outOfStockCount },
            { label: 'In stock (healthy)', value: inStockCount - lowStockCount },
            { label: 'Total products', value: totalProducts },
        ]);

        document.getElementById('outOfStockCount').textContent = outOfStockCount;
        setBreakdown('outOfStockCount', [
            { label: 'Out of stock products', value: outOfStockCount },
            { label: 'In stock products', value: inStockCount },
            { label: 'Total products', value: totalProducts },
            { label: '─────────────', value: '' },
            { label: 'Remaining units', value: totalStockCount },
            { label: 'Remaining cost value', value: formatCurrency(inventoryValue) },
            { label: 'Remaining sell value', value: formatCurrency(inventorySellValue) },
        ]);

        document.getElementById('inventoryValue').textContent = formatCurrency(inventoryValue);
        setBreakdown('inventoryValue', [
            { label: 'Unique products', value: totalProducts },
            { label: 'Total units in stock', value: totalStockCount },
            { label: '─────────────', value: '' },
            { label: 'Inventory cost value', value: formatCurrency(inventoryValue) },
            { label: 'Inventory sell value', value: formatCurrency(inventorySellValue) },
            { label: 'Potential profit', value: formatCurrency(potentialProfit) },
            { label: 'Avg cost per unit', value: avgCost > 0 ? formatCurrency(avgCost) : '—' },
            { label: 'Avg sell per unit', value: avgSell > 0 ? formatCurrency(avgSell) : '—' },
        ]);

        const stockCountEl = document.getElementById('totalStockCount');
        if (stockCountEl) stockCountEl.textContent = totalStockCount.toLocaleString();
    }

    showAddProductModal() {
        // Reset form
        document.getElementById('modalTitle').textContent = 'Add New Product';
        document.getElementById('productForm').reset();
        document.getElementById('productId').value = '';
        document.getElementById('deleteProductBtn').style.display = 'none';

        // Set default values
        document.getElementById('productStock').value = '0';
        document.getElementById('lowStockAlert').value = this.lowStockThreshold || '10';

        // Default category: Use the business type category if shop has a specific type
        let defaultCategory = 'Other';
        if (this.businessType && this.businessType !== 'general') {
            const options = Array.from(document.getElementById('productCategory').options).map(o => o.value);
            const match = options.find(opt => opt.toLowerCase() === this.businessType.toLowerCase());
            if (match) {
                defaultCategory = match;
            }
        }

        document.getElementById('productCategory').value = defaultCategory;
        document.getElementById('productPriority').value = 1000;

        // Reset selling-price suggestion tracking
        this._lastSuggestedSellingPrice = '';
        if (this.updateSellingClearBtn) this.updateSellingClearBtn();

        // Default: new products are hidden from customers until enabled
        const showInStoreCheckbox = document.getElementById('showInStore');
        if (showInStoreCheckbox) showInStoreCheckbox.checked = false;

        // Load product types for the selected category (respects business type)
        this.updateProductTypes(defaultCategory);

        // Render dynamic fields
        this.renderDynamicFields();

        this.generateSKU();

        // Reset photos
        this.clearPhotos();
        this.isManualSku = false;

        // Reset variants
        this.resetVariants();
        // Show variants option for new products
        const enableVariantsCheckbox = document.getElementById('enableVariants');
        if (enableVariantsCheckbox) {
            enableVariantsCheckbox.parentElement.parentElement.style.display = '';
            enableVariantsCheckbox.disabled = false;
        }

        // Show modal
        document.getElementById('productModal').classList.add('active');
    }

    addVariantRow(data = {}) {
        const container = document.getElementById('variantsList');
        if (!container) return;

        // Get dynamic fields for current category
        const categoryElem = document.getElementById('productCategory');
        const selectedCategory = categoryElem ? categoryElem.value : null;
        let dynamicFields = [];
        if (selectedCategory && this.metadataConfigs && this.metadataConfigs[selectedCategory]) {
            dynamicFields = this.metadataConfigs[selectedCategory];
        }

        // Get base product values for placeholders
        const baseCost = document.getElementById('costPrice')?.value || '';
        const basePrice = document.getElementById('sellingPrice')?.value || '';
        const baseStock = document.getElementById('productStock')?.value || '0';
        const baseDynamicValues = this.getDynamicFieldValues();

        // Get existing variant attributes (for edit mode)
        let existingAttrs = data.attributes || {};
        if (typeof existingAttrs === 'string') { try { existingAttrs = JSON.parse(existingAttrs); } catch(e) { existingAttrs = {}; } }

        const row = document.createElement('div');
        row.className = 'variant-row';

        // Initialize variant images array on the row
        row._variantImages = data._variantImages || []; // Array of { file, url }
        row._variantFile = null; // Keep for backward compat (first image file)

        // Build dynamic fields HTML with base values as placeholders
        let dynamicFieldsHtml = '';
        if (dynamicFields.length > 0) {
            dynamicFieldsHtml = '<div class="variant-dynamic-fields">';
            dynamicFields.forEach(field => {
                const fieldId = field.id || field.label.toLowerCase().replace(/\s+/g, '_');
                const existingVal = existingAttrs[fieldId] || '';
                const baseVal = baseDynamicValues[fieldId] || '';
                const isTagField = field.type === 'tags' || ['color', 'colour', 'shade', 'size', 'storage', 'ram', 'volume', 'portion', 'pack', 'flavor', 'flavour', 'format', 'finish'].some(kw => field.label.toLowerCase().includes(kw));

                if (isTagField) {
                    const tagOptions = this.dynTagFields && this.dynTagFields[fieldId] ? Array.from(this.dynTagFields[fieldId]) : [];
                    const datalistId = `dl_add_${Math.random().toString(36).substr(2, 9)}_${fieldId}`;
                    const isSizeField = ['size', 'storage', 'portion', 'weight', 'pack'].some(k => field.label.toLowerCase().includes(k));
                    dynamicFieldsHtml += `<div class="variant-field-wrapper">
                        <label class="variant-field-label">${field.label}</label>
                        <input type="text" class="variant-attr variant-tag-input" data-field-id="${fieldId}" value="${existingVal}" list="${datalistId}" placeholder="Enter ${field.label}" required>
                        <datalist id="${datalistId}">`;
                    tagOptions.forEach(opt => {
                        dynamicFieldsHtml += `<option value="${opt}"></option>`;
                    });
                    dynamicFieldsHtml += `</datalist>`;
                    if (isSizeField) {
                        dynamicFieldsHtml += `<div class="variant-chips-container" data-field-id="${fieldId}"></div>`;
                    }
                    dynamicFieldsHtml += `</div>`;
                } else if (field.type === 'select') {
                    const options = Array.isArray(field.options) ? field.options : [];
                    dynamicFieldsHtml += `<div class="variant-field-wrapper"><label class="variant-field-label">${field.label}</label><select class="variant-attr" data-field-id="${fieldId}">`;
                    dynamicFieldsHtml += `<option value="">${baseVal ? '↑ ' + baseVal + ' (base)' : 'Select ' + field.label}</option>`;
                    options.forEach(opt => {
                        dynamicFieldsHtml += `<option value="${opt}" ${existingVal === opt ? 'selected' : ''}>${opt}</option>`;
                    });
                    dynamicFieldsHtml += '</select></div>';
                } else {
                    dynamicFieldsHtml += `<div class="variant-field-wrapper"><label class="variant-field-label">${field.label}</label><input type="${field.type || 'text'}" class="variant-attr" data-field-id="${fieldId}" placeholder="${baseVal || 'Enter ' + field.label}" value="${existingVal}"></div>`;
                }
            });
            dynamicFieldsHtml += '</div>';
        }

        row.innerHTML = `
            <div class="variant-row-header">
                <div class="variant-name-row">
                    <input type="text" class="variant-name" placeholder="Variant name (e.g. Red, XL, 500ml)" value="${data.name || data.variant_name || ''}">
                    <button type="button" class="btn btn-sm btn-danger remove-variant-btn" title="Delete variant">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
                <div class="variant-images-container">
                    <div class="variant-images-grid"></div>
                </div>
            </div>
            <div class="variant-pricing-grid">
                <div class="variant-field-wrapper">
                    <label class="variant-field-label">STOCK</label>
                    <input type="number" class="variant-stock" placeholder="${baseStock}" value="${data.stock || 0}" min="0">
                </div>
                <div class="variant-field-wrapper">
                    <label class="variant-field-label">COST</label>
                    <input type="number" class="variant-cost" placeholder="${baseCost || '0.00'}" value="${data.cost_price || ''}" step="0.01" min="0">
                </div>
                <div class="variant-field-wrapper variant-price-col">
                    <label class="variant-field-label variant-price-label">PRICE *</label>
                    <input type="number" class="variant-price" placeholder="${basePrice || '0.00'}" value="${data.price || ''}" step="0.01" min="0" required>
                </div>
            </div>
            ${dynamicFieldsHtml}
        `;

        // Hover effect
        row.addEventListener('mouseenter', () => { row.style.borderColor = '#93c5fd'; row.style.boxShadow = '0 2px 8px rgba(59,130,246,0.08)'; });
        row.addEventListener('mouseleave', () => { row.style.borderColor = '#e2e8f0'; row.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; });

        row.querySelector('.remove-variant-btn').addEventListener('click', () => row.remove());
        container.appendChild(row);

        // Smooth scroll newly added variant into view when manually added
        if (!data.name && !data.variant_name && Object.keys(data).length <= 1) {
            setTimeout(() => {
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 60);
        }

        // Render variant images grid
        this.renderVariantImagesGrid(row);

        // Initialize and bind tag chip events for size fields
        row._variantSizeStocks = data.attributes?.size_stock || {}; // Load existing size stocks if any
        row._variantSizePrices = data.attributes?.size_price || data.attributes?.size_prices || {}; // Load existing size prices if any
        row.querySelectorAll('.variant-tag-input').forEach(input => {
            const fieldId = input.dataset.fieldId;
            const container = row.querySelector(`.variant-chips-container[data-field-id="${fieldId}"]`);
            if (container) {
                const render = () => this.renderVariantDynTagChips(row, input, container, fieldId);
                input.addEventListener('input', render);
                
                // Also trigger validation when main stock changes
                const stockInput = row.querySelector('.variant-stock');
                if (stockInput) {
                    stockInput.addEventListener('input', () => this.validateVariantSizeStock(row, container));
                }
                
                render(); // Initial render
            }
        });
    }

    renderVariantDynTagChips(row, inputEl, containerEl, fieldId) {
        const val = inputEl.value;
        const tags = val.split(',').map(s => s.trim()).filter(s => s);
        
        if (!row._variantSizeStocks) row._variantSizeStocks = {};
        if (!row._variantSizePrices) row._variantSizePrices = {};
        
        containerEl.innerHTML = '';
        tags.forEach(t => {
            const stock = row._variantSizeStocks[t] ?? '';
            const price = row._variantSizePrices[t] ?? '';
            const chip = document.createElement('span');
            chip.className = 'variant-sub-chip';
            chip.innerHTML = `
                <span class="chip-tag-name">${t}</span>
                <input type="number" min="0" placeholder="Qty" value="${stock}"
                    title="Stock for ${t}"
                    class="chip-qty-input">
                <input type="number" min="0" step="0.01" placeholder="Price" value="${price}"
                    title="Optional custom price for ${t}"
                    class="chip-price-input">
            `;
            const inputs = chip.querySelectorAll('input');
            const qtyInput = inputs[0];
            const priceInput = inputs[1];
            qtyInput.addEventListener('input', (e) => {
                const qty = parseInt(e.target.value, 10);
                row._variantSizeStocks[t] = isNaN(qty) ? 0 : Math.max(0, qty);
                this.validateVariantSizeStock(row, containerEl);
            });
            priceInput.addEventListener('input', (e) => {
                const p = parseFloat(e.target.value);
                if (isNaN(p) || e.target.value === '') {
                    delete row._variantSizePrices[t];
                } else {
                    row._variantSizePrices[t] = Math.max(0, p);
                }
            });
            containerEl.appendChild(chip);
        });
        this.validateVariantSizeStock(row, containerEl);
    }

    validateVariantSizeStock(row, containerEl) {
        const variantStock = parseInt(row.querySelector('.variant-stock').value) || 0;
        const totalSizeStock = Object.values(row._variantSizeStocks || {}).reduce((sum, q) => sum + (parseInt(q) || 0), 0);
        const isOver = totalSizeStock > variantStock;

        containerEl.querySelectorAll('input[type="number"]').forEach(inp => {
            inp.style.border = isOver ? '1px solid #dc2626' : '1px solid #bfdbfe';
            inp.style.background = isOver ? '#fff5f5' : 'white';
        });

        let warn = containerEl.parentElement.querySelector('.variant-size-warning');
        if (isOver) {
            if (!warn) {
                warn = document.createElement('div');
                warn.className = 'variant-size-warning';
                warn.style.cssText = 'color:#dc2626;font-size:0.7rem;margin-top:4px;font-weight:600;';
                containerEl.parentElement.appendChild(warn);
            }
            warn.textContent = `⚠ Size stock (${totalSizeStock}) > Variant stock (${variantStock})`;
        } else if (warn) {
            warn.remove();
        }
    }

    renderVariantImagesGrid(row) {
        const grid = row.querySelector('.variant-images-grid');
        if (!grid) return;

        grid.innerHTML = '';

        // Render existing images
        (row._variantImages || []).forEach((img, idx) => {
            const slot = document.createElement('div');
            slot.style.cssText = 'width:48px;height:48px;border-radius:8px;overflow:hidden;position:relative;border:2px solid #e2e8f0;flex-shrink:0;';
            slot.innerHTML = `
                <img src="${img.url}" style="width:100%;height:100%;object-fit:cover;">
                <button type="button" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#ef4444;border:none;color:white;font-size:0.55rem;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">×</button>
            `;
            if (idx === 0) slot.style.border = '2px solid var(--primary, #3b82f6)';
            slot.querySelector('button').onclick = (e) => {
                e.stopPropagation();
                row._variantImages.splice(idx, 1);
                row._variantFile = row._variantImages.length > 0 ? row._variantImages[0].file : null;
                this.renderVariantImagesGrid(row);
            };
            grid.appendChild(slot);
        });

        // Add button (if less than 5)
        if ((row._variantImages || []).length < 5) {
            const addSlot = document.createElement('div');
            addSlot.style.cssText = 'width:48px;height:48px;border-radius:8px;border:2px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;cursor:pointer;background:#f8fafc;flex-shrink:0;transition:border-color 0.2s;';
            addSlot.innerHTML = '<i class="fas fa-plus" style="color:#94a3b8;font-size:0.8rem;"></i>';
            addSlot.title = 'Add image (max 5)';
            addSlot.onmouseenter = () => { addSlot.style.borderColor = '#93c5fd'; };
            addSlot.onmouseleave = () => { addSlot.style.borderColor = '#cbd5e1'; };
            addSlot.onclick = () => { this.showVariantImagePicker(row, null); };
            grid.appendChild(addSlot);
        }
    }

    getVariants() {
        const rows = document.querySelectorAll('#variantsList .variant-row');
        const variants = [];
        rows.forEach(row => {
            const name = row.querySelector('.variant-name').value.trim();
            const stock = parseInt(row.querySelector('.variant-stock').value) || 0;
            const costPrice = parseFloat(row.querySelector('.variant-cost').value) || 0;
            const price = parseFloat(row.querySelector('.variant-price').value) || 0;
            const imageFile = row._variantImages && row._variantImages.length > 0 ? row._variantImages[0].file : null;
            const imageFiles = (row._variantImages || []).map(img => img.file).filter(f => f);
            const imageUrls = (row._variantImages || []).map(img => img.url).filter(u => u);

            // Collect dynamic attribute fields
            const attributes = {};
            row.querySelectorAll('.variant-attr').forEach(input => {
                const fieldId = input.dataset.fieldId;
                const val = input.value.trim();
                if (fieldId && val) {
                    attributes[fieldId] = val;
                }
            });

            // Include size stocks & prices if any
            if (row._variantSizeStocks && Object.keys(row._variantSizeStocks).length > 0) {
                attributes.size_stock = row._variantSizeStocks;
            }
            if (row._variantSizePrices && Object.keys(row._variantSizePrices).length > 0) {
                attributes.size_price = row._variantSizePrices;
                attributes.size_prices = row._variantSizePrices;
            }

            if (name) {
                variants.push({ name, stock, costPrice, price, imageFile, imageFiles, imageUrls, attributes });
            }
        });
        return variants;
    }

    resetVariants() {
        const container = document.getElementById('variantsList');
        if (container) container.innerHTML = '';
        const checkbox = document.getElementById('enableVariants');
        if (checkbox) { checkbox.checked = false; checkbox.disabled = false; }
        const section = document.getElementById('variantsSection');
        if (section) section.style.display = 'none';
        this.dynTagFields = {};
    }

    getCategoryAttributeDefinitions(category) {
        const cat = (category || '').toLowerCase();
        if (cat.includes('cloth') || cat.includes('fashion') || cat.includes('apparel')) {
            return [
                { key: 'color', label: 'Available Colors', icon: 'fas fa-paint-brush', color: '#ec4899', type: 'tags', presets: ['Red', 'Blue', 'Black', 'White', 'Green', 'Yellow', 'Pink'] },
                { key: 'size', label: 'Available Sizes', icon: 'fas fa-ruler-combined', color: '#3b82f6', type: 'tags', presets: ['S', 'M', 'L', 'XL', 'XXL', 'Free Size'] },
                { key: 'material', label: 'Material', icon: 'fas fa-layer-group', color: '#8b5cf6', type: 'select', options: ['', 'Cotton', 'Polyester', 'Denim', 'Silk', 'Linen', 'Wool', 'Leather'] }
            ];
        } else if (cat.includes('gadget') || cat.includes('electronic') || cat.includes('mobile') || cat.includes('tech') || cat.includes('accessory')) {
            return [
                { key: 'color', label: 'Available Colors', icon: 'fas fa-palette', color: '#ec4899', type: 'tags', presets: ['Black', 'Silver', 'Space Grey', 'Gold', 'White', 'Blue'] },
                { key: 'storage', label: 'Storage / RAM', icon: 'fas fa-microchip', color: '#10b981', type: 'tags', presets: ['64GB', '128GB', '256GB', '512GB', '1TB'] },
                { key: 'warranty', label: 'Warranty', icon: 'fas fa-shield-alt', color: '#f59e0b', type: 'select', options: ['', 'No Warranty', '6 Months', '1 Year', '2 Years'] }
            ];
        } else if (cat.includes('beauty') || cat.includes('cosmetic')) {
            return [
                { key: 'shade', label: 'Shade / Color', icon: 'fas fa-magic', color: '#ec4899', type: 'tags', presets: ['Nude', 'Red', 'Pink', 'Coral', 'Berry', 'Rose'] },
                { key: 'volume', label: 'Volume / Weight', icon: 'fas fa-flask', color: '#3b82f6', type: 'tags', presets: ['30ml', '50ml', '100ml', '200ml', '50g', '100g'] },
                { key: 'skin_type', label: 'Skin Type', icon: 'fas fa-user-check', color: '#8b5cf6', type: 'select', options: ['', 'All Skin Types', 'Oily', 'Dry', 'Combination', 'Sensitive'] }
            ];
        } else if (cat.includes('book')) {
            return [
                { key: 'format', label: 'Format', icon: 'fas fa-book-open', color: '#6366f1', type: 'tags', presets: ['Paperback', 'Hardcover', 'eBook', 'Audiobook'] },
                { key: 'language', label: 'Language', icon: 'fas fa-language', color: '#3b82f6', type: 'select', options: ['', 'English', 'Hindi', 'Spanish', 'French', 'German', 'Bengali'] }
            ];
        } else if (cat.includes('furniture') || cat.includes('decor')) {
            return [
                { key: 'finish', label: 'Color / Finish', icon: 'fas fa-couch', color: '#84cc16', type: 'tags', presets: ['Oak', 'Walnut', 'Black', 'White', 'Mahogany', 'Teak'] },
                { key: 'material', label: 'Material', icon: 'fas fa-hammer', color: '#f97316', type: 'select', options: ['', 'Solid Wood', 'Engineered Wood', 'Metal', 'Leather', 'Fabric', 'Glass'] }
            ];
        } else if (cat.includes('restaurent') || cat.includes('food')) {
            return [
                { key: 'portion', label: 'Portion / Size', icon: 'fas fa-utensils', color: '#ef4444', type: 'tags', presets: ['Quarter', 'Half', 'Full', 'Regular', 'Large', 'Family Pack'] },
                { key: 'spice_level', label: 'Spice Level', icon: 'fas fa-pepper-hot', color: '#dc2626', type: 'tags', presets: ['Mild', 'Medium', 'Spicy', 'Extra Spicy'] },
                { key: 'dietary', label: 'Dietary Type', icon: 'fas fa-leaf', color: '#16a34a', type: 'select', options: ['', 'Veg', 'Non-Veg', 'Eggitarian', 'Vegan'] }
            ];
        } else if (cat.includes('car') || cat.includes('bike') || cat.includes('vehicle')) {
            return [
                { key: 'color', label: 'Vehicle Color', icon: 'fas fa-car', color: '#64748b', type: 'tags', presets: ['White', 'Black', 'Silver', 'Red', 'Blue', 'Grey'] },
                { key: 'fuel_type', label: 'Fuel Type', icon: 'fas fa-gas-pump', color: '#ef4444', type: 'select', options: ['', 'Petrol', 'Diesel', 'Electric', 'Hybrid', 'CNG'] },
                { key: 'transmission', label: 'Transmission', icon: 'fas fa-cogs', color: '#3b82f6', type: 'select', options: ['', 'Manual', 'Automatic'] }
            ];
        } else if (cat.includes('pet')) {
            return [
                { key: 'pet_type', label: 'Pet Type', icon: 'fas fa-paw', color: '#f59e0b', type: 'select', options: ['', 'Dog', 'Cat', 'Fish', 'Bird', 'Small Animal'] },
                { key: 'weight', label: 'Pack Size', icon: 'fas fa-weight-hanging', color: '#10b981', type: 'tags', presets: ['500g', '1kg', '3kg', '5kg', '10kg'] },
                { key: 'flavor', label: 'Flavor', icon: 'fas fa-drumstick-bite', color: '#ef4444', type: 'tags', presets: ['Chicken', 'Lamb', 'Fish', 'Beef', 'Vegetable'] }
            ];
        } else {
            return [
                { key: 'color', label: 'Colors (Optional)', icon: 'fas fa-palette', color: '#ec4899', type: 'tags', presets: ['Black', 'White', 'Red', 'Blue', 'Silver'] },
                { key: 'size', label: 'Size / Style (Optional)', icon: 'fas fa-tag', color: '#3b82f6', type: 'tags', presets: ['Small', 'Medium', 'Large'] }
            ];
        }
    }

    renderCategoryAttributes(category, existingAttributes = null) {
        const container = document.getElementById('categoryAttributesContainer');
        const catLabel = document.getElementById('catAttrLabel');
        if (!container) return;

        if (catLabel) catLabel.textContent = category || 'Category Options';

        const defs = this.getCategoryAttributeDefinitions(category);
        this.currentAttributeDefs = defs;

        // Initialize state
        this.productAttributes = {};
        defs.forEach(d => {
            if (d.type === 'tags') {
                this.productAttributes[d.key] = new Set();
            } else {
                this.productAttributes[d.key] = '';
            }
        });

        // Populate existing attributes if provided
        if (existingAttributes) {
            Object.keys(existingAttributes).forEach(k => {
                const val = existingAttributes[k];
                if (Array.isArray(val)) {
                    this.productAttributes[k] = new Set(val);
                } else if (typeof val === 'string' && val.includes(',')) {
                    this.productAttributes[k] = new Set(val.split(',').map(s => s.trim()));
                } else if (val) {
                    if (this.productAttributes[k] instanceof Set) {
                        this.productAttributes[k].add(val);
                    } else {
                        this.productAttributes[k] = val;
                    }
                }
            });
        }

        let html = '';
        defs.forEach(d => {
            if (d.type === 'tags') {
                html += `
                    <div style="margin-bottom:14px;">
                        <label style="font-weight:600;font-size:0.8rem;color:#475569;display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                            <i class="${d.icon}" style="color:${d.color};"></i> ${d.label}:
                        </label>
                        <div style="display:flex;gap:8px;margin-bottom:6px;">
                            <input type="text" id="attrInput_${d.key}" placeholder="Add ${d.label.toLowerCase()}" style="flex:1;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.85rem;outline:none;background:white;">
                            <button type="button" class="btn btn-sm btn-primary" onclick="window.inventoryManager.addAttributeTagFromInput('${d.key}')" style="padding:8px 14px;font-size:0.8rem;">Add</button>
                        </div>
                        ${d.presets && d.presets.length > 0 ? `
                        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
                            ${d.presets.map(p => `
                                <button type="button" class="preset-chip" onclick="window.inventoryManager.addAttributeTag('${d.key}', '${p}')" style="padding:3px 8px;border:1px solid #cbd5e1;background:white;color:#334155;border-radius:12px;font-size:0.75rem;cursor:pointer;">${p}</button>
                            `).join('')}
                        </div>
                        ` : ''}
                        <div id="attrChips_${d.key}" style="display:flex;flex-wrap:wrap;gap:6px;min-height:20px;"></div>
                    </div>
                `;
            } else if (d.type === 'select') {
                const currentVal = this.productAttributes[d.key] || '';
                html += `
                    <div style="margin-bottom:14px;">
                        <label style="font-weight:600;font-size:0.8rem;color:#475569;display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                            <i class="${d.icon}" style="color:${d.color};"></i> ${d.label}:
                        </label>
                        <select id="attrSelect_${d.key}" onchange="window.inventoryManager.setAttributeValue('${d.key}', this.value)" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.85rem;outline:none;background:white;color:#334155;">
                            ${d.options.map(opt => `<option value="${opt}" ${currentVal === opt ? 'selected' : ''}>${opt || 'Select ' + d.label}</option>`).join('')}
                        </select>
                    </div>
                `;
            }
        });

        html += '<div id="customAttributesList"></div>';
        container.innerHTML = html;

        // Render tag chips and bind enter keys
        defs.forEach(d => {
            if (d.type === 'tags') {
                this.renderAttributeTags(d.key);
                const input = document.getElementById(`attrInput_${d.key}`);
                if (input) {
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            this.addAttributeTagFromInput(d.key);
                        }
                    });
                }
            }
        });

        // Add custom attribute button handler
        const addCustomBtn = document.getElementById('addCustomAttrBtn');
        if (addCustomBtn) {
            addCustomBtn.onclick = () => this.promptAddCustomAttribute();
        }
    }

    addAttributeTagFromInput(key) {
        const input = document.getElementById(`attrInput_${key}`);
        if (input && input.value.trim()) {
            this.addAttributeTag(key, input.value.trim());
            input.value = '';
        }
    }

    addAttributeTag(key, val) {
        val = (val || '').trim();
        if (!val) return;
        if (!this.productAttributes[key] || !(this.productAttributes[key] instanceof Set)) {
            this.productAttributes[key] = new Set();
        }
        this.productAttributes[key].add(val);
        this.renderAttributeTags(key);
        // Live-update variant builder preview
        if (document.getElementById('variantsSection')?.style.display !== 'none') {
            this.updateVariantBuilderPreview();
        }
    }

    removeAttributeTag(key, val) {
        if (this.productAttributes[key] instanceof Set) {
            this.productAttributes[key].delete(val);
            this.renderAttributeTags(key);
            // Live-update variant builder preview
            if (document.getElementById('variantsSection')?.style.display !== 'none') {
                this.updateVariantBuilderPreview();
            }
        }
    }

    setAttributeValue(key, val) {
        this.productAttributes[key] = (val || '').trim();
    }

    renderAttributeTags(key) {
        const container = document.getElementById(`attrChips_${key}`);
        if (!container) return;
        const setObj = this.productAttributes[key];
        const tags = setObj instanceof Set ? Array.from(setObj) : [];

        container.innerHTML = tags.map(t => `
            <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#f1f5f9;border:1px solid #cbd5e1;color:#334155;border-radius:12px;font-size:0.8rem;font-weight:600;">
                ${t}
                <button type="button" onclick="window.inventoryManager.removeAttributeTag('${key}', '${t}')" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:0.85rem;padding:0;line-height:1;margin-left:2px;">&times;</button>
            </span>
        `).join('');
    }

    promptAddCustomAttribute() {
        const attrName = prompt('Enter custom attribute name (e.g. Frame Type, Scent, Voltage):');
        if (!attrName || !attrName.trim()) return;
        const key = attrName.trim().toLowerCase().replace(/\s+/g, '_');
        
        if (this.productAttributes[key]) {
            showNotification('Attribute already exists', 'warning');
            return;
        }

        this.productAttributes[key] = new Set();
        const customContainer = document.getElementById('customAttributesList');
        if (customContainer) {
            const div = document.createElement('div');
            div.style.marginBottom = '14px';
            div.innerHTML = `
                <label style="font-weight:600;font-size:0.8rem;color:#475569;display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                    <i class="fas fa-plus-circle" style="color:var(--primary);"></i> ${attrName.trim()}:
                </label>
                <div style="display:flex;gap:8px;margin-bottom:6px;">
                    <input type="text" id="attrInput_${key}" placeholder="Add value and press Enter" style="flex:1;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.85rem;outline:none;background:white;">
                    <button type="button" class="btn btn-sm btn-primary" onclick="window.inventoryManager.addAttributeTagFromInput('${key}')" style="padding:8px 14px;font-size:0.8rem;">Add</button>
                </div>
                <div id="attrChips_${key}" style="display:flex;flex-wrap:wrap;gap:6px;min-height:20px;"></div>
            `;
            customContainer.appendChild(div);

            const input = div.querySelector(`#attrInput_${key}`);
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.addAttributeTagFromInput(key);
                    }
                });
            }
        }
    }

    addBuilderColor(val) {
        val = (val || '').trim();
        if (!val) return;
        this.selectedBuilderColors.add(val);
        this.renderBuilderColorChips();
    }

    removeBuilderColor(val) {
        this.selectedBuilderColors.delete(val);
        this.renderBuilderColorChips();
    }

    renderBuilderColorChips() {
        const container = document.getElementById('builderSelectedColors');
        if (!container) return;
        container.innerHTML = Array.from(this.selectedBuilderColors).map(color => `
            <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#fdf2f8;border:1px solid #fbcfe8;color:#9d174d;border-radius:12px;font-size:0.8rem;font-weight:600;">
                <i class="fas fa-paint-brush" style="font-size:0.7rem;"></i> ${color}
                <button type="button" onclick="window.inventoryManager.removeBuilderColor('${color}')" style="background:none;border:none;color:#9d174d;cursor:pointer;font-size:0.85rem;padding:0;line-height:1;margin-left:2px;">&times;</button>
            </span>
        `).join('');
    }

    addBuilderSize(val) {
        val = (val || '').trim();
        if (!val) return;
        this.selectedBuilderSizes.add(val);
        this.renderBuilderSizeChips();
    }

    removeBuilderSize(val) {
        this.selectedBuilderSizes.delete(val);
        this.renderBuilderSizeChips();
    }

    renderBuilderSizeChips() {
        const container = document.getElementById('builderSelectedSizes');
        if (!container) return;
        container.innerHTML = Array.from(this.selectedBuilderSizes).map(size => `
            <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;border-radius:6px;font-size:0.8rem;font-weight:600;">
                <i class="fas fa-ruler-combined" style="font-size:0.7rem;"></i> ${size}
                <button type="button" onclick="window.inventoryManager.removeBuilderSize('${size}')" style="background:none;border:none;color:#1e40af;cursor:pointer;font-size:0.85rem;padding:0;line-height:1;margin-left:2px;">&times;</button>
            </span>
        `).join('');
    }

    generateVariantCombinations() {
        // Collect all tag-type (Set) attributes from dynTagFields
        const attrEntries = [];
        if (this.dynTagFields) {
            Object.keys(this.dynTagFields).forEach(key => {
                const val = this.dynTagFields[key];
                if (val instanceof Set && val.size > 0) {
                    attrEntries.push({ key, values: Array.from(val) });
                }
            });
        }

        if (attrEntries.length === 0) {
            showNotification('Please add at least one Product Attribute (e.g. Color, Size) above before generating variants.', 'warning');
            return;
        }

        const defaultStockInput = document.getElementById('builderDefaultStock')?.value;
        const defaultStock = defaultStockInput !== '' && defaultStockInput !== undefined
            ? (parseInt(defaultStockInput) || 0)
            : (parseInt(document.getElementById('productStock')?.value) || 0);

        const defaultPriceInput = document.getElementById('builderDefaultPrice')?.value;
        const defaultPrice = defaultPriceInput !== '' && defaultPriceInput !== undefined
            ? (parseFloat(defaultPriceInput) || 0)
            : (parseFloat(document.getElementById('sellingPrice')?.value) || 0);

        const defaultCost = parseFloat(document.getElementById('costPrice')?.value) || 0;

        // Compute cartesian product of all tag attributes
        let combinations = [{ name: '', attrs: {} }];
        attrEntries.forEach(({ key, values }) => {
            const next = [];
            combinations.forEach(combo => {
                values.forEach(v => {
                    next.push({
                        name: combo.name ? `${combo.name} / ${v}` : v,
                        attrs: { ...combo.attrs, [key]: v }
                    });
                });
            });
            combinations = next;
        });

        // Clear existing and add new variant rows
        const existingRows = document.querySelectorAll('#variantsList .variant-row');
        if (existingRows.length > 0 && !confirm(`Replace the ${existingRows.length} existing variant(s) with ${combinations.length} new combination(s)?`)) {
            return;
        }
        document.getElementById('variantsList').innerHTML = '';

        combinations.forEach(combo => {
            let comboStock = defaultStock;
            let comboPrice = defaultPrice;
            Object.keys(combo.attrs).forEach(k => {
                const val = combo.attrs[k];
                if (this.dynTagStocks && this.dynTagStocks[k] && this.dynTagStocks[k][val] !== undefined) {
                    comboStock = parseInt(this.dynTagStocks[k][val]) || 0;
                }
                if (this.dynTagPrices && this.dynTagPrices[k] && this.dynTagPrices[k][val] !== undefined) {
                    comboPrice = parseFloat(this.dynTagPrices[k][val]) || defaultPrice;
                }
            });

            this.addVariantRow({
                name: combo.name,
                stock: comboStock,
                price: comboPrice,
                cost_price: defaultCost,
                attributes: combo.attrs
            });
        });

        showNotification(`Generated ${combinations.length} variant combination(s)!`, 'success');
    }

    updateVariantBuilderPreview() {
        const preview = document.getElementById('variantBuilderPreview');
        if (!preview) return;

        const tagAttrs = [];
        if (this.dynTagFields) {
            Object.keys(this.dynTagFields).forEach(key => {
                const val = this.dynTagFields[key];
                if (val instanceof Set && val.size > 0) {
                    tagAttrs.push({ key, label: key, values: Array.from(val) });
                }
            });
        }

        if (tagAttrs.length === 0) {
            preview.innerHTML = '';
            return;
        }

        let totalCombos = tagAttrs.reduce((acc, a) => acc * a.values.length, 1);
        preview.innerHTML = tagAttrs.map(a => `
            <div style="margin-bottom:6px;">
                <span style="font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;">${a.label}:</span>
                <span style="margin-left:6px;">${a.values.map(v => `<span style="display:inline-block;padding:2px 8px;background:#e0f2fe;color:#0369a1;border-radius:10px;font-size:0.75rem;font-weight:600;margin:2px;">${v}</span>`).join('')}</span>
            </div>
        `).join('') + `<div style="margin-top:8px;font-size:0.75rem;color:#0369a1;font-weight:700;"><i class="fas fa-bolt"></i> Will generate <strong>${totalCombos}</strong> variant combination(s).</div>`;
    }

    addVariantRowWithData(v) {
        // Add a variant row pre-filled with existing data from database
        const container = document.getElementById('variantsList');
        if (!container) return;

        // Get base product values for placeholders
        const baseCost = document.getElementById('costPrice')?.value || '';
        const basePrice = document.getElementById('sellingPrice')?.value || '';
        const baseStock = document.getElementById('productStock')?.value || '0';
        const baseDynamicValues = this.getDynamicFieldValues();

        // Get dynamic fields for current category
        const categoryElem = document.getElementById('productCategory');
        const selectedCategory = categoryElem ? categoryElem.value : null;
        let dynamicFields = [];
        if (selectedCategory && this.metadataConfigs && this.metadataConfigs[selectedCategory]) {
            dynamicFields = this.metadataConfigs[selectedCategory];
        }

        // Get existing variant attributes
        let existingAttrs = v.attributes || {};
        if (typeof existingAttrs === 'string') { try { existingAttrs = JSON.parse(existingAttrs); } catch(e) { existingAttrs = {}; } }

        // Build dynamic fields HTML
        let dynamicFieldsHtml = '';
        if (dynamicFields.length > 0) {
            dynamicFieldsHtml = '<div class="variant-dynamic-fields">';
            dynamicFields.forEach(field => {
                const fieldId = field.id || field.label.toLowerCase().replace(/\s+/g, '_');
                const existingVal = existingAttrs[fieldId] || '';
                const baseVal = baseDynamicValues[fieldId] || '';
                const isTagField = field.type === 'tags' || ['color', 'colour', 'shade', 'size', 'storage', 'ram', 'volume', 'portion', 'pack', 'flavor', 'flavour', 'format', 'finish'].some(kw => field.label.toLowerCase().includes(kw));

                if (isTagField) {
                    const tagOptions = this.dynTagFields && this.dynTagFields[fieldId] ? Array.from(this.dynTagFields[fieldId]) : [];
                    const datalistId = `dl_${v.id || Math.random().toString(36).substr(2, 9)}_${fieldId}`;
                    const isSizeField = ['size', 'storage', 'portion', 'weight', 'pack'].some(k => field.label.toLowerCase().includes(k));
                    dynamicFieldsHtml += `<div class="variant-field-wrapper">
                        <label class="variant-field-label">${field.label}</label>
                        <input type="text" class="variant-attr variant-tag-input" data-field-id="${fieldId}" value="${existingVal}" list="${datalistId}" placeholder="Enter ${field.label}" required>
                        <datalist id="${datalistId}">`;
                    tagOptions.forEach(opt => {
                        dynamicFieldsHtml += `<option value="${opt}"></option>`;
                    });
                    dynamicFieldsHtml += `</datalist>`;
                    if (isSizeField) {
                        dynamicFieldsHtml += `<div class="variant-chips-container" data-field-id="${fieldId}"></div>`;
                    }
                    dynamicFieldsHtml += `</div>`;
                } else if (field.type === 'select') {
                    const options = Array.isArray(field.options) ? field.options : [];
                    dynamicFieldsHtml += `<div class="variant-field-wrapper"><label class="variant-field-label">${field.label}</label><select class="variant-attr" data-field-id="${fieldId}">`;
                    dynamicFieldsHtml += `<option value="">${baseVal ? '↑ ' + baseVal + ' (base)' : 'Select ' + field.label}</option>`;
                    options.forEach(opt => {
                        dynamicFieldsHtml += `<option value="${opt}" ${existingVal === opt ? 'selected' : ''}>${opt}</option>`;
                    });
                    dynamicFieldsHtml += '</select></div>';
                } else {
                    dynamicFieldsHtml += `<div class="variant-field-wrapper"><label class="variant-field-label">${field.label}</label><input type="${field.type || 'text'}" class="variant-attr" data-field-id="${fieldId}" placeholder="${baseVal || 'Enter ' + field.label}" value="${existingVal}"></div>`;
                }
            });
            dynamicFieldsHtml += '</div>';
        }

        const row = document.createElement('div');
        row.className = 'variant-row';
        row.dataset.variantDbId = v.id || '';

        // Load existing variant images from attributes.variant_images or image_url
        let existingImages = [];
        if (existingAttrs.variant_images && Array.isArray(existingAttrs.variant_images)) {
            existingImages = existingAttrs.variant_images.map(url => ({ file: null, url }));
        } else if (v.image_url) {
            existingImages = [{ file: null, url: v.image_url }];
        }
        row._variantImages = existingImages;
        row._variantFile = existingImages.length > 0 ? existingImages[0].file : null;

        row.innerHTML = `
            <div class="variant-row-header">
                <div class="variant-name-row">
                    <input type="text" class="variant-name" placeholder="Variant name" value="${v.variant_name || ''}">
                    <button type="button" class="btn btn-sm btn-danger remove-variant-btn" title="Delete variant">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
                <div class="variant-images-container">
                    <div class="variant-images-grid"></div>
                </div>
            </div>
            <div class="variant-pricing-grid">
                <div class="variant-field-wrapper">
                    <label class="variant-field-label">STOCK</label>
                    <input type="number" class="variant-stock" placeholder="${baseStock}" value="${v.stock || 0}" min="0">
                </div>
                <div class="variant-field-wrapper">
                    <label class="variant-field-label">COST</label>
                    <input type="number" class="variant-cost" placeholder="${baseCost || '0.00'}" value="${v.cost_price || ''}" step="0.01" min="0">
                </div>
                <div class="variant-field-wrapper variant-price-col">
                    <label class="variant-field-label variant-price-label">PRICE *</label>
                    <input type="number" class="variant-price" placeholder="${basePrice || '0.00'}" value="${v.price || ''}" step="0.01" min="0" required>
                </div>
            </div>
            ${dynamicFieldsHtml}
        `;

        // Hover effect
        row.addEventListener('mouseenter', () => { row.style.borderColor = '#93c5fd'; row.style.boxShadow = '0 2px 8px rgba(59,130,246,0.08)'; });
        row.addEventListener('mouseleave', () => { row.style.borderColor = '#e2e8f0'; row.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; });

        row.querySelector('.remove-variant-btn').addEventListener('click', async () => {
            const dbId = row.dataset.variantDbId;
            if (dbId) {
                if (confirm('Delete this variant permanently?')) {
                    await supabaseClient.from('product_variants').delete().eq('id', dbId);
                    row.remove();
                    showNotification('Variant deleted', 'success');
                }
            } else {
                row.remove();
            }
        });

        container.appendChild(row);

        // Render variant images grid
        this.renderVariantImagesGrid(row);

        // Initialize and bind tag chip events for size fields
        row._variantSizeStocks = existingAttrs.size_stock || {}; // Load existing size stocks if any
        row._variantSizePrices = existingAttrs.size_price || existingAttrs.size_prices || {}; // Load existing size prices if any
        row.querySelectorAll('.variant-tag-input').forEach(input => {
            const fieldId = input.dataset.fieldId;
            const container = row.querySelector(`.variant-chips-container[data-field-id="${fieldId}"]`);
            if (container) {
                const render = () => this.renderVariantDynTagChips(row, input, container, fieldId);
                input.addEventListener('input', render);
                
                // Also trigger validation when main stock changes
                const stockInput = row.querySelector('.variant-stock');
                if (stockInput) {
                    stockInput.addEventListener('input', () => this.validateVariantSizeStock(row, container));
                }
                
                render(); // Initial render
            }
        });
    }

    async saveProductWithVariants(baseName, baseSku, category, productType, baseCost, basePrice, baseStock, description, lowStockAlert, priority, showInStore, dynamicValues, variants) {
        try {
            // 1. Upload all primary product images to ImgBB
            const primaryImageUrls = [];
            for (const img of this.productImages) {
                if (img.file) {
                    try {
                        const publicUrl = await window.utils.uploadImageToImgbb(img.file);
                        if (publicUrl) {
                            primaryImageUrls.push(publicUrl);
                        } else {
                            console.error('Upload error: failed to get URL from ImgBB for primary image');
                        }
                    } catch (err) {
                        console.error('Primary image upload exception:', err);
                    }
                } else if (img.url && !img.url.startsWith('data:')) {
                    primaryImageUrls.push(img.url);
                }
            }

            const mainImageUrl = primaryImageUrls.length > 0 ? primaryImageUrls[0] : null;

            // 2. Create the SINGLE parent product
            const productData = {
                shop_id: this.shopId,
                product_name: baseName,
                sku: baseSku,
                category: category || null,
                type: productType || null,
                stock: baseStock,
                cost_price: baseCost,
                selling_price: basePrice,
                product_image: mainImageUrl,
                product_images: primaryImageUrls,
                description: description || null,
                low_stock_alert: lowStockAlert,
                priority: priority,
                show_in_store: showInStore,
                metadata: { ...dynamicValues, has_variants: true, base_stock: baseStock, product_images: primaryImageUrls },
                updated_at: new Date().toISOString()
            };

            const { data: savedProduct, error: productError } = await supabaseClient
                .from('products')
                .insert([productData])
                .select()
                .single();

            if (productError) throw productError;

            const productId = savedProduct.id;

            // 3. Upload variant images and insert variant rows
            const variantRows = [];

            for (let i = 0; i < variants.length; i++) {
                const v = variants[i];
                const variantImageUrls = [];

                // Upload all variant images to ImgBB (up to 5)
                const allImageFiles = v.imageFiles || [];
                const existingUrls = v.imageUrls || [];

                for (const file of allImageFiles) {
                    if (file) {
                        try {
                            const publicUrl = await window.utils.uploadImageToImgbb(file);
                            if (publicUrl) {
                                variantImageUrls.push(publicUrl);
                            } else {
                                console.error('Upload error: failed to get URL from ImgBB for variant image');
                            }
                        } catch (err) {
                            console.error('Variant file upload exception:', err);
                        }
                    }
                }

                // Add existing URLs that weren't re-uploaded
                existingUrls.forEach(url => {
                    if (url && !url.startsWith('data:') && !variantImageUrls.includes(url)) {
                        variantImageUrls.push(url);
                    }
                });

                const primaryVariantImage = variantImageUrls.length > 0 ? variantImageUrls[0] : mainImageUrl;

                variantRows.push({
                    product_id: productId,
                    shop_id: this.shopId,
                    variant_name: v.name,
                    attributes: { name: v.name, ...(v.attributes || {}), ...(!Object.keys(v.attributes || {}).length ? dynamicValues : {}), variant_images: variantImageUrls },
                    sku: `${baseSku}-${v.name.replace(/\s+/g, '').toUpperCase()}-${i + 1}`,
                    price: v.price || basePrice,
                    cost_price: v.costPrice || baseCost,
                    stock: v.stock,
                    image_url: primaryVariantImage,
                    is_active: true
                });
            }

            const { error: variantError } = await supabaseClient
                .from('product_variants')
                .insert(variantRows);

            if (variantError) throw variantError;

            showNotification(`Product created with ${variantRows.length} variant(s)!`, 'success');
            this.closeAllModals();
            await this.loadInventory();

        } catch (error) {
            console.error('Variant save error:', error);
            showNotification('Failed to save: ' + (error.message || 'Unknown error'), 'error');
        } finally {
            showLoading(false);
        }
    }

    async saveVariantsForProduct(productId) {
        const rows = document.querySelectorAll('#variantsList .variant-row');
        if (rows.length === 0) return;

        // Get main product dynamic values as fallback
        const mainDynamicValues = this.getDynamicFieldValues();

        for (const row of rows) {
            const dbId = row.dataset.variantDbId;
            const name = row.querySelector('.variant-name').value.trim();
            const stock = parseInt(row.querySelector('.variant-stock').value) || 0;
            const costPrice = parseFloat(row.querySelector('.variant-cost').value) || 0;
            const price = parseFloat(row.querySelector('.variant-price').value) || 0;

            if (!name) continue;

            // Collect variant-specific attributes
            const attributes = { name };
            row.querySelectorAll('.variant-attr').forEach(input => {
                const fieldId = input.dataset.fieldId;
                const val = input.value.trim();
                if (fieldId && val) attributes[fieldId] = val;
            });

            // Include size stocks if any
            if (row._variantSizeStocks && Object.keys(row._variantSizeStocks).length > 0) {
                const totalSizeStock = Object.values(row._variantSizeStocks).reduce((sum, q) => sum + (parseInt(q) || 0), 0);
                if (totalSizeStock > stock) {
                    throw new Error(`Variant "${name}" has total size stock (${totalSizeStock}) greater than its total stock (${stock}).`);
                }
                attributes.size_stock = row._variantSizeStocks;
            }
            if (row._variantSizePrices && Object.keys(row._variantSizePrices).length > 0) {
                attributes.size_price = row._variantSizePrices;
                attributes.size_prices = row._variantSizePrices;
            }

            // If no variant-specific attrs filled, use main product values as default
            if (Object.keys(attributes).length <= 1 && Object.keys(mainDynamicValues).length > 0) {
                Object.assign(attributes, mainDynamicValues);
            }

            // Upload all variant images (multiple)
            const variantImageUrls = [];
            const variantImages = row._variantImages || [];

            for (const img of variantImages) {
                if (img.file) {
                    try {
                        const publicUrl = await window.utils.uploadImageToImgbb(img.file);
                        if (publicUrl) {
                            variantImageUrls.push(publicUrl);
                        } else {
                            console.error('Upload error: failed to get URL from ImgBB for variant image');
                        }
                    } catch (err) {
                        console.error('Variant image upload exception:', err);
                    }
                } else if (img.url && !img.url.startsWith('data:')) {
                    variantImageUrls.push(img.url);
                }
            }

            // Store all image URLs in attributes
            if (variantImageUrls.length > 0) {
                attributes.variant_images = variantImageUrls;
            }

            const primaryImageUrl = variantImageUrls.length > 0 ? variantImageUrls[0] : null;

            if (dbId) {
                // Update existing variant
                const updateData = { variant_name: name, stock, cost_price: costPrice, price, attributes };
                if (primaryImageUrl) updateData.image_url = primaryImageUrl;
                await supabaseClient.from('product_variants').update(updateData).eq('id', dbId);
            } else {
                // Insert new variant
                const baseSku = document.getElementById('productSKU').value || '';
                await supabaseClient.from('product_variants').insert([{
                    product_id: productId,
                    shop_id: this.shopId,
                    variant_name: name,
                    attributes: attributes,
                    sku: `${baseSku}-${name.replace(/\s+/g, '').toUpperCase()}`,
                    price: price,
                    cost_price: costPrice,
                    stock: stock,
                    image_url: primaryImageUrl,
                    is_active: true
                }]);
            }
        }

        // Don't modify parent stock — it stores only base stock
        // POS and inventory calculate total dynamically
    }

    showImageSourcePicker() {
        // Remove existing picker if any
        const existing = document.getElementById('imageSourcePicker');
        if (existing) existing.remove();

        const picker = document.createElement('div');
        picker.id = 'imageSourcePicker';
        picker.className = 'modal active';
        picker.innerHTML = `
            <div class="modal-content" style="max-width:300px;border-radius:16px;overflow:hidden;">
                <div style="padding:20px;text-align:center;">
                    <h4 style="margin:0 0 16px;font-size:1rem;color:#334155;">Add Image</h4>
                    <div style="display:flex;gap:12px;">
                        <button id="pickCamera" style="flex:1;padding:20px 12px;border:2px solid #e2e8f0;border-radius:12px;background:white;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;transition:all 0.2s;">
                            <i class="fas fa-camera" style="font-size:1.5rem;color:#3b82f6;"></i>
                            <span style="font-size:0.8rem;font-weight:600;color:#334155;">Camera</span>
                        </button>
                        <button id="pickGallery" style="flex:1;padding:20px 12px;border:2px solid #e2e8f0;border-radius:12px;background:white;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;transition:all 0.2s;">
                            <i class="fas fa-images" style="font-size:1.5rem;color:#8b5cf6;"></i>
                            <span style="font-size:0.8rem;font-weight:600;color:#334155;">Gallery</span>
                        </button>
                    </div>
                    <button style="margin-top:12px;padding:8px 20px;border:none;background:#f1f5f9;border-radius:8px;cursor:pointer;font-size:0.8rem;color:#64748b;" onclick="this.closest('.modal').remove()">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(picker);
        picker.addEventListener('click', (e) => { if (e.target === picker) picker.remove(); });

        picker.querySelector('#pickCamera').addEventListener('click', () => {
            picker.remove();
            document.getElementById('productCameraFile').click();
        });

        picker.querySelector('#pickGallery').addEventListener('click', () => {
            picker.remove();
            document.getElementById('productImageFile').click();
        });
    }

    showVariantImagePicker(row, imgPreview) {
        const existing = document.getElementById('imageSourcePicker');
        if (existing) existing.remove();

        if ((row._variantImages || []).length >= 5) {
            showNotification('Maximum 5 images per variant', 'warning');
            return;
        }

        const picker = document.createElement('div');
        picker.id = 'imageSourcePicker';
        picker.className = 'modal active';
        
        // Gather all uploaded images (Primary + Variants)
        const allUploadedImages = [];
        const seenUrls = new Set();
        
        if (this.productImages) {
            this.productImages.forEach(img => {
                if (img.url && !seenUrls.has(img.url)) {
                    seenUrls.add(img.url);
                    allUploadedImages.push(img);
                }
            });
        }
        
        document.querySelectorAll('#variantsList .variant-row').forEach(r => {
            if (r._variantImages) {
                r._variantImages.forEach(img => {
                    if (img.url && !seenUrls.has(img.url)) {
                        seenUrls.add(img.url);
                        allUploadedImages.push(img);
                    }
                });
            }
        });

        let primaryImagesHtml = '';
        if (allUploadedImages.length > 0) {
            primaryImagesHtml = `
                <div style="margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                    <h5 style="margin: 0 0 10px; font-size: 0.85rem; color: #475569; text-align: left;">Choose from Uploaded Images</h5>
                    <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px;">
                        ${allUploadedImages.map((img, idx) => `
                            <img src="${img.url}" data-idx="${idx}" class="vpick-primary-img" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: border-color 0.2s;">
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        picker.innerHTML = `
            <div class="modal-content" style="max-width:300px;border-radius:16px;overflow:hidden;">
                <div style="padding:20px;text-align:center;">
                    <h4 style="margin:0 0 16px;font-size:1rem;color:#334155;">Add Variant Image</h4>
                    <div style="display:flex;gap:12px;">
                        <button id="vpickCamera" style="flex:1;padding:20px 12px;border:2px solid #e2e8f0;border-radius:12px;background:white;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;">
                            <i class="fas fa-camera" style="font-size:1.5rem;color:#3b82f6;"></i>
                            <span style="font-size:0.8rem;font-weight:600;color:#334155;">Camera</span>
                        </button>
                        <button id="vpickGallery" style="flex:1;padding:20px 12px;border:2px solid #e2e8f0;border-radius:12px;background:white;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;">
                            <i class="fas fa-images" style="font-size:1.5rem;color:#8b5cf6;"></i>
                            <span style="font-size:0.8rem;font-weight:600;color:#334155;">Gallery</span>
                        </button>
                    </div>
                    ${primaryImagesHtml}
                    <button style="margin-top:12px;padding:8px 20px;border:none;background:#f1f5f9;border-radius:8px;cursor:pointer;font-size:0.8rem;color:#64748b;" onclick="this.closest('.modal').remove()">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(picker);
        picker.addEventListener('click', (e) => { if (e.target === picker) picker.remove(); });

        const self = this;
        const handleFile = (file) => {
            if (file && file.type.startsWith('image/')) {
                compressImage(file, 800, 0.7).then(compressed => {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        if (!row._variantImages) row._variantImages = [];
                        row._variantImages.push({ file: compressed, url: ev.target.result });
                        row._variantFile = row._variantImages[0].file;
                        self.renderVariantImagesGrid(row);
                    };
                    reader.readAsDataURL(compressed);
                });
            }
        };

        if (allUploadedImages.length > 0) {
            picker.querySelectorAll('.vpick-primary-img').forEach(imgEl => {
                imgEl.addEventListener('click', (e) => {
                    const idx = e.target.getAttribute('data-idx');
                    const selectedImg = allUploadedImages[idx];
                    if (selectedImg) {
                        if (!row._variantImages) row._variantImages = [];
                        row._variantImages.push({
                            file: selectedImg.file,
                            url: selectedImg.url
                        });
                        row._variantFile = row._variantImages[0].file;
                        self.renderVariantImagesGrid(row);
                        picker.remove();
                    }
                });
                imgEl.addEventListener('mouseenter', (e) => e.target.style.borderColor = '#3b82f6');
                imgEl.addEventListener('mouseleave', (e) => e.target.style.borderColor = 'transparent');
            });
        }

        picker.querySelector('#vpickCamera').addEventListener('click', () => {
            picker.remove();
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.capture = 'environment';
            input.onchange = (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); };
            input.click();
        });

        picker.querySelector('#vpickGallery').addEventListener('click', () => {
            picker.remove();
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = true;
            input.onchange = (e) => { 
                if (e.target.files) {
                    for (let i = 0; i < e.target.files.length; i++) {
                        handleFile(e.target.files[i]);
                    }
                }
            };
            input.click();
        });
    }

    handlePhotoSelection(file) {
        if (!file.type.startsWith('image/')) {
            showNotification('Please select an image file', 'error');
            return;
        }

        if (this.productImages.length >= 5) {
            showNotification('Maximum 5 images allowed per product', 'warning');
            return;
        }

        // Compress image before storing
        compressImage(file, 800, 0.7).then(compressedFile => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.productImages.push({
                    file: compressedFile,
                    url: e.target.result
                });
                this.renderProductImagesGrid();
            };
            reader.readAsDataURL(compressedFile);
        });
    }

    renderProductImagesGrid() {
        const grid = document.getElementById('productImagesGrid');
        if (!grid) return;

        grid.innerHTML = '';

        // Render current images
        this.productImages.forEach((img, index) => {
            const slot = document.createElement('div');
            slot.className = 'image-slot';
            slot.innerHTML = `
                <img src="${img.url}" alt="Product image">
                <button type="button" class="remove-image" onclick="inventoryManager.removeProductImage(${index})">
                    <i class="fas fa-times"></i>
                </button>
                ${index === 0 ? '<span class="primary-badge">Primary</span>' : ''}
            `;
            grid.appendChild(slot);
        });

        // Render empty slots up to 5
        if (this.productImages.length < 5) {
            const emptySlot = document.createElement('div');
            emptySlot.className = 'image-slot empty';
            emptySlot.onclick = () => this.showImageSourcePicker();
            emptySlot.innerHTML = `<i class="fas fa-plus"></i>`;
            grid.appendChild(emptySlot);
        }
    }

    removeProductImage(index) {
        this.productImages.splice(index, 1);
        this.renderProductImagesGrid();
    }

    clearPhotos() {
        this.productImages = [];
        this.renderProductImagesGrid();
        const fileInput = document.getElementById('productImageFile');
        if (fileInput) fileInput.value = '';
    }

    async showEditProductModal(productId) {
        showLoading(true);

        try {
            const { data: product, error } = await supabaseClient
                .from('products')
                .select('*')
                .eq('id', productId)
                .single();

            if (error) throw error;

            // Populate form
            document.getElementById('modalTitle').textContent = 'Edit Product';
            document.getElementById('productId').value = product.id;
            document.getElementById('productName').value = product.product_name || '';
            document.getElementById('productSKU').value = product.sku || '';
            document.getElementById('productPriority').value = product.priority || 0;

            // Handle category - check if column exists
            let categoryValue = 'Other';
            if (product.category) {
                categoryValue = product.category;
            }
            document.getElementById('productCategory').value = categoryValue;
            this.updateProductTypes(categoryValue, product.type || '');

            document.getElementById('productStock').value = product.stock || 0;
            document.getElementById('costPrice').value = product.cost_price || '';
            document.getElementById('sellingPrice').value = product.selling_price || '';

            // Reset selling-price suggestion tracking
            this._lastSuggestedSellingPrice = '';
            if (this.updateSellingClearBtn) this.updateSellingClearBtn();

            // Render dynamic fields and populate existing attribute values
            this.renderDynamicFields(product);

            // Handle Multiple Images
            this.productImages = [];

            // Try product_images column first
            let imageList = product.product_images || [];
            if (typeof imageList === 'string') {
                try { imageList = JSON.parse(imageList); } catch (e) { imageList = []; }
            }

            // Fallback to metadata
            if (imageList.length === 0 && product.metadata && product.metadata.product_images) {
                imageList = product.metadata.product_images;
            }

            // Fallback to legacy single product_image
            if (imageList.length === 0 && product.product_image) {
                imageList = [product.product_image];
            }

            if (Array.isArray(imageList)) {
                this.productImages = imageList.map(url => ({ file: null, url: url }));
            }
            this.renderProductImagesGrid();

            document.getElementById('productDescription').value = product.description ? product.description.split('--SPECIFICATIONS--')[0].split('--VARIANT_DATA--')[0].trim() : '';

            document.getElementById('lowStockAlert').value = product.low_stock_alert || this.lowStockThreshold || 10;

            // Set show in store checkbox
            const showInStoreCheckbox = document.getElementById('showInStore');
            if (showInStoreCheckbox) {
                showInStoreCheckbox.checked = product.show_in_store !== false;
            }

            // Variant editing: Load variants from product_variants table
            this.resetVariants();
            const enableVariantsCheckbox = document.getElementById('enableVariants');
            const variantsSection = document.getElementById('variantsSection');
            const variantsList = document.getElementById('variantsList');

            if (enableVariantsCheckbox && variantsSection && variantsList) {
                // Show the variant section and allow editing
                enableVariantsCheckbox.parentElement.parentElement.style.display = '';
                enableVariantsCheckbox.disabled = false;

                // Load existing variants from database
                try {
                    const { data: existingVariants } = await supabaseClient
                        .from('product_variants')
                        .select('*')
                        .eq('product_id', product.id)
                        .order('created_at');

                    if (existingVariants && existingVariants.length > 0) {
                        enableVariantsCheckbox.checked = true;
                        variantsSection.style.display = 'block';

                        // Show existing variants with edit/delete capability
                        existingVariants.forEach(v => {
                            this.addVariantRowWithData(v);
                        });
                    }
                } catch (e) {
                    console.warn('Could not load variants:', e);
                }
            }

            // Reset manual SKU flag for editing
            this.isManualSku = true;

            // Render dynamic fields and populate them
            this.renderDynamicFields(product);

            // Show delete button for admin
            document.getElementById('deleteProductBtn').style.display =
                this.currentUser.role === 'shop_admin' ? 'block' : 'none';

            // Show modal
            document.getElementById('productModal').classList.add('active');

        } catch (error) {

            showNotification('Failed to load product details', 'error');
        } finally {
            showLoading(false);
        }
    }

    async saveProduct() {
        // Get form values
        const productId = document.getElementById('productId').value;
        const productName = document.getElementById('productName').value.trim();
        const sku = document.getElementById('productSKU').value.trim();
        const category = document.getElementById('productCategory').value.trim();
        const productType = document.getElementById('productType').value.trim();
        const stock = parseInt(document.getElementById('productStock').value) || 0;
        const costPrice = parseFloat(document.getElementById('costPrice').value) || 0;
        const sellingPrice = parseFloat(document.getElementById('sellingPrice').value) || 0;
        const description = document.getElementById('productDescription').value.trim();
        const lowStockAlert = parseInt(document.getElementById('lowStockAlert').value) || this.lowStockThreshold || 10;
        const rawPriority = document.getElementById('productPriority').value;
        const priority = rawPriority !== '' && !isNaN(parseInt(rawPriority)) ? parseInt(rawPriority) : 1000;
        const showInStore = document.getElementById('showInStore')?.checked !== false;

        // Get dynamic fields values
        const dynamicValues = this.getDynamicFieldValues();

        // Build metadata.attributes from multi-value tag fields and store in dynamicValues
        const formattedAttributes = {};
        if (this.dynTagFields) {
            Object.keys(this.dynTagFields).forEach(k => {
                const val = this.dynTagFields[k];
                if (val instanceof Set && val.size > 0) {
                    formattedAttributes[k] = Array.from(val);
                }
            });
        }
        // Also include any string values from dynamicValues that are multi-type
        Object.keys(dynamicValues).forEach(k => {
            if (Array.isArray(dynamicValues[k])) {
                formattedAttributes[k] = dynamicValues[k];
            }
        });

        // Include per-tag stock maps (size_stock, etc.) in formattedAttributes
        if (this.dynTagStocks) {
            Object.keys(this.dynTagStocks).forEach(k => {
                const stockMap = this.dynTagStocks[k];
                if (stockMap && Object.keys(stockMap).length > 0) {
                    formattedAttributes[`${k}_stock`] = stockMap;
                    dynamicValues[`${k}_stock`] = stockMap; // also top-level for easy access
                }
            });
        }

        // Include per-tag price maps (size_price, etc.) in formattedAttributes
        if (this.dynTagPrices) {
            Object.keys(this.dynTagPrices).forEach(k => {
                const priceMap = this.dynTagPrices[k];
                if (priceMap && Object.keys(priceMap).length > 0) {
                    formattedAttributes[`${k}_price`] = priceMap;
                    dynamicValues[`${k}_price`] = priceMap; // also top-level for easy access
                    formattedAttributes[`${k}_prices`] = priceMap;
                    dynamicValues[`${k}_prices`] = priceMap;
                }
            });
        }

        dynamicValues.attributes = formattedAttributes;

        // Top-level fallbacks for backward compatibility
        if (formattedAttributes.color) {
            dynamicValues.color = formattedAttributes.color;
            dynamicValues.available_colors = formattedAttributes.color;
        }
        if (formattedAttributes.size) {
            dynamicValues.size = formattedAttributes.size;
            dynamicValues.available_sizes = formattedAttributes.size;
        }


        // Validate
        if (!productName || !sku) {
            showNotification('Product name and SKU are required', 'error');
            return;
        }

        if (costPrice < 0 || sellingPrice < 0 || stock < 0) {
            showNotification('Prices and stock cannot be negative', 'error');
            return;
        }

        // Validate per-size stock: total size quantities must not exceed product stock
        if (this.dynTagStocks) {
            for (const key of Object.keys(this.dynTagStocks)) {
                const stockMap = this.dynTagStocks[key];
                if (!stockMap || Object.keys(stockMap).length === 0) continue;
                const totalSizeStock = Object.values(stockMap).reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);
                if (totalSizeStock > stock) {
                    const label = key.charAt(0).toUpperCase() + key.slice(1);
                    showNotification(
                        `Total ${label} stock (${totalSizeStock}) exceeds product stock quantity (${stock}). Please reduce size quantities.`,
                        'error'
                    );
                    return;
                }
            }
        }

        // Check if variants are enabled (only for NEW products, not edits)
        const variantsEnabled = document.getElementById('enableVariants')?.checked && !productId;
        const variants = variantsEnabled ? this.getVariants() : [];

        if (variantsEnabled && variants.length === 0) {
            showNotification('Please add at least one variant or disable variants', 'error');
            return;
        }

        showLoading(true);

        try {
            // If variants enabled, save multiple products
            if (variantsEnabled && variants.length > 0) {
                console.log('[Save] Saving', variants.length, 'variants for:', productName);
                await this.saveProductWithVariants(productName, sku, category, productType, costPrice, sellingPrice, stock, description, lowStockAlert, priority, showInStore, dynamicValues, variants);
                return;
            }

            // Prepare product data (single product save)
            const productData = {
                shop_id: this.shopId,
                product_name: productName,
                sku: sku,
                stock: stock,
                cost_price: costPrice,
                selling_price: sellingPrice,
                updated_at: new Date().toISOString()
            };

            // Add optional fields only if they have values
            if (category && category !== '') {
                productData.category = category;
            }

            if (productType && productType !== '') {
                productData.type = productType;
            }

            const cleanDesc = description.split('--SPECIFICATIONS--')[0].split('--VARIANT_DATA--')[0].trim();
            if (cleanDesc && cleanDesc !== '') {
                productData.description = cleanDesc;
            }

            // Store dynamic fields in metadata if column exists, or in description as JSON string block
            productData.metadata = dynamicValues;

            productData.low_stock_alert = lowStockAlert;
            productData.priority = priority;
            productData.show_in_store = showInStore;

            // Handle Multiple Image Uploads
            const finalImageUrls = [];
            for (const img of this.productImages) {
                if (img.file) {
                    try {
                        const publicUrl = await window.utils.uploadImageToImgbb(img.file);
                        if (!publicUrl) {
                            console.error('Upload error: failed to get URL from ImgBB');
                            continue; // Skip failed uploads but keep going
                        }

                        finalImageUrls.push(publicUrl);
                    } catch (err) {
                        console.error('File upload exception:', err);
                    }
                } else if (img.url && !img.url.startsWith('data:')) {
                    finalImageUrls.push(img.url);
                }
            }

            if (finalImageUrls.length > 0) {
                productData.product_image = finalImageUrls[0]; // Primary image
                productData.product_images = finalImageUrls; // All images

                // Also store in metadata as fallback
                productData.metadata = {
                    ...(productData.metadata || {}),
                    product_images: finalImageUrls
                };
            } else {
                productData.product_image = null;
                productData.product_images = [];
            }

            let result;

            if (productId) {
                // Update existing product
                const { data, error } = await supabaseClient
                    .from('products')
                    .update(productData)
                    .eq('id', productId)
                    .select()
                    .single();

                if (error) {
                    // Handle missing columns
                    if (error.message.includes('column "category" does not exist') ||
                        error.message.includes('column "type" does not exist') ||
                        error.message.includes('column "product_image" does not exist') ||
                        error.message.includes('column "product_images" does not exist')) {

                        // Remove problematic columns and try again
                        if (error.message.includes('column "category"')) delete productData.category;
                        if (error.message.includes('column "type"')) delete productData.type;
                        if (error.message.includes('column "product_image"')) delete productData.product_image;
                        if (error.message.includes('column "product_images"')) delete productData.product_images;
                        if (error.message.includes('column "metadata"')) {
                            // If metadata column missing, append to description
                            if (Object.keys(dynamicValues).length > 0) {
                                const baseDesc = (productData.description || '').split('--SPECIFICATIONS--')[0].split('--VARIANT_DATA--')[0].trim();
                                productData.description = (baseDesc ? baseDesc + '\n' : '') +
                                    '--SPECIFICATIONS--\n' + JSON.stringify(dynamicValues);
                            }
                            delete productData.metadata;
                        }

                        const { data: updatedData, error: updateError } = await supabaseClient
                            .from('products')
                            .update(productData)
                            .eq('id', productId)
                            .select()
                            .single();

                        if (updateError) throw updateError;
                        result = updatedData;
                    } else {
                        throw error;
                    }
                } else {
                    result = data;
                }

                showNotification('Product updated successfully', 'success');

                // Save/update variants if variant section is active
                const variantsChecked = document.getElementById('enableVariants')?.checked;
                if (variantsChecked) {
                    await this.saveVariantsForProduct(productId);
                }

                // Audit Log
                if (window.authManager) {
                    await window.authManager.createAuditLog('update', 'products', productId, null, {
                        product_name: productName,
                        sku: sku,
                        stock: stock,
                        selling_price: sellingPrice
                    });
                }
            } else {
                // Add new product
                const { data, error } = await supabaseClient
                    .from('products')
                    .insert([productData])
                    .select()
                    .single();

                if (error) {
                    // Handle missing columns or duplicate SKU
                    if (error.message.includes('column "category" does not exist') ||
                        error.message.includes('column "type" does not exist') ||
                        error.message.includes('column "product_image" does not exist') ||
                        error.message.includes('column "product_images" does not exist')) {

                        // Remove problematic columns and try again
                        if (error.message.includes('column "category"')) delete productData.category;
                        if (error.message.includes('column "type"')) delete productData.type;
                        if (error.message.includes('column "product_image"')) delete productData.product_image;
                        if (error.message.includes('column "product_images"')) delete productData.product_images;
                        if (error.message.includes('column "metadata"')) {
                            // If metadata column missing, append to description
                            if (Object.keys(dynamicValues).length > 0) {
                                const baseDesc = (productData.description || '').split('--SPECIFICATIONS--')[0].split('--VARIANT_DATA--')[0].trim();
                                productData.description = (baseDesc ? baseDesc + '\n' : '') +
                                    '--SPECIFICATIONS--\n' + JSON.stringify(dynamicValues);
                            }
                            delete productData.metadata;
                        }

                        const { data: newData, error: insertError } = await supabaseClient
                            .from('products')
                            .insert([productData])
                            .select()
                            .single();

                        if (insertError) {
                            if (insertError.code === '23505') { // Unique constraint violation
                                throw new Error('SKU already exists');
                            }
                            throw insertError;
                        }
                        result = newData;
                    } else if (error.code === '23505') { // Unique constraint violation
                        throw new Error('SKU already exists');
                    } else {
                        throw error;
                    }
                } else {
                    result = data;
                }

                showNotification('Product added successfully', 'success');

                // Audit Log
                if (window.authManager) {
                    await window.authManager.createAuditLog('create', 'products', result?.id, null, {
                        product_name: productName,
                        sku: sku,
                        stock: stock,
                        selling_price: sellingPrice
                    });
                }
            }

            // Close modal and refresh
            this.closeAllModals();
            await this.loadInventory();

        } catch (error) {

            showNotification('Failed to save product: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async deleteProduct() {
        const productId = document.getElementById('productId').value;

        if (!productId) return;

        if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
            return;
        }

        showLoading(true);

        try {
            // Check if product has sales
            const { data: sales, error: salesError } = await supabaseClient
                .from('sale_items')
                .select('id')
                .eq('product_id', productId)
                .limit(1);

            if (salesError) throw salesError;

            if (sales && sales.length > 0) {
                showNotification('Cannot delete product with sales history. You can set stock to 0 instead.', 'error');
                return;
            }

            // Delete product
            const { error } = await supabaseClient
                .from('products')
                .delete()
                .eq('id', productId);

            if (error) throw error;

            showNotification('Product deleted successfully', 'success');

            // Audit Log
            if (window.authManager) {
                await window.authManager.createAuditLog('delete', 'products', productId, null, { product_id: productId });
            }

            // Close modal and refresh sli
            this.closeAllModals();
            await this.loadInventory();

        } catch (error) {

            showNotification('Failed to delete product', 'error');
        } finally {
            showLoading(false);
        }
    }

    async deleteProductById(productId) {
        if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
            return;
        }

        showLoading(true);

        try {
            // Check if product has sales
            const { data: sales, error: salesError } = await supabaseClient
                .from('sale_items')
                .select('id')
                .eq('product_id', productId)
                .limit(1);

            if (salesError) throw salesError;

            if (sales && sales.length > 0) {
                showNotification('Cannot delete product with sales history. You can set stock to 0 instead.', 'error');
                return;
            }

            // Delete product
            const { error } = await supabaseClient
                .from('products')
                .delete()
                .eq('id', productId);

            if (error) throw error;

            showNotification('Product deleted successfully', 'success');

            // Audit Log
            if (window.authManager) {
                await window.authManager.createAuditLog('delete', 'products', productId, null, { product_id: productId });
            }

            // Refresh inventory
            await this.loadInventory();

        } catch (error) {

            showNotification('Failed to delete product', 'error');
        } finally {
            showLoading(false);
        }
    }

    generateSKU(force = false) {
        const name = document.getElementById('productName').value.trim();
        const skuInput = document.getElementById('productSKU');

        if (!name && !force) return;

        // Smart Algorithm for accurate 5-6 char SKU
        const words = name.split(/\s+/).filter(w => w.length > 0);
        let prefix = '';
        let suffix = '';

        if (words.length > 0) {
            // Take 3 chars from first word, preferring consonants
            const first = words[0].replace(/[aeiou]/ig, '');
            prefix = (first.length >= 3 ? first : words[0]).substring(0, 3);
        }

        // Try to find numbers (size etc)
        const digits = name.match(/\d+/);
        if (digits) {
            suffix = digits[0].substring(0, 2);
        }

        // Add first letter of last word if available
        let lastChar = '';
        if (words.length > 1) {
            lastChar = words[words.length - 1].charAt(0);
        }

        let baseSku = (prefix + suffix + lastChar).toUpperCase().substring(0, 6);

        // Padding if too short
        if (baseSku.length < 4) {
            const extra = Math.random().toString(36).substring(2, 6 - baseSku.length).toUpperCase();
            baseSku += extra;
        }

        // If 'force' (refresh button clicked), always make it different by adding random at end or changing padding
        if (force) {
            const randomChar = Math.random().toString(36).substring(2, 3).toUpperCase();
            if (baseSku.length >= 6) {
                baseSku = baseSku.substring(0, 5) + randomChar;
            } else {
                baseSku += randomChar;
            }
        }

        skuInput.value = baseSku.substring(0, 6);
    }

    generateProductHighlights() {
        const nameInput = document.getElementById('productName');
        const name = nameInput ? nameInput.value.trim() : '';

        const categoryElem = document.getElementById('productCategory');
        const category = categoryElem && categoryElem.value && categoryElem.value !== 'Other' ? categoryElem.value.trim() : '';

        const typeElem = document.getElementById('productType');
        const productType = typeElem && typeElem.value && !typeElem.value.toLowerCase().includes('select') ? typeElem.value.trim() : '';

        const priceElem = document.getElementById('sellingPrice');
        const priceVal = priceElem ? parseFloat(priceElem.value) : 0;

        const descInput = document.getElementById('productDescription');

        // Check if enough info exists
        if (!name && !productType && !category && (!priceVal || priceVal <= 0)) {
            showNotification('Please enter a Product Name or select Category/Type first', 'warning');
            if (nameInput) nameInput.focus();
            return;
        }

        // Determine core subject noun: productType > name > category > 'Product'
        let subject = 'Product';
        if (productType && productType !== 'Other') {
            subject = productType;
        } else if (name) {
            subject = name;
        } else if (category && category !== 'Other') {
            subject = category;
        }

        const catLower = ((category || '') + ' ' + (productType || '') + ' ' + (this.businessType || '')).toLowerCase();

        // 1. Gather dynamic attributes (Material, Fabric, Brand, Warranty, etc.)
        const materialVal = (document.getElementById('dyn_material')?.value || '').trim();
        const brandVal = (document.getElementById('dyn_brand')?.value || '').trim();
        const modelVal = (document.getElementById('dyn_model')?.value || '').trim();
        const dietaryVal = (document.getElementById('dyn_dietary')?.value || '').trim();

        // Dynamic Tag fields (Colors, Sizes, etc.)
        const colors = this.dynTagFields && this.dynTagFields['color'] && this.dynTagFields['color'].size > 0 
            ? Array.from(this.dynTagFields['color']) 
            : [];
        const sizes = this.dynTagFields && this.dynTagFields['size'] && this.dynTagFields['size'].size > 0 
            ? Array.from(this.dynTagFields['size']) 
            : [];

        // 2. Gather variants from variant rows (Live variants from DOM)
        const variantRows = document.querySelectorAll('#variantsList .variant-row');
        const variantsList = [];
        variantRows.forEach(row => {
            const vName = row.querySelector('.variant-name')?.value?.trim();
            const vPriceVal = parseFloat(row.querySelector('.variant-price')?.value);
            const vStockVal = parseInt(row.querySelector('.variant-stock')?.value);
            if (vName) {
                variantsList.push({
                    name: vName,
                    price: !isNaN(vPriceVal) && vPriceVal > 0 ? vPriceVal : (priceVal > 0 ? priceVal : null),
                    stock: !isNaN(vStockVal) ? vStockVal : null
                });
            }
        });

        const enableVariants = document.getElementById('enableVariants')?.checked;

        const sections = [];

        // ==================== SECTION 1: CORE FEATURE & CRAFTSMANSHIP HIGHLIGHTS ====================
        const highlightBullets = [];
        if (catLower.includes('elec') || catLower.includes('tech') || catLower.includes('appliance') || catLower.includes('mobile')) {
            highlightBullets.push(`• Premium Quality: ${subject} engineered for high performance, reliability & durability`);
        } else if (catLower.includes('food') || catLower.includes('rest') || catLower.includes('groc') || catLower.includes('cafe') || catLower.includes('bakery')) {
            highlightBullets.push(`• Fresh & Authentic: ${subject} prepared with premium ingredients for rich flavor & satisfaction`);
        } else if (catLower.includes('med') || catLower.includes('pharma') || catLower.includes('health')) {
            highlightBullets.push(`• Certified Quality: ${subject} formulated for safety, precision & reliable effectiveness`);
        } else if (catLower.includes('cosmet') || catLower.includes('beauty') || catLower.includes('skin')) {
            highlightBullets.push(`• Premium Care: ${subject} formulated for gentle nourishment & radiant results`);
        } else {
            // Clothing / Fashion / General
            highlightBullets.push(`• Premium Quality: ${subject} designed for superior comfort & long-lasting durability`);
        }

        // Finish & Aesthetics
        highlightBullets.push(`• Superior Finish: Modern styling with sleek aesthetics and a refined finish suitable for any occasion`);

        // Material / Craftsmanship
        if (materialVal) {
            highlightBullets.push(`• Premium Materials: Crafted from high-grade ${materialVal} ensuring breathability, softness & lasting strength`);
        } else if (brandVal || modelVal) {
            const brandText = [brandVal, modelVal].filter(Boolean).join(' ');
            highlightBullets.push(`• Authentic Craftsmanship: Genuine ${brandText} engineering with precision attention to detail`);
        } else {
            highlightBullets.push(`• Precision Craftsmanship: Built with reinforced durability for everyday wear and versatile usage`);
        }

        // Fit / Ergonomics / Lifestyle
        if (catLower.includes('cloth') || catLower.includes('wear') || catLower.includes('apparel') || catLower.includes('shoe')) {
            highlightBullets.push(`• Tailored Fit: Thoughtfully structured silhouette offering effortless movement and all-day comfort`);
        } else if (catLower.includes('elec') || catLower.includes('tech')) {
            highlightBullets.push(`• Smart & Intuitive: Seamless operation designed for effortless day-to-day productivity and convenience`);
        } else if (catLower.includes('food')) {
            highlightBullets.push(`• Hygienically Prepared: Packed with utmost care to seal in natural freshness and taste`);
        } else {
            highlightBullets.push(`• Everyday Versatility: Seamlessly adapts to your routine with reliable daily performance`);
        }
        sections.push(highlightBullets.join('\n'));

        // ==================== SECTION 2: VARIANTS & OPTIONS BREAKDOWN ====================
        const variantBullets = [];
        if (variantsList.length > 0) {
            variantBullets.push('Available Variants & Options:');
            const displayCount = Math.min(variantsList.length, 12);
            for (let i = 0; i < displayCount; i++) {
                const v = variantsList[i];
                const priceStr = v.price !== null ? (typeof formatCurrency === 'function' ? ` — ${formatCurrency(v.price)}` : ` — ₹${v.price.toFixed(2)}`) : '';
                variantBullets.push(`• ${v.name}${priceStr}`);
            }
            if (variantsList.length > 12) {
                variantBullets.push(`• ...plus ${variantsList.length - 12} more options available to suit your preference`);
            }
        } else if (enableVariants || colors.length > 0 || sizes.length > 0) {
            variantBullets.push('Available Options & Sizes:');
            if (colors.length > 0) {
                variantBullets.push(`• Available Colors: ${colors.join(', ')}`);
            }
            if (sizes.length > 0) {
                variantBullets.push(`• Available Sizes: ${sizes.join(', ')}`);
            }
            variantBullets.push(`• Multiple size & color combinations tailored to your perfect fit`);
        }
        if (variantBullets.length > 0) {
            sections.push(variantBullets.join('\n'));
        }

        // ==================== SECTION 3: SPECIFICATIONS & PRODUCT DETAILS ====================
        const specBullets = [];
        specBullets.push('Product Details & Specifications:');
        if (name && name !== subject) {
            specBullets.push(`• Product: ${name}`);
        }
        if (category && category !== 'Other') {
            specBullets.push(`• Category: ${category}${productType && productType !== category ? ` (${productType})` : ''}`);
        }
        if (materialVal) {
            specBullets.push(`• Material / Fabric: ${materialVal}`);
        }
        if (brandVal || modelVal) {
            specBullets.push(`• Brand / Model: ${[brandVal, modelVal].filter(Boolean).join(' ')}`);
        }
        if (dietaryVal) {
            specBullets.push(`• Dietary Type: ${dietaryVal}`);
        }
        if (catLower.includes('cloth') || catLower.includes('wear') || catLower.includes('apparel')) {
            specBullets.push(`• Care Instructions: Machine washable, color-fast and shrink resistant`);
        } else if (catLower.includes('elec') || catLower.includes('tech')) {
            specBullets.push(`• Package Contents: Product with standard manufacturer accessories and quick start guide`);
        } else if (catLower.includes('food')) {
            specBullets.push(`• Storage: Store in a cool, dry place to maintain peak freshness`);
        }
        sections.push(specBullets.join('\n'));

        // ==================== SECTION 4: VALUE & SATISFACTION ASSURANCE ====================
        const valueBullets = [];
        valueBullets.push('Value & Assurance:');
        const allPrices = variantsList.map(v => v.price).filter(p => p !== null && !isNaN(p) && p > 0);
        if (priceVal > 0) allPrices.push(priceVal);

        if (allPrices.length > 0) {
            const minPrice = Math.min(...allPrices);
            const maxPrice = Math.max(...allPrices);
            if (minPrice !== maxPrice) {
                const minFormatted = typeof formatCurrency === 'function' ? formatCurrency(minPrice) : `₹${minPrice.toFixed(2)}`;
                const maxFormatted = typeof formatCurrency === 'function' ? formatCurrency(maxPrice) : `₹${maxPrice.toFixed(2)}`;
                valueBullets.push(`• Great value starting from ${minFormatted} up to ${maxFormatted}`);
            } else {
                const formatted = typeof formatCurrency === 'function' ? formatCurrency(minPrice) : `₹${minPrice.toFixed(2)}`;
                valueBullets.push(`• Great value at ${formatted}`);
            }
        } else {
            valueBullets.push(`• Great value offering exceptional quality & everyday versatility`);
        }
        valueBullets.push(`• Quality Guarantee: 100% genuine product inspected for customer satisfaction`);
        sections.push(valueBullets.join('\n'));

        // ==================== COMPOSE FINAL DESCRIPTION ====================
        const generatedText = sections.join('\n\n');

        if (descInput) {
            descInput.value = generatedText;
            descInput.focus();
            descInput.style.height = 'auto';
            descInput.style.height = Math.max(140, descInput.scrollHeight + 10) + 'px';
            descInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        showNotification('✨ Comprehensive description & variants summary generated!', 'success');
    }

    filterProducts(searchTerm) {
        this.filterProductsCombined();
    }

    filterByStock(filterType) {
        this.filterProductsCombined();
    }

    filterByCategory(category) {
        this.handleCategoryChange(category);
    }

    loadTypes(category) {
        const typeFilter = document.getElementById('typeFilter');
        if (!typeFilter) return;

        // Collect unique product types ONLY from products added for this shop
        const productTypes = new Set();
        (this.products || []).forEach(p => {
            const pCat = typeof p.category === 'string' ? p.category : (p.category?.category_name || '');
            const matchesCategory = !category || pCat.toLowerCase() === category.toLowerCase();
            if (matchesCategory && p.type && p.type.trim() && p.type !== 'N/A' && p.type !== 'Select Type') {
                productTypes.add(p.type.trim());
            }
        });

        if (productTypes.size === 0) {
            typeFilter.style.display = 'none';
            typeFilter.value = '';
            return;
        }

        const currentVal = typeFilter.value;
        typeFilter.innerHTML = '<option value="">All Types</option>';
        Array.from(productTypes).sort().forEach(type => {
            const opt = document.createElement('option');
            opt.value = type;
            opt.textContent = type;
            if (type === currentVal) opt.selected = true;
            typeFilter.appendChild(opt);
        });

        typeFilter.style.display = 'inline-block';
    }

    handleCategoryChange(category) {
        this.loadTypes(category);
        this.filterProductsCombined();
    }

    filterProductsCombined() {
        this.filteredProducts = this.applyInventoryFilters();
        this.inventoryPage = 1;
        this.renderProducts();
    }

    escapeCSVField(value) {
        if (value === null || value === undefined) return '';
        let str = String(value);
        if (/[",\r\n]/.test(str)) {
            str = '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    // Takes any metadata shape (raw JSON, partial, or hand-typed) and produces a
    // clean, consistent structure used by the store/pos (attributes + stock/price maps).
    normalizeInventoryMetadata(meta) {
        if (!meta || typeof meta !== 'object' || Array.isArray(meta)) meta = {};
        const out = { ...meta };
        const attrs = {};
        const rawAttrs = (out.attributes && typeof out.attributes === 'object' && !Array.isArray(out.attributes))
            ? out.attributes : {};

        const internalKeys = ['product_images', 'product_image', 'variant_images', 'carousel_images',
            'attributes', 'variant_group', 'has_variants', 'base_stock'];

        const addValues = (key, val) => {
            if (!key || val === undefined || val === null) return;
            const arr = Array.isArray(val) ? val : [val];
            const cleaned = arr.map(v => (v === undefined || v === null ? '' : String(v).trim())).filter(v => v !== '');
            if (!cleaned.length) return;
            if (!attrs[key]) attrs[key] = [];
            cleaned.forEach(v => { if (!attrs[key].includes(v)) attrs[key].push(v); });
        };

        // 1) Array/string values already inside metadata.attributes
        Object.keys(rawAttrs).forEach(k => {
            if (/(_stock|_stocks|_price|_prices)$/i.test(k)) return;
            if (internalKeys.includes(k)) return;
            const v = rawAttrs[k];
            if (Array.isArray(v) || typeof v === 'string' || typeof v === 'number') addValues(k, v);
        });

        // 2) Top-level array values (color/size/etc.)
        const topSkip = internalKeys.concat(['size_stock', 'size_stocks', 'size_price', 'size_prices',
            'color_stock', 'color_price', 'available_colors', 'available_sizes']);
        Object.keys(out).forEach(k => {
            if (topSkip.includes(k)) return;
            const v = out[k];
            if (Array.isArray(v)) addValues(k, v);
        });

        // 3) Fold aliases into canonical keys
        const mergeAlias = (canonical, aliases) => {
            aliases.forEach(a => {
                if (attrs[a]) { addValues(canonical, attrs[a]); delete attrs[a]; }
                if (out[a] !== undefined) addValues(canonical, out[a]);
            });
        };
        mergeAlias('color', ['available_colors', 'available_color', 'colors', 'colour', 'colours']);
        mergeAlias('size', ['available_sizes', 'available_size', 'sizes']);

        // 4) Collect *_stock / *_price maps from top-level and from attributes
        const collectMaps = (obj, suffix, parser) => {
            const maps = {};
            if (!obj || typeof obj !== 'object') return maps;
            const re = new RegExp('^(.+)_' + suffix + 's?$', 'i');
            Object.keys(obj).forEach(k => {
                const m = k.match(re);
                if (!m) return;
                const rawMap = obj[k];
                if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return;
                let base = m[1].toLowerCase();
                if (base === 'colour') base = 'color';
                if (!maps[base]) maps[base] = {};
                Object.keys(rawMap).forEach(opt => {
                    const num = parser(rawMap[opt]);
                    if (!isNaN(num)) maps[base][opt.trim()] = num;
                });
            });
            return maps;
        };

        const stockMaps = Object.assign({}, collectMaps(out, 'stock', parseInt), collectMaps(rawAttrs, 'stock', parseInt));
        const priceMaps = Object.assign({}, collectMaps(out, 'price', parseFloat), collectMaps(rawAttrs, 'price', parseFloat));

        // 5) Write stock/price maps back into both attrs and top-level
        Object.keys(stockMaps).forEach(base => {
            if (!Object.keys(stockMaps[base]).length) return;
            out[base + '_stock'] = stockMaps[base];
            attrs[base + '_stock'] = stockMaps[base];
        });
        Object.keys(priceMaps).forEach(base => {
            if (!Object.keys(priceMaps[base]).length) return;
            out[base + '_price'] = priceMaps[base];
            out[base + '_prices'] = priceMaps[base];
            attrs[base + '_price'] = priceMaps[base];
            attrs[base + '_prices'] = priceMaps[base];
        });

        // 6) Derive attribute option lists from stock map keys when missing
        Object.keys(stockMaps).forEach(base => {
            if (!attrs[base]) attrs[base] = [];
            Object.keys(stockMaps[base]).forEach(opt => {
                if (!attrs[base].includes(opt)) attrs[base].push(opt);
            });
        });

        out.attributes = attrs;

        // 7) Backward-compatible top-level aliases used by the store & POS
        if (attrs.color && attrs.color.length) { out.color = attrs.color; out.available_colors = attrs.color; }
        if (attrs.size && attrs.size.length) { out.size = attrs.size; out.available_sizes = attrs.size; }

        return out;
    }

    // "size: S, M, L; color: Red, Blue"
    formatAttributesForCSV(meta) {
        const attrs = (meta && meta.attributes) || {};
        const parts = [];
        Object.keys(attrs).forEach(k => {
            if (/(_stock|_stocks|_price|_prices)$/i.test(k)) return;
            const v = attrs[k];
            if (Array.isArray(v) && v.length) parts.push(`${k}: ${v.join(', ')}`);
        });
        return parts.join('; ');
    }

    // "size: S=5, M=3; color: Red=2"  (kind = 'stock' | 'price')
    formatOptionMapForCSV(meta, kind) {
        const attrs = (meta && meta.attributes) || {};
        const re = new RegExp('^(.+)_' + (kind === 'price' ? 'prices?' : 'stocks?') + '$', 'i');
        const seen = new Set();
        const parts = [];
        Object.keys(attrs).forEach(k => {
            const m = k.match(re);
            if (!m) return;
            const base = m[1];
            if (seen.has(base)) return;
            const mapObj = attrs[k];
            if (mapObj && typeof mapObj === 'object' && !Array.isArray(mapObj)) {
                const entries = Object.keys(mapObj).map(o => `${o}=${mapObj[o]}`);
                if (entries.length) { parts.push(`${base}: ${entries.join(', ')}`); seen.add(base); }
            }
        });
        return parts.join('; ');
    }

    // Parse "size: S, M; color: Red" -> { size: ['S','M'], color: ['Red'] }
    parseAttributesText(str) {
        const out = {};
        if (!str || typeof str !== 'string') return out;
        str.split(/[;\n]+/).forEach(seg => {
            seg = seg.trim();
            if (!seg) return;
            const idx = seg.indexOf(':');
            if (idx < 0) return;
            const key = seg.slice(0, idx).trim().toLowerCase();
            const vals = seg.slice(idx + 1).split(/[,|]+/).map(s => s.trim()).filter(Boolean);
            if (key && vals.length) out[key] = vals;
        });
        return out;
    }

    // Parse "size: S=5, M=3" -> { size: { S: 5, M: 3 } }
    parseOptionMapText(str, parser) {
        const num = parser || parseInt;
        const out = {};
        if (!str || typeof str !== 'string') return out;
        str.split(/[;\n]+/).forEach(seg => {
            seg = seg.trim();
            if (!seg) return;
            const idx = seg.indexOf(':');
            if (idx < 0) return;
            const base = seg.slice(0, idx).trim().toLowerCase();
            const map = {};
            seg.slice(idx + 1).split(/[,|]+/).forEach(pair => {
                pair = pair.trim();
                if (!pair) return;
                const eq = pair.indexOf('=');
                if (eq < 0) return;
                const opt = pair.slice(0, eq).trim();
                const val = num(pair.slice(eq + 1).trim());
                if (opt && !isNaN(val)) map[opt] = val;
            });
            if (base && Object.keys(map).length) out[base] = map;
        });
        return out;
    }

    async exportInventory() {
        showLoading(true);

        try {
            const allProducts = this.products || [];

            if (allProducts.length === 0) {
                showNotification('No inventory items to export', 'warning');
                return;
            }

            // Fetch full variants for every product so a single CSV can round-trip
            const variantsByProductId = {};
            try {
                const { data: variants } = await supabaseClient
                    .from('product_variants')
                    .select('product_id, variant_name, sku, cost_price, price, stock, image_url, attributes, is_active')
                    .in('product_id', allProducts.map(p => p.id));

                (variants || []).forEach(v => {
                    if (!variantsByProductId[v.product_id]) variantsByProductId[v.product_id] = [];
                    variantsByProductId[v.product_id].push({
                        variant_name: v.variant_name || '',
                        sku: v.sku,
                        cost_price: v.cost_price,
                        price: v.price,
                        stock: v.stock,
                        image_url: v.image_url,
                        attributes: v.attributes,
                        is_active: v.is_active !== false
                    });
                });
            } catch (e) {
                console.warn('Could not load variants for CSV export:', e);
            }

            const headers = [
                'Product Name', 'SKU', 'Category', 'Type', 'Stock', 'Low Stock Alert',
                'Cost Price', 'Selling Price', 'Display Priority', 'Product Image',
                'Description', 'Show In Store', 'Attributes', 'Stock By Option', 'Price By Option',
                'Variants', 'Metadata'
            ];

            const rows = [headers.join(',')];

            allProducts.forEach(product => {
                let category = 'Uncategorized';
                if (typeof product.category === 'string') {
                    category = product.category;
                } else if (product.category && product.category.category_name) {
                    category = product.category.category_name;
                }

                // Auto-correct/normalize metadata so the friendly columns are consistent
                const meta = this.normalizeInventoryMetadata(product.metadata);
                let metadata = '';
                try { metadata = JSON.stringify(meta); } catch (e) { metadata = ''; }

                const attributesText = this.formatAttributesForCSV(meta);
                const stockText = this.formatOptionMapForCSV(meta, 'stock');
                const priceText = this.formatOptionMapForCSV(meta, 'price');

                const variants = variantsByProductId[product.id] || [];
                const variantsJson = variants.length ? JSON.stringify(variants) : '';

                rows.push([
                    this.escapeCSVField(product.product_name || ''),
                    this.escapeCSVField(product.sku || ''),
                    this.escapeCSVField(category),
                    this.escapeCSVField(product.type || ''),
                    this.escapeCSVField(parseInt(product.stock || 0)),
                    this.escapeCSVField(product.low_stock_alert !== undefined && product.low_stock_alert !== null ? product.low_stock_alert : ''),
                    this.escapeCSVField(parseFloat(product.cost_price || 0)),
                    this.escapeCSVField(parseFloat(product.selling_price || 0)),
                    this.escapeCSVField(product.priority !== undefined && product.priority !== null ? product.priority : ''),
                    this.escapeCSVField(product.product_image || ''),
                    this.escapeCSVField(product.description || ''),
                    this.escapeCSVField(product.show_in_store !== false ? 'true' : 'false'),
                    this.escapeCSVField(attributesText),
                    this.escapeCSVField(stockText),
                    this.escapeCSVField(priceText),
                    this.escapeCSVField(variantsJson),
                    this.escapeCSVField(metadata)
                ].join(','));
            });

            // Prepend BOM so Excel opens non-ASCII characters correctly
            const csv = '\uFEFF' + rows.join('\r\n');

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `inventory_all_${this.shopId}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showNotification(`Exported ${allProducts.length} item(s) to a single CSV file`, 'success');

        } catch (error) {
            console.error('Error exporting inventory CSV:', error);
            showNotification('Failed to export inventory', 'error');
        } finally {
            showLoading(false);
        }
    }

    async convertUrlToBase64(url) {
        if (!url || typeof url !== 'string') return null;
        if (url.startsWith('data:image')) {
            return await this.compressBase64Image(url, 500, 0.7);
        }

        try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) return url;
            const blob = await response.blob();

            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(url);
                reader.readAsDataURL(blob);
            });

            if (base64 && base64.startsWith('data:image')) {
                return await this.compressBase64Image(base64, 500, 0.7);
            }
            return base64;
        } catch (e) {
            console.warn('Could not convert image to base64 hard image:', url, e);
            return url;
        }
    }

    async compressBase64Image(dataUrl, maxWidth = 500, quality = 0.7) {
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) return dataUrl;
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxWidth) {
                    if (width > height) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxWidth) / height);
                        height = maxWidth;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        });
    }

    async exportFullInventoryData() {
        const useZip = confirm("Click OK to download as a ZIP Archive with actual image files (images/ folder + inventory.json).\n\nClick CANCEL to download a compact JSON backup file.");
        if (useZip) {
            return this.exportFullInventoryZip();
        }

        showLoading(true);

        try {
            // Fetch all products with complete fields for this shop
            const { data: products, error: pErr } = await supabaseClient
                .from('products')
                .select('*')
                .eq('shop_id', this.shopId)
                .order('product_name');

            if (pErr) throw pErr;

            if (!products || products.length === 0) {
                showNotification('No inventory items to export', 'warning');
                return;
            }

            // Fetch variants for all products
            const productIds = products.map(p => p.id);
            const { data: variants } = await supabaseClient
                .from('product_variants')
                .select('*')
                .in('product_id', productIds);

            const variantsByProductId = {};
            if (variants) {
                variants.forEach(v => {
                    if (!variantsByProductId[v.product_id]) variantsByProductId[v.product_id] = [];
                    variantsByProductId[v.product_id].push({
                        variant_name: v.variant_name || '',
                        sku: v.sku,
                        cost_price: v.cost_price,
                        price: v.price,
                        stock: v.stock,
                        image_url: v.image_url,
                        attributes: v.attributes,
                        is_active: v.is_active
                    });
                });
            }

            showNotification('Compressing product images for compact JSON export...', 'info');

            // Clean product objects for re-import with compact hard images
            const exportProducts = [];
            for (let p of products) {
                let hardImage = p.product_image || '';
                if (hardImage) {
                    hardImage = await this.convertUrlToBase64(hardImage);
                }

                // Convert any carousel images in metadata as well
                let metaCopy = null;
                if (p.metadata) {
                    try {
                        metaCopy = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : JSON.parse(JSON.stringify(p.metadata));
                        if (metaCopy && Array.isArray(metaCopy.carousel_images)) {
                            const newCarousel = [];
                            for (let cUrl of metaCopy.carousel_images) {
                                if (cUrl) {
                                    newCarousel.push(await this.convertUrlToBase64(cUrl));
                                } else {
                                    newCarousel.push(cUrl);
                                }
                            }
                            metaCopy.carousel_images = newCarousel;
                        }
                    } catch (e) {
                        metaCopy = p.metadata;
                    }
                }

                exportProducts.push({
                    product_name: p.product_name,
                    sku: p.sku,
                    category: typeof p.category === 'string' ? p.category : (p.category?.category_name || 'Other'),
                    type: p.type || '',
                    cost_price: parseFloat(p.cost_price || 0),
                    selling_price: parseFloat(p.selling_price || 0),
                    stock: parseInt(p.stock || 0),
                    product_image: hardImage,
                    description: p.description || '',
                    metadata: metaCopy || p.metadata || {},
                    show_in_store: p.show_in_store !== false,
                    variants: variantsByProductId[p.id] || []
                });
            }

            const packageObj = {
                app: 'dolphin_inventory',
                version: '1.0',
                export_date: new Date().toISOString(),
                has_hard_images: true,
                total_products: exportProducts.length,
                products: exportProducts
            };

            const jsonString = JSON.stringify(packageObj, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `inventory_compact_data_${this.shopId}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showNotification(`Exported ${exportProducts.length} items with compact embedded images & details!`, 'success');
        } catch (error) {
            console.error('Error exporting full inventory data:', error);
            showNotification('Failed to export inventory data package', 'error');
        } finally {
            showLoading(false);
        }
    }

    async exportFullInventoryZip() {
        showLoading(true);

        try {
            await window.loadJSZip();
            const zip = new window.JSZip();
            const imgFolder = zip.folder("images");

            // Fetch products
            const { data: products, error: pErr } = await supabaseClient
                .from('products')
                .select('*')
                .eq('shop_id', this.shopId)
                .order('product_name');

            if (pErr) throw pErr;

            if (!products || products.length === 0) {
                showNotification('No inventory items to export', 'warning');
                return;
            }

            // Fetch variants
            const productIds = products.map(p => p.id);
            const { data: variants } = await supabaseClient
                .from('product_variants')
                .select('*')
                .in('product_id', productIds);

            const variantsByProductId = {};
            if (variants) {
                variants.forEach(v => {
                    if (!variantsByProductId[v.product_id]) variantsByProductId[v.product_id] = [];
                    variantsByProductId[v.product_id].push({
                        variant_name: v.variant_name || '',
                        sku: v.sku,
                        cost_price: v.cost_price,
                        price: v.price,
                        stock: v.stock,
                        image_url: v.image_url,
                        attributes: v.attributes,
                        is_active: v.is_active
                    });
                });
            }

            showNotification('Packaging actual hard image files into ZIP archive...', 'info');

            const exportProducts = [];
            let imgCounter = 1;

            for (let p of products) {
                let imgPathInZip = '';
                if (p.product_image) {
                    try {
                        let blob = null;
                        if (p.product_image.startsWith('data:image')) {
                            const parts = p.product_image.split(',');
                            const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
                            const bstr = atob(parts[1]);
                            let n = bstr.length;
                            const u8arr = new Uint8Array(n);
                            while (n--) {
                                u8arr[n] = bstr.charCodeAt(n);
                            }
                            blob = new Blob([u8arr], { type: mime });
                        } else if (p.product_image.startsWith('http')) {
                            const res = await fetch(p.product_image, { mode: 'cors' });
                            if (res.ok) blob = await res.blob();
                        }

                        if (blob) {
                            const ext = blob.type.includes('png') ? 'png' : 'jpg';
                            const fileName = `product_${imgCounter}_${(p.sku || 'item').replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`;
                            imgFolder.file(fileName, blob);
                            imgPathInZip = `images/${fileName}`;
                            imgCounter++;
                        } else {
                            imgPathInZip = p.product_image;
                        }
                    } catch (e) {
                        console.warn('Error archiving image file:', p.product_image, e);
                        imgPathInZip = p.product_image;
                    }
                }

                exportProducts.push({
                    product_name: p.product_name,
                    sku: p.sku,
                    category: typeof p.category === 'string' ? p.category : (p.category?.category_name || 'Other'),
                    type: p.type || '',
                    cost_price: parseFloat(p.cost_price || 0),
                    selling_price: parseFloat(p.selling_price || 0),
                    stock: parseInt(p.stock || 0),
                    product_image: imgPathInZip,
                    description: p.description || '',
                    metadata: p.metadata || {},
                    show_in_store: p.show_in_store !== false,
                    variants: variantsByProductId[p.id] || []
                });
            }

            const packageObj = {
                app: 'dolphin_inventory',
                version: '1.0',
                export_date: new Date().toISOString(),
                is_zip_package: true,
                total_products: exportProducts.length,
                products: exportProducts
            };

            zip.file("inventory.json", JSON.stringify(packageObj, null, 2));

            const zipBlob = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(zipBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `inventory_image_package_${this.shopId}_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showNotification(`Downloaded ZIP Package with actual hard image files (${exportProducts.length} items)!`, 'success');
        } catch (error) {
            console.error('Error generating ZIP package:', error);
            showNotification('Failed to generate ZIP image package', 'error');
        } finally {
            showLoading(false);
        }
    }

    async importInventoryData(file) {
        if (!file) return;
        showLoading(true);

        try {
            let itemsToImport = [];

            if (file.name.endsWith('.zip')) {
                await window.loadJSZip();
                const zip = await window.JSZip.loadAsync(file);
                const jsonFile = zip.file("inventory.json");
                if (!jsonFile) {
                    throw new Error('Invalid ZIP package. Missing "inventory.json" file inside ZIP.');
                }

                const jsonText = await jsonFile.async("text");
                const parsed = JSON.parse(jsonText);
                const rawItems = Array.isArray(parsed) ? parsed : (parsed.products || []);

                showNotification('Extracting hard image files from ZIP archive...', 'info');

                const getZipFile = (relPath) => {
                    if (!relPath) return null;
                    const cleanPath = relPath.replace(/^[\.\/]+/, '');
                    return zip.file(cleanPath) || zip.file(relPath) || zip.file(`images/${cleanPath}`);
                };

                for (let item of rawItems) {
                    if (item.product_image && (item.product_image.includes('images/') || !item.product_image.startsWith('http'))) {
                        const imgZipFile = getZipFile(item.product_image);
                        if (imgZipFile) {
                            const imgBlob = await imgZipFile.async("blob");
                            item.product_image = await new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result);
                                reader.readAsDataURL(imgBlob);
                            });
                        }
                    }

                    if (item.metadata && typeof item.metadata === 'object' && Array.isArray(item.metadata.carousel_images)) {
                        const resolvedCarousel = [];
                        for (let cImg of item.metadata.carousel_images) {
                            if (cImg && (cImg.includes('images/') || !cImg.startsWith('http'))) {
                                const cZipFile = getZipFile(cImg);
                                if (cZipFile) {
                                    const cBlob = await cZipFile.async("blob");
                                    const cDataUrl = await new Promise((resolve) => {
                                        const reader = new FileReader();
                                        reader.onloadend = () => resolve(reader.result);
                                        reader.readAsDataURL(cBlob);
                                    });
                                    resolvedCarousel.push(cDataUrl);
                                } else {
                                    resolvedCarousel.push(cImg);
                                }
                            } else {
                                resolvedCarousel.push(cImg);
                            }
                        }
                        item.metadata.carousel_images = resolvedCarousel;
                    }
                }
                itemsToImport = rawItems;
            } else if (file.name.endsWith('.json')) {
                const text = await file.text();
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed)) {
                    itemsToImport = parsed;
                } else if (parsed && Array.isArray(parsed.products)) {
                    itemsToImport = parsed.products;
                } else {
                    throw new Error('Invalid JSON format. Expected an array of products or a package with "products" list.');
                }
            } else if (file.name.endsWith('.csv')) {
                const text = await file.text();
                itemsToImport = this.parseCSVInventory(text);
            } else {
                throw new Error('Unsupported file format. Please upload a .zip, .json, or .csv file.');
            }

            if (itemsToImport.length === 0) {
                showNotification('No valid product records found in file', 'warning');
                return;
            }

            const confirmImport = confirm(`Found ${itemsToImport.length} item(s) in "${file.name}". Do you want to import them into your inventory?`);
            if (!confirmImport) {
                showLoading(false);
                return;
            }

            let successCount = 0;
            let skipCount = 0;

            // Fetch existing SKUs for duplicate checks
            const existingSkus = new Set((this.products || []).map(p => (p.sku || '').toUpperCase()));

            for (let item of itemsToImport) {
                const productName = item.product_name || item.name || item['Product Name'];
                if (!productName) {
                    skipCount++;
                    continue;
                }

                let sku = item.sku || item.SKU || item['SKU'];
                if (!sku || existingSkus.has(sku.toUpperCase())) {
                    // Auto-generate non-colliding SKU
                    sku = `SKU-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
                }
                existingSkus.add(sku.toUpperCase());

                const category = item.category || item.Category || 'Other';
                const type = item.type || item.Type || '';
                const costPrice = parseFloat(item.cost_price || item['Cost Price'] || item.costPrice || 0);
                const sellingPrice = parseFloat(item.selling_price || item['Selling Price'] || item.sellingPrice || item.price || 0);
                const stock = parseInt(item.stock || item.Stock || item.quantity || 0) || 0;
                const productImage = item.product_image || item.image || item['Image URL'] || item['Product Image'] || null;
                const description = item.description || item.Description || '';

                // Metadata can be an object (JSON import) or a JSON string (CSV import)
                let metadata = item.metadata !== undefined ? item.metadata : item.Metadata;
                if (typeof metadata === 'string') {
                    const metaTrim = metadata.trim();
                    if (metaTrim) { try { metadata = JSON.parse(metaTrim); } catch (e) { metadata = {}; } } else { metadata = {}; }
                }
                if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) metadata = {};

                // Merge easy-to-fill columns, then auto-correct the whole metadata structure
                const friendlyAttrs = this.parseAttributesText(
                    item.attributes !== undefined ? item.attributes : item['Attributes']
                );
                const friendlyStock = this.parseOptionMapText(
                    item['Stock By Option'] !== undefined ? item['Stock By Option'] : item.stock_by_option, parseInt
                );
                const friendlyPrice = this.parseOptionMapText(
                    item['Price By Option'] !== undefined ? item['Price By Option'] : item.price_by_option, parseFloat
                );

                Object.keys(friendlyAttrs).forEach(k => {
                    const existing = Array.isArray(metadata[k]) ? metadata[k].slice() : [];
                    metadata[k] = existing.concat(friendlyAttrs[k].filter(v => !existing.includes(v)));
                });
                Object.keys(friendlyStock).forEach(base => {
                    metadata[base + '_stock'] = { ...(metadata[base + '_stock'] || {}), ...friendlyStock[base] };
                });
                Object.keys(friendlyPrice).forEach(base => {
                    metadata[base + '_price'] = { ...(metadata[base + '_price'] || {}), ...friendlyPrice[base] };
                    metadata[base + '_prices'] = { ...(metadata[base + '_prices'] || {}), ...friendlyPrice[base] };
                });

                metadata = this.normalizeInventoryMetadata(metadata);

                // Low stock alert (object or CSV string)
                const lowStockRaw = item.low_stock_alert !== undefined ? item.low_stock_alert
                    : (item['Low Stock Alert'] !== undefined ? item['Low Stock Alert'] : item.lowStockAlert);
                let lowStockAlert = parseInt(lowStockRaw);
                if (isNaN(lowStockAlert)) lowStockAlert = this.lowStockThreshold || 10;

                // Display priority
                const priorityRaw = item.priority !== undefined ? item.priority
                    : (item['Display Priority'] !== undefined ? item['Display Priority'] : item.Priority);
                let priority = parseInt(priorityRaw);
                if (isNaN(priority)) priority = 1000;

                // Show to customers (bool, or "true"/"false"/"0"/"1" from CSV)
                const showInStoreRaw = item.show_in_store !== undefined ? item.show_in_store : item['Show In Store'];
                const showInStore = !(showInStoreRaw === false || showInStoreRaw === 'false' || showInStoreRaw === 0 || showInStoreRaw === '0');

                // Variants can be an array (JSON import) or a JSON string (CSV import)
                let variants = item.variants !== undefined ? item.variants : item.Variants;
                if (typeof variants === 'string') {
                    const varTrim = variants.trim();
                    if (varTrim) { try { variants = JSON.parse(varTrim); } catch (e) { variants = []; } } else { variants = []; }
                }
                if (!Array.isArray(variants)) variants = [];

                // Insert Product with duplicate SKU conflict retry handler
                let insertResult = await supabaseClient
                    .from('products')
                    .insert({
                        shop_id: this.shopId,
                        product_name: productName,
                        sku: sku,
                        category: category,
                        type: type,
                        cost_price: costPrice,
                        selling_price: sellingPrice,
                        stock: stock,
                        product_image: productImage,
                        description: description,
                        metadata: metadata,
                        show_in_store: showInStore,
                        low_stock_alert: lowStockAlert,
                        priority: priority
                    })
                    .select('id')
                    .single();

                // If duplicate SKU constraint error (409 Conflict / code 23505), retry with unique SKU
                if (insertResult.error && (insertResult.error.code === '23505' || (insertResult.error.message && insertResult.error.message.includes('sku')))) {
                    const uniqueSuffix = Math.floor(100 + Math.random() * 900);
                    sku = `${sku}_${uniqueSuffix}`;
                    existingSkus.add(sku.toUpperCase());

                    insertResult = await supabaseClient
                        .from('products')
                        .insert({
                            shop_id: this.shopId,
                            product_name: productName,
                            sku: sku,
                            category: category,
                            type: type,
                            cost_price: costPrice,
                            selling_price: sellingPrice,
                            stock: stock,
                            product_image: productImage,
                            description: description,
                            metadata: metadata,
                            show_in_store: showInStore,
                            low_stock_alert: lowStockAlert,
                            priority: priority
                        })
                        .select('id')
                        .single();
                }

                if (insertResult.error) {
                    console.error('Failed to insert product:', productName, insertResult.error);
                    skipCount++;
                    continue;
                }

                const newProd = insertResult.data;

                // If product has variants, insert them with mandatory shop_id, variant_name, and unique SKUs
                if (newProd && Array.isArray(variants) && variants.length > 0) {
                    const variantRows = variants.map((v, vIdx) => {
                        let vName = v.variant_name || v.name || v.attributes?.variant_name || v.attributes?.name;
                        if (!vName && v.attributes && typeof v.attributes === 'object') {
                            const attrVals = Object.values(v.attributes).filter(val => typeof val === 'string' || typeof val === 'number');
                            if (attrVals.length > 0) vName = attrVals.join(' / ');
                        }
                        if (!vName) vName = `Variant ${vIdx + 1}`;

                        return {
                            product_id: newProd.id,
                            shop_id: this.shopId,
                            variant_name: vName,
                            sku: v.sku ? `${v.sku}_${Math.floor(Math.random() * 100)}` : `${sku}-V${vIdx + 1}-${Math.floor(Math.random() * 1000)}`,
                            cost_price: parseFloat(v.cost_price !== undefined ? v.cost_price : (costPrice || 0)),
                            price: parseFloat(v.price !== undefined ? v.price : (v.selling_price || sellingPrice || 0)),
                            stock: parseInt(v.stock !== undefined ? v.stock : 0),
                            image_url: v.image_url || v.url || v.product_image || null,
                            attributes: typeof v.attributes === 'object' ? v.attributes : {},
                            is_active: v.is_active !== false
                        };
                    });

                    const { error: vErr } = await supabaseClient.from('product_variants').insert(variantRows);
                    if (vErr) {
                        console.error('Failed to insert variants for product:', productName, vErr);
                    }
                }

                successCount++;
            }

            showNotification(`Import Complete! Successfully added ${successCount} item(s). ${skipCount > 0 ? `(${skipCount} skipped/failed)` : ''}`, 'success');

            // Refresh inventory table
            await this.loadInventory();

        } catch (error) {
            console.error('Error importing inventory data:', error);
            showNotification(error.message || 'Failed to import inventory file', 'error');
        } finally {
            showLoading(false);
        }
    }

    parseCSVInventory(csvText) {
        const text = String(csvText || '').replace(/^\uFEFF/, '');
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;
        let i = 0;

        while (i < text.length) {
            const ch = text[i];

            if (inQuotes) {
                if (ch === '"') {
                    if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                    inQuotes = false; i++; continue;
                }
                field += ch; i++; continue;
            }

            if (ch === '"') { inQuotes = true; i++; continue; }
            if (ch === ',') { row.push(field); field = ''; i++; continue; }
            if (ch === '\r') { i++; continue; }
            if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
            field += ch; i++;
        }
        if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }

        // Drop fully-empty trailing rows and blank lines
        while (rows.length && rows[rows.length - 1].every(c => String(c).trim() === '')) rows.pop();

        if (rows.length < 2) return [];

        const headers = rows[0].map(h => String(h).replace(/^\uFEFF/, '').trim());
        const products = [];

        for (let r = 1; r < rows.length; r++) {
            const values = rows[r];
            if (!values || values.every(v => String(v).trim() === '')) continue;

            const rowObj = {};
            headers.forEach((h, index) => {
                if (!h) return;
                rowObj[h] = values[index] !== undefined ? values[index] : '';
            });
            products.push(rowObj);
        }

        return products;
    }

    async loadBusinessType() {
        try {
            // Priority 1: Check shops table (Source of Truth set by Super Admin)
            const { data: shopData, error: shopError } = await supabaseClient
                .from('shops')
                .select('business_type')
                .eq('id', this.shopId)
                .maybeSingle();

            if (shopData && shopData.business_type) {
                this.businessType = shopData.business_type;
            } else {
                // Priority 2: Check shop_settings (Fallback)
                const { data: settingsData, error: settingsError } = await supabaseClient
                    .from('shop_settings')
                    .select('business_type')
                    .eq('shop_id', this.shopId)
                    .maybeSingle();

                if (settingsData && settingsData.business_type) {
                    this.businessType = settingsData.business_type;
                }
            }

            // Populate the Type Filter dropdown with types relevant to the business type
            this.populateTypeFilter();

        } catch (error) {
            console.error('Error loading business type:', error);
        }
    }

    populateTypeFilter() {
        const categoryFilter = document.getElementById('categoryFilter');
        const selectedCategory = categoryFilter ? categoryFilter.value : '';
        this.loadTypes(selectedCategory);
    }

    renderDynamicFields(product = null) {
        const container = document.getElementById('dynamicFields');
        if (!container) return;

        container.innerHTML = '';
        let fields = [];

        // Get current category from form
        const categoryElem = document.getElementById('productCategory');
        const selectedCategory = categoryElem ? categoryElem.value : null;

        // Try to parse existing values from product
        let values = {};
        if (product) {
            if (product.metadata) {
                values = typeof product.metadata === 'string' ? JSON.parse(product.metadata) : product.metadata;
            } else if (product.description && product.description.includes('--SPECIFICATIONS--')) {
                try {
                    const parts = product.description.split('--SPECIFICATIONS--');
                    values = JSON.parse(parts[1].trim());
                } catch (e) { console.error('Failed to parse specifications from description', e); }
            }
        }
        // Flatten: if attributes key exists, merge it
        const savedAttributes = values.attributes || {};

        // Priority 1: Use custom metadata fields from system_configs (loaded into this.metadataConfigs)
        if (selectedCategory && this.metadataConfigs && this.metadataConfigs[selectedCategory]) {
            fields = this.metadataConfigs[selectedCategory];
        } else {
            // Priority 2: Fallback to hardcoded businessType-based fields (Legacy support)
            switch (this.businessType) {
                case 'restaurant':
                    fields = [
                        { id: 'dietary', label: 'Dietary Type', type: 'select', options: ['Veg', 'Non-Veg', 'Vegan', 'Eggitarian'] },
                        { id: 'prepTime', label: 'Preparation Time (mins)', type: 'number' }
                    ];
                    break;
                case 'medicine':
                    fields = [
                        { id: 'expiryDate', label: 'Expiry Date', type: 'date' },
                        { id: 'batchNo', label: 'Batch Number', type: 'text' },
                        { id: 'dosageForm', label: 'Dosage Form', type: 'select', options: ['Tablet', 'Syrup', 'Capsule', 'Injection', 'Ointment'] }
                    ];
                    break;
                case 'grocery':
                    fields = [
                        { id: 'unit', label: 'Unit', type: 'select', options: ['kg', 'gm', 'ltr', 'ml', 'unit', 'packet'] },
                        { id: 'weight', label: 'Weight/Volume', type: 'number' }
                    ];
                    break;
                case 'cloth':
                    fields = [
                        { id: 'color', label: 'Color', type: 'tags', presets: ['Red','Blue','Black','White','Green','Yellow','Pink','Purple','Orange'] },
                        { id: 'size', label: 'Size', type: 'tags', presets: ['XS','S','M','L','XL','XXL','Free Size'] },
                        { id: 'material', label: 'Material', type: 'text' }
                    ];
                    break;
                case 'footwear':
                    fields = [
                        { id: 'color', label: 'Color', type: 'tags', presets: ['Black','White','Brown','Red','Blue','Nude'] },
                        { id: 'size', label: 'Size (EU/UK)', type: 'tags', presets: ['6','7','8','9','10','11'] },
                        { id: 'material', label: 'Material', type: 'text' }
                    ];
                    break;
                case 'cosmetics':
                    fields = [
                        { id: 'skinType', label: 'Skin Type', type: 'select', options: ['All', 'Oily', 'Dry', 'Combination', 'Sensitive'] },
                        { id: 'volume', label: 'Volume/Weight', type: 'tags', presets: ['30ml','50ml','100ml','200ml'] }
                    ];
                    break;
                case 'electronics':
                    fields = [
                        { id: 'brand', label: 'Brand', type: 'text' },
                        { id: 'warranty', label: 'Warranty', type: 'text' },
                        { id: 'model', label: 'Model Name', type: 'text' }
                    ];
                    break;
                case 'furniture':
                    fields = [
                        { id: 'material', label: 'Material', type: 'text' },
                        { id: 'dimensions', label: 'Dimensions', type: 'text' }
                    ];
                    break;
                case 'home_appliances':
                    fields = [
                        { id: 'power', label: 'Power Rating', type: 'text' },
                        { id: 'warranty', label: 'Warranty Period', type: 'text' }
                    ];
                    break;
                case 'toys':
                    fields = [
                        { id: 'ageGroup', label: 'Age Group', type: 'select', options: ['0-3 Years', '3-6 Years', '6-12 Years', '12+ Years'] },
                        { id: 'material', label: 'Material', type: 'text' }
                    ];
                    break;
                case 'pet_supplies':
                    fields = [
                        { id: 'lifeStage', label: 'Life Stage', type: 'select', options: ['Junior', 'Adult', 'Senior'] },
                        { id: 'flavor', label: 'Flavor', type: 'text' }
                    ];
                    break;
                case 'jewellery':
                    fields = [
                        { id: 'purity', label: 'Purity/Karat', type: 'text' },
                        { id: 'material', label: 'Primary Material', type: 'text' }
                    ];
                    break;
            }
        }

        // Auto-upgrade text fields to 'tags' type when label implies multi-value
        const MULTI_VALUE_KEYWORDS = ['color', 'colour', 'shade', 'size', 'storage', 'ram', 'volume', 'portion', 'pack', 'flavor', 'flavour', 'format', 'finish'];
        fields = fields.map(f => {
            if (f.type === 'text' || f.type === 'tags') {
                const ll = (f.label || '').toLowerCase();
                if (MULTI_VALUE_KEYWORDS.some(kw => ll.includes(kw))) {
                    return { ...f, type: 'tags' };
                }
            }
            return f;
        });

        // Track which fields are multi-value (tags)
        this.dynTagFields = {};
        this.dynTagStocks = {};
        this.dynTagPrices = {};

        if (fields.length > 0) {
            // Separate tag fields from simple fields
            const tagFields = fields.filter(f => f.type === 'tags');
            const simpleFields = fields.filter(f => f.type !== 'tags');

            // Render tag fields together in a nice grouped box (if any exist)
            if (tagFields.length > 0) {
                const tagSection = document.createElement('div');
                tagSection.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:12px;';

                // Single "All" button that fills both Size & Color fields
                const hasSizeOrColor = tagFields.some(f => {
                    const fk = (f.id || f.label || '').toLowerCase();
                    return fk.includes('size') || fk.includes('color') || fk.includes('colour');
                });
                if (hasSizeOrColor) {
                    const allBar = document.createElement('div');
                    allBar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px dashed #e2e8f0;';
                    const allBtn = document.createElement('button');
                    allBtn.type = 'button';
                    allBtn.id = 'allSizeColorBtn';
                    allBtn.textContent = '⭐ All';
                    allBtn.style.cssText = 'padding:4px 14px;border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:10px;font-size:0.8rem;font-weight:700;cursor:pointer;';
                    allBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.applyAllSizeColor();
                    });
                    const allStatus = document.createElement('span');
                    allStatus.id = 'allSizeColorStatus';
                    allStatus.style.cssText = 'display:none;font-size:0.73rem;font-weight:700;color:#047857;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:2px 10px;';
                    allBar.appendChild(allBtn);
                    allBar.appendChild(allStatus);
                    tagSection.appendChild(allBar);
                }

                tagFields.forEach(field => {
                    const fieldKey = field.id || field.label.toLowerCase().replace(/\s+/g, '_');
                    this.dynTagFields[fieldKey] = new Set();

                    // Pre-populate from saved data
                    const savedVal = savedAttributes[fieldKey] || values[fieldKey] || (fieldKey === 'color' ? (values.available_colors || savedAttributes.available_colors) : (fieldKey === 'size' ? (values.available_sizes || savedAttributes.available_sizes) : null));
                    if (Array.isArray(savedVal)) {
                        savedVal.forEach(v => this.dynTagFields[fieldKey].add(v));
                    } else if (typeof savedVal === 'string' && savedVal) {
                        savedVal.split(',').map(s => s.trim()).filter(Boolean).forEach(v => this.dynTagFields[fieldKey].add(v));
                    }

                    // Pre-populate per-tag stock quantities from saved data
                    const stockKey = `${fieldKey}_stock`;
                    const savedStock = savedAttributes[stockKey] || values[stockKey];
                    if (savedStock && typeof savedStock === 'object') {
                        if (!this.dynTagStocks) this.dynTagStocks = {};
                        this.dynTagStocks[fieldKey] = { ...savedStock };
                    }

                    // Pre-populate per-tag price overrides from saved data
                    const priceKey = `${fieldKey}_price`;
                    const savedPrice = savedAttributes[priceKey] || values[priceKey] || savedAttributes[`${fieldKey}_prices`] || values[`${fieldKey}_prices`];
                    if (savedPrice && typeof savedPrice === 'object') {
                        if (!this.dynTagPrices) this.dynTagPrices = {};
                        this.dynTagPrices[fieldKey] = { ...savedPrice };
                    }

                    // Pick icon
                    let iconClass = 'fas fa-tag';
                    const ll = field.label.toLowerCase();
                    if (ll.includes('color') || ll.includes('colour') || ll.includes('shade')) iconClass = 'fas fa-palette';
                    else if (ll.includes('size') || ll.includes('storage') || ll.includes('volume') || ll.includes('portion')) iconClass = 'fas fa-ruler-combined';
                    else if (ll.includes('flavor') || ll.includes('flavour')) iconClass = 'fas fa-drumstick-bite';

                    const initialCsv = Array.from(this.dynTagFields[fieldKey]).join(', ');

                    const tagBlock = document.createElement('div');
                    tagBlock.style.cssText = 'margin-bottom:14px;';
                    tagBlock.innerHTML = `
                        <label style="font-weight:600;font-size:0.82rem;color:#475569;display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                            <i class="${iconClass}" style="color:var(--primary);"></i> ${field.label}
                        </label>
                        <input type="text" id="dynTagInput_${fieldKey}" value="${initialCsv}"
                            placeholder="Enter ${field.label}"
                            style="width:100%;padding:7px 11px;border:1px solid #cbd5e1;border-radius:6px;font-size:0.85rem;outline:none;background:white;margin-bottom:6px;">
                        ${field.presets && field.presets.length > 0 ? `
                        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px;">
                            ${field.presets.map(p => `<button type="button" onclick="window.inventoryManager.addDynTag('${fieldKey}', '${p}')" style="padding:2px 9px;border:1px solid #cbd5e1;background:white;color:#475569;border-radius:10px;font-size:0.75rem;cursor:pointer;">${p}</button>`).join('')}
                        </div>` : ''}
                        <div id="dynTagChips_${fieldKey}" style="display:flex;flex-wrap:wrap;gap:5px;min-height:18px;"></div>
                    `;
                    tagSection.appendChild(tagBlock);

                    // Bind live comma-separated input
                    setTimeout(() => {
                        const inp = document.getElementById(`dynTagInput_${fieldKey}`);
                        if (inp) inp.addEventListener('input', () => this.syncDynTagInput(fieldKey, inp.value));
                    }, 0);
                });

                container.appendChild(tagSection);

                // Render existing chips for all tag fields
                tagFields.forEach(f => {
                    const fk = f.id || f.label.toLowerCase().replace(/\s+/g, '_');
                    this.renderDynTagChips(fk);
                });
            }

            // Render simple fields (text/select/number/date) in 2-column rows as before
            if (simpleFields.length > 0) {
                let row;
                simpleFields.forEach((field, index) => {
                    if (index % 2 === 0) {
                        row = document.createElement('div');
                        row.className = 'form-row';
                        container.appendChild(row);
                    }

                    const group = document.createElement('div');
                    group.className = 'form-group';

                    const label = document.createElement('label');
                    let iconClass = 'fas fa-info-circle';
                    const labelLower = field.label.toLowerCase();
                    if (labelLower.includes('date') || labelLower.includes('expiry')) iconClass = 'fas fa-calendar-alt';
                    else if (labelLower.includes('time')) iconClass = 'fas fa-clock';
                    else if (labelLower.includes('weight') || labelLower.includes('unit') || labelLower.includes('volume')) iconClass = 'fas fa-weight';
                    else if (labelLower.includes('material')) iconClass = 'fas fa-layer-group';
                    else if (labelLower.includes('brand')) iconClass = 'fas fa-trademark';
                    else if (labelLower.includes('warranty') || labelLower.includes('expiry')) iconClass = 'fas fa-shield-alt';
                    else if (labelLower.includes('veg')) iconClass = 'fas fa-leaf';

                    label.innerHTML = `<i class="${iconClass}"></i> ${field.label}`;
                    group.appendChild(label);

                    let input;
                    if (field.type === 'select') {
                        input = document.createElement('select');
                        const placeholder = document.createElement('option');
                        placeholder.value = '';
                        placeholder.textContent = `-- Select ${field.label} --`;
                        input.appendChild(placeholder);
                        const options = Array.isArray(field.options) ? field.options : [];
                        options.forEach(opt => {
                            const option = document.createElement('option');
                            option.value = opt;
                            option.textContent = opt;
                            input.appendChild(option);
                        });
                    } else {
                        input = document.createElement('input');
                        input.type = field.type;
                        input.placeholder = `Enter ${field.label}`;
                    }

                    const fieldKey = field.id || field.label.toLowerCase().replace(/\s+/g, '_');
                    input.id = 'dyn_' + fieldKey;
                    input.className = 'dynamic-field-input';

                    // Pre-populate from saved data
                    const savedVal = savedAttributes[fieldKey] || values[fieldKey];
                    if (savedVal && typeof savedVal === 'string') input.value = savedVal;
                    else if (savedVal && typeof savedVal !== 'object') input.value = String(savedVal);

                    group.appendChild(input);
                    row.appendChild(group);
                });
            }

            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    }

    // Sync a comma-separated dynamic field input into the tag set and chips
    syncDynTagInput(key, rawValue) {
        if (!this.dynTagFields) this.dynTagFields = {};
        const tags = (rawValue || '').split(',').map(s => s.trim()).filter(Boolean);
        this.dynTagFields[key] = new Set(tags);

        // Drop stock/price overrides for tags that were removed
        if (this.dynTagStocks && this.dynTagStocks[key]) {
            Object.keys(this.dynTagStocks[key]).forEach(t => { if (!tags.includes(t)) delete this.dynTagStocks[key][t]; });
        }
        if (this.dynTagPrices && this.dynTagPrices[key]) {
            Object.keys(this.dynTagPrices[key]).forEach(t => { if (!tags.includes(t)) delete this.dynTagPrices[key][t]; });
        }

        this.renderDynTagChips(key);
        // Update variant preview if variants section open
        if (document.getElementById('variantsSection')?.style.display !== 'none') {
            this.updateVariantBuilderPreview();
        }
    }

    // Add a tag to a multi-value dynamic field (used by quick preset buttons)
    addDynTag(key, val) {
        const inp = document.getElementById(`dynTagInput_${key}`);
        const incoming = (val || '').split(',').map(s => s.trim()).filter(Boolean);
        if (incoming.length === 0) return;
        if (!this.dynTagFields) this.dynTagFields = {};
        const existing = this.dynTagFields[key] instanceof Set ? Array.from(this.dynTagFields[key]) : [];
        incoming.forEach(v => { if (!existing.includes(v)) existing.push(v); });
        if (inp) inp.value = existing.join(', ');
        this.syncDynTagInput(key, existing.join(', '));
    }

    // Single "All" button: fill both Size & Color fields with "All"
    applyAllSizeColor() {
        if (!this.dynTagFields) this.dynTagFields = {};
        let filledAny = false;

        // Collect size/color keys from state AND from the rendered inputs
        const keys = new Set(Object.keys(this.dynTagFields));
        document.querySelectorAll('input[id^="dynTagInput_"]').forEach(inp => {
            keys.add(inp.id.replace('dynTagInput_', ''));
        });

        keys.forEach(key => {
            const k = (key || '').toLowerCase();
            if (k.includes('size') || k.includes('color') || k.includes('colour') || k.includes('shade')) {
                const set = this.dynTagFields[key];
                const existing = set instanceof Set ? Array.from(set) : (Array.isArray(set) ? set : []);
                const inp = document.getElementById(`dynTagInput_${key}`);
                const fromInput = inp ? inp.value.split(',').map(s => s.trim()).filter(Boolean) : [];
                const current = existing.length > 0 ? existing : fromInput;
                const hasAll = current.some(v => (v || '').toLowerCase() === 'all');
                if (!hasAll) {
                    const next = current.concat('All');
                    if (inp) inp.value = next.join(', ');
                    this.syncDynTagInput(key, next.join(', '));
                    filledAny = true;
                }
            }
        });

        if (filledAny) {
            const allStatus = document.getElementById('allSizeColorStatus');
            if (allStatus) allStatus.style.display = 'none';
        } else {
            const allStatus = document.getElementById('allSizeColorStatus');
            if (allStatus) {
                allStatus.textContent = 'Size & Color already set to "All"';
                allStatus.style.display = 'inline-block';
            }
            showNotification('Size & Color already set to "All"', 'info');
        }
    }

    // Remove a tag from a multi-value dynamic field
    removeDynTag(key, val) {
        if (this.dynTagFields && this.dynTagFields[key] instanceof Set) {
            this.dynTagFields[key].delete(val);
            if (this.dynTagStocks && this.dynTagStocks[key]) {
                delete this.dynTagStocks[key][val];
            }
            if (this.dynTagPrices && this.dynTagPrices[key]) {
                delete this.dynTagPrices[key][val];
            }
            const inp = document.getElementById(`dynTagInput_${key}`);
            if (inp) inp.value = Array.from(this.dynTagFields[key]).join(', ');
            this.renderDynTagChips(key);
            if (document.getElementById('variantsSection')?.style.display !== 'none') {
                this.updateVariantBuilderPreview();
            }
        }
    }

    // Render tag chips for a dynamic tag field
    renderDynTagChips(key) {
        const container = document.getElementById(`dynTagChips_${key}`);
        if (!container) return;
        const tags = this.dynTagFields && this.dynTagFields[key] instanceof Set ? Array.from(this.dynTagFields[key]) : [];
        const isSizeField = ['size', 'storage', 'portion', 'weight', 'pack'].some(k => key.toLowerCase().includes(k));

        if (isSizeField) {
            // For size fields: show chips with stock quantity and optional price inputs
            if (!this.dynTagStocks) this.dynTagStocks = {};
            if (!this.dynTagStocks[key]) this.dynTagStocks[key] = {};
            if (!this.dynTagPrices) this.dynTagPrices = {};
            if (!this.dynTagPrices[key]) this.dynTagPrices[key] = {};
            container.innerHTML = '';
            tags.forEach(t => {
                const isAllTag = (t || '').toLowerCase() === 'all';
                let stock = this.dynTagStocks[key][t] ?? '';
                // Size "all" → auto-fill qty with base Stock Quantity
                if (isAllTag && (stock === '' || stock === null || stock === undefined)) {
                    stock = parseInt(document.getElementById('productStock')?.value) || 0;
                    this.dynTagStocks[key][t] = stock;
                }
                const price = this.dynTagPrices[key][t] ?? '';
                const chip = document.createElement('span');
                chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 8px 4px 10px;background:#f8fafc;border:1px solid #cbd5e1;color:#1e293b;border-radius:10px;font-size:0.8rem;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,0.03);';
                chip.innerHTML = `
                    <span style="font-weight:700;color:#1e40af;font-size:0.85rem;">${t}</span>
                    <div style="display:inline-flex;align-items:center;gap:3px;background:white;padding:2px 5px;border:1px solid #bfdbfe;border-radius:6px;" title="Stock quantity for ${t}">
                        <span style="font-size:0.68rem;color:#64748b;font-weight:600;">Qty</span>
                        <input type="number" min="0" placeholder="0" value="${stock}" data-tag="${t}"
                            style="width:42px;padding:1px 2px;border:none;font-size:0.78rem;color:#1e3a8a;background:transparent;outline:none;text-align:center;font-weight:600;"
                            onchange="window.inventoryManager.setDynTagStock('${key}', '${t}', this.value)"
                            oninput="window.inventoryManager.setDynTagStock('${key}', '${t}', this.value)">
                    </div>
                    <div style="display:inline-flex;align-items:center;gap:3px;background:white;padding:2px 5px;border:1px solid #d1fae5;border-radius:6px;" title="Optional price for ${t} (defaults to base selling price)">
                        <span style="font-size:0.68rem;color:#059669;font-weight:700;">₹</span>
                        <input type="number" min="0" step="0.01" placeholder="Base" value="${price}"
                            style="width:52px;padding:1px 2px;border:none;font-size:0.78rem;color:#065f46;background:transparent;outline:none;text-align:center;font-weight:600;"
                            onchange="window.inventoryManager.setDynTagPrice('${key}', '${t}', this.value)"
                            oninput="window.inventoryManager.setDynTagPrice('${key}', '${t}', this.value)">
                    </div>
                    <button type="button" onclick="window.inventoryManager.removeDynTag('${key}', '${t}')" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:0.85rem;padding:0 2px;line-height:1;margin-left:2px;transition:color 0.15s;" onmouseover="this.style.color='#dc2626'" onmouseout="this.style.color='#94a3b8'" title="Remove ${t}">&#x2715;</button>
                `;
                container.appendChild(chip);
            });
        } else {
            container.innerHTML = tags.map(t => `
                <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;border-radius:10px;font-size:0.8rem;font-weight:600;">
                    ${t}
                    <button type="button" onclick="window.inventoryManager.removeDynTag('${key}', '${t}')" style="background:none;border:none;color:#1e40af;cursor:pointer;font-size:0.8rem;padding:0;line-height:1;margin-left:2px;">&#x00D7;</button>
                </span>
            `).join('');
        }
    }

    // Set stock quantity for a specific tag value (e.g. size M -> 5)
    setDynTagStock(key, tag, value) {
        if (!this.dynTagStocks) this.dynTagStocks = {};
        if (!this.dynTagStocks[key]) this.dynTagStocks[key] = {};
        const qty = parseInt(value, 10);
        this.dynTagStocks[key][tag] = isNaN(qty) ? 0 : Math.max(0, qty);

        // Live validation: check total against product stock
        const productStock = parseInt(document.getElementById('productStock')?.value) || 0;
        const stockMap = this.dynTagStocks[key];
        const totalSizeStock = Object.values(stockMap).reduce((sum, q) => sum + (parseInt(q) || 0), 0);
        const isOver = totalSizeStock > productStock;

        // Find the container and update all inputs' border color
        const container = document.getElementById(`dynTagChips_${key}`);
        if (container) {
            container.querySelectorAll('input[type="number"]').forEach(inp => {
                inp.style.border = isOver ? '1px solid #dc2626' : '1px solid #bfdbfe';
                inp.style.background = isOver ? '#fff5f5' : 'white';
            });
            // Show or remove warning label
            let warn = container.parentElement?.querySelector('.size-stock-warning');
            if (isOver) {
                if (!warn) {
                    warn = document.createElement('div');
                    warn.className = 'size-stock-warning';
                    warn.style.cssText = 'color:#dc2626;font-size:0.75rem;margin-top:4px;font-weight:600;';
                    container.parentElement.appendChild(warn);
                }
                warn.textContent = `⚠ Total size stock (${totalSizeStock}) exceeds product stock (${productStock})`;
            } else if (warn) {
                warn.remove();
            }
        }
    }

    // Keep "all" size chips in sync with the base Stock Quantity
    syncAllSizeQtyFields() {
        if (!this.dynTagStocks) return;
        const productStock = parseInt(document.getElementById('productStock')?.value) || 0;
        Object.keys(this.dynTagStocks).forEach(key => {
            const stockMap = this.dynTagStocks[key];
            const allTags = Object.keys(stockMap).filter(t => (t || '').toLowerCase() === 'all');
            if (allTags.length === 0) return;
            allTags.forEach(t => {
                stockMap[t] = productStock;
                const container = document.getElementById(`dynTagChips_${key}`);
                if (container) {
                    container.querySelectorAll('input[data-tag]').forEach(inp => {
                        if ((inp.dataset.tag || '').toLowerCase() === 'all') inp.value = productStock;
                    });
                }
                this.setDynTagStock(key, t, productStock);
            });
        });
    }

    // Set custom price override for a specific tag value (e.g. size XL -> 250)
    setDynTagPrice(key, tag, value) {
        if (!this.dynTagPrices) this.dynTagPrices = {};
        if (!this.dynTagPrices[key]) this.dynTagPrices[key] = {};
        const p = parseFloat(value);
        if (isNaN(p) || value === '' || value === null) {
            delete this.dynTagPrices[key][tag];
        } else {
            this.dynTagPrices[key][tag] = Math.max(0, p);
        }
    }

    getDynamicFieldValues() {
        const values = {};
        // Simple input/select fields
        document.querySelectorAll('.dynamic-field-input').forEach(input => {
            const id = input.id.replace('dyn_', '');
            if (input.value && input.value.trim()) values[id] = input.value.trim();
        });
        // Multi-value tag fields
        if (this.dynTagFields) {
            Object.keys(this.dynTagFields).forEach(key => {
                const set = this.dynTagFields[key];
                if (set instanceof Set && set.size > 0) {
                    values[key] = Array.from(set);
                }
            });
        }
        // Per-tag stock quantities (e.g. size_stock: { M: 5, S: 4, L: 1 })
        if (this.dynTagStocks) {
            Object.keys(this.dynTagStocks).forEach(key => {
                const stockMap = this.dynTagStocks[key];
                if (stockMap && Object.keys(stockMap).length > 0) {
                    values[`${key}_stock`] = stockMap;
                }
            });
        }
        // Per-tag price overrides (e.g. size_price: { M: 150, L: 200 })
        if (this.dynTagPrices) {
            Object.keys(this.dynTagPrices).forEach(key => {
                const priceMap = this.dynTagPrices[key];
                if (priceMap && Object.keys(priceMap).length > 0) {
                    values[`${key}_price`] = priceMap;
                    values[`${key}_prices`] = priceMap;
                }
            });
        }
        return values;
    }

    async startCamera() {
        const modal = document.getElementById('cameraModal');
        const video = document.getElementById('cameraVideo');
        if (!modal || !video) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.cameraFacingMode || 'environment' },
                audio: false
            });
            video.srcObject = stream;
            this.cameraStream = stream;
            modal.classList.add('active');
        } catch (err) {
            console.error('Camera access error:', err);
            showNotification('Could not access camera. Please check permissions.', 'error');
            // Fallback: trigger file input with capture
            document.getElementById('productImageFile').click();
        }
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        const video = document.getElementById('cameraVideo');
        if (video) video.srcObject = null;
    }

    switchCamera() {
        this.cameraFacingMode = this.cameraFacingMode === 'user' ? 'environment' : 'user';
        this.stopCamera();
        this.startCamera();
    }

    takePicture() {
        const video = document.getElementById('cameraVideo');
        const canvas = document.getElementById('cameraCanvas');
        if (!video || !canvas) return;

        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            const file = new File([blob], `captured_photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
            this.handlePhotoSelection(file);
            document.getElementById('cameraModal').classList.remove('active');
            this.stopCamera();
        }, 'image/jpeg', 0.8);
    }

    closeAllModals() {
        this.stopCamera();
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }
}

// Initialize on inventory page
if (window.location.pathname.includes('inventory.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        window.inventoryManager = new InventoryManager();
    });
}
