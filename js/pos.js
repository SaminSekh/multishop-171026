// POS System Manager - COMPLETELY FIXED VERSION
class POSManager {
    constructor() {
        this.currentUser = null;
        this.shopId = null;
        this.cart = [];
        this.products = [];
        this.cartTotal = 0;
        this.cartSubtotal = 0;
        this.discount = 0;
        this.deliveryCharge = 0;
        this.posPage = 1;
        this.perPage = window.getStoredPerPage ? window.getStoredPerPage('pos', 50) : 50;
        // Recent Transactions state (search / date filter / pagination)
        this.transactions = [];
        this.filteredTransactions = [];
        this.txPage = 1;
        this.txPerPage = window.getStoredPerPage ? window.getStoredPerPage('pos_transactions', 50) : 50;
        this.txSearchTerm = '';
        this.txDateFrom = '';
        this.txDateTo = '';
        this.txProductMap = {};
        this.currentRestockSale = null;
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

        // Update Shop Info (Wait for it so we have the logo)
        await this.updateShopName();

        // Update UI
        this.updateUI();

        // Setup event listeners
        this.setupEventListeners();

        // Load products and pull the shared Spin & Win URL in parallel
        await Promise.all([
            this.loadProducts(),
            this.syncAppsScriptUrlFromSupabase()
        ]);

        // Update time
        this.updateCurrentTime();

        // Load recent transactions
        await this.loadRecentTransactions();

        // Check for held sales
        this.checkHeldSales();

        // Check for pending order redirected from Google Sheet Orders section
        await this.checkPendingOrderFromGoogleSheet();
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

        // Update currency symbols
        const discountCurrency = document.getElementById('discountCurrency');
        if (discountCurrency) {
            discountCurrency.textContent = getCurrencySymbol();
        }
    }

    async updateShopName() {
        try {
            // Fetch shop, receipt wording and QR in parallel to cut round-trips
            const [shopRes, settingsRes, qrRes] = await Promise.all([
                supabaseClient
                    .from('shops')
                    .select('shop_name, shop_logo, business_type')
                    .eq('id', this.shopId)
                    .single(),
                supabaseClient
                    .from('shop_settings')
                    .select('currency, receipt_header, receipt_footer')
                    .eq('shop_id', this.shopId)
                    .maybeSingle(),
                // Receipt QR is optional and its column may not exist yet on older
                // installs, so a failure here must never break the wording above.
                supabaseClient
                    .from('shop_settings')
                    .select('receipt_qr_image_url')
                    .eq('shop_id', this.shopId)
                    .maybeSingle()
                    .then(res => res, err => ({ data: null, error: err }))
            ]);

            const { data: shop, error } = shopRes;
            if (!error && shop) {
                this.shopData = shop;
                this.shopLogo = shop.shop_logo || null;
                this.businessType = shop.business_type || 'general';

                // Set shop logo as favicon
                if (shop.shop_logo) {
                    setFavicon(shop.shop_logo);
                }
            }

            const { data: settings } = settingsRes;
            if (settings) {
                window.shopCurrency = settings.currency || 'INR';
                this.receiptHeader = settings.receipt_header || 'Thank you for shopping with us!';
                this.receiptFooter = settings.receipt_footer || 'Please visit again!';
            } else {
                this.receiptHeader = 'Thank you for shopping with us!';
                this.receiptFooter = 'Please visit again!';
            }

            this.receiptQrImageUrl = '';
            if (qrRes && qrRes.error) {
                console.warn('Receipt QR load skipped:', qrRes.error.message);
            } else if (qrRes && qrRes.data) {
                this.receiptQrImageUrl = qrRes.data.receipt_qr_image_url || '';
            }
        } catch (error) {
            console.error('Error fetching shop info:', error);
        }
    }

    setupEventListeners() {
        // Hide out of stock checkbox
        const hideOutOfStockCb = document.getElementById('hideOutOfStock');
        if (hideOutOfStockCb) {
            hideOutOfStockCb.addEventListener('change', () => {
                this.posPage = 1;
                this.filterProductsCombined();
            });
        }

        // Product search
        const searchInput = document.getElementById('productSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterProducts(e.target.value);
            });
        }

        // Filter buttons
        document.querySelectorAll('[data-filter]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.filterProductsBy(filter);
            });
        });

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
            typeFilter.addEventListener('change', (e) => {
                this.handleTypeChange(e.target.value);
            });
        }

        // Add to cart
        document.addEventListener('click', (e) => {
            if (e.target.closest('.add-to-cart-btn')) {
                const btn = e.target.closest('.add-to-cart-btn');
                const productId = btn.dataset.id;
                this.handleAddToCart(productId);
            }
            // Product detail view on card click (not on Add button)
            if (e.target.closest('.product-card') && !e.target.closest('.add-to-cart-btn')) {
                const card = e.target.closest('.product-card');
                const addBtn = card.querySelector('.add-to-cart-btn');
                if (addBtn) {
                    this.showProductDetail(addBtn.dataset.id);
                }
            }
        });

        // Remove from cart
        document.addEventListener('click', (e) => {
            if (e.target.closest('.remove-from-cart')) {
                const btn = e.target.closest('.remove-from-cart');
                const productId = btn.dataset.id;
                this.removeFromCart(productId);
            }
        });

        // Edit price in cart
        document.addEventListener('click', (e) => {
            if (e.target.closest('.edit-price-btn')) {
                const btn = e.target.closest('.edit-price-btn');
                const productId = btn.dataset.id;
                this.editCartItemPrice(productId);
            }
        });

        // Update quantity
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('cart-quantity')) {
                const productId = e.target.dataset.id;
                const quantity = parseInt(e.target.value) || 1;
                this.updateCartQuantity(productId, quantity);
            }
        });

        // Discount input
        const discountInput = document.getElementById('discountAmount');
        if (discountInput) {
            discountInput.addEventListener('input', (e) => {
                this.discount = parseFloat(e.target.value) || 0;
                this.updateCartTotals();
            });
        }

        // Delivery charge input
        const deliveryInput = document.getElementById('deliveryCharge');
        if (deliveryInput) {
            deliveryInput.addEventListener('input', (e) => {
                this.deliveryCharge = parseFloat(e.target.value) || 0;
                this.updateCartTotals();
            });
        }

        // Payment method change
        document.querySelectorAll('input[name="paymentMethod"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.togglePaymentFields(e.target.value);
            });
        });

        // Remove old amount received / change listeners — replaced by delivery charge
        const amountReceived = document.getElementById('amountReceived');
        if (amountReceived) {
            amountReceived.addEventListener('input', (e) => {
                const received = parseFloat(e.target.value) || 0;
                const change = received - this.cartTotal;
                const changeElement = document.getElementById('changeAmount');
                if (changeElement) {
                    changeElement.value = change > 0 ? change.toFixed(2) : '0.00';
                }
            });
        }

        // Amount paid for credit
        const amountPaid = document.getElementById('amountPaid');
        if (amountPaid) {
            amountPaid.addEventListener('input', (e) => {
                const paid = parseFloat(e.target.value) || 0;
                const pending = this.cartTotal - paid;
                const pendingElement = document.getElementById('pendingAmount');
                if (pendingElement) {
                    pendingElement.value = pending > 0 ? pending.toFixed(2) : '0.00';
                }
            });
        }

        // Checkout button
        const checkoutBtn = document.getElementById('checkoutBtn');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', () => {
                this.processCheckout();
            });
        }

        // Clear cart button
        const clearCartBtn = document.getElementById('clearCartBtn');
        if (clearCartBtn) {
            clearCartBtn.addEventListener('click', () => {
                this.clearCart();
            });
        }

        // Hold sale button
        const holdSaleBtn = document.getElementById('holdSaleBtn');
        if (holdSaleBtn) {
            holdSaleBtn.addEventListener('click', () => {
                this.holdSale();
            });
        }

        // Print invoice button
        const printInvoiceBtn = document.getElementById('printInvoiceBtn');
        if (printInvoiceBtn) {
            printInvoiceBtn.addEventListener('click', () => {
                this.printInvoice();
            });
        }

        // Refresh transactions
        const refreshTransactions = document.getElementById('refreshTransactions');
        if (refreshTransactions) {
            refreshTransactions.addEventListener('click', () => {
                this.loadRecentTransactions();
            });
        }

        // Transactions search / date filter / reset
        const txSearchInput = document.getElementById('txSearch');
        const txSearchBtn = document.getElementById('txSearchBtn');
        const txDateFrom = document.getElementById('txDateFrom');
        const txDateTo = document.getElementById('txDateTo');
        const txReset = document.getElementById('txResetFilters');

        const applyTxSearch = () => {
            this.txSearchTerm = txSearchInput ? txSearchInput.value : '';
            this.txPage = 1;
            this.txApplyFilters();
        };

        if (txSearchBtn) {
            txSearchBtn.addEventListener('click', applyTxSearch);
        }
        if (txSearchInput) {
            txSearchInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') applyTxSearch();
            });
        }
        if (txDateFrom) {
            txDateFrom.addEventListener('change', () => {
                this.txDateFrom = txDateFrom.value;
                this.txPage = 1;
                this.txApplyFilters();
            });
        }
        if (txDateTo) {
            txDateTo.addEventListener('change', () => {
                this.txDateTo = txDateTo.value;
                this.txPage = 1;
                this.txApplyFilters();
            });
        }
        if (txReset) {
            txReset.addEventListener('click', () => {
                if (txSearchInput) txSearchInput.value = '';
                this.txSearchTerm = '';
                this.txDateFrom = '';
                this.txDateTo = '';
                if (txDateFrom) txDateFrom.value = '';
                if (txDateTo) txDateTo.value = '';
                this.txPage = 1;
                this.txApplyFilters();
            });
        }

        // Setup live Members Club phone lookup
        this.setupMemberPhoneLookup();

        // Restock / Refund modal
        const confirmRestockBtn = document.getElementById('confirmRestock');
        if (confirmRestockBtn) {
            confirmRestockBtn.addEventListener('click', () => {
                this.confirmRestock();
            });
        }
        const restockModalEl = document.getElementById('restockModal');
        if (restockModalEl) {
            restockModalEl.addEventListener('click', (e) => {
                if (e.target === restockModalEl) this.closeRestockModal();
            });
        }

        // Modal close buttons
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeAllModals();
            });
        });

        // Load held sale button
        const loadHeldSaleBtn = document.getElementById('loadHeldSaleBtn');
        if (loadHeldSaleBtn) {
            loadHeldSaleBtn.addEventListener('click', () => {
                this.loadHeldSale();
            });
        }

        // Mobile cart toggle
        const mobileCartToggle = document.getElementById('mobileCartToggle');
        if (mobileCartToggle) {
            mobileCartToggle.addEventListener('click', () => {
                this.toggleMobileCart();
            });
        }

        // Mobile close button
        const closeCartBtn = document.getElementById('closeCartBtn');
        if (closeCartBtn) {
            closeCartBtn.addEventListener('click', () => {
                this.closeMobileCart();
            });
        }

        // Cart backdrop click (close cart)
        const cartBackdrop = document.getElementById('cartBackdrop');
        if (cartBackdrop) {
            cartBackdrop.addEventListener('click', () => {
                this.closeMobileCart();
            });
        }
    }

    getMembersKey() {
        const shopId = this.shopId || localStorage.getItem('current_shop_id') || localStorage.getItem('pos_shop_id') || '';
        return shopId ? `spinwin_members_${shopId}` : 'spinwin_members_v1';
    }

    getMembers() {
        const primaryKey = this.getMembersKey();
        let members = [];
        try {
            const raw = localStorage.getItem(primaryKey);
            if (raw) members = JSON.parse(raw);
        } catch(e) {}

        if (primaryKey !== 'spinwin_members_v1') {
            try {
                const rawV1 = localStorage.getItem('spinwin_members_v1');
                if (rawV1) {
                    const v1Members = JSON.parse(rawV1);
                    if (Array.isArray(v1Members) && v1Members.length > 0) {
                        const existingIds = new Set(members.map(m => String(m.id)));
                        v1Members.forEach(m => {
                            if (!existingIds.has(String(m.id))) {
                                members.push(m);
                            }
                        });
                    }
                }
            } catch(e) {}
        }
        return Array.isArray(members) ? members : [];
    }

    saveMembers(members) {
        const primaryKey = this.getMembersKey();
        const json = JSON.stringify(members);
        localStorage.setItem(primaryKey, json);
        localStorage.setItem('spinwin_members_v1', json);
    }

    getAppsScriptUrl() {
        const shopId = this.shopId || localStorage.getItem('current_shop_id') || localStorage.getItem('pos_shop_id') || '';
        const secondaryUrl = shopId ? (localStorage.getItem(`gs_secondary_sheet_url_${shopId}`) || "") : "";
        const spinShopUrl = shopId ? (localStorage.getItem(`spinwin_apps_script_url_${shopId}`) || "") : "";
        const globalUrl = localStorage.getItem("spinwin_apps_script_url_v1") || "";
        return secondaryUrl || spinShopUrl || globalUrl || "";
    }

    async syncAppsScriptUrlFromSupabase() {
        try {
            const shopId = this.shopId || localStorage.getItem('current_shop_id') || '';
            if (!shopId || typeof supabaseClient === 'undefined') return;
            if (this.getAppsScriptUrl()) return; // Already known on this device
            const { data, error } = await supabaseClient
                .from('shop_settings')
                .select('spinwin_apps_script_url')
                .eq('shop_id', shopId)
                .maybeSingle();
            if (error) {
                console.warn('POS Spin & Win URL sync skipped:', error.message);
                return;
            }
            const sharedUrl = data && data.spinwin_apps_script_url ? String(data.spinwin_apps_script_url).trim() : '';
            if (sharedUrl) {
                localStorage.setItem(`gs_secondary_sheet_url_${shopId}`, sharedUrl);
                localStorage.setItem(`spinwin_apps_script_url_${shopId}`, sharedUrl);
                localStorage.setItem('spinwin_apps_script_url_v1', sharedUrl);
            }
        } catch (e) {
            console.warn('POS Spin & Win URL sync skipped:', e);
        }
    }

    syncMemberToCloud(member) {
        const url = this.getAppsScriptUrl();
        if (!url) return;
        try {
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'save_member', member: member })
            }).then(res => res.json()).then(data => {
                if (data && data.ok) {
                    const members = this.getMembers();
                    const target = members.find(m => String(m.id) === String(member.id));
                    if (target) {
                        target.synced = true;
                        this.saveMembers(members);
                    }
                }
            }).catch(err => console.warn('POS member cloud sync deferred:', err));
        } catch(e) {}
    }

    setupMemberPhoneLookup() {
        const handlePhoneInput = (phoneInputEl, nameInputEl, badgeEl) => {
            if (!phoneInputEl || !badgeEl) return;

            const checkMatch = () => {
                const phoneVal = phoneInputEl.value ? phoneInputEl.value.trim() : '';
                const cleanPhone = phoneVal.replace(/[^0-9]/g, '');

                if (cleanPhone.length < 3) {
                    badgeEl.style.display = 'none';
                    badgeEl.innerHTML = '';
                    return;
                }

                const members = this.getMembers();

                const match = Array.isArray(members) ? members.find(m => {
                    const p = String(m.phone || '').replace(/[^0-9]/g, '');
                    return p && p === cleanPhone;
                }) : null;

                if (match) {
                    const cashWorth = ((match.credits || 0) / 100).toFixed(2);
                    badgeEl.innerHTML = `
                        <div style="display:flex;align-items:center;justify-space-between;width:100%;gap:10px;flex-wrap:wrap;">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <i class="fas fa-crown" style="color:#eab308;font-size:0.95rem;"></i>
                                <span><strong>Members Club:</strong> ${match.name} · <strong style="color:#059669;">⭐ ${match.credits || 0} pts</strong> (Worth ≈ ₹${cashWorth})</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
                                <button type="button" class="btn-member-add" style="padding:4px 10px;font-size:0.75rem;background:#10b981;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;display:inline-flex;align-items:center;gap:4px;box-shadow:0 2px 4px rgba(16,185,129,0.2);">
                                    <i class="fas fa-plus-circle"></i> Add Pts
                                </button>
                                <button type="button" class="btn-member-deduct" style="padding:4px 10px;font-size:0.75rem;background:#f59e0b;color:#1e1100;border:none;border-radius:6px;cursor:pointer;font-weight:700;display:inline-flex;align-items:center;gap:4px;box-shadow:0 2px 4px rgba(245,158,11,0.2);">
                                    <i class="fas fa-minus-circle"></i> Redeem
                                </button>
                            </div>
                        </div>
                    `;
                    badgeEl.style.display = 'flex';

                    // Attach quick button click listeners
                    const addBtn = badgeEl.querySelector('.btn-member-add');
                    const deductBtn = badgeEl.querySelector('.btn-member-deduct');

                    if (addBtn) {
                        addBtn.onclick = (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            this.openPosMemberActionModal(match, 'add');
                        };
                    }

                    if (deductBtn) {
                        deductBtn.onclick = (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            this.openPosMemberActionModal(match, 'deduct');
                        };
                    }

                    // Auto-fill customer name if blank
                    if (nameInputEl && !nameInputEl.value.trim()) {
                        nameInputEl.value = match.name;
                    }
                } else {
                    // No existing member — offer to register as a new member & add points
                    badgeEl.innerHTML = `
                        <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:10px;flex-wrap:wrap;">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <i class="fas fa-user-plus" style="color:#0284c7;font-size:0.95rem;"></i>
                                <span><strong>New Customer</strong> · Not a member yet</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
                                <button type="button" class="btn-member-register" style="padding:4px 10px;font-size:0.75rem;background:#0284c7;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;display:inline-flex;align-items:center;gap:4px;box-shadow:0 2px 4px rgba(2,132,199,0.2);">
                                    <i class="fas fa-crown"></i> Register & Add Pts
                                </button>
                            </div>
                        </div>
                    `;
                    badgeEl.style.display = 'flex';

                    const regBtn = badgeEl.querySelector('.btn-member-register');
                    if (regBtn) {
                        regBtn.onclick = (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const name = nameInputEl ? nameInputEl.value.trim() : '';
                            const phone = phoneInputEl.value.trim();
                            if (!name) {
                                showNotification('Please enter the customer name to register a member', 'error');
                                if (nameInputEl) nameInputEl.focus();
                                return;
                            }
                            const newMember = this.buildNewMember(name, phone);
                            this.openPosMemberActionModal(newMember, 'add', true);
                        };
                    }
                }
            };

            phoneInputEl.addEventListener('input', checkMatch);
            phoneInputEl.addEventListener('focus', checkMatch);
            if (nameInputEl) nameInputEl.addEventListener('input', checkMatch);
        };

        const customerPhone = document.getElementById('customerPhone');
        const customerName = document.getElementById('customerName');
        const customerBadge = document.getElementById('customerMemberBadge');

        const buyerPhone = document.getElementById('buyerPhone');
        const buyerName = document.getElementById('buyerName');
        const buyerBadge = document.getElementById('buyerMemberBadge');

        handlePhoneInput(customerPhone, customerName, customerBadge);
        handlePhoneInput(buyerPhone, buyerName, buyerBadge);
    }

    getMembershipTypes() {
        const defaults = [
            { name: 'Spin Winner', icon: '👑' },
            { name: 'Direct Member', icon: '💎' },
            { name: 'VIP Member', icon: '⭐' }
        ];
        try {
            const shopId = this.shopId || localStorage.getItem('current_shop_id') || localStorage.getItem('pos_shop_id') || '';
            const key = shopId ? `spinwin_settings_${shopId}` : 'spinwin_settings_v2';
            let raw = localStorage.getItem(key);
            if (!raw && key !== 'spinwin_settings_v2') raw = localStorage.getItem('spinwin_settings_v2');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.membershipTypes) && parsed.membershipTypes.length) {
                    const list = parsed.membershipTypes
                        .filter(t => t && t.name)
                        .map(t => ({ name: String(t.name), icon: t.icon || '🏅' }));
                    if (list.length) return list;
                }
            }
        } catch (e) {}
        return defaults;
    }

    buildNewMember(name, phone, type) {
        const nowIso = new Date().toISOString();
        const memberType = type || 'Direct Member';
        return {
            id: `mem_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: name,
            phone: phone,
            type: memberType,
            memberType: memberType,
            credits: 0,
            lifetimeEarned: 0,
            totalCashedOut: 0,
            notes: 'Registered from POS',
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
            ledger: [],
            synced: false
        };
    }

    openPosMemberActionModal(member, actionType, isNew = false) {
        const modal = document.getElementById('posMemberActionModal');
        if (!modal) return;

        document.getElementById('posMemberId').value = member.id;
        document.getElementById('posActionType').value = actionType;

        const titleEl = document.getElementById('posMemberActionTitle');
        const submitBtn = document.getElementById('posSubmitActionBtn');

        document.getElementById('posMemberName').textContent = member.name || 'Member';
        document.getElementById('posMemberPhone').textContent = `Phone: ${member.phone || '—'}`;
        document.getElementById('posMemberCredits').textContent = `${member.credits || 0} pts`;
        document.getElementById('posMemberCash').textContent = `₹${((member.credits || 0) / 100).toFixed(2)}`;

        const addFields = document.getElementById('posAddPointsFields');
        const deductFields = document.getElementById('posDeductPointsFields');

        if (actionType === 'add') {
            titleEl.innerHTML = isNew
                ? `<i class="fas fa-user-plus" style="color:#10b981;"></i> Register & Add Points for ${member.name}`
                : `<i class="fas fa-plus-circle" style="color:#10b981;"></i> Add Points for ${member.name}`;
            submitBtn.textContent = isNew ? 'Register & Add Points' : 'Add Points';
            submitBtn.className = 'btn btn-success';

            addFields.style.display = 'block';
            deductFields.style.display = 'none';

            // Membership type selector (only when registering a new member)
            const typeGroup = document.getElementById('posAddMemberTypeGroup');
            const typeSelect = document.getElementById('posAddMemberType');
            if (typeGroup && typeSelect) {
                typeSelect.innerHTML = '';
                if (isNew) {
                    const types = this.getMembershipTypes();
                    types.forEach((t) => {
                        const opt = document.createElement('option');
                        opt.value = t.name;
                        opt.textContent = `${t.icon ? t.icon + ' ' : ''}${t.name}`;
                        if (t.name === 'Direct Member') opt.selected = true;
                        typeSelect.appendChild(opt);
                    });
                    if (!typeSelect.value && typeSelect.options.length) typeSelect.selectedIndex = 0;
                    typeGroup.style.display = 'block';
                } else {
                    typeGroup.style.display = 'none';
                }
            }

            const purAmt = document.getElementById('posAddPurchaseAmount');
            const ptsInput = document.getElementById('posAddPointsInput');
            const noteInput = document.getElementById('posAddNoteInput');
            const chipsEl = document.getElementById('posAddPercentChips');

            // Points = Purchase × % (100 pts = ₹1.00 cash value)
            const computePts = (percent, amount) => Math.max(0, Math.round((amount || 0) * percent));

            const renderChips = () => {
                if (!chipsEl) return;
                const amount = parseFloat(purAmt.value || 0) || 0;
                const percents = [1, 2, 3, 5, 10];
                chipsEl.innerHTML = percents.map(p => `
                    <button type="button" class="pos-pct-chip" data-pct="${p}" title="${p}% of ₹${amount.toFixed(2)}" style="padding:5px 10px;font-size:0.72rem;font-weight:700;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:999px;cursor:pointer;white-space:nowrap;">
                        ${p}% → ${computePts(p, amount)} pts
                    </button>
                `).join('');
                chipsEl.querySelectorAll('.pos-pct-chip').forEach(btn => {
                    btn.onclick = (e) => {
                        e.preventDefault();
                        const pct = parseFloat(btn.dataset.pct) || 0;
                        const amt = parseFloat(purAmt.value || 0) || 0;
                        ptsInput.value = computePts(pct, amt);
                    };
                });
            };

            purAmt.value = (this.cartTotal || 0).toFixed(2);
            ptsInput.value = Math.max(1, computePts(1, parseFloat(purAmt.value || 0) || 0));
            renderChips();
            purAmt.oninput = renderChips;
            noteInput.value = `POS Purchase Bill (₹${(this.cartTotal || 0).toFixed(2)})`;
        } else {
            titleEl.innerHTML = `<i class="fas fa-minus-circle" style="color:#f59e0b;"></i> Redeem Points for ${member.name}`;
            submitBtn.textContent = 'Redeem & Apply Discount';
            submitBtn.className = 'btn btn-warning';

            addFields.style.display = 'none';
            deductFields.style.display = 'block';

            const billAmt = document.getElementById('posDeductBillAmount');
            const ptsInput = document.getElementById('posDeductPointsInput');
            const maxPtsSpan = document.getElementById('posMaxRedeemPts');
            const discountDisp = document.getElementById('posRedeemDiscountDisplay');
            const noteInput = document.getElementById('posDeductNoteInput');

            billAmt.value = (this.cartTotal || 0).toFixed(2);
            maxPtsSpan.textContent = String(member.credits || 0);

            const maxWorthPts = Math.round((this.cartTotal || 0) * 100);
            const defaultRedeem = Math.min(member.credits || 0, maxWorthPts > 0 ? maxWorthPts : (member.credits || 0));
            ptsInput.value = defaultRedeem;

            const calcDiscount = () => {
                const pts = Math.min(member.credits || 0, Math.max(0, parseInt(ptsInput.value || 0, 10)));
                discountDisp.textContent = `₹${(pts / 100).toFixed(2)}`;
            };

            ptsInput.oninput = calcDiscount;
            calcDiscount();

            noteInput.value = `POS Discount Redemption`;
        }

        modal.classList.add('active');

        const form = document.getElementById('posMemberActionForm');
        form.onsubmit = (e) => {
            e.preventDefault();
            this.processPosMemberActionSubmit(member, isNew);
        };
    }

    processPosMemberActionSubmit(member, isNew = false) {
        const modal = document.getElementById('posMemberActionModal');
        const actionType = document.getElementById('posActionType').value;
        const memberId = document.getElementById('posMemberId').value;

        const members = this.getMembers();

        let targetMember = members.find(m => String(m.id) === String(memberId));
        if (!targetMember) {
            if (isNew) {
                targetMember = member;
                members.push(targetMember);
            } else {
                showNotification('Member not found', 'error');
                return;
            }
        }

        const nowIso = new Date().toISOString();
        if (!Array.isArray(targetMember.ledger)) targetMember.ledger = [];

        if (actionType === 'add') {
            const ptsToAdd = Math.max(1, parseInt(document.getElementById('posAddPointsInput').value || '0', 10));
            const note = document.getElementById('posAddNoteInput').value.trim() || 'POS Purchase Credits';

            if (isNew) {
                const typeSelect = document.getElementById('posAddMemberType');
                const chosenType = (typeSelect && typeSelect.value) ? typeSelect.value : (targetMember.type || 'Direct Member');
                targetMember.type = chosenType;
                targetMember.memberType = chosenType;
                if (!targetMember.createdAtIso) targetMember.createdAtIso = nowIso;
            }

            targetMember.credits = (targetMember.credits || 0) + ptsToAdd;
            targetMember.lifetimeEarned = (targetMember.lifetimeEarned || 0) + ptsToAdd;
            targetMember.updatedAtIso = nowIso;
            targetMember.synced = false;

            targetMember.ledger.unshift({
                id: `tx_${Date.now()}_${Math.floor(Math.random()*1000)}`,
                type: 'CREDIT',
                credits: ptsToAdd,
                cashValue: ptsToAdd / 100,
                note: note,
                dateTimeIso: nowIso,
                balanceAfter: targetMember.credits
            });

            this.saveMembers(members);
            this.syncMemberToCloud(targetMember);
            showNotification(isNew
                ? `Registered ${targetMember.name} with +${ptsToAdd} points!`
                : `Added +${ptsToAdd} points to ${targetMember.name}!`, 'success');
        } else if (actionType === 'deduct') {
            const maxPts = targetMember.credits || 0;
            const ptsToDeduct = Math.min(maxPts, Math.max(1, parseInt(document.getElementById('posDeductPointsInput').value || '0', 10)));
            const cashDiscount = ptsToDeduct / 100;
            const note = document.getElementById('posDeductNoteInput').value.trim() || 'POS Credit Redemption';

            targetMember.credits = Math.max(0, (targetMember.credits || 0) - ptsToDeduct);
            targetMember.totalCashedOut = (targetMember.totalCashedOut || 0) + cashDiscount;
            targetMember.updatedAtIso = nowIso;
            targetMember.synced = false;

            targetMember.ledger.unshift({
                id: `tx_${Date.now()}_${Math.floor(Math.random()*1000)}`,
                type: 'DEBIT',
                credits: ptsToDeduct,
                cashValue: cashDiscount,
                note: note,
                dateTimeIso: nowIso,
                balanceAfter: targetMember.credits
            });

            this.saveMembers(members);
            this.syncMemberToCloud(targetMember);

            const discountInput = document.getElementById('discountAmount');
            if (discountInput) {
                discountInput.value = cashDiscount.toFixed(2);
                this.discount = cashDiscount;
                this.updateCartTotals();
            }

            showNotification(`Redeemed ${ptsToDeduct} pts (₹${cashDiscount.toFixed(2)} discount applied)!`, 'success');
        }

        if (modal) modal.classList.remove('active');

        const customerPhone = document.getElementById('customerPhone');
        if (customerPhone) customerPhone.dispatchEvent(new Event('input'));
        const buyerPhone = document.getElementById('buyerPhone');
        if (buyerPhone) buyerPhone.dispatchEvent(new Event('input'));
    }

    checkHeldSales() {
        const heldSale = localStorage.getItem(`hold_sale_${this.shopId}`);
        if (heldSale) {
            showNotification('There is a held sale available', 'info');
        }
    }

    async loadProducts() {
        showLoading(true);

        try {
            // Business type was already fetched with the shop in updateShopName;
            // only fetch it here if it's still unknown.
            if (!this.businessType) {
                const { data: shopData } = await supabaseClient
                    .from('shops')
                    .select('business_type')
                    .eq('id', this.shopId)
                    .maybeSingle();

                this.businessType = shopData?.business_type || 'general';
            }

            // Load type configurations and products in parallel
            const [typeConfigsRes, productsRes] = await Promise.all([
                supabaseClient
                    .from('system_configs')
                    .select('key, value')
                    .like('key', 'types_%'),
                supabaseClient
                    .from('products')
                    .select('*')
                    .eq('shop_id', this.shopId)
                    .order('product_name')
            ]);

            const { data: typeConfigsData } = typeConfigsRes;
            this.typeConfigs = {};
            if (typeConfigsData) {
                typeConfigsData.forEach(config => {
                    const category = config.key.replace('types_', '');
                    this.typeConfigs[category] = config.value.split(',').map(t => t.trim());
                });
            }

            const { data: products, error } = productsRes;
            if (error) throw error;

            this.products = products || [];

            // For ALL products, check if they have variants and add variant stocks to display
            if (this.products.length > 0) {
                const allProductIds = this.products.map(p => p.id);
                const { data: variantStocks } = await supabaseClient
                    .from('product_variants')
                    .select('product_id, stock')
                    .in('product_id', allProductIds)
                    .eq('is_active', true);

                if (variantStocks && variantStocks.length > 0) {
                    const variantTotals = {};
                    variantStocks.forEach(v => {
                        variantTotals[v.product_id] = (variantTotals[v.product_id] || 0) + (parseInt(v.stock) || 0);
                    });
                    // Store original base stock and add variant stocks for display
                    this.products.forEach(p => {
                        if (variantTotals[p.id]) {
                            p._baseStock = parseInt(p.stock) || 0;
                            p.stock = p._baseStock + variantTotals[p.id];
                        }
                    });
                }
            }

            this.renderProducts();

            // Load categories for filter
            this.loadCategories();

        } catch (error) {

            showNotification('Failed to load products', 'error');
        } finally {
            showLoading(false);
        }
    }

    renderProducts() {
        const container = document.getElementById('productGrid');
        if (!container) return;

        // Apply hide out of stock filter
        const hideOutOfStockCb = document.getElementById('hideOutOfStock');
        const hideOutOfStock = hideOutOfStockCb ? hideOutOfStockCb.checked : false;
        const displayProducts = hideOutOfStock ? this.products.filter(p => (parseInt(p.stock) || 0) >= 1) : this.products;

        if (displayProducts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box-open fa-2x"></i>
                    <p>No products available</p>
                    <small>Add products from inventory</small>
                </div>
            `;

            const productCount = document.getElementById('productCount');
            if (productCount) {
                productCount.innerHTML = `
                    <span class="count-badge">0 Items</span>
                    <span class="stock-badge">Total Stock: 0</span>
                `;
            }
            this.renderPosPagination(0);
            return;
        }

        // Pagination
        const perPage = this.perPage || 50;
        this.posPage = this.posPage || 1;
        const totalItems = displayProducts.length;
        const totalPages = Math.ceil(totalItems / perPage);
        if (this.posPage > totalPages) this.posPage = totalPages;
        if (this.posPage < 1) this.posPage = 1;
        const start = (this.posPage - 1) * perPage;
        const pageProducts = displayProducts.slice(start, start + perPage);

        container.innerHTML = pageProducts.map(product => {
            const stock = parseInt(product.stock) || 0;
            const stockClass = stock < 1 ? 'out-of-stock' :
                stock < 10 ? 'low-stock' : 'in-stock';

            const price = parseFloat(product.selling_price) || 0;

            return `
                <div class="product-card ${stockClass}">
                    <div class="product-image-container">
                        <img src="${product.product_image || this.shopLogo || 'https://via.placeholder.com/300?text=No+Image'}" 
                             class="product-img-pos" 
                             alt="${product.product_name}">
                        ${stock < 1 ? '<div class="out-of-stock-overlay">Sold Out</div>' : ''}
                    </div>
                    <div class="product-info">
                        <div class="product-category-type">
                            ${product.category || 'General'} ${product.type ? `• ${product.type}` : ''}
                        </div>
                        <div class="product-name" title="${product.product_name || 'Unnamed Product'}">
                            ${product.product_name || 'Unnamed Product'}
                        </div>
                        <div class="product-sku">SKU: ${product.sku || 'N/A'}</div>
                        <div class="product-meta">
                            <span class="stock-status ${stockClass}">
                                <i class="fas ${stock < 1 ? 'fa-times-circle' : 'fa-check-circle'}"></i> 
                                ${stock < 1 ? 'Out of Stock' : `${stock} in stock`}
                            </span>
                        </div>
                        <div class="product-price-action">
                            <div class="product-price">${formatCurrency(price)}</div>
                            <button class="btn btn-sm btn-primary add-to-cart-btn" 
                                    data-id="${product.id}"
                                    ${stock < 1 ? 'disabled' : ''}>
                                <i class="fas fa-cart-plus"></i> Add
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const productCount = document.getElementById('productCount');
        if (productCount) {
            const totalStock = displayProducts.reduce((sum, p) => sum + (parseInt(p.stock) || 0), 0);
            productCount.innerHTML = `
                <span class="count-badge">${displayProducts.length} Items</span>
                <span class="stock-badge">Total Stock: ${totalStock}</span>
            `;
        }

        this.renderPosPagination(totalItems);
    }

    loadCategories() {
        const categories = new Set();
        this.products.forEach(product => {
            if (product.category) {
                categories.add(product.category);
            }
        });

        const categoryFilter = document.getElementById('categoryFilter');
        if (!categoryFilter) return;

        categoryFilter.innerHTML = '<option value="">All Categories</option>';

        const sortedCategories = Array.from(categories).sort();
        sortedCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
    }

    loadTypes(category) {
        const typeFilter = document.getElementById('typeFilter');
        if (!typeFilter) return;

        // Collect unique product types ONLY from products added for this shop
        const productTypes = new Set();
        (this.products || []).forEach(product => {
            const pCat = typeof product.category === 'string' ? product.category : (product.category?.category_name || '');
            const matchesCategory = !category || pCat.toLowerCase() === category.toLowerCase();
            if (matchesCategory && product.type && product.type.trim() && product.type !== 'N/A' && product.type !== 'Select Type') {
                productTypes.add(product.type.trim());
            }
        });

        if (productTypes.size === 0) {
            typeFilter.style.display = 'none';
            typeFilter.innerHTML = '<option value="">All Types</option>';
            return;
        }

        const currentVal = typeFilter.value;
        typeFilter.style.display = 'inline-block';
        typeFilter.innerHTML = '<option value="">All Types</option>';

        const sortedTypes = Array.from(productTypes).sort();
        sortedTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            if (type === currentVal) option.selected = true;
            typeFilter.appendChild(option);
        });
    }

    handleCategoryChange(category) {
        this.loadTypes(category);
        this.filterProductsCombined();
    }

    handleTypeChange(type) {
        this.filterProductsCombined();
    }

    filterProducts(searchTerm) {
        this.posPage = 1;
        if (!searchTerm.trim()) {
            this.renderProducts();
            return;
        }

        let filtered = this.products.filter(product =>
            (product.product_name && product.product_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (product.category && product.category.toLowerCase().includes(searchTerm.toLowerCase()))
        );

        // Apply hide out of stock filter
        const hideOutOfStockCb = document.getElementById('hideOutOfStock');
        if (hideOutOfStockCb && hideOutOfStockCb.checked) {
            filtered = filtered.filter(p => (parseInt(p.stock) || 0) >= 1);
        }

        this.renderFilteredProducts(filtered);
    }

    filterProductsBy(filterType) {
        this.posPage = 1;
        let filtered = this.products;

        switch (filterType) {
            case 'low-stock':
                filtered = this.products.filter(p => p.stock < 10 && p.stock > 0);
                break;
            case 'out-of-stock':
                filtered = this.products.filter(p => p.stock < 1);
                break;
            default:
                filtered = this.products;
        }

        // Apply hide out of stock filter (except when explicitly viewing out-of-stock)
        if (filterType !== 'out-of-stock') {
            const hideOutOfStockCb = document.getElementById('hideOutOfStock');
            if (hideOutOfStockCb && hideOutOfStockCb.checked) {
                filtered = filtered.filter(p => (parseInt(p.stock) || 0) >= 1);
            }
        }

        this.renderFilteredProducts(filtered);
    }

    filterProductsByCategory(category) {
        this.handleCategoryChange(category);
    }

    filterProductsCombined() {
        this.posPage = 1;
        const categoryFilter = document.getElementById('categoryFilter');
        const typeFilter = document.getElementById('typeFilter');
        const searchInput = document.getElementById('productSearch');

        const selectedCategory = categoryFilter ? categoryFilter.value : '';
        const selectedType = typeFilter ? typeFilter.value : '';
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

        let filtered = this.products;

        if (selectedCategory) {
            filtered = filtered.filter(p => p.category === selectedCategory);
        }

        if (selectedType) {
            filtered = filtered.filter(p => p.type === selectedType);
        }

        if (searchTerm) {
            filtered = filtered.filter(p =>
                (p.product_name && p.product_name.toLowerCase().includes(searchTerm)) ||
                (p.sku && p.sku.toLowerCase().includes(searchTerm))
            );
        }

        // Apply hide out of stock filter
        const hideOutOfStockCb = document.getElementById('hideOutOfStock');
        if (hideOutOfStockCb && hideOutOfStockCb.checked) {
            filtered = filtered.filter(p => (parseInt(p.stock) || 0) >= 1);
        }

        this.renderFilteredProducts(filtered);
    }

    renderFilteredProducts(filteredProducts) {
        const container = document.getElementById('productGrid');
        if (!container) return;

        if (filteredProducts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search fa-2x"></i>
                    <p>No products found</p>
                    <small>Try a different search term</small>
                </div>
            `;

            const productCount = document.getElementById('productCount');
            if (productCount) {
                productCount.innerHTML = `
                    <span class="count-badge">0 Found</span>
                    <span class="stock-badge">Total Stock: 0</span>
                `;
            }
            this.renderPosPagination(0);
            return;
        }

        // Pagination
        const perPage = this.perPage || 50;
        this.posPage = this.posPage || 1;
        const totalItems = filteredProducts.length;
        const totalPages = Math.ceil(totalItems / perPage);
        if (this.posPage > totalPages) this.posPage = totalPages;
        if (this.posPage < 1) this.posPage = 1;
        const start = (this.posPage - 1) * perPage;
        const pageProducts = filteredProducts.slice(start, start + perPage);

        container.innerHTML = pageProducts.map(product => {
            const stock = parseInt(product.stock) || 0;
            const stockClass = stock < 1 ? 'out-of-stock' :
                stock < 10 ? 'low-stock' : 'in-stock';

            const price = parseFloat(product.selling_price) || 0;

            return `
                <div class="product-card ${stockClass}">
                    <div class="product-image-container">
                        <img src="${product.product_image || this.shopLogo || 'https://via.placeholder.com/300?text=No+Image'}" 
                             class="product-img-pos" 
                             alt="${product.product_name}">
                        ${stock < 1 ? '<div class="out-of-stock-overlay">Sold Out</div>' : ''}
                    </div>
                    <div class="product-info">
                        <div class="product-category-type">
                            ${product.category || 'General'} ${product.type ? `• ${product.type}` : ''}
                        </div>
                        <div class="product-name" title="${product.product_name || 'Unnamed Product'}">
                            ${product.product_name || 'Unnamed Product'}
                        </div>
                        <div class="product-sku">SKU: ${product.sku || 'N/A'}</div>
                        <div class="product-meta">
                            <span class="stock-status ${stockClass}">
                                <i class="fas ${stock < 1 ? 'fa-times-circle' : 'fa-check-circle'}"></i> 
                                ${stock < 1 ? 'Out of Stock' : `${stock} in stock`}
                            </span>
                        </div>
                        <div class="product-price-action">
                            <div class="product-price">${formatCurrency(price)}</div>
                            <button class="btn btn-sm btn-primary add-to-cart-btn" 
                                    data-id="${product.id}"
                                    ${stock < 1 ? 'disabled' : ''}>
                                <i class="fas fa-cart-plus"></i> Add
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const productCount = document.getElementById('productCount');
        if (productCount) {
            const totalStock = filteredProducts.reduce((sum, p) => sum + (parseInt(p.stock) || 0), 0);
            productCount.innerHTML = `
                <span class="count-badge">${filteredProducts.length} Found</span>
                <span class="stock-badge">Total Stock: ${totalStock}</span>
            `;
        }

        this.renderPosPagination(totalItems);
    }

    renderPosPagination(totalProducts) {
        let paginationEl = document.getElementById('posPagination');
        if (!paginationEl) {
            paginationEl = document.createElement('div');
            paginationEl.id = 'posPagination';
            const productGrid = document.getElementById('productGrid');
            if (productGrid) productGrid.after(paginationEl);
        }

        const perPage = this.perPage || 50;
        const totalPages = Math.ceil(totalProducts / perPage) || 1;
        const currentPage = this.posPage || 1;
        const perPageHtml = window.renderPerPageControlHTML ? window.renderPerPageControlHTML('pos', perPage) : '';

        paginationEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:white;border:1px solid #e2e8f0;border-radius:10px;margin-top:12px;flex-wrap:wrap;gap:10px;">
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                    <span style="font-size:0.8rem;color:#64748b;">Showing ${totalProducts > 0 ? (currentPage-1)*perPage+1 : 0}-${Math.min(currentPage*perPage, totalProducts)} of ${totalProducts}</span>
                    ${perPageHtml}
                </div>
                <div style="display:flex;gap:4px;align-items:center;">
                    <button onclick="window.posManager.posPage=1;window.posManager.renderProducts();" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-left"></i></button>
                    <button onclick="window.posManager.posPage--;window.posManager.renderProducts();" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-left"></i></button>
                    <span style="padding:6px 12px;background:var(--primary);color:white;border-radius:6px;font-size:0.75rem;font-weight:700;">${currentPage} / ${totalPages}</span>
                    <button onclick="window.posManager.posPage++;window.posManager.renderProducts();" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-right"></i></button>
                    <button onclick="window.posManager.posPage=${totalPages};window.posManager.renderProducts();" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-right"></i></button>
                </div>
            </div>
        `;

        const selectEl = paginationEl.querySelector('#perPageSelect_pos');
        const customInputEl = paginationEl.querySelector('#perPageCustomInput_pos');

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
                        if (window.saveStoredPerPage) window.saveStoredPerPage('pos', num);
                        this.posPage = 1;
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
                    if (window.saveStoredPerPage) window.saveStoredPerPage('pos', num);
                    this.posPage = 1;
                    this.renderProducts();
                }
            };
            customInputEl.addEventListener('change', handleCustom);
            customInputEl.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleCustom(e); });
        }
    }

    showPriceEditor(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        const stock = parseInt(product.stock) || 0;
        if (stock < 1) {
            showNotification('Product out of stock', 'warning');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3><i class="fas fa-tag"></i> Set Selling Price</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Product: <strong>${product.product_name || 'Unnamed Product'}</strong></label>
                    </div>
                    <div class="form-group">
                        <label>Original Price</label>
                        <input type="number" id="originalPrice" class="form-control" 
                               value="${parseFloat(product.selling_price).toFixed(2)}" 
                               readonly>
                    </div>
                    <div class="form-group">
                        <label for="customPrice">Selling Price *</label>
                        <input type="number" id="customPrice" class="form-control" 
                               value="${parseFloat(product.selling_price).toFixed(2)}" 
                               min="0" step="0.01" required>
                        <small class="form-text">Enter negotiated price</small>
                    </div>
                    <div class="form-row" style="margin-top: 15px;">
                        <div class="form-group">
                            <button class="btn btn-secondary btn-block close-price-modal">
                                Cancel
                            </button>
                        </div>
                        <div class="form-group">
                            <button class="btn btn-primary btn-block" id="addWithCustomPrice">
                                <i class="fas fa-cart-plus"></i> Add to Cart
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        setTimeout(() => {
            const customPriceInput = document.getElementById('customPrice');
            if (customPriceInput) {
                customPriceInput.focus();
                customPriceInput.select();
            }
        }, 100);

        modal.querySelector('#addWithCustomPrice').addEventListener('click', () => {
            const customPriceInput = document.getElementById('customPrice');
            const customPrice = parseFloat(customPriceInput.value);

            if (isNaN(customPrice) || customPrice < 0) {
                showNotification('Please enter a valid price', 'error');
                customPriceInput.focus();
                return;
            }

            this.addToCartWithCustomPrice(productId, customPrice);
            modal.remove();
        });

        modal.querySelector('.close-price-modal').addEventListener('click', () => {
            modal.remove();
        });

        modal.querySelector('#customPrice').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#addWithCustomPrice').click();
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    addSizeToCart(product, size, stock, price, variant = null, quantityToAdd = 1) {
        const baseSellingPrice = (variant && variant.price !== undefined && variant.price !== null && variant.price !== '' && !isNaN(parseFloat(variant.price)) && parseFloat(variant.price) > 0)
            ? parseFloat(variant.price)
            : (parseFloat(product.selling_price) || 0);

        const effectivePrice = (price !== undefined && price !== null && price !== '' && !isNaN(parseFloat(price)) && parseFloat(price) > 0)
            ? parseFloat(price)
            : baseSellingPrice;

        const effectiveStock = parseInt(stock) || 0;
        const qtyNum = parseInt(quantityToAdd) || 1;

        const cartId = variant ? `${product.id}_v_${variant.id}_size_${size}_${effectivePrice}` : `${product.id}_size_${size}_${effectivePrice}`;
        const existingItem = this.cart.find(item => item.id === cartId);

        if (existingItem) {
            existingItem.quantity += qtyNum;
        } else {
            const cost = (variant && variant.cost_price !== undefined && variant.cost_price !== null && !isNaN(parseFloat(variant.cost_price)))
                ? parseFloat(variant.cost_price)
                : (parseFloat(product.cost_price) || 0);
            const name = variant ? `${product.product_name} - ${variant.variant_name} (Size ${size})` : `${product.product_name} (Size ${size})`;
            const image = variant?.image_url || product.product_image || null;

            this.cart.push({
                id: cartId,
                name: name,
                sku: (variant && variant.sku) ? variant.sku : product.sku,
                price: effectivePrice,
                original_price: effectivePrice,
                cost_price: cost,
                quantity: qtyNum,
                stock: effectiveStock > 0 ? effectiveStock : 999,
                product_image: image,
                price_changed: false,
                _sizeKey: size,         // track which size was sold
                _productId: product.id, // needed for stock update
                _variantId: variant ? variant.id : null // needed for variant stock update
            });
        }

        this.updateCartDisplay();
        showNotification(`${product.product_name} (Size ${size}) added to cart`, 'success');
        return true;
    }

    addVariantToCart(product, variant, variantPrice = null, quantityToAdd = 1) {
        let vAttrs = variant.attributes;
        if (typeof vAttrs === 'string') { try { vAttrs = JSON.parse(vAttrs); } catch(e) { vAttrs = {}; } }
        vAttrs = vAttrs || {};

        let effectivePrice = variantPrice !== null ? parseFloat(variantPrice) : null;
        if (isNaN(effectivePrice) || effectivePrice === null || effectivePrice <= 0) {
            if (variant.price !== undefined && variant.price !== null && !isNaN(parseFloat(variant.price)) && parseFloat(variant.price) > 0) {
                effectivePrice = parseFloat(variant.price);
            } else if (vAttrs.price !== undefined && !isNaN(parseFloat(vAttrs.price)) && parseFloat(vAttrs.price) > 0) {
                effectivePrice = parseFloat(vAttrs.price);
            } else {
                effectivePrice = parseFloat(product.selling_price) || 0;
            }
        }

        const variantStock = parseInt(variant.stock) || 0;
        const qtyNum = parseInt(quantityToAdd) || 1;

        const cartId = product.id + '_v_' + variant.id;
        const existingItem = this.cart.find(item => item.id === cartId);

        if (existingItem) {
            existingItem.quantity += qtyNum;
        } else {
            const costPrice = (variant.cost_price !== undefined && variant.cost_price !== null && !isNaN(parseFloat(variant.cost_price)))
                ? parseFloat(variant.cost_price)
                : (parseFloat(product.cost_price) || 0);

            this.cart.push({
                id: cartId,
                name: `${product.product_name} (${variant.variant_name})`,
                sku: variant.sku || product.sku,
                price: effectivePrice,
                original_price: effectivePrice,
                cost_price: costPrice,
                quantity: qtyNum,
                stock: variantStock > 0 ? variantStock : 999,
                product_image: variant.image_url || product.product_image || null,
                price_changed: false,
                _productId: product.id,
                _variantId: variant.id
            });
        }

        this.updateCartDisplay();
        showNotification(`${product.product_name} (${variant.variant_name}) added to cart`, 'success');
        return true;
    }

    async showProductDetail(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        // Load database variants if any
        let variants = [];
        try {
            const { data } = await supabaseClient
                .from('product_variants')
                .select('*')
                .eq('product_id', productId)
                .eq('is_active', true);
            if (data) variants = data;
        } catch (e) {}

        // Parse metadata
        let meta = product.metadata;
        if (typeof meta === 'string') {
            try { meta = JSON.parse(meta); } catch(e) { meta = {}; }
        }
        meta = meta || {};
        const attrs = (meta.attributes && typeof meta.attributes === 'object') ? meta.attributes : {};

        // Find size/option stock map
        let sizeStock = meta.size_stock || attrs.size_stock || null;
        if (typeof sizeStock === 'string') { try { sizeStock = JSON.parse(sizeStock); } catch(e) { sizeStock = null; } }

        // Find size/option price map
        let sizePrice = meta.size_price || attrs.size_price || meta.size_prices || attrs.size_prices || null;
        if (typeof sizePrice === 'string') { try { sizePrice = JSON.parse(sizePrice); } catch(e) { sizePrice = null; } }

        // Find sizes list
        let tagType = 'Size';
        const rawSizes = meta.size || attrs.size || meta.available_sizes || attrs.available_sizes || [];
        let sizeList = Array.isArray(rawSizes) ? rawSizes :
                         (typeof rawSizes === 'string' ? rawSizes.split(',').map(s => s.trim()).filter(Boolean) : []);

        // If no sizes found, check other dynamic tag attributes (storage, pack, portion, volume, color, shade, model, edition)
        if (sizeList.length === 0 && !sizeStock) {
            const possibleKeys = ['storage', 'pack', 'portion', 'volume', 'color', 'shade', 'model', 'edition'];
            for (const k of possibleKeys) {
                const rawOpts = meta[k] || attrs[k] || meta[`available_${k}s`] || attrs[`available_${k}s`] || [];
                const list = Array.isArray(rawOpts) ? rawOpts :
                             (typeof rawOpts === 'string' ? rawOpts.split(',').map(s => s.trim()).filter(Boolean) : []);
                const tagStock = meta[`${k}_stock`] || attrs[`${k}_stock`] || null;
                if (list.length > 0 || tagStock) {
                    tagType = k.charAt(0).toUpperCase() + k.slice(1);
                    sizeList = list;
                    sizeStock = tagStock;
                    if (typeof sizeStock === 'string') { try { sizeStock = JSON.parse(sizeStock); } catch(e) { sizeStock = null; } }
                    sizePrice = meta[`${k}_price`] || attrs[`${k}_price`] || meta[`${k}_prices`] || attrs[`${k}_prices`] || null;
                    if (typeof sizePrice === 'string') { try { sizePrice = JSON.parse(sizePrice); } catch(e) { sizePrice = null; } }
                    break;
                }
            }
        }

        // Include any keys from sizeStock or sizePrice that weren't in sizeList
        if (sizeStock && typeof sizeStock === 'object') {
            Object.keys(sizeStock).forEach(k => {
                const trimmed = String(k).trim();
                if (trimmed && !sizeList.some(s => String(s).trim().toLowerCase() === trimmed.toLowerCase())) {
                    sizeList.push(trimmed);
                }
            });
        }
        if (sizePrice && typeof sizePrice === 'object') {
            Object.keys(sizePrice).forEach(k => {
                const trimmed = String(k).trim();
                if (trimmed && !sizeList.some(s => String(s).trim().toLowerCase() === trimmed.toLowerCase())) {
                    sizeList.push(trimmed);
                }
            });
        }

        // Deduplicate sizeList
        sizeList = Array.from(new Set(sizeList.map(s => String(s).trim()).filter(Boolean)));

        const hasExplicitSizeStock = !!(sizeStock && typeof sizeStock === 'object' && Object.keys(sizeStock).length > 0);
        const hasSizes = sizeList.length > 0;

        // Stock helper functions
        const getStockForSize = (s) => {
            if (!hasExplicitSizeStock) return parseInt(product._baseStock || product.stock) || 0;
            if (sizeStock[s] !== undefined && sizeStock[s] !== null) return parseInt(sizeStock[s]) || 0;
            const matchKey = Object.keys(sizeStock).find(k => k.trim().toLowerCase() === s.trim().toLowerCase());
            if (matchKey && sizeStock[matchKey] !== undefined) return parseInt(sizeStock[matchKey]) || 0;
            return 0;
        };

        const getPriceForSize = (s) => {
            if (sizePrice && typeof sizePrice === 'object') {
                if (sizePrice[s] !== undefined && sizePrice[s] !== null && sizePrice[s] !== '') {
                    const sp = parseFloat(sizePrice[s]);
                    if (!isNaN(sp) && sp > 0) return sp;
                }
                const matchKey = Object.keys(sizePrice).find(k => k.trim().toLowerCase() === s.trim().toLowerCase());
                if (matchKey && sizePrice[matchKey] !== undefined && sizePrice[matchKey] !== null && sizePrice[matchKey] !== '') {
                    const sp = parseFloat(sizePrice[matchKey]);
                    if (!isNaN(sp) && sp > 0) return sp;
                }
            }
            return parseFloat(product.selling_price) || 0;
        };

        // Total stock computation
        let totalSizeStock = 0;
        if (hasExplicitSizeStock) {
            sizeList.forEach(s => {
                totalSizeStock += getStockForSize(s);
            });
        }

        const baseSellingPrice = parseFloat(product.selling_price) || 0;
        const costPrice = parseFloat(product.cost_price) || 0;
        const profitMargin = (costPrice > 0 && baseSellingPrice >= costPrice)
            ? Math.round(((baseSellingPrice - costPrice) / costPrice) * 100)
            : null;

        const displayTotalStock = hasExplicitSizeStock ? totalSizeStock : (parseInt(product._baseStock || product.stock) || 0);

        // Build Clean Specifications HTML (exclude internal objects, size_stock, size_price, etc.)
        let specsHtml = '';
        const specsMap = new Map();
        const formatLabel = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        const ignoreKeys = new Set([
            'attributes', 'product_images', 'product_image', 'variant_group', 'variant_size',
            'variant_color', 'variant_label', 'has_variants', 'base_stock', 'stock',
            'cost_price', 'selling_price', 'price', 'description', 'sku', 'name',
            'title', 'id', 'created_at', 'updated_at', 'category', 'type', 'shop_id'
        ]);

        ['size', 'storage', 'pack', 'portion', 'volume', 'color', 'shade', 'model', 'edition'].forEach(tag => {
            ignoreKeys.add(`${tag}_stock`);
            ignoreKeys.add(`${tag}_stocks`);
            ignoreKeys.add(`${tag}_price`);
            ignoreKeys.add(`${tag}_prices`);
            ignoreKeys.add(`${tag}_cost`);
            ignoreKeys.add(`${tag}_costs`);
            ignoreKeys.add(`available_${tag}s`);
            ignoreKeys.add(`available_${tag}`);
        });

        if (hasSizes) {
            ignoreKeys.add('size');
            ignoreKeys.add('available_sizes');
            ignoreKeys.add(tagType.toLowerCase());
            ignoreKeys.add(`available_${tagType.toLowerCase()}s`);
        }

        const extractCleanSpecs = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            for (const [k, v] of Object.entries(obj)) {
                const lower = k.toLowerCase().trim();
                if (ignoreKeys.has(lower)) continue;
                if (lower.endsWith('_stock') || lower.endsWith('_price') || lower.endsWith('_prices') || lower.endsWith('_cost')) continue;
                if (v === null || v === undefined) continue;

                if (typeof v === 'object') {
                    if (Array.isArray(v)) {
                        const validArr = v.filter(item => typeof item !== 'object' && item !== null && String(item).trim());
                        if (validArr.length > 0) {
                            specsMap.set(lower, { label: formatLabel(k), val: validArr.join(', ') });
                        }
                    }
                    continue; // Skip objects to prevent [object Object]
                }

                const str = String(v).trim();
                if (str && str !== '[object Object]') {
                    specsMap.set(lower, { label: formatLabel(k), val: str });
                }
            }
        };

        extractCleanSpecs(attrs);
        extractCleanSpecs(meta);

        if (specsMap.size > 0) {
            specsHtml = `
                <div style="margin-top:16px;padding-top:14px;border-top:1px solid #f1f5f9;">
                    <div style="font-size:0.75rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">
                        Specifications & Details
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;">
                        ${Array.from(specsMap.values()).map(spec => `
                            <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:0.75rem;color:#334155;">
                                <span style="color:#64748b;font-weight:500;">${spec.label}:</span>
                                <strong style="color:#0f172a;">${spec.val}</strong>
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Build Available Sizes & Pricing Table HTML with beautiful alignment
        let sizesTableHtml = '';
        if (hasSizes) {
            sizesTableHtml = `
                <div style="margin-top:16px;padding-top:14px;border-top:1px solid #e2e8f0;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                        <div style="font-size:0.8rem;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.04em;display:flex;align-items:center;gap:6px;">
                            <i class="fas fa-ruler-combined" style="color:var(--primary);"></i> Available ${tagType}s & Pricing
                        </div>
                        ${hasExplicitSizeStock ? `
                            <span style="font-size:0.75rem;font-weight:600;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:12px;">
                                Total: ${totalSizeStock} units
                            </span>
                        ` : ''}
                    </div>

                    <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                        <!-- Table Header -->
                        <div style="display:grid;grid-template-columns: 1fr 100px 110px 80px;background:#f8fafc;padding:8px 14px;border-bottom:1px solid #e2e8f0;font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">
                            <div>${tagType}</div>
                            <div style="text-align:right;">Price</div>
                            <div style="text-align:center;">Stock</div>
                            <div style="text-align:right;">Action</div>
                        </div>

                        <!-- Table Body Rows -->
                        <div style="max-height:220px;overflow-y:auto;">
                            ${sizeList.map((size, idx) => {
                                const stock = getStockForSize(size);
                                const isOOS = stock <= 0;
                                const effPrice = getPriceForSize(size);
                                const isLast = idx === sizeList.length - 1;

                                return `
                                    <div class="pos-detail-row" style="display:grid;grid-template-columns: 1fr 100px 110px 80px;align-items:center;padding:10px 14px;border-bottom:${isLast ? 'none' : '1px solid #f1f5f9'};background:${isOOS ? '#fafafa' : '#ffffff'};transition:background 0.15s ease;">
                                        <!-- Size Label -->
                                        <div>
                                            <span style="display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:26px;padding:0 8px;border-radius:6px;background:${isOOS ? '#f1f5f9' : '#eff6ff'};color:${isOOS ? '#94a3b8' : '#1d4ed8'};font-weight:700;font-size:0.82rem;border:1px solid ${isOOS ? '#e2e8f0' : '#bfdbfe'};">
                                                ${size}
                                            </span>
                                        </div>

                                        <!-- Price -->
                                        <div style="text-align:right;font-weight:700;font-size:0.88rem;color:var(--primary);">
                                            ${formatCurrency(effPrice)}
                                        </div>

                                        <!-- Stock Status Badge -->
                                        <div style="text-align:center;">
                                            ${!isOOS ? `
                                                <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;background:#dcfce7;color:#15803d;font-size:0.72rem;font-weight:600;white-space:nowrap;">
                                                    <i class="fas fa-check-circle" style="font-size:0.65rem;"></i> ${stock} avail.
                                                </span>
                                            ` : `
                                                <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;background:#fee2e2;color:#b91c1c;font-size:0.72rem;font-weight:600;white-space:nowrap;">
                                                    <i class="fas fa-times-circle" style="font-size:0.65rem;"></i> Out of stock
                                                </span>
                                            `}
                                        </div>

                                        <!-- Action Button -->
                                        <div style="text-align:right;">
                                            ${!isOOS ? `
                                                <button class="pos-detail-add-size-btn" data-size="${size}" data-stock="${stock}" data-price="${effPrice}" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--primary);color:white;border:none;border-radius:6px;font-size:0.73rem;font-weight:600;cursor:pointer;transition:transform 0.1s, opacity 0.15s;white-space:nowrap;">
                                                    <i class="fas fa-plus"></i> Add
                                                </button>
                                            ` : `
                                                <button disabled style="display:inline-flex;align-items:center;padding:4px 8px;background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;border-radius:6px;font-size:0.72rem;font-weight:500;cursor:not-allowed;white-space:nowrap;">
                                                    Sold Out
                                                </button>
                                            `}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
        }

        // Build Variants HTML (if any database variants exist)
        let variantsHtml = '';
        if (variants.length > 0) {
            variantsHtml = `
                <div style="margin-top:16px;padding-top:14px;border-top:1px solid #e2e8f0;">
                    <div style="font-size:0.8rem;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
                        <i class="fas fa-layer-group" style="color:var(--primary);"></i> Product Variants (${variants.length})
                    </div>

                    <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                        <!-- Header -->
                        <div style="display:grid;grid-template-columns: 1fr 100px 110px 80px;background:#f8fafc;padding:8px 14px;border-bottom:1px solid #e2e8f0;font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">
                            <div>Variant</div>
                            <div style="text-align:right;">Price</div>
                            <div style="text-align:center;">Stock</div>
                            <div style="text-align:right;">Action</div>
                        </div>

                        <!-- Rows -->
                        <div style="max-height:220px;overflow-y:auto;">
                            ${variants.map((v, idx) => {
                                let vPrice = (v.price !== undefined && v.price !== null && v.price !== '' && !isNaN(parseFloat(v.price)))
                                    ? parseFloat(v.price) : baseSellingPrice;
                                const vStock = parseInt(v.stock) || 0;
                                const isOOS = vStock <= 0;
                                const isLast = idx === variants.length - 1;

                                let vAttrs = v.attributes;
                                if (typeof vAttrs === 'string') { try { vAttrs = JSON.parse(vAttrs); } catch(e) { vAttrs = {}; } }
                                vAttrs = vAttrs || {};
                                const vSubStock = vAttrs.size_stock || vAttrs.storage_stock || null;
                                const hasSubSizes = vSubStock && typeof vSubStock === 'object' && Object.keys(vSubStock).length > 0;

                                return `
                                    <div class="pos-detail-row" style="display:grid;grid-template-columns: 1fr 100px 110px 80px;align-items:center;padding:10px 14px;border-bottom:${isLast ? 'none' : '1px solid #f1f5f9'};background:${isOOS ? '#fafafa' : '#ffffff'};transition:background 0.15s ease;">
                                        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                                            ${v.image_url ? `
                                                <img src="${v.image_url}" style="width:30px;height:30px;border-radius:6px;object-fit:cover;border:1px solid #e2e8f0;cursor:pointer;flex-shrink:0;" onclick="(function(e){var lb=document.createElement('div');lb.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer;';lb.innerHTML='<img src=&quot;'+e.target.src+'&quot; style=&quot;max-width:90%;max-height:90%;object-fit:contain;border-radius:12px;&quot;>';lb.onclick=function(){lb.remove();};document.body.appendChild(lb);})(event)">
                                            ` : ''}
                                            <div style="min-width:0;">
                                                <div style="font-weight:600;font-size:0.82rem;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                                    ${v.variant_name}
                                                </div>
                                                ${v.sku ? `<div style="font-size:0.7rem;color:#94a3b8;">SKU: ${v.sku}</div>` : ''}
                                            </div>
                                        </div>

                                        <div style="text-align:right;font-weight:700;font-size:0.88rem;color:var(--primary);">
                                            ${formatCurrency(vPrice)}
                                        </div>

                                        <div style="text-align:center;">
                                            ${!isOOS ? `
                                                <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;background:#dcfce7;color:#15803d;font-size:0.72rem;font-weight:600;white-space:nowrap;">
                                                    <i class="fas fa-check-circle" style="font-size:0.65rem;"></i> ${vStock} avail.
                                                </span>
                                            ` : `
                                                <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;background:#fee2e2;color:#b91c1c;font-size:0.72rem;font-weight:600;white-space:nowrap;">
                                                    <i class="fas fa-times-circle" style="font-size:0.65rem;"></i> Out of stock
                                                </span>
                                            `}
                                        </div>

                                        <div style="text-align:right;">
                                            ${!isOOS ? (hasSubSizes ? `
                                                <button class="pos-detail-pick-variant-size-btn" data-variant-id="${v.id}" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#3b82f6;color:white;border:none;border-radius:6px;font-size:0.73rem;font-weight:600;cursor:pointer;white-space:nowrap;">
                                                    Sizes <i class="fas fa-chevron-right" style="font-size:0.65rem;"></i>
                                                </button>
                                            ` : `
                                                <button class="pos-detail-add-variant-btn" data-variant-id="${v.id}" data-stock="${vStock}" data-price="${vPrice}" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--primary);color:white;border:none;border-radius:6px;font-size:0.73rem;font-weight:600;cursor:pointer;transition:transform 0.1s, opacity 0.15s;white-space:nowrap;">
                                                    <i class="fas fa-plus"></i> Add
                                                </button>
                                            `) : `
                                                <button disabled style="display:inline-flex;align-items:center;padding:4px 8px;background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;border-radius:6px;font-size:0.72rem;font-weight:500;cursor:not-allowed;white-space:nowrap;">
                                                    Sold Out
                                                </button>
                                            `}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
        }

        // Clean category name
        const categoryName = (typeof product.category === 'object' && product.category !== null)
            ? (product.category.category_name || 'General')
            : (product.category || 'General');

        // Remove existing detail modal if any
        const existing = document.getElementById('posProductDetailModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'posProductDetailModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <style>
                #posProductDetailModal .pos-detail-row:hover {
                    background: #f8fafc !important;
                }
                #posProductDetailModal .pos-detail-add-size-btn:hover,
                #posProductDetailModal .pos-detail-add-variant-btn:hover {
                    filter: brightness(1.08);
                    transform: scale(1.02);
                }
            </style>
            <div class="modal-content" style="max-width:540px;width:95%;border-radius:14px;overflow:hidden;box-shadow:0 20px 30px -10px rgba(0,0,0,0.25);border:1px solid #e2e8f0;padding:0;">
                <div class="modal-header" style="padding:16px 20px;border-bottom:1px solid #e2e8f0;background:#ffffff;display:flex;align-items:center;justify-content:space-between;">
                    <h3 style="margin:0;font-size:1.15rem;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:10px;">
                        <span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:#eff6ff;color:var(--primary);">
                            <i class="fas fa-box-open" style="font-size:0.95rem;"></i>
                        </span>
                        Product Details
                    </h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body" style="padding:20px;max-height:75vh;overflow-y:auto;">
                    <div style="display:flex;gap:16px;align-items:flex-start;">
                        <img src="${product.product_image || this.shopLogo || 'https://via.placeholder.com/100'}" 
                             style="width:96px;height:96px;border-radius:12px;object-fit:cover;border:1px solid #e2e8f0;box-shadow:0 2px 4px rgba(0,0,0,0.04);cursor:pointer;flex-shrink:0;" 
                             onclick="(function(e){var lb=document.createElement('div');lb.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer;';lb.innerHTML='<img src=&quot;'+e.target.src+'&quot; style=&quot;max-width:90%;max-height:90%;object-fit:contain;border-radius:12px;&quot;>';lb.onclick=function(){lb.remove();};document.body.appendChild(lb);})(event)"
                             title="Click to zoom">
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:0.72rem;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:0.04em;">
                                ${categoryName} ${product.type ? '• ' + product.type : ''}
                            </div>
                            <h4 style="margin:3px 0 2px 0;font-size:1.2rem;font-weight:700;color:#0f172a;line-height:1.3;">
                                ${product.product_name}
                            </h4>
                            <div style="font-size:0.78rem;color:#64748b;font-family:monospace;font-weight:600;">
                                SKU: <span style="color:#334155;">${product.sku || 'N/A'}</span>
                            </div>
                            <div style="margin-top:8px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;">
                                <span style="font-size:1.35rem;font-weight:800;color:var(--primary);letter-spacing:-0.02em;">
                                    ${formatCurrency(baseSellingPrice)}
                                </span>
                                ${costPrice > 0 ? `
                                    <span style="font-size:0.8rem;color:#64748b;">Cost: <span class="cost-spoiler" onclick="event.stopPropagation(); this.classList.toggle('revealed');" title="Click to reveal cost price">${formatCurrency(costPrice)}</span></span>
                                ` : ''}
                                ${profitMargin !== null ? `
                                    <span style="font-size:0.72rem;font-weight:700;color:#16a34a;background:#dcfce7;padding:2px 7px;border-radius:6px;">${profitMargin}% Margin</span>
                                ` : ''}
                            </div>
                            <div style="margin-top:6px;font-size:0.78rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                <span style="display:inline-flex;align-items:center;gap:5px;font-weight:600;color:${displayTotalStock > 0 ? '#16a34a' : '#dc2626'};background:${displayTotalStock > 0 ? '#f0fdf4' : '#fef2f2'};border:1px solid ${displayTotalStock > 0 ? '#bbf7d0' : '#fecaca'};padding:2px 8px;border-radius:6px;">
                                    <i class="fas fa-${displayTotalStock > 0 ? 'check-circle' : 'times-circle'}"></i>
                                    ${hasExplicitSizeStock ? `Total Stock: ${displayTotalStock}` : `Stock: ${displayTotalStock}`}
                                </span>
                                ${(hasExplicitSizeStock && product._baseStock && product._baseStock !== displayTotalStock) ? `
                                    <span style="color:#64748b;font-size:0.72rem;">(Base: ${product._baseStock})</span>
                                ` : ''}
                            </div>
                        </div>
                    </div>

                    ${product.description ? `
                        <div style="margin-top:12px;padding:10px 12px;background:#f8fafc;border-radius:8px;font-size:0.82rem;color:#475569;line-height:1.5;border:1px solid #f1f5f9;">
                            ${product.description.split('--SPECIFICATIONS--')[0].split('--VARIANT_DATA--')[0].trim()}
                        </div>
                    ` : ''}

                    ${sizesTableHtml}
                    ${variantsHtml}
                    ${specsHtml}
                </div>
                <div class="modal-footer" style="padding:14px 20px;border-top:1px solid #e2e8f0;background:#f8fafc;display:flex;gap:10px;">
                    <button class="btn btn-secondary btn-action close-modal" style="flex:1;border-radius:8px;font-weight:600;">Close</button>
                    <button class="btn btn-primary btn-action" id="posDetailAddBtn" style="flex:2;border-radius:8px;font-weight:600;">
                        <i class="fas fa-cart-plus"></i> Add to Cart
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close handlers
        modal.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => modal.remove()));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        // Add to cart from bottom footer button
        modal.querySelector('#posDetailAddBtn').addEventListener('click', () => {
            modal.remove();
            this.handleAddToCart(productId);
        });

        // Quick Add for Sizes directly inside details table
        modal.querySelectorAll('.pos-detail-add-size-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const size = btn.dataset.size;
                const stock = parseInt(btn.dataset.stock) || 0;
                const price = parseFloat(btn.dataset.price) || baseSellingPrice;

                const success = this.addSizeToCart(product, size, stock, price);
                if (success) {
                    const origHtml = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check"></i> Added';
                    btn.style.background = '#16a34a';
                    setTimeout(() => {
                        btn.innerHTML = origHtml;
                        btn.style.background = 'var(--primary)';
                    }, 1200);
                }
            });
        });

        // Quick Add for DB Variants directly inside details table
        modal.querySelectorAll('.pos-detail-add-variant-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const variantId = btn.dataset.variantId;
                const vData = variants.find(v => v.id === variantId);
                if (!vData) return;

                const success = this.addVariantToCart(product, vData, parseFloat(btn.dataset.price));
                if (success) {
                    const origHtml = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check"></i> Added';
                    btn.style.background = '#16a34a';
                    setTimeout(() => {
                        btn.innerHTML = origHtml;
                        btn.style.background = 'var(--primary)';
                    }, 1200);
                }
            });
        });

        // Select size for DB variant that has sub-sizes
        modal.querySelectorAll('.pos-detail-pick-variant-size-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const variantId = btn.dataset.variantId;
                const vData = variants.find(v => v.id === variantId);
                if (!vData) return;

                let vAttrs = vData.attributes;
                if (typeof vAttrs === 'string') { try { vAttrs = JSON.parse(vAttrs); } catch(err) { vAttrs = {}; } }
                vAttrs = vAttrs || {};
                const vSizeStock = vAttrs.size_stock || vAttrs.storage_stock || {};
                const sizeList = Object.keys(vSizeStock);
                modal.remove();
                this.showSizePicker(product, sizeList, vSizeStock, vData);
            });
        });
    }

    async handleAddToCart(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        // Check if product has database variants
        try {
            const { data: variants } = await supabaseClient
                .from('product_variants')
                .select('*')
                .eq('product_id', productId)
                .eq('is_active', true);

            if (variants && variants.length > 0) {
                // Show variant selector modal
                this.showVariantSelector(product, variants);
                return;
            }
        } catch (e) { /* fall through */ }

        // Check if product has per-size stock in metadata
        let meta = product.metadata || {};
        if (typeof meta === 'string') {
            try {
                meta = JSON.parse(meta);
            } catch(e) {
                meta = {};
            }
        }
        const attrs = meta.attributes || {};

        // Find size_stock from all possible locations
        let sizeStock = meta.size_stock || attrs.size_stock || null;
        if (typeof sizeStock === 'string') { try { sizeStock = JSON.parse(sizeStock); } catch(e) { sizeStock = null; } }

        // Find sizes list from all possible locations
        const rawSizes = meta.size || attrs.size || meta.available_sizes || attrs.available_sizes || [];
        let sizeList = Array.isArray(rawSizes) ? rawSizes :
                         (typeof rawSizes === 'string' ? rawSizes.split(',').map(s => s.trim()).filter(Boolean) : []);

        let optionPriceMap = meta.size_price || attrs.size_price || meta.size_prices || attrs.size_prices || null;

        // If no sizes found, check other dynamic tag attributes (storage, pack, portion, volume, color, etc.)
        if (sizeList.length === 0) {
            const possibleKeys = ['storage', 'pack', 'portion', 'volume', 'color', 'shade', 'model', 'edition'];
            for (const k of possibleKeys) {
                const rawOpts = meta[k] || attrs[k] || meta[`available_${k}s`] || attrs[`available_${k}s`] || [];
                const list = Array.isArray(rawOpts) ? rawOpts :
                             (typeof rawOpts === 'string' ? rawOpts.split(',').map(s => s.trim()).filter(Boolean) : []);
                if (list.length > 0) {
                    sizeList = list;
                    sizeStock = meta[`${k}_stock`] || attrs[`${k}_stock`] || null;
                    if (typeof sizeStock === 'string') { try { sizeStock = JSON.parse(sizeStock); } catch(e) { sizeStock = null; } }
                    optionPriceMap = meta[`${k}_price`] || attrs[`${k}_price`] || meta[`${k}_prices`] || attrs[`${k}_prices`] || null;
                    break;
                }
            }
        }

        console.log('[POS] sizeStock:', JSON.stringify(sizeStock), '| sizeList:', JSON.stringify(sizeList));

        if (sizeList.length > 0) {
            // Show size picker — even if no size_stock set, picker needed to track which size is sold
            this.showSizePicker(product, sizeList, sizeStock || {}, null, optionPriceMap);
            return;
        }

        // No variants, no sizes — add directly
        this.addToCartWithCustomPrice(productId, null);
    }

    showSizePicker(product, sizeList, sizeStock, variant = null, sizePrice = null) {
        const existing = document.getElementById('sizeSelectorModal');
        if (existing) existing.remove();

        let meta = product.metadata || {};
        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e) { meta = {}; } }
        let resolvedSizePrice = sizePrice;
        if (!resolvedSizePrice) {
            if (variant && variant.attributes) {
                let vAttrs = variant.attributes;
                if (typeof vAttrs === 'string') { try { vAttrs = JSON.parse(vAttrs); } catch(e) { vAttrs = {}; } }
                resolvedSizePrice = vAttrs.size_price || vAttrs.size_prices || {};
            } else {
                let attrs = meta.attributes || {};
                if (typeof attrs === 'string') { try { attrs = JSON.parse(attrs); } catch(e) { attrs = {}; } }
                resolvedSizePrice = meta.size_price || attrs.size_price || meta.size_prices || attrs.size_prices || {};
            }
        }
        if (typeof resolvedSizePrice === 'string') { try { resolvedSizePrice = JSON.parse(resolvedSizePrice); } catch(e) { resolvedSizePrice = {}; } }

        const baseSellingPrice = (variant && variant.price !== undefined && variant.price !== null && variant.price !== '' && !isNaN(parseFloat(variant.price)) && parseFloat(variant.price) > 0)
            ? parseFloat(variant.price)
            : (parseFloat(product.selling_price) || 0);

        const modal = document.createElement('div');
        modal.id = 'sizeSelectorModal';
        modal.className = 'modal active';

        const sizeOptions = sizeList.map(size => {
            const stock = parseInt(sizeStock[size] ?? 999) || 0;
            const isOOS = stock === 0;
            let effectivePrice = baseSellingPrice;
            if (resolvedSizePrice && resolvedSizePrice[size] !== undefined && resolvedSizePrice[size] !== null && resolvedSizePrice[size] !== '') {
                const sp = parseFloat(resolvedSizePrice[size]);
                if (!isNaN(sp) && sp > 0) effectivePrice = sp;
            }
            return `
                <div class="size-option${isOOS ? ' oos' : ''}"
                    data-size="${size}" data-stock="${stock}" data-price="${effectivePrice}"
                    style="display:flex;align-items:center;justify-content:space-between;
                           padding:14px 16px;border:2px solid ${isOOS ? '#fee2e2' : '#e2e8f0'};
                           border-radius:10px;cursor:${isOOS ? 'not-allowed' : 'pointer'};
                           margin-bottom:8px;background:${isOOS ? '#fef2f2' : 'white'};
                           transition:all 0.2s;opacity:${isOOS ? '0.6' : '1'};">
                    <div>
                        <span style="font-weight:700;font-size:1rem;color:${isOOS ? '#dc2626' : '#1e293b'};">Size ${size}</span>
                        ${isOOS ? '<span style="margin-left:8px;font-size:0.75rem;background:#dc2626;color:white;padding:2px 8px;border-radius:20px;font-weight:600;">OUT OF STOCK</span>' : ''}
                        <div style="font-size:0.85rem;font-weight:600;color:var(--primary);margin-top:2px;">₹${effectivePrice}</div>
                    </div>
                    <div style="font-size:0.8rem;color:${isOOS ? '#dc2626' : '#64748b'};">
                        ${isOOS ? 'Unavailable' : stock + ' in stock'}
                    </div>
                </div>
            `;
        }).join('');

        modal.innerHTML = `
            <div class="modal-content" style="max-width:380px;">
                <div class="modal-header">
                    <h3><i class="fas fa-ruler-combined"></i> Select Size</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #f1f5f9;">
                        <img src="${(variant?.image_url) || product.product_image || 'https://via.placeholder.com/50'}" style="width:50px;height:50px;border-radius:8px;object-fit:cover;">
                        <div>
                            <div style="font-weight:700;font-size:0.95rem;">${variant ? `${product.product_name} - ${variant.variant_name}` : product.product_name}</div>
                            <div style="font-size:0.8rem;color:#64748b;">SKU: ${(variant && variant.sku) || product.sku} &bull; ₹${baseSellingPrice}</div>
                        </div>
                    </div>
                    ${sizeOptions}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        modal.querySelectorAll('.size-option:not(.oos)').forEach(opt => {
            opt.addEventListener('mouseenter', () => { opt.style.borderColor = 'var(--primary)'; opt.style.background = '#f0fdf4'; });
            opt.addEventListener('mouseleave', () => { opt.style.borderColor = '#e2e8f0'; opt.style.background = 'white'; });
            opt.addEventListener('click', () => {
                const size = opt.dataset.size;
                const stock = parseInt(opt.dataset.stock) || 0;
                const price = parseFloat(opt.dataset.price) || baseSellingPrice;
                const added = this.addSizeToCart(product, size, stock, price, variant);
                if (added) {
                    modal.remove();
                }
            });
        });
    }

    showVariantSelector(product, variants) {
        const existing = document.getElementById('variantSelectorModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'variantSelectorModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:420px;">
                <div class="modal-header">
                    <h3><i class="fas fa-layer-group"></i> Select Option</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #f1f5f9;">
                        <img src="${product.product_image || 'https://via.placeholder.com/50'}" style="width:50px;height:50px;border-radius:8px;object-fit:cover;">
                        <div>
                            <div style="font-weight:700;font-size:0.95rem;">${product.product_name}</div>
                            <div style="font-size:0.8rem;color:#64748b;">SKU: ${product.sku}</div>
                        </div>
                    </div>

                    <!-- Base product option -->
                    <div class="variant-option" data-type="base" style="display:flex;align-items:center;gap:12px;padding:12px;border:2px solid #e2e8f0;border-radius:10px;cursor:pointer;margin-bottom:8px;transition:all 0.2s;">
                        <div style="flex:1;">
                            <div style="font-weight:600;font-size:0.85rem;">${product.product_name} (Base)</div>
                            <div style="font-size:0.75rem;color:#64748b;">Stock: ${product._baseStock || product.stock}</div>
                        </div>
                        <div style="font-weight:700;color:var(--primary);">${formatCurrency(product.selling_price)}</div>
                    </div>

                    <!-- Variant options -->
                    ${variants.map(v => {
                        let vPrice = (v.price !== undefined && v.price !== null && v.price !== '' && !isNaN(parseFloat(v.price)))
                            ? parseFloat(v.price)
                            : null;
                        if (vPrice === null && v.attributes) {
                            let vAttrs = v.attributes;
                            if (typeof vAttrs === 'string') { try { vAttrs = JSON.parse(vAttrs); } catch(e) { vAttrs = {}; } }
                            if (vAttrs.price !== undefined && vAttrs.price !== null && !isNaN(parseFloat(vAttrs.price))) {
                                vPrice = parseFloat(vAttrs.price);
                            }
                        }
                        const effectivePrice = (vPrice !== null && vPrice > 0) ? vPrice : (parseFloat(product.selling_price) || 0);
                        return `
                        <div class="variant-option" data-type="variant" data-variant-id="${v.id}" data-price="${effectivePrice}" data-name="${v.variant_name}" data-stock="${v.stock}" style="display:flex;align-items:center;gap:12px;padding:12px;border:2px solid #e2e8f0;border-radius:10px;cursor:pointer;margin-bottom:8px;transition:all 0.2s;">
                            ${v.image_url ? `<img src="${v.image_url}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;">` : ''}
                            <div style="flex:1;">
                                <div style="font-weight:600;font-size:0.85rem;">${v.variant_name}</div>
                                <div style="font-size:0.75rem;color:#64748b;">Stock: ${v.stock}</div>
                            </div>
                            <div style="font-weight:700;color:#d97706;">${formatCurrency(effectivePrice)}</div>
                        </div>
                    `;}).join('')}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close handlers
        modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        // Option click handlers
        modal.querySelectorAll('.variant-option').forEach(opt => {
            opt.addEventListener('mouseenter', () => { opt.style.borderColor = 'var(--primary)'; opt.style.background = '#f0fdf4'; });
            opt.addEventListener('mouseleave', () => { opt.style.borderColor = '#e2e8f0'; opt.style.background = 'white'; });
            opt.addEventListener('click', () => {
                if (opt.dataset.type === 'base') {
                    // Check if base product has sizes
                    let meta = product.metadata || {};
                    if (typeof meta === 'string') {
                        try { meta = JSON.parse(meta); } catch(e) { meta = {}; }
                    }
                    const attrs = meta.attributes || {};
                    let sizeStock = meta.size_stock || attrs.size_stock || null;
                    if (typeof sizeStock === 'string') { try { sizeStock = JSON.parse(sizeStock); } catch(e) { sizeStock = null; } }
                    const rawSizes = meta.size || attrs.size || meta.available_sizes || attrs.available_sizes || [];
                    const sizeList = Array.isArray(rawSizes) ? rawSizes :
                                     (typeof rawSizes === 'string' ? rawSizes.split(',').map(s => s.trim()).filter(Boolean) : []);
                    
                    if (sizeList.length > 0) {
                        this.showSizePicker(product, sizeList, sizeStock || {});
                        modal.remove();
                    } else {
                        this.addToCartWithCustomPrice(product.id, null);
                        modal.remove();
                    }
                } else {
                    const variantId = opt.dataset.variantId;
                    const vData = variants.find(v => v.id === variantId);
                    
                    let vAttrs = vData ? vData.attributes : null;
                    if (typeof vAttrs === 'string') {
                        try { vAttrs = JSON.parse(vAttrs); } catch(e) { vAttrs = {}; }
                    }
                    vAttrs = vAttrs || {};

                    const vSizeStock = vAttrs.size_stock || vAttrs.storage_stock || null;
                    if (vSizeStock && typeof vSizeStock === 'object' && Object.keys(vSizeStock).length > 0) {
                        const sizeStock = vSizeStock;
                        const sizeList = Object.keys(sizeStock);
                        this.showSizePicker(product, sizeList, sizeStock, vData);
                        modal.remove();
                        return;
                    }

                    // Add variant to cart
                    const variantName = vData?.variant_name || opt.dataset.name;
                    let variantPrice = parseFloat(opt.dataset.price);
                    if (isNaN(variantPrice) || variantPrice <= 0) {
                        if (vData && vData.price !== undefined && vData.price !== null && !isNaN(parseFloat(vData.price)) && parseFloat(vData.price) > 0) {
                            variantPrice = parseFloat(vData.price);
                        } else if (vAttrs.price !== undefined && !isNaN(parseFloat(vAttrs.price)) && parseFloat(vAttrs.price) > 0) {
                            variantPrice = parseFloat(vAttrs.price);
                        } else {
                            variantPrice = parseFloat(product.selling_price) || 0;
                        }
                    }
                    const variantStock = parseInt(vData?.stock ?? opt.dataset.stock) || 0;

                    if (variantStock < 1) {
                        showNotification('This variant is out of stock', 'warning');
                        return;
                    }

                    const cartId = product.id + '_v_' + (vData ? vData.id : opt.dataset.variantId);
                    const existingItem = this.cart.find(item => item.id === cartId);

                    if (existingItem) {
                        if (existingItem.quantity >= variantStock) {
                            showNotification('Maximum stock reached', 'warning');
                            return;
                        }
                        existingItem.quantity += 1;
                    } else {
                        const costPrice = (vData?.cost_price !== undefined && vData.cost_price !== null && !isNaN(parseFloat(vData.cost_price)))
                            ? parseFloat(vData.cost_price)
                            : (parseFloat(product.cost_price) || 0);

                        this.cart.push({
                            id: cartId,
                            name: product.product_name + ' (' + variantName + ')',
                            sku: vData?.sku || product.sku,
                            price: variantPrice,
                            original_price: variantPrice,
                            cost_price: costPrice,
                            quantity: 1,
                            stock: variantStock,
                            product_image: vData?.image_url || product.product_image || null,
                            price_changed: false,
                            _productId: product.id,
                            _variantId: vData ? vData.id : opt.dataset.variantId
                        });
                    }

                    this.updateCartDisplay();
                    showNotification(`${product.product_name} (${variantName}) added to cart`, 'success');
                }
                modal.remove();
            });
        });
    }

    addToCartWithCustomPrice(productId, customPrice = null) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        const stock = parseInt(product.stock) || 0;
        if (stock < 1) {
            showNotification('Product out of stock', 'warning');
            return;
        }

        const price = customPrice !== null ? parseFloat(customPrice) : parseFloat(product.selling_price) || 0;
        const existingItem = this.cart.find(item => item.id === productId);

        if (existingItem) {
            if (existingItem.quantity >= stock) {
                showNotification(`Only ${stock} units available in stock`, 'warning');
                return;
            }
            existingItem.quantity += 1;
            if (customPrice !== null && existingItem.price !== price) {
                existingItem.price = price;
                existingItem.price_changed = true;
            }
        } else {
            this.cart.push({
                id: product.id,
                name: product.product_name || 'Unnamed Product',
                sku: product.sku || 'N/A',
                price: price,
                original_price: parseFloat(product.selling_price) || 0,
                cost_price: parseFloat(product.cost_price) || 0, // Store cost price
                quantity: 1,
                stock: stock,
                product_image: product.product_image || null,
                price_changed: customPrice !== null
            });
        }

        this.updateCartDisplay();

        const productName = product.product_name || 'Product';
        const message = customPrice !== null && customPrice !== parseFloat(product.selling_price)
            ? `${productName} added at negotiated price ${formatCurrency(price)}`
            : `${productName} added to cart`;
        showNotification(message, 'success');
    }

    editCartItemPrice(productId) {
        const cartItem = this.cart.find(item => item.id === productId);
        if (!cartItem) return;

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3><i class="fas fa-edit"></i> Edit Price</h3>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Product: <strong>${cartItem.name}</strong></label>
                    </div>
                    <div class="form-group">
                        <label>Original Price</label>
                        <input type="number" class="form-control" 
                               value="${cartItem.original_price.toFixed(2)}" readonly>
                    </div>
                    <div class="form-group">
                        <label for="editPrice">Current Price</label>
                        <input type="number" id="editPrice" class="form-control" 
                               value="${cartItem.price.toFixed(2)}" 
                               min="0" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Total for ${cartItem.quantity} units</label>
                        <input type="number" id="editTotal" class="form-control" 
                               value="${(cartItem.price * cartItem.quantity).toFixed(2)}" 
                               readonly>
                    </div>
                    <div class="form-row" style="margin-top: 15px;">
                        <div class="form-group">
                            <button class="btn btn-secondary btn-block close-edit-modal">
                                Cancel
                            </button>
                        </div>
                        <div class="form-group">
                            <button class="btn btn-primary btn-block" id="savePrice">
                                <i class="fas fa-save"></i> Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const editPriceInput = modal.querySelector('#editPrice');
        const editTotalInput = modal.querySelector('#editTotal');

        editPriceInput.addEventListener('input', () => {
            const newPrice = parseFloat(editPriceInput.value) || 0;
            const total = newPrice * cartItem.quantity;
            editTotalInput.value = total.toFixed(2);
        });

        setTimeout(() => {
            editPriceInput.focus();
            editPriceInput.select();
        }, 100);

        modal.querySelector('#savePrice').addEventListener('click', () => {
            const newPrice = parseFloat(editPriceInput.value);

            if (isNaN(newPrice) || newPrice < 0) {
                showNotification('Please enter a valid price', 'error');
                editPriceInput.focus();
                return;
            }

            cartItem.price = newPrice;
            cartItem.price_changed = newPrice !== cartItem.original_price;
            this.updateCartDisplay();
            showNotification('Price updated successfully', 'success');
            modal.remove();
        });

        modal.querySelector('.close-edit-modal').addEventListener('click', () => {
            modal.remove();
        });

        editPriceInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#savePrice').click();
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    removeFromCart(productId) {
        const index = this.cart.findIndex(item => item.id === productId);
        if (index !== -1) {
            const itemName = this.cart[index].name;
            this.cart.splice(index, 1);
            this.updateCartDisplay();
            showNotification(`${itemName} removed from cart`, 'info');
        }
    }

    updateCartQuantity(productId, quantity) {
        const item = this.cart.find(item => item.id === productId);
        if (!item) return;

        if (quantity < 1) {
            this.removeFromCart(productId);
            return;
        }

        if (quantity > item.stock) {
            showNotification(`Only ${item.stock} units available`, 'warning');
            quantity = item.stock;
        }

        item.quantity = quantity;
        this.updateCartDisplay();
    }

    updateCartDisplay() {
        const container = document.getElementById('cartItems');
        if (!container) return;

        if (this.cart.length === 0) {
            container.innerHTML = `
                <div class="empty-cart">
                    <div class="empty-cart-icon">
                        <i class="fas fa-shopping-basket"></i>
                    </div>
                    <h5>Your cart is empty</h5>
                    <p>Select products from the list to start a sale</p>
                </div>
            `;
        } else {
            container.innerHTML = this.cart.map(item => `
                <div class="cart-item">
                    <div class="cart-item-header">
                        <img src="${item.product_image || 'https://via.placeholder.com/150?text=No+Image'}" 
                             class="product-img-cart" 
                             alt="${item.name}">
                        <div class="cart-item-info">
                            <div class="cart-item-name">
                                <strong>${item.name}</strong>
                                <small>SKU: ${item.sku}</small>
                                ${item.price_changed ?
                    `<span class="price-changed-badge">Negotiated</span>` :
                    ''}
                            </div>
                            <div class="cart-item-price">
                                <span class="price-text">${formatCurrency(item.price)} × </span>
                                <input type="number" 
                                       class="cart-quantity" 
                                       data-id="${item.id}"
                                       value="${item.quantity}" 
                                       min="1" 
                                       max="${item.stock}">
                            </div>
                            <div class="cart-item-actions">
                                <button class="btn btn-sm btn-light edit-price-btn" data-id="${item.id}" title="Edit Price">
                                    <i class="fas fa-tag"></i>
                                </button>
                                <button class="btn btn-sm btn-light text-danger remove-from-cart" data-id="${item.id}" title="Remove">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        this.updateCartTotals();
    }

    updateCartTotals() {
        this.cartSubtotal = this.cart.reduce((sum, item) => {
            return sum + (item.price * item.quantity);
        }, 0);

        // Delivery charge is display-only — does NOT affect the sale total
        this.cartTotal = this.cartSubtotal - this.discount;
        if (this.cartTotal < 0) this.cartTotal = 0;

        const subtotalElement = document.getElementById('cartSubtotal');
        const totalElement = document.getElementById('cartTotal');
        const deliveryRow = document.getElementById('deliveryChargeRow');
        const deliveryDisplay = document.getElementById('deliveryChargeDisplay');

        if (subtotalElement) subtotalElement.textContent = formatCurrency(this.cartSubtotal);
        if (totalElement) totalElement.textContent = formatCurrency(this.cartTotal);

        // Show/hide delivery row (info only)
        if (deliveryRow && deliveryDisplay) {
            if (this.deliveryCharge > 0) {
                deliveryRow.style.display = '';
                deliveryDisplay.textContent = '+' + formatCurrency(this.deliveryCharge);
            } else {
                deliveryRow.style.display = 'none';
            }
        }

        const pendingAmount = document.getElementById('pendingAmount');
        const amountPaid = document.getElementById('amountPaid');
        if (pendingAmount && amountPaid) {
            const paid = parseFloat(amountPaid.value) || 0;
            pendingAmount.value = (this.cartTotal - paid).toFixed(2);
        }

        this.updateCartCount();
    }

    updateCartCount() {
        const cartCountBadge = document.getElementById('cartCountBadge');
        if (!cartCountBadge) return;

        const itemCount = this.cart.length;

        if (itemCount > 0) {
            cartCountBadge.textContent = itemCount;
            cartCountBadge.classList.add('active');
        } else {
            cartCountBadge.textContent = '0';
            cartCountBadge.classList.remove('active');
        }
    }

    toggleMobileCart() {
        const cartSection = document.getElementById('cartSection');
        const cartBackdrop = document.getElementById('cartBackdrop');

        if (!cartSection || !cartBackdrop) return;

        const isActive = cartSection.classList.contains('active');

        if (isActive) {
            this.closeMobileCart();
        } else {
            this.openMobileCart();
        }
    }

    openMobileCart() {
        const cartSection = document.getElementById('cartSection');
        const cartBackdrop = document.getElementById('cartBackdrop');

        if (cartSection) {
            cartSection.classList.add('active');
        }

        if (cartBackdrop) {
            cartBackdrop.classList.add('active');
        }

        // Prevent body scroll when cart is open
        document.body.style.overflow = 'hidden';
    }

    closeMobileCart() {
        const cartSection = document.getElementById('cartSection');
        const cartBackdrop = document.getElementById('cartBackdrop');

        if (cartSection) {
            cartSection.classList.remove('active');
        }

        if (cartBackdrop) {
            cartBackdrop.classList.remove('active');
        }

        // Restore body scroll
        document.body.style.overflow = '';
    }

    togglePaymentFields(paymentMethod) {
        const creditInfo = document.getElementById('creditInfo');
        const cashPayment = document.getElementById('cashPayment');

        if (!creditInfo || !cashPayment) return;

        // Update active card class
        document.querySelectorAll('.payment-card').forEach(card => {
            if (card.dataset.method === paymentMethod) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });

        if (paymentMethod === 'credit') {
            creditInfo.style.display = 'block';
            cashPayment.style.display = 'none';
        } else {
            creditInfo.style.display = 'none';
            cashPayment.style.display = 'block';
        }
    }

    async processCheckout() {
        if (this.cart.length === 0) {
            showNotification('Cart is empty', 'warning');
            return;
        }

        const paymentMethodElement = document.querySelector('input[name="paymentMethod"]:checked');
        if (!paymentMethodElement) {
            showNotification('Please select payment method', 'error');
            return;
        }
        const paymentMethod = paymentMethodElement.value;

        if (paymentMethod === 'credit') {
            const buyerName = document.getElementById('buyerName');
            const buyerPhone = document.getElementById('buyerPhone');
            const amountPaid = document.getElementById('amountPaid');

            if (!buyerName || !buyerPhone) {
                showNotification('Please enter buyer information for credit sale', 'error');
                return;
            }

            const name = buyerName.value.trim();
            const phone = buyerPhone.value.trim();
            const paid = parseFloat(amountPaid?.value || 0) || 0;

            if (!name || !phone) {
                showNotification('Buyer name and phone are required for credit sales', 'error');
                return;
            }

            if (paid > this.cartTotal) {
                showNotification('Amount paid cannot exceed total amount', 'error');
                return;
            }
        } else if (paymentMethod === 'cash') {
            // No validation needed — delivery charge is optional, no change field
        }

        showLoading(true);

        try {
            // Validate stock availability BEFORE creating the sale
            for (const item of this.cart) {
                const isVariant = item.id.includes('_v_');
                const isSizeItem = item.id.includes('_size_');

                if (isVariant) {
                    let variantId = item._variantId || item.id.split('_v_')[1];
                    let sizeKey = null;
                    if (isSizeItem) {
                        if (!item._variantId) variantId = variantId.split('_size_')[0];
                        sizeKey = item._sizeKey || (item.id.includes('_size_') ? item.id.split('_size_')[1].split('_')[0] : null);
                    }

                    const { data: variant } = await supabaseClient
                        .from('product_variants')
                        .select('stock, variant_name, attributes')
                        .eq('id', variantId)
                        .single();

                    if (!variant) {
                        throw new Error(`Variant "${item.name}" not found`);
                    }
                    if ((parseInt(variant.stock) || 0) < item.quantity) {
                        throw new Error(`Insufficient stock for "${item.name}". Available: ${variant.stock}, Requested: ${item.quantity}`);
                    }

                    if (isSizeItem && sizeKey) {
                        let attrs = variant.attributes || {};
                        if (typeof attrs === 'string') { try { attrs = JSON.parse(attrs); } catch(e) { attrs = {}; } }
                        const sizeStock = attrs.size_stock || attrs.storage_stock || {};
                        const currentSizeStock = parseInt(sizeStock[sizeKey] ?? variant.stock) || 0;
                        if (currentSizeStock < item.quantity) {
                            throw new Error(`Insufficient stock for "${variant.variant_name} Size ${sizeKey}". Available: ${currentSizeStock}, Requested: ${item.quantity}`);
                        }
                    }
                } else if (isSizeItem) {
                    const productId = item._productId || item.id.split('_size_')[0];
                    const sizeKey = item._sizeKey || (item.id.includes('_size_') ? item.id.split('_size_')[1].split('_')[0] : null);

                    const { data: product, error: fetchError } = await supabaseClient
                        .from('products')
                        .select('stock, metadata, product_name')
                        .eq('id', productId)
                        .eq('shop_id', this.shopId)
                        .single();

                    if (fetchError || !product) {
                        throw new Error(`Product "${item.name}" not found or unavailable`);
                    }

                    let meta = product.metadata || {};
                    if (typeof meta === 'string') {
                        try { meta = JSON.parse(meta); } catch(e) { meta = {}; }
                    }
                    let sizeStock = meta.size_stock || {};
                    if (typeof sizeStock === 'string') { try { sizeStock = JSON.parse(sizeStock); } catch(e) { sizeStock = {}; } }

                    const currentSizeStock = parseInt(sizeStock[sizeKey] ?? product.stock) || 0;
                    if (currentSizeStock < item.quantity) {
                        throw new Error(`Insufficient stock for "${product.product_name} Size ${sizeKey}". Available: ${currentSizeStock}, Requested: ${item.quantity}`);
                    }
                } else {
                    const { data: product, error: fetchError } = await supabaseClient
                        .from('products')
                        .select('stock, product_name')
                        .eq('id', item.id)
                        .eq('shop_id', this.shopId)
                        .single();

                    if (fetchError || !product) {
                        throw new Error(`Product "${item.name}" not found or unavailable`);
                    }
                    if ((parseInt(product.stock) || 0) < item.quantity) {
                        throw new Error(`Insufficient stock for "${product.product_name}". Available: ${product.stock}, Requested: ${item.quantity}`);
                    }
                }
            }

            const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const total = this.cartTotal;

            const currentUser = authManager.getCurrentUser();
            if (!currentUser) {
                throw new Error('User not authenticated');
            }

            // Get user identifier - FIXED: Use username/email instead of UUID
            let soldByValue = currentUser.username || currentUser.email || 'pos_user';

            const saleData = {
                shop_id: this.shopId,
                invoice_number: invoiceNumber,
                total_amount: total,
                discount_amount: this.discount,
                payment_method: paymentMethod,
                sold_by: soldByValue,
                amount_paid: total,
                pending_amount: 0,
                sale_status: 'completed'
            };

            // Add optional customer details (available for all payment types)
            const customerName = document.getElementById('customerName')?.value.trim() || '';
            const customerPhone = document.getElementById('customerPhone')?.value.trim() || '';
            const saleRemark = document.getElementById('saleRemark')?.value.trim() || '';

            if (customerName) saleData.buyer_name = customerName;
            if (customerPhone) saleData.buyer_phone = customerPhone;
            if (saleRemark) saleData.buyer_address = saleRemark; // Store remark in buyer_address field

            if (paymentMethod === 'credit') {
                const buyerName = document.getElementById('buyerName');
                const buyerPhone = document.getElementById('buyerPhone');
                const buyerAddress = document.getElementById('buyerAddress');
                const amountPaid = document.getElementById('amountPaid');

                saleData.buyer_name = buyerName ? buyerName.value.trim() : '';
                saleData.buyer_phone = buyerPhone ? buyerPhone.value.trim() : '';
                saleData.buyer_address = buyerAddress ? buyerAddress.value.trim() : '';

                const paid = parseFloat(amountPaid?.value || 0) || 0;
                saleData.amount_paid = paid;
                saleData.pending_amount = total - paid;
                saleData.sale_status = 'credit';

                if (!saleData.buyer_name || !saleData.buyer_phone) {
                    throw new Error('Buyer name and phone are required for credit sales');
                }
            }



            // Create sale record
            const { data: sale, error: saleError } = await supabaseClient
                .from('sales')
                .insert([saleData])
                .select()
                .single();

            if (saleError) {


                // If error is about sold_by, try alternative approach
                if (saleError.message.includes('sold_by')) {
                    // Try with a simpler sold_by value
                    saleData.sold_by = 'system';

                    const { data: sale2, error: saleError2 } = await supabaseClient
                        .from('sales')
                        .insert([saleData])
                        .select()
                        .single();

                    if (saleError2) throw saleError2;
                    return await this.completeSaleProcess(sale2.id, paymentMethod, total, saleData);
                }

                throw saleError;
            }

            await this.completeSaleProcess(sale.id, paymentMethod, total, saleData);

        } catch (error) {


            let errorMessage = 'Failed to process sale';
            if (error.message) {
                errorMessage += ': ' + error.message;
            }

            showNotification(errorMessage, 'error');
        } finally {
            showLoading(false);
        }
    }

    async completeSaleProcess(saleId, paymentMethod, total, saleData) {
        try {
            // Insert sale items
            const saleItems = this.cart.map(item => {
                // For variants/sizes, extract the real product_id
                const productId = item._productId || item.id.split('_v_')[0].split('_size_')[0];

                return {
                    sale_id: saleId,
                    product_id: productId,
                    product_name: item.name,
                    sku: item.sku,
                    product_image: item.product_image,
                    quantity: item.quantity,
                    unit_price: item.price,
                    original_price: item.original_price,
                    cost_price: item.cost_price,
                    total_price: item.price * item.quantity,
                    price_changed: item.price_changed || false
                };
            });



            const { error: itemsError } = await supabaseClient
                .from('sale_items')
                .insert(saleItems);

            if (itemsError) throw itemsError;



            // Update product stock
            await this.updateProductStocks();

            // Create credit record if needed
            if (paymentMethod === 'credit' && saleData.pending_amount > 0) {
                const creditData = {
                    shop_id: this.shopId,
                    buyer_name: saleData.buyer_name,
                    buyer_phone: saleData.buyer_phone,
                    buyer_address: saleData.buyer_address || '',
                    total_amount: total,
                    amount_paid: saleData.amount_paid,
                    pending_amount: saleData.pending_amount,
                    credit_date: new Date().toISOString().split('T')[0],
                    status: 'pending',
                    sale_id: saleId
                };



                const { error: creditError } = await supabaseClient
                    .from('credits')
                    .insert([creditData]);

                if (creditError) {

                }
            }

            showNotification('Sale completed successfully!', 'success');
            // Signal dashboard and other open pages that data changed
            localStorage.setItem('shopDataChanged', Date.now().toString());

            // Save cart items, customer details and delivery charge for invoice BEFORE clearing
            const invoiceItems = [...this.cart];
            const invoiceDeliveryCharge = this.deliveryCharge || 0;
            const invoiceBuyerName = saleData.buyer_name || document.getElementById('customerName')?.value.trim() || document.getElementById('buyerName')?.value.trim() || '';
            const invoiceBuyerPhone = saleData.buyer_phone || document.getElementById('customerPhone')?.value.trim() || document.getElementById('buyerPhone')?.value.trim() || '';

            // Clear cart
            this.clearCart();

            // Reset form
            this.resetPaymentForm();

            // Build invoice from local data immediately (no await)
            const finalSale = {
                id: saleId,
                invoice_number: saleData.invoice_number || `INV-${Date.now()}`,
                total_amount: total,
                discount_amount: saleData.discount_amount || 0,
                amount_paid: saleData.amount_paid || total,
                pending_amount: saleData.pending_amount || 0,
                payment_method: paymentMethod,
                buyer_name: invoiceBuyerName,
                customer_name: invoiceBuyerName,
                buyer_phone: invoiceBuyerPhone,
                customer_phone: invoiceBuyerPhone,
                buyer_address: saleData.buyer_address || '',
                created_at: new Date().toISOString()
            };

            // Show invoice modal INSTANTLY using local data
            try {
                this.showInvoice(finalSale, invoiceItems, invoiceDeliveryCharge);
            } catch (invErr) {
                console.warn('Failed to display invoice:', invErr);
            }

            // Background refresh — do NOT block invoice display
            Promise.allSettled([
                this.loadRecentTransactions(),
                this.loadProducts(),
                window.authManager ? window.authManager.createAuditLog('sell', 'sales', saleId, null, {
                    invoice_number: finalSale.invoice_number,
                    total_amount: total,
                    payment_method: paymentMethod,
                    items_count: saleItems.length
                }).catch(e => console.warn('Audit log failed:', e)) : Promise.resolve()
            ]).catch(e => console.warn('Background refresh error:', e));

        } catch (error) {

            throw error;
        }
    }

    async updateProductStocks() {

        for (const item of this.cart) {
            try {
                // Check if this is a variant item (id contains '_v_')
                const isVariant = item.id.includes('_v_');
                const isSizeItem = item.id.includes('_size_');

                if (isVariant) {
                    // Extract variant ID and update variant stock
                    let variantId = item._variantId || item.id.split('_v_')[1];
                    let sizeKey = null;
                    if (isSizeItem) {
                        if (!item._variantId) variantId = variantId.split('_size_')[0];
                        sizeKey = item._sizeKey || (item.id.includes('_size_') ? item.id.split('_size_')[1].split('_')[0] : null);
                    }

                    const { data: variant, error: fetchError } = await supabaseClient
                        .from('product_variants')
                        .select('stock, variant_name, attributes')
                        .eq('id', variantId)
                        .single();

                    if (fetchError || !variant) {
                        throw new Error(`Variant "${item.name}" not found`);
                    }

                    const currentStock = parseInt(variant.stock) || 0;
                    if (currentStock < item.quantity) {
                        throw new Error(`Insufficient stock for ${variant.variant_name}. Available: ${currentStock}, Requested: ${item.quantity}`);
                    }

                    let updatedAttrs = variant.attributes || {};
                    if (typeof updatedAttrs === 'string') { try { updatedAttrs = JSON.parse(updatedAttrs); } catch(e) { updatedAttrs = {}; } }
                    if (isSizeItem && sizeKey) {
                        let sizeStock = updatedAttrs.size_stock || updatedAttrs.storage_stock || {};
                        const currentSizeStock = parseInt(sizeStock[sizeKey] ?? variant.stock) || 0;
                        sizeStock[sizeKey] = Math.max(0, currentSizeStock - item.quantity);
                        if (updatedAttrs.size_stock) updatedAttrs.size_stock = sizeStock;
                        else updatedAttrs.storage_stock = sizeStock;
                    }

                    // Update variant stock and attributes
                    await supabaseClient
                        .from('product_variants')
                        .update({ 
                            stock: Math.max(0, currentStock - item.quantity),
                            attributes: updatedAttrs 
                        })
                        .eq('id', variantId);

                } else if (isSizeItem) {
                    // Size-based product — update size_stock in metadata + overall product stock
                    const productId = item._productId || item.id.split('_size_')[0];
                    const sizeKey = item._sizeKey || (item.id.includes('_size_') ? item.id.split('_size_')[1].split('_')[0] : null);

                    const { data: product, error: fetchError } = await supabaseClient
                        .from('products')
                        .select('stock, metadata, product_name')
                        .eq('id', productId)
                        .eq('shop_id', this.shopId)
                        .single();

                    if (fetchError || !product) {
                        throw new Error(`Product "${item.name}" not found`);
                    }

                    let meta = product.metadata || {};
                    if (typeof meta === 'string') {
                        try { meta = JSON.parse(meta); } catch(e) { meta = {}; }
                    }
                    let sizeStock = meta.size_stock || {};
                    if (typeof sizeStock === 'string') { try { sizeStock = JSON.parse(sizeStock); } catch(e) { sizeStock = {}; } }

                    const currentSizeStock = parseInt(sizeStock[sizeKey] ?? product.stock) || 0;
                    if (currentSizeStock < item.quantity) {
                        throw new Error(`Insufficient stock for ${product.product_name} Size ${sizeKey}. Available: ${currentSizeStock}, Requested: ${item.quantity}`);
                    }

                    // Deduct from size stock
                    sizeStock[sizeKey] = currentSizeStock - item.quantity;

                    // Also deduct from total product stock
                    const newTotalStock = Math.max(0, (parseInt(product.stock) || 0) - item.quantity);

                    const updatedMeta = { ...meta, size_stock: sizeStock };
                    if (updatedMeta.attributes) updatedMeta.attributes = { ...updatedMeta.attributes, size_stock: sizeStock };

                    const { error: updateError } = await supabaseClient
                        .from('products')
                        .update({
                            stock: newTotalStock,
                            metadata: updatedMeta,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', productId)
                        .eq('shop_id', this.shopId);

                    if (updateError) throw updateError;

                    // Update local product cache
                    const localProduct = this.products.find(p => p.id === productId);
                    if (localProduct) {
                        localProduct.stock = newTotalStock;
                        if (typeof localProduct.metadata === 'string') {
                            try { localProduct.metadata = JSON.parse(localProduct.metadata); } catch(e) { localProduct.metadata = {}; }
                        }
                        if (!localProduct.metadata) localProduct.metadata = {};
                        localProduct.metadata.size_stock = sizeStock;
                    }

                } else {
                    // Regular product — original logic
                    const { data: product, error: fetchError } = await supabaseClient
                        .from('products')
                        .select('stock, product_name')
                        .eq('id', item.id)
                        .eq('shop_id', this.shopId)
                        .single();

                    if (fetchError || !product) {
                        throw new Error(`Product "${item.name}" not found or unavailable`);
                    }

                    const currentStock = parseInt(product.stock) || 0;
                    if (currentStock < item.quantity) {
                        throw new Error(`Insufficient stock for ${product.product_name}. Available: ${currentStock}, Requested: ${item.quantity}`);
                    }

                    const newStock = currentStock - item.quantity;
                    const { error: updateError } = await supabaseClient
                        .from('products')
                        .update({ stock: newStock, updated_at: new Date().toISOString() })
                        .eq('id', item.id)
                        .eq('shop_id', this.shopId);

                    if (updateError) throw updateError;

                    const localProduct = this.products.find(p => p.id === item.id);
                    if (localProduct) localProduct.stock = newStock;
                }

            } catch (error) {
                throw error;
            }
        }
    }

    clearCart() {
        this.cart = [];
        this.discount = 0;
        this.deliveryCharge = 0;
        this.updateCartDisplay();

        const discountInput = document.getElementById('discountAmount');
        if (discountInput) discountInput.value = '';

        const deliveryInput = document.getElementById('deliveryCharge');
        if (deliveryInput) deliveryInput.value = '';

        const deliveryRow = document.getElementById('deliveryChargeRow');
        if (deliveryRow) deliveryRow.style.display = 'none';

        showNotification('Cart cleared', 'info');
    }

    holdSale() {
        if (this.cart.length === 0) {
            showNotification('Cart is empty', 'warning');
            return;
        }

        const holdData = {
            cart: this.cart,
            discount: this.discount,
            timestamp: new Date().toISOString()
        };

        localStorage.setItem(`hold_sale_${this.shopId}`, JSON.stringify(holdData));

        showNotification('Sale held successfully', 'success');
    }

    loadHeldSale() {
        const heldData = localStorage.getItem(`hold_sale_${this.shopId}`);
        if (!heldData) {
            showNotification('No held sale found', 'warning');
            return;
        }

        try {
            const holdData = JSON.parse(heldData);
            this.cart = holdData.cart || [];
            this.discount = holdData.discount || 0;
            this.updateCartDisplay();

            const discountInput = document.getElementById('discountAmount');
            if (discountInput) {
                discountInput.value = this.discount;
            }

            showNotification('Held sale loaded successfully', 'success');
        } catch (error) {

            showNotification('Failed to load held sale', 'error');
        }
    }

    resetPaymentForm() {
        const buyerName = document.getElementById('buyerName');
        const buyerPhone = document.getElementById('buyerPhone');
        const buyerAddress = document.getElementById('buyerAddress');
        const amountPaid = document.getElementById('amountPaid');
        const pendingAmount = document.getElementById('pendingAmount');

        if (buyerName) buyerName.value = '';
        if (buyerPhone) buyerPhone.value = '';
        if (buyerAddress) buyerAddress.value = '';
        if (amountPaid) amountPaid.value = '';
        if (pendingAmount) pendingAmount.value = '';

        const amountReceived = document.getElementById('amountReceived');
        const changeAmount = document.getElementById('changeAmount');

        if (amountReceived) amountReceived.value = '';
        if (changeAmount) changeAmount.value = '';

        const cashRadio = document.querySelector('input[value="cash"]');
        if (cashRadio) {
            cashRadio.checked = true;
            this.togglePaymentFields('cash');
        }
    }

    async loadRecentTransactions() {
        try {
            const { data: transactions, error } = await supabaseClient
                .from('sales')
                .select(`
                    id,
                    invoice_number,
                    total_amount,
                    payment_method,
                    sale_status,
                    created_at,
                    buyer_name,
                    buyer_phone,
                    sold_by
                `)
                .eq('shop_id', this.shopId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Product lookup map — lets search match product name / SKU
            this.txProductMap = {};
            (this.products || []).forEach(p => {
                this.txProductMap[p.id] = {
                    name: (p.product_name || '').toLowerCase(),
                    sku: (p.sku || '').toLowerCase()
                };
            });

            const saleIds = (transactions || []).map(t => t.id);
            let itemsBySale = {};
            if (saleIds.length > 0) {
                const { data: items, error: itemsError } = await supabaseClient
                    .from('sale_items')
                    .select('sale_id, product_id, quantity, product_name')
                    .in('sale_id', saleIds);
                if (!itemsError && items) {
                    items.forEach(i => {
                        if (!itemsBySale[i.sale_id]) itemsBySale[i.sale_id] = [];
                        itemsBySale[i.sale_id].push(i);
                        // Fallback so items still match search even if the product isn't in this.products yet
                        if (!this.txProductMap[i.product_id]) {
                            this.txProductMap[i.product_id] = {
                                name: (i.product_name || '').toLowerCase(),
                                sku: ''
                            };
                        }
                    });
                }
            }

            this.transactions = (transactions || []).map(t => ({
                ...t,
                items: itemsBySale[t.id] || []
            }));

            this.txApplyFilters();

        } catch (error) {
            // silently ignore — panel will just show whatever it had
        }
    }

    txApplyFilters() {
        const term = (this.txSearchTerm || '').toLowerCase().trim();
        const from = this.txDateFrom ? new Date(this.txDateFrom + 'T00:00:00').getTime() : null;
        const to = this.txDateTo ? new Date(this.txDateTo + 'T23:59:59.999').getTime() : null;

        this.filteredTransactions = (this.transactions || []).filter(t => {
            const created = new Date(t.created_at).getTime();
            if (from && !isNaN(created) && created < from) return false;
            if (to && !isNaN(created) && created > to) return false;

            if (term) {
                const invoice = (t.invoice_number || '').toLowerCase();
                const buyer = (t.buyer_name || '').toLowerCase();
                const phone = (t.buyer_phone || '');
                const staff = (t.sold_by || '').toLowerCase();

                let itemHit = false;
                if (t.items && t.items.length > 0) {
                    itemHit = t.items.some(i => {
                        const prod = this.txProductMap[i.product_id] || {};
                        const pname = (i.product_name || '').toLowerCase();
                        return (prod.name && prod.name.includes(term)) ||
                            (prod.sku && prod.sku.includes(term)) ||
                            pname.includes(term);
                    });
                }

                if (!invoice.includes(term) && !buyer.includes(term) &&
                    !phone.includes(term) && !staff.includes(term) && !itemHit) {
                    return false;
                }
            }

            return true;
        });

        const totalPages = Math.ceil(this.filteredTransactions.length / (this.txPerPage || 50)) || 1;
        if (this.txPage > totalPages) this.txPage = totalPages;
        if (this.txPage < 1) this.txPage = 1;

        this.renderRecentTransactions();
        this.renderTxPagination();
    }

    timeAgo(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
        if (isNaN(diffSec) || diffSec < 0) return formatDate(dateStr);
        if (diffSec < 60) return 'just now';
        const min = Math.floor(diffSec / 60);
        if (min < 60) return min + ' min ago';
        const hrs = Math.floor(min / 60);
        if (hrs < 24) return hrs + ' hr ago';
        const days = Math.floor(hrs / 24);
        if (days < 7) return days + ' day' + (days > 1 ? 's' : '') + ' ago';
        return formatDate(dateStr);
    }

    renderRecentTransactions() {
        const container = document.getElementById('transactionsList');
        if (!container) return;

        const perPage = this.txPerPage || 50;
        const start = (this.txPage - 1) * perPage;
        const pageTransactions = this.filteredTransactions.slice(start, start + perPage);

        if (pageTransactions.length === 0) {
            const hasFilters = (this.txSearchTerm && this.txSearchTerm.trim()) || this.txDateFrom || this.txDateTo;
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-receipt fa-2x"></i>
                    <p>${hasFilters ? 'No transactions match your filters' : 'No recent transactions'}</p>
                    ${hasFilters ? '<button class="btn btn-sm" id="txEmptyReset" data-tip="Reset filters"><i class="fas fa-rotate-left"></i> Reset</button>' : ''}
                </div>
            `;
            const resetBtn = container.querySelector('#txEmptyReset');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    const txSearchInput = document.getElementById('txSearch');
                    const txDateFrom = document.getElementById('txDateFrom');
                    const txDateTo = document.getElementById('txDateTo');
                    if (txSearchInput) txSearchInput.value = '';
                    if (txDateFrom) txDateFrom.value = '';
                    if (txDateTo) txDateTo.value = '';
                    this.txSearchTerm = '';
                    this.txDateFrom = '';
                    this.txDateTo = '';
                    this.txPage = 1;
                    this.txApplyFilters();
                });
            }
            return;
        }

        container.innerHTML = `
            <div class="pos-tx-list">
                ${pageTransactions.map(transaction => {
                    const method = (transaction.payment_method || 'unknown').toLowerCase();
                    const normalized = ['cash', 'credit', 'card', 'digital'].includes(method) ? method : 'unknown';
                    const isRefunded = transaction.sale_status === 'refunded';
                    const isPartial = transaction.sale_status === 'partially_refunded';
                    const statusText = isRefunded ? 'Restocked'
                        : isPartial ? 'Partial'
                        : transaction.sale_status === 'completed' ? 'Paid'
                        : transaction.sale_status;
                    const statusClass = isRefunded ? 'refunded' : isPartial ? 'partial' : 'completed';
                    const icon = normalized === 'cash' ? 'fa-coins'
                        : normalized === 'credit' ? 'fa-hand-holding-usd'
                        : normalized === 'card' ? 'fa-credit-card'
                        : normalized === 'digital' ? 'fa-mobile-alt'
                        : 'fa-receipt';
                    const count = (transaction.items && transaction.items.length) || 0;
                    return `
                        <div class="pos-tx-item ${isRefunded ? 'refunded' : ''}" data-sale-id="${transaction.id}">
                            <div class="pos-tx-icon ${normalized}">
                                <i class="fas ${icon}"></i>
                            </div>
                            <div class="pos-tx-main">
                                <div class="pos-tx-row">
                                    <span class="pos-tx-invoice">${transaction.invoice_number || 'N/A'}</span>
                                    <span class="pos-tx-amount">${formatCurrency(transaction.total_amount)}</span>
                                </div>
                                <div class="pos-tx-sub">
                                    ${(transaction.buyer_name || transaction.buyer_phone) ? `<span class="pos-tx-buyer"><i class="fas fa-user"></i> ${transaction.buyer_name || ''}${transaction.buyer_name && transaction.buyer_phone ? ' · ' : ''}${transaction.buyer_phone || ''}</span>` : ''}
                                    <span class="pos-tx-method ${normalized}">${(transaction.payment_method || 'unknown').toUpperCase()}</span>
                                    <span class="pos-tx-time"><i class="far fa-clock"></i> ${this.timeAgo(transaction.created_at)}</span>
                                    ${count > 0 ? `<span class="pos-tx-items-count"><i class="fas fa-box-open"></i> ${count} item${count > 1 ? 's' : ''}</span>` : ''}
                                </div>
                            </div>
                            <div class="pos-tx-actions">
                                <span class="pos-tx-status ${statusClass}">${statusText}</span>
                                <button class="pos-tx-restock" data-sale-id="${transaction.id}" ${isRefunded ? 'disabled' : ''}
                                    data-tip="${isRefunded ? 'Already restocked' : isPartial ? 'Restock more items' : 'Restock / refund items'}">
                                    <i class="fas fa-undo-alt"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        container.querySelectorAll('.pos-tx-restock').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openRestockModal(btn.getAttribute('data-sale-id'));
            });
        });
    }

    renderTxPagination() {
        const paginationEl = document.getElementById('posTxPagination');
        if (!paginationEl) return;

        const perPage = this.txPerPage || 50;
        const total = this.filteredTransactions.length;
        const totalPages = Math.ceil(total / perPage) || 1;
        const currentPage = this.txPage || 1;
        const perPageHtml = window.renderPerPageControlHTML ? window.renderPerPageControlHTML('pos_transactions', perPage) : '';

        paginationEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:white;border:1px solid #e2e8f0;border-radius:10px;margin-top:12px;flex-wrap:wrap;gap:10px;">
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                    <span style="font-size:0.8rem;color:#64748b;">Showing ${total > 0 ? (currentPage-1)*perPage+1 : 0}-${Math.min(currentPage*perPage, total)} of ${total}</span>
                    ${perPageHtml}
                </div>
                <div style="display:flex;gap:4px;align-items:center;">
                    <button onclick="window.posManager.txPage=1;window.posManager.renderRecentTransactions();window.posManager.renderTxPagination();" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-left"></i></button>
                    <button onclick="window.posManager.txPage--;window.posManager.renderRecentTransactions();window.posManager.renderTxPagination();" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-left"></i></button>
                    <span style="padding:6px 12px;background:var(--primary);color:white;border-radius:6px;font-size:0.75rem;font-weight:700;">${currentPage} / ${totalPages}</span>
                    <button onclick="window.posManager.txPage++;window.posManager.renderRecentTransactions();window.posManager.renderTxPagination();" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-right"></i></button>
                    <button onclick="window.posManager.txPage=${totalPages};window.posManager.renderRecentTransactions();window.posManager.renderTxPagination();" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-right"></i></button>
                </div>
            </div>
        `;

        const selectEl = paginationEl.querySelector('#perPageSelect_pos_transactions');
        const customInputEl = paginationEl.querySelector('#perPageCustomInput_pos_transactions');

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
                        this.txPerPage = num;
                        if (window.saveStoredPerPage) window.saveStoredPerPage('pos_transactions', num);
                        this.txPage = 1;
                        this.renderRecentTransactions();
                        this.renderTxPagination();
                    }
                }
            });
        }

        if (customInputEl) {
            const handleCustom = (e) => {
                const num = parseInt(e.target.value);
                if (!isNaN(num) && num > 0) {
                    this.txPerPage = num;
                    if (window.saveStoredPerPage) window.saveStoredPerPage('pos_transactions', num);
                    this.txPage = 1;
                    this.renderRecentTransactions();
                    this.renderTxPagination();
                }
            };
            customInputEl.addEventListener('change', handleCustom);
            customInputEl.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleCustom(e); });
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

    async openRestockModal(saleId) {
        if (!saleId) return;

        const [saleRes, itemsRes] = await Promise.all([
            supabaseClient.from('sales')
                .select('id, invoice_number, total_amount, payment_method, buyer_name, sale_status')
                .eq('id', saleId)
                .maybeSingle(),
            supabaseClient.from('sale_items')
                .select('id, product_id, product_name, sku, quantity, unit_price, total_price')
                .eq('sale_id', saleId)
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
        this.currentRestockSale = sale;
        this.currentRestockItems = items.map(item => ({
            ...item,
            done: restockMap[item.id] || 0
        }));

        const modal = document.getElementById('restockModal');
        if (!modal) return;

        document.getElementById('restockInvoice').textContent = sale.invoice_number || 'N/A';
        const customerEl = document.getElementById('restockCustomer');
        customerEl.textContent = sale.buyer_name ? `Customer: ${sale.buyer_name}` : (sale.total_amount ? `Total: ${formatCurrency(sale.total_amount)}` : '');
        this.renderRestockItems();
        this.updateRestockTotal();

        modal.classList.add('active');
    }

    renderRestockItems() {
        const container = document.getElementById('restockItems');
        if (!container) return;

        container.innerHTML = this.currentRestockItems.map(item => {
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

        const selectAll = document.getElementById('restockSelectAll');
        if (selectAll) {
            const checkboxes = [...container.querySelectorAll('.restock-check:not(:disabled)')];
            selectAll.checked = checkboxes.length > 0 && checkboxes.every(cb => cb.checked);
            selectAll.onchange = () => {
                checkboxes.forEach(cb => cb.checked = selectAll.checked);
                this.updateRestockTotal();
            };
        }

        container.querySelectorAll('.restock-check').forEach(cb => {
            cb.addEventListener('change', () => {
                if (!cb.checked) {
                    const qty = container.querySelector(`.restock-qty[data-item-id="${cb.getAttribute('data-item-id')}"]`);
                    if (qty) qty.disabled = true;
                } else {
                    const qty = container.querySelector(`.restock-qty[data-item-id="${cb.getAttribute('data-item-id')}"]`);
                    if (qty) { qty.disabled = false; }
                }
                this.updateRestockTotal();
            });
        });

        container.querySelectorAll('.restock-qty').forEach(input => {
            input.addEventListener('input', () => {
                this.updateRestockTotal();
            });
        });

        this.updateRestockTotal();
    }

    updateRestockTotal() {
        const container = document.getElementById('restockItems');
        if (!container) return;

        let total = 0;
        this.currentRestockItems.forEach(item => {
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

        const totalEl = document.getElementById('restockTotal');
        if (totalEl) totalEl.textContent = formatCurrency(total);
    }

    async confirmRestock() {
        const sale = this.currentRestockSale;
        if (!sale) return;

        const container = document.getElementById('restockItems');
        if (!container) return;

        const selections = [];
        this.currentRestockItems.forEach(item => {
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
            let restockedTotal = 0;
            for (const sel of selections) {
                const ok = await this.applyRestockToItem(sel.item, sel.qty);
                if (ok) {
                    const map = this.getRestockMap(sale.id);
                    map[sel.item.id] = (map[sel.item.id] || 0) + sel.qty;
                    this.saveRestockMap(sale.id, map);
                    restockedTotal += sel.qty * sel.item.unit_price;
                }
            }

            if (restockedTotal <= 0) {
                showNotification('Could not restock the selected items', 'error');
                return;
            }

            // Determine if ALL items are now fully restocked
            const map = this.getRestockMap(sale.id);
            let allDone = true;
            this.currentRestockItems.forEach(item => {
                if ((item.quantity - (map[item.id] || 0)) > 0) allDone = false;
            });
            const newStatus = allDone ? 'refunded' : 'partially_refunded';

            await supabaseClient.from('sales')
                .update({ sale_status: newStatus })
                .eq('id', sale.id);

            // Credit sale — reduce outstanding debt by the refunded amount
            if (sale.payment_method === 'credit') {
                const { data: linkedCredit } = await supabaseClient
                    .from('credits')
                    .select('id, pending_amount')
                    .eq('sale_id', sale.id)
                    .eq('shop_id', this.shopId)
                    .maybeSingle();

                if (linkedCredit) {
                    const newPending = Math.max(0, (parseFloat(linkedCredit.pending_amount) || 0) - restockedTotal);
                    await supabaseClient.from('credits')
                        .update({ pending_amount: newPending, status: newPending <= 0 ? 'completed' : 'pending' })
                        .eq('id', linkedCredit.id);
                }
            }

            if (window.authManager) {
                const summary = selections.map(s => `${s.item.product_name} x${s.qty}`).join(', ');
                await window.authManager.createAuditLog('restock', 'sales', sale.id, null, {
                    sale_id: sale.id,
                    action: 'restock',
                    items: summary,
                    refund_amount: restockedTotal,
                    status: newStatus
                }).catch(e => console.warn('Audit log failed:', e));
            }

            localStorage.setItem('shopDataChanged', Date.now().toString());
            this.closeRestockModal();
            showNotification(`Restocked ${selections.length} item${selections.length > 1 ? 's' : ''} · Refunded ${formatCurrency(restockedTotal)}`, 'success');
            await this.loadProducts();
            await this.loadRecentTransactions();

        } catch (error) {
            console.error('Error restocking sale:', error);
            showNotification('Failed to restock: ' + (error.message || error), 'error');
        } finally {
            showLoading(false);
        }
    }

    closeRestockModal() {
        const modal = document.getElementById('restockModal');
        if (modal) modal.classList.remove('active');
        this.currentRestockSale = null;
    }

    async applyRestockToItem(item, quantity) {
        if (!item || !item.product_id) return false;
        const qty = parseFloat(quantity) || 0;
        if (qty <= 0) return false;

        let isVariant = false;
        let sizeKey = null;

        const sizeMatch = item.product_name ? item.product_name.match(/\(Size (.*?)\)$/) : null;
        if (sizeMatch) sizeKey = sizeMatch[1].trim();

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
                if (typeof updatedAttrs === 'string') { try { updatedAttrs = JSON.parse(updatedAttrs); } catch (e) { updatedAttrs = {}; } }

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

        if (!isVariant) {
            const { data: product, error: pError } = await supabaseClient
                .from('products')
                .select('stock, metadata')
                .eq('id', item.product_id)
                .single();

            if (!pError && product) {
                let meta = product.metadata || {};
                if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }

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

    showInvoice(sale, cartItems, deliveryCharge) {
        if (!sale) return;
        const shopName = this.shopData?.shop_name || 'Shop';
        const shopLogo = this.shopData?.shop_logo || this.shopLogo || '';
        deliveryCharge = parseFloat(deliveryCharge) || 0;
        cartItems = cartItems || [];

        // Receipt wording comes from Settings > POS so the shop owner controls it
        const receiptHeader = String(this.receiptHeader || '').trim() || 'Thank you for shopping with us!';
        const receiptFooter = String(this.receiptFooter || '').trim() || 'Please visit again!';

        // Optional QR image uploaded in Settings > POS, printed below the receipt
        const receiptQrUrl = String(this.receiptQrImageUrl || '').trim();
        const qrHtml = receiptQrUrl ? `
                <div class="qr-section text-center">
                    <img src="${escapeHtml(receiptQrUrl)}" alt="QR Code" crossorigin="anonymous">
                </div>` : '';

        const itemsHtml = cartItems.map(item => `
            <tr>
                <td style="padding: 6px 0; border-bottom: 1px dashed #e2e8f0;">
                    <div style="font-weight: 600; color: #1e293b;">${item.name}</div>
                    <small style="color: #64748b;">${item.quantity} × ${formatCurrency(item.price)}</small>
                </td>
                <td style="text-align: right; vertical-align: top; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-weight: 600; color: #1e293b;">
                    ${formatCurrency(item.price * item.quantity)}
                </td>
            </tr>
        `).join('');

        const printItemsHtml = cartItems.map(item => `
            <tr>
                <td style="padding: 5px 0;">${item.name}<br><small style="color: #666;">${item.quantity} x ${formatCurrency(item.price)}</small></td>
                <td style="text-align: right; vertical-align: top; padding: 5px 0;">${formatCurrency(item.price * item.quantity)}</td>
            </tr>
        `).join('');

        // Watermark HTML — only shown if logo exists
        const watermarkHtml = shopLogo ? `
            <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 55mm;
                height: 55mm;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.12;
                pointer-events: none;
                z-index: 0;
            ">
                <img src="${shopLogo}" 
                     style="max-width:100%;max-height:100%;object-fit:contain;"
                     crossorigin="anonymous">
            </div>` : `
            <div style="
                position: fixed;
                top: 25%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-30deg);
                font-size: 48px;
                font-weight: 900;
                color: #000;
                opacity: 0.04;
                pointer-events: none;
                z-index: 0;
                white-space: nowrap;
                letter-spacing: 4px;
                font-family: monospace;
            ">${shopName}</div>`;

        const printableInvoiceHtml = `
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
                    .invoice-content { position: relative; z-index: 1; }
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
                ${watermarkHtml}
                <div class="invoice-content">
                <div class="header text-center">
                    <div class="shop-name">${shopName}</div>
                    <div>INVOICE / RECEIPT</div>
                </div>

                <div class="info-section">
                    <div class="info-row"><span>Date:</span> <span>${new Date(sale.created_at || Date.now()).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'})} ${new Date(sale.created_at || Date.now()).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}).toLowerCase()}</span></div>
                    <div class="info-row"><span>Invoice:</span> <span>${sale.invoice_number}</span></div>
                    <div class="info-row"><span>Payment:</span> <span style="text-transform: uppercase;">${sale.payment_method || 'CASH'}</span></div>
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
                        ${printItemsHtml}
                    </tbody>
                </table>

                <div class="totals">
                    <div class="info-row"><span>Subtotal:</span> <span>${formatCurrency(parseFloat(sale.total_amount) + parseFloat(sale.discount_amount || 0))}</span></div>
                    <div class="info-row"><span>Discount:</span> <span>-${formatCurrency(sale.discount_amount || 0)}</span></div>
                    ${deliveryCharge > 0 ? `<div class="info-row"><span>Delivery Charge:</span> <span>+${formatCurrency(deliveryCharge)}</span></div>` : ''}
                    <div class="total-row"><span>TOTAL:</span> <span>${formatCurrency(parseFloat(sale.total_amount) + deliveryCharge)}</span></div>
                    ${sale.pending_amount > 0 ? `<div class="info-row" style="color:red;margin-top:5px;"><span>Pending:</span> <span>${formatCurrency(sale.pending_amount)}</span></div>` : ''}
                </div>

                <div class="footer text-center">
                    <p>${receiptHeader}</p>
                    <p>${receiptFooter}</p>
                    ${sale.buyer_address && sale.payment_method !== 'credit' ? `<p style="font-style:italic;margin-top:5px;">Note: ${sale.buyer_address}</p>` : ''}
                    <button class="no-print" onclick="window.print()" style="margin-top: 20px; padding: 10px 20px; background: #000; color: #fff; border: none; cursor: pointer; border-radius: 4px;">Print Now</button>
                    <button class="no-print" onclick="window.close()" style="margin-top: 10px; padding: 8px 15px; background: #666; color: #fff; border: none; cursor: pointer; border-radius: 4px; margin-left:10px;">Close</button>
                </div>
                ${qrHtml}
                </div>
                </div>
            </body>
            </html>
        `;

        const invoiceModal = document.getElementById('invoiceModal');
        const invoiceContent = document.getElementById('invoiceContent');

        if (invoiceModal && invoiceContent) {
            invoiceContent.innerHTML = `
                <div style="text-align:center;margin-bottom:10px;">
                    <div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:#dcfce7;color:#16a34a;font-size:1.2rem;margin-bottom:6px;">
                        <i class="fas fa-check"></i>
                    </div>
                    <h3 style="margin:0;font-size:1.15rem;color:#0f172a;font-weight:700;">Sale Completed!</h3>
                    <p style="margin:2px 0 0;color:#64748b;font-size:0.8rem;font-family:monospace;">${sale.invoice_number}</p>
                </div>

                <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:14px 16px;font-family:'Courier Prime',monospace,sans-serif;font-size:0.85rem;color:#1e293b;">
                    <div style="text-align:center;border-bottom:1px dashed #cbd5e1;padding-bottom:8px;margin-bottom:8px;">
                        <div style="font-size:1rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${shopName}</div>
                        <div style="font-size:0.72rem;color:#64748b;margin-top:2px;">
                            ${new Date(sale.created_at || Date.now()).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'})} 
                            ${new Date(sale.created_at || Date.now()).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}).toLowerCase()}
                        </div>
                        <div style="font-size:0.75rem;color:#475569;margin-top:3px;">Payment: <strong style="text-transform:uppercase;">${sale.payment_method || 'CASH'}</strong></div>
                        ${sale.buyer_name ? `<div style="font-size:0.75rem;color:#475569;">Customer: <strong>${sale.buyer_name}</strong></div>` : ''}
                    </div>

                    <div style="max-height:160px;overflow-y:auto;margin-bottom:8px;padding-right:4px;">
                        <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                        </table>
                    </div>

                    <div style="border-top:1px dashed #cbd5e1;padding-top:8px;font-size:0.82rem;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                            <span>Subtotal:</span>
                            <span>${formatCurrency(parseFloat(sale.total_amount) + parseFloat(sale.discount_amount || 0))}</span>
                        </div>
                        ${parseFloat(sale.discount_amount || 0) > 0 ? `
                        <div style="display:flex;justify-content:space-between;margin-bottom:3px;color:#16a34a;">
                            <span>Discount:</span>
                            <span>-${formatCurrency(sale.discount_amount)}</span>
                        </div>` : ''}
                        ${deliveryCharge > 0 ? `
                        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                            <span>Delivery Charge:</span>
                            <span>+${formatCurrency(deliveryCharge)}</span>
                        </div>` : ''}
                        <div style="display:flex;justify-content:space-between;font-weight:800;font-size:1.05rem;margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0;color:#0f172a;">
                            <span>TOTAL:</span>
                            <span>${formatCurrency(parseFloat(sale.total_amount) + deliveryCharge)}</span>
                        </div>
                        ${sale.pending_amount > 0 ? `
                        <div style="display:flex;justify-content:space-between;color:#dc2626;font-weight:700;margin-top:4px;">
                            <span>Pending:</span>
                            <span>${formatCurrency(sale.pending_amount)}</span>
                        </div>` : ''}
                    </div>
                </div>
            `;

            // Setup print button
            const printBtn = document.getElementById('printActualBtn');
            if (printBtn) {
                printBtn.onclick = () => {
                    this.printHtmlReceipt(printableInvoiceHtml);
                };
            }

            // Setup Spin & Win Reward button
            const spinBtn = document.getElementById('spinRewardBtn');
            if (spinBtn) {
                spinBtn.onclick = () => {
                    const customerName = sale.buyer_name || sale.customer_name || document.getElementById('customerName')?.value.trim() || document.getElementById('buyerName')?.value.trim() || '';
                    const customerPhone = sale.buyer_phone || sale.customer_phone || sale.phone || document.getElementById('customerPhone')?.value.trim() || document.getElementById('buyerPhone')?.value.trim() || '';
                    const totalBill = parseFloat(sale.total_amount || 0) + (parseFloat(deliveryCharge) || 0);
                    const purchasedItem = (cartItems && cartItems.length > 0) ? (cartItems[0].product_name || cartItems[0].name || '') : '';

                    const pendingSpinData = {
                        customerName: customerName,
                        customerPhone: customerPhone,
                        amount: totalBill,
                        itemName: purchasedItem,
                        timestamp: Date.now()
                    };

                    sessionStorage.setItem('pending_spin_customer', JSON.stringify(pendingSpinData));
                    localStorage.setItem('pending_spin_customer', JSON.stringify(pendingSpinData));

                    const shopId = window.authManager?.shopId || sale.shop_id || '';
                    const params = new URLSearchParams();
                    if (shopId) params.set('shop_id', shopId);
                    if (customerName) params.set('customer_name', customerName);
                    if (customerPhone) params.set('customer_phone', customerPhone);
                    if (totalBill > 0) params.set('amount', String(totalBill));
                    if (purchasedItem) params.set('item_name', purchasedItem);

                    const targetUrl = 'spin.html?' + params.toString();
                    window.location.href = targetUrl;
                };
            }

            // Adjust modal dialog size nicely
            const modalContent = invoiceModal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.style.maxWidth = '460px';
            }

            invoiceModal.classList.add('active');
        } else {
            // Fallback: print directly
            this.printHtmlReceipt(printableInvoiceHtml);
        }
    }

    printHtmlReceipt(htmlContent) {
        // Warm the cache for the receipt's remote images so they are already
        // decoded by the time the print window/iframe renders (and by print()).
        const remoteImages = [this.receiptQrImageUrl, this.shopData?.shop_logo, this.shopLogo]
            .filter(Boolean)
            .map(url => this.preloadImage(url));

        Promise.all(remoteImages).finally(() => {
            this.writeReceiptForPrint(htmlContent);
        });
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

    writeReceiptForPrint(htmlContent) {
        let printWindow = null;
        try {
            printWindow = window.open('', '_blank');
        } catch (e) {
            printWindow = null;
        }

        // If window.open succeeded and wasn't blocked by popup blocker
        if (printWindow && printWindow.document) {
            try {
                printWindow.document.open();
                printWindow.document.write(htmlContent);
                printWindow.document.close();
                return;
            } catch (e) {
                console.warn('Direct print window write failed, falling back to iframe:', e);
            }
        }

        // Fallback to hidden iframe (never blocked by popup blocker)
        try {
            let iframe = document.getElementById('posPrintIframe');
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.id = 'posPrintIframe';
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
            doc.write(htmlContent);
            doc.close();
            const printNow = () => {
                try {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                } catch (err) {
                    console.warn('Iframe print error:', err);
                }
            };
            // Print as soon as every not-yet-decoded <img> in the receipt has
            // settled, but never hang if one of them never fires load/error.
            const images = Array.from(iframe.contentDocument.querySelectorAll('img'));
            const pending = images.filter(img => !img.complete);
            if (pending.length === 0) {
                setTimeout(printNow, 300);
            } else {
                let settled = 0;
                const onSettled = () => {
                    if (++settled >= pending.length) setTimeout(printNow, 100);
                };
                pending.forEach(img => {
                    img.addEventListener('load', onSettled, { once: true });
                    img.addEventListener('error', onSettled, { once: true });
                });
                setTimeout(printNow, 2500);
            }
        } catch (err) {
            console.error('Failed to print receipt:', err);
            showNotification('Unable to open print preview. Please check browser popups.', 'warning');
        }
    }

    printInvoice() {
        if (this.cart.length === 0) {
            showNotification('Cart is empty', 'warning');
            return;
        }

        this.showInvoice({
            invoice_number: `DRAFT-${Date.now()}`,
            total_amount: this.cartTotal,
            discount_amount: this.discount,
            amount_paid: this.cartTotal,
            pending_amount: 0,
            payment_method: 'cash',
            created_at: new Date().toISOString()
        }, this.cart, this.deliveryCharge);
    }

    updateCurrentTime() {
        const update = () => {
            const now = new Date();
            const timeElement = document.getElementById('currentTime');
            const dateElement = document.getElementById('currentDate');

            if (timeElement) {
                timeElement.textContent = now.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });
            }

            if (dateElement) {
                dateElement.textContent = now.toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });
            }
        };

        update();
        setInterval(update, 1000);
    }

    async checkPendingOrderFromGoogleSheet() {
        const stored = localStorage.getItem('pending_pos_order');
        if (!stored) return;

        try {
            const order = JSON.parse(stored);
            localStorage.removeItem('pending_pos_order');

            if (!order || !order.id) return;

            // 1. Populate Customer Details
            const customerNameInput = document.getElementById('customerName');
            const customerPhoneInput = document.getElementById('customerPhone');
            const saleRemarkInput = document.getElementById('saleRemark');
            const customerFieldsContainer = document.getElementById('customerDetailsFields');

            if (customerNameInput && order.name) customerNameInput.value = order.name;
            if (customerPhoneInput && order.phone) customerPhoneInput.value = order.phone;

            let remark = `Order #${order.id}`;
            if (order.location) remark += ` | Loc: ${order.location}`;
            if (order.note) remark += ` | Note: ${order.note}`;
            if (saleRemarkInput) saleRemarkInput.value = remark;

            if (customerFieldsContainer) {
                customerFieldsContainer.style.display = 'block';
            }

            // Also populate credit buyer inputs
            const buyerNameInput = document.getElementById('buyerName');
            const buyerPhoneInput = document.getElementById('buyerPhone');
            const buyerAddressInput = document.getElementById('buyerAddress');

            if (buyerNameInput && order.name) buyerNameInput.value = order.name;
            if (buyerPhoneInput && order.phone) buyerPhoneInput.value = order.phone;
            if (buyerAddressInput && order.location) buyerAddressInput.value = order.location;

            // 2. Clear existing cart
            this.cart = [];

            // 3. Parse items text and populate cart matching variants
            const itemsText = order.items || '';
            const lines = itemsText.split('\n').map(l => l.trim()).filter(Boolean);

            for (const line of lines) {
                await this.findAndAddOrderProductToCart(line, order.total, lines.length);
            }

            this.updateCartDisplay();

            if (typeof showNotification === 'function') {
                showNotification(`Order #${order.id} (${order.name}) loaded into POS cart!`, 'success');
            }

        } catch (e) {
            console.error('Error loading pending POS order:', e);
        }
    }

    async findAndAddOrderProductToCart(line, orderTotal, totalLinesCount) {
        if (!line || !line.trim()) return;

        // 1. Clean line numbering (e.g. "1. " or "1) ")
        let clean = line.replace(/^\d+[\.\)]\s*/, '').trim();

        let qty = 1;
        let itemName = clean;
        let lineTotal = 0;

        // 2. Parse price total if line contains '=' e.g. " = ₹450.00" or " = 450"
        if (clean.includes('=')) {
            const parts = clean.split('=');
            itemName = parts[0].trim();
            const priceStr = parts[1].replace(/[^0-9\.]/g, '');
            if (priceStr) lineTotal = parseFloat(priceStr) || 0;
        }

        // 3. Parse quantity e.g. "x7" or "x 7" or "(x7)" or "(7)"
        const qtyMatch = itemName.match(/\s+x\s*(\d+)$/i) || itemName.match(/\(x(\d+)\)$/i);
        if (qtyMatch) {
            qty = parseInt(qtyMatch[1], 10) || 1;
            itemName = itemName.replace(/\s+x\s*(\d+)$/i, '').replace(/\(x(\d+)\)$/i, '').trim();
        }

        const calculatedUnitPrice = lineTotal > 0 ? (lineTotal / qty) : null;

        // Ensure database variants for shop are loaded
        if (!this._cachedShopVariants) {
            try {
                const { data } = await supabaseClient
                    .from('product_variants')
                    .select('*')
                    .eq('shop_id', this.shopId)
                    .eq('is_active', true);
                this._cachedShopVariants = data || [];
            } catch (e) {
                this._cachedShopVariants = [];
            }
        }

        const allDbVariants = this._cachedShopVariants || [];
        const allProducts = this.products || [];

        // --- STEP 1: SKU MATCHING (Highest Priority) ---
        // Extract all parenthetical strings e.g. "(32)" and "(6hm322)"
        const parenMatches = [];
        const regex = /\(([^\)]+)\)/g;
        let match;
        while ((match = regex.exec(itemName)) !== null) {
            parenMatches.push(match[1].trim());
        }

        for (const candidateSku of parenMatches) {
            if (!candidateSku) continue;

            // A. Search Base Products by SKU (case-insensitive)
            const matchedBaseProd = allProducts.find(p => p.sku && p.sku.trim().toLowerCase() === candidateSku.toLowerCase());
            if (matchedBaseProd) {
                this.addMatchedProductToCart(matchedBaseProd, itemName, calculatedUnitPrice, qty);
                return;
            }

            // B. Search Database Variants by SKU
            const matchedDbVar = allDbVariants.find(v => v.sku && v.sku.trim().toLowerCase() === candidateSku.toLowerCase());
            if (matchedDbVar) {
                const parentProd = allProducts.find(p => p.id === matchedDbVar.product_id);
                if (parentProd) {
                    this.addVariantToCart(parentProd, matchedDbVar, calculatedUnitPrice, qty);
                    return;
                }
            }
        }

        // --- STEP 2: DATABASE VARIANT NAME MATCHING ---
        for (const v of allDbVariants) {
            const p = allProducts.find(prod => prod.id === v.product_id);
            if (!p) continue;

            const vNameFull1 = `${p.product_name} (${v.variant_name})`.toLowerCase();
            const vNameFull2 = `${p.product_name} - ${v.variant_name}`.toLowerCase();
            const itemLower = itemName.toLowerCase();

            if (itemLower.includes(vNameFull1) || itemLower.includes(vNameFull2) || (v.sku && itemLower.includes(v.sku.toLowerCase()))) {
                this.addVariantToCart(p, v, calculatedUnitPrice, qty);
                return;
            }
        }

        // --- STEP 3: PRODUCT NAME & ATTRIBUTES MATCHING ---
        // Sort products by product_name length descending so specific product names match first
        const sortedProducts = [...allProducts].sort((a, b) => (b.product_name || '').length - (a.product_name || '').length);

        for (const p of sortedProducts) {
            const pName = (p.product_name || '').toLowerCase().trim();
            if (!pName) continue;

            if (itemName.toLowerCase().includes(pName) || (p.sku && itemName.toLowerCase().includes(p.sku.toLowerCase()))) {
                this.addMatchedProductToCart(p, itemName, calculatedUnitPrice, qty);
                return;
            }
        }

        // --- STEP 4: CUSTOM ITEM FALLBACK (If product not in inventory) ---
        const unitPrice = calculatedUnitPrice || ((parseFloat(orderTotal) || 0) / (totalLinesCount * qty) || 0);
        this.cart.push({
            id: 'order_item_' + Math.random().toString(36).substring(2, 9),
            name: itemName || 'Received Order Item',
            sku: 'ORDER-CUSTOM',
            price: unitPrice,
            original_price: unitPrice,
            cost_price: 0,
            quantity: qty,
            stock: 999,
            product_image: null,
            price_changed: false
        });
        this.updateCartDisplay();
    }

    addMatchedProductToCart(product, fullItemName, calculatedUnitPrice, qty) {
        let meta = product.metadata || {};
        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e) { meta = {}; } }
        const attrs = meta.attributes || {};

        let sizeStockMap = meta.size_stock || attrs.size_stock || null;
        if (typeof sizeStockMap === 'string') { try { sizeStockMap = JSON.parse(sizeStockMap); } catch(e) { sizeStockMap = null; } }

        // Check for size match in fullItemName e.g. "(32)" or "- 32"
        if (sizeStockMap && typeof sizeStockMap === 'object') {
            const availableSizes = Object.keys(sizeStockMap);
            for (const sKey of availableSizes) {
                const sClean = sKey.trim().toLowerCase();
                const regexStr = `(?:\\b|\\()${sClean}(?:\\b|\\))`;
                if (new RegExp(regexStr, 'i').test(fullItemName)) {
                    const stock = parseInt(sizeStockMap[sKey]) || 0;
                    let sizePriceMap = meta.size_price || attrs.size_price || null;
                    if (typeof sizePriceMap === 'string') { try { sizePriceMap = JSON.parse(sizePriceMap); } catch(e) { sizePriceMap = null; } }
                    const price = (sizePriceMap && sizePriceMap[sKey]) ? parseFloat(sizePriceMap[sKey]) : (calculatedUnitPrice || parseFloat(product.selling_price) || 0);

                    this.addSizeToCart(product, sKey, stock, price, null, qty);
                    return;
                }
            }
        }

        // Standard base product addition
        const unitPrice = calculatedUnitPrice || parseFloat(product.selling_price) || 0;
        const stock = parseInt(product.stock) || 0;
        const existing = this.cart.find(i => i.id === product.id);

        if (existing) {
            existing.quantity += qty;
        } else {
            this.cart.push({
                id: product.id,
                name: product.product_name,
                sku: product.sku || 'N/A',
                price: unitPrice,
                original_price: parseFloat(product.selling_price) || unitPrice,
                cost_price: parseFloat(product.cost_price) || 0,
                quantity: qty,
                stock: stock > 0 ? stock : (product._baseStock || 999),
                product_image: product.product_image || null,
                price_changed: unitPrice !== parseFloat(product.selling_price)
            });
        }
        this.updateCartDisplay();
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }
}

// Initialize POS on pos.html page
if (window.location.pathname.includes('pos.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        window.posManager = new POSManager();
    });
}
