const SETTINGS_KEY = "spinwin_settings_v2";
const RECORDS_KEY = "spinwin_history_v1";
const ACTIVE_TAB_KEY = "spinwin_active_tab_v1";
const APPS_SCRIPT_URL_KEY = "spinwin_apps_script_url_v1";
const MEMBERS_KEY = "spinwin_members_v1";
const CREDIT_RATE_PER_100 = 1; // 100 Credits = ₹1.00

const STATUS_PENDING = "Pending";
const STATUS_COMPLETED = "Completed";
const STATUS_REJECTED = "Rejected";
const STATUS_EXPIRED = "Expired";
const LEGACY_DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyltcB5TcqISvcbIcs3ka3RjaFa1IT8ZxiHDeIA30g01BirlBmnzg2dy7xN0knQAsMAww/exec";

const DEFAULT_SETTINGS = {
  shopName: "Lucky Shop",
  shopLogoUrl: "",
  expiryHours: 24,
  spinDuration: 5,
  manualDateEnabled: false,
  manualDateTime: "",
  appsScriptUrl: "",
  conditions: [
    {
      id: uid(),
      itemName: "Jeans Pant",
      label: "Jeans Pant (Wheel 1)",
      icon: "👖",
      minAmount: 0,
      prizes: [
        { id: uid(), name: "Leather Belt Free", probability: 30, enabled: true },
        { id: uid(), name: "20% Off Denim", probability: 25, enabled: true },
        { id: uid(), name: "Cap Free", probability: 15, enabled: true },
        { id: uid(), name: "Try Again", probability: 29.9, enabled: true },
        { id: uid(), name: "Grand Prize", probability: 0.1, enabled: true }
      ]
    },
    {
      id: uid(),
      itemName: "Shirt",
      label: "Shirt (Wheel 2)",
      icon: "👔",
      minAmount: 0,
      prizes: [
        { id: uid(), name: "Silk Tie Free", probability: 25, enabled: true },
        { id: uid(), name: "15% Off Next Shirt", probability: 30, enabled: true },
        { id: uid(), name: "Cufflinks Free", probability: 15, enabled: true },
        { id: uid(), name: "Try Again", probability: 29.9, enabled: true },
        { id: uid(), name: "Grand Prize", probability: 0.1, enabled: true }
      ]
    }
  ],
  // Keep flat prizes for backward compatibility / migration
  prizes: [
    { id: uid(), name: "10% Discount", probability: 40, enabled: true },
    { id: uid(), name: "Free Drink", probability: 25, enabled: true },
    { id: uid(), name: "Buy 1 Get 1", probability: 10, enabled: true },
    { id: uid(), name: "Try Again", probability: 24.9, enabled: true },
    { id: uid(), name: "Grand Prize", probability: 0.1, enabled: true }
  ],
  membershipTypes: [
    { id: "mt_spin_winner", name: "Spin Winner", icon: "👑" },
    { id: "mt_direct_member", name: "Direct Member", icon: "💎" },
    { id: "mt_vip_member", name: "VIP Member", icon: "⭐" }
  ]
};

const state = {
  settings: loadSettings(),
  records: loadRecords(),
  wheelAngle: 0,
  spinning: false,
  wheelHovered: false,
  spinLockedForEntry: false,
  lastEntrySignature: "",
  currentResultId: null,
  selectedRecordIds: new Set(),
  selectedMemberIds: new Set(),
  logoImage: null,
  defaultLogoImage: null,
  receiptQrImage: null,
  receiptQrLoaded: false,
  recordsPage: 1,
  recordsPageSize: (window.getStoredPerPage ? window.getStoredPerPage('spin_records', 50) : 50),
  soundMuted: localStorage.getItem("spinwin_sound_muted") === "true",
  selectedConditionId: null,
  members: loadMembers(),
  memberSearchQuery: "",
  memberFilter: "all",
  membersPage: 1,
membersPageSize: (window.getStoredPerPage ? window.getStoredPerPage('spin_members', 50) : 50),
  activeHistoryMemberId: null,
  activeRecordForCredit: null,
  activeViewRecord: null,
  activeMemberForCard: null,
  lastWinnerIndex: null,
  lastWinnerSegments: 0,
  rimPhase: 0
};

const el = {};
let wheelCtx = null;
let couponCtx = null;
let spinFullscreenCtx = null;
let couponViewCtx = null;
let memberCardCtx = null;

function initDOM() {
  el.shopNameDisplay = byId("shopNameDisplay");
  el.customerName = byId("customerName");
  el.customerNumber = byId("customerNumber");
  el.purchaseAmount = byId("purchaseAmount");
  el.saveBtn = byId("saveBtn");
  el.downloadBtn = byId("downloadBtn");
  el.shareBtn = byId("shareBtn");
el.wheelCanvas = byId("wheelCanvas");
  el.couponCanvas = byId("couponCanvas");
  el.fullscreenBtn = byId("fullscreenBtn");
  el.spinFullscreen = byId("spinFullscreen");
  el.spinFullscreenClose = byId("spinFullscreenClose");
  el.spinFullscreenWrap = byId("spinFullscreenWrap");
  el.spinFullscreenCanvas = byId("spinFullscreenCanvas");
  el.spinFullscreenPointer = byId("spinFullscreenPointer");
  el.spinFullscreenHint = byId("spinFullscreenHint");
  el.resultEmpty = byId("resultEmpty");
  el.resultDetails = byId("resultDetails");
  el.resultRecordId = byId("resultRecordId");
  el.resultShop = byId("resultShop");
  el.resultCustomer = byId("resultCustomer");
  el.resultCustomerNumber = byId("resultCustomerNumber");
  el.resultAmount = byId("resultAmount");
  el.resultPrize = byId("resultPrize");
  el.resultStatus = byId("resultStatus");
  el.resultDate = byId("resultDate");
  el.resultExpiry = byId("resultExpiry");
  el.shopNameInput = byId("shopNameInput");
  el.shopLogoUrlInput = byId("shopLogoUrlInput");
  el.expiryHoursInput = byId("expiryHoursInput");
  el.appsScriptUrlInput = byId("appsScriptUrlInput");
  el.testAppsScriptBtn = byId("testAppsScriptBtn");
  el.appsScriptStatusMsg = byId("appsScriptStatusMsg");
  el.manualDateToggle = byId("manualDateToggle");
  el.manualDateInput = byId("manualDateInput");
  el.prizeTableBody = byId("prizeTableBody");
  el.addPrizeBtn = byId("addPrizeBtn");
  el.membershipTypeTableBody = byId("membershipTypeTableBody");
  el.addMembershipTypeBtn = byId("addMembershipTypeBtn");
  el.membershipTypeRowTemplate = byId("membershipTypeRowTemplate");
  el.saveSettingsBtn = byId("saveSettingsBtn");
  el.resetDataBtn = byId("resetDataBtn");
  el.prizeRowTemplate = byId("prizeRowTemplate");
  el.recordSearchInput = byId("recordSearchInput");
  el.recordFilterSortSelect = byId("recordFilterSortSelect");
  el.refreshRecordsBtn = byId("refreshRecordsBtn");
  el.exportRecordsBtn = byId("exportRecordsBtn");
  el.recordsSummary = byId("recordsSummary");
  el.recordsTableBody = byId("recordsTableBody");
  el.selectAllRecords = byId("selectAllRecords");
  el.bulkActionSelect = byId("bulkActionSelect");
  el.applyBulkActionBtn = byId("applyBulkActionBtn");
  el.clearSelectionBtn = byId("clearSelectionBtn");
  el.editModal = byId("editModal");
  el.editRecordForm = byId("editRecordForm");
  el.editRecordId = byId("editRecordId");
  el.editCustomerName = byId("editCustomerName");
  el.editCustomerNumber = byId("editCustomerNumber");
  el.editPurchaseAmount = byId("editPurchaseAmount");
  el.editPrizeWon = byId("editPrizeWon");
  el.editExpiryDate = byId("editExpiryDate");
  el.cancelEditBtn = byId("cancelEditBtn");
  el.toastContainer = byId("toastContainer");
  el.bulkActionsBar = byId("bulkActionsBar");
  el.tabMenuToggle = byId("tabMenuToggle");
  el.tabNav = byId("tabNav");
  el.tabButtons = Array.from(document.querySelectorAll("[data-tab-target]"));
  el.tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));
  el.soundToggleBtn = byId("soundToggleBtn");
  el.soundIcon = byId("soundIcon");
  el.wheelPointer = byId("wheelPointer");
  el.wheelHint = byId("wheelHint");
  el.wheelWinPill = byId("wheelWinPill");
  el.wheelWinPillText = byId("wheelWinPillText");
  el.confettiCanvas = byId("confettiCanvas");
  el.wheelWrap = document.querySelector(".wheel-wrap");
  el.spinDurationInput = byId("spinDurationInput");
  el.spinTimePills = byId("spinTimePills");
  el.winnerModal = byId("winnerModal");
  el.winnerPrizeName = byId("winnerPrizeName");
  el.winnerCustomerMsg = byId("winnerCustomerMsg");
  el.winnerRecordId = byId("winnerRecordId");
  el.winnerViewCouponBtn = byId("winnerViewCouponBtn");
  el.winnerSpinAgainBtn = byId("winnerSpinAgainBtn");
  el.recordsPaginationBar = byId("recordsPaginationBar");
  el.paginationRangeText = byId("paginationRangeText");
  el.pageSizeSelect = byId("pageSizeSelect");
  el.firstPageBtn = byId("firstPageBtn");
  el.prevPageBtn = byId("prevPageBtn");
  el.nextPageBtn = byId("nextPageBtn");
  el.lastPageBtn = byId("lastPageBtn");
  el.paginationPages = byId("paginationPages");
  el.spinConditionSelect = byId("spinConditionSelect");
  el.conditionTabsBar = byId("conditionTabsBar");
  el.conditionEditorCard = byId("conditionEditorCard");
  el.conditionBadgeActive = byId("conditionBadgeActive");
  el.conditionEditorTitle = byId("conditionEditorTitle");
  el.deleteConditionBtn = byId("deleteConditionBtn");
  el.conditionItemNameInput = byId("conditionItemNameInput");
  el.conditionLabelInput = byId("conditionLabelInput");
  el.conditionIconInput = byId("conditionIconInput");
  el.conditionMinAmountInput = byId("conditionMinAmountInput");
  el.addConditionBtn = byId("addConditionBtn");
  el.conditionProbSummary = byId("conditionProbSummary");
  el.winnerItemPill = byId("winnerItemPill");
  el.winnerItemText = byId("winnerItemText");

  // Members Section Elements
  el.statTotalMembers = byId("statTotalMembers");
  el.statMembersSubtitle = byId("statMembersSubtitle");
  el.statTotalCredits = byId("statTotalCredits");
  el.statCreditsWorth = byId("statCreditsWorth");
  el.statTotalEarned = byId("statTotalEarned");
  el.statEarnedWorth = byId("statEarnedWorth");
  el.statTotalCashPaid = byId("statTotalCashPaid");
  el.statRedeemedCredits = byId("statRedeemedCredits");
  el.memberSearchInput = byId("memberSearchInput");
  el.clearMemberSearchBtn = byId("clearMemberSearchBtn");
  el.memberFilterSelect = byId("memberFilterSelect");
  el.membersTableBody = byId("membersTableBody");
  el.selectAllMembers = byId("selectAllMembers");
  el.memberBulkActionsBar = byId("memberBulkActionsBar");
  el.memberBulkActionSelect = byId("memberBulkActionSelect");
  el.applyMemberBulkActionBtn = byId("applyMemberBulkActionBtn");
  el.clearMemberSelectionBtn = byId("clearMemberSelectionBtn");
  el.membersEmptyState = byId("membersEmptyState");
  el.membersEmptyMsg = byId("membersEmptyMsg");
  el.emptyAddMemberBtn = byId("emptyAddMemberBtn");
  el.openNewMemberModalBtn = byId("openNewMemberModalBtn");
  el.openAddCreditModalBtn = byId("openAddCreditModalBtn");
  el.openDeductModalBtn = byId("openDeductModalBtn");
  el.pushMembersBtn = byId("pushMembersBtn");
  el.refreshMembersBtn = byId("refreshMembersBtn");
  el.exportMembersBtn = byId("exportMembersBtn");
  el.membersPaginationBar = byId("membersPaginationBar");
  el.membersPaginationRangeText = byId("membersPaginationRangeText");
  el.membersPageSizeSelect = byId("membersPageSizeSelect");
  el.membersFirstPageBtn = byId("membersFirstPageBtn");
  el.membersPrevPageBtn = byId("membersPrevPageBtn");
  el.membersNextPageBtn = byId("membersNextPageBtn");
  el.membersLastPageBtn = byId("membersLastPageBtn");
  el.membersPaginationPages = byId("membersPaginationPages");

  // Member Modal
  el.memberModal = byId("memberModal");
  el.memberModalTitle = byId("memberModalTitle");
  el.memberForm = byId("memberForm");
  el.memberFormId = byId("memberFormId");
  el.memberFormName = byId("memberFormName");
  el.memberFormPhone = byId("memberFormPhone");
  el.memberFormType = byId("memberFormType");
  el.memberFormInitialCredits = byId("memberFormInitialCredits");
  el.memberInitialCreditsGroup = byId("memberInitialCreditsGroup");
  el.memberCreditsFieldLabel = byId("memberCreditsFieldLabel");
  el.initialCreditsHint = byId("initialCreditsHint");
  el.memberFormNotes = byId("memberFormNotes");
  el.saveMemberBtn = byId("saveMemberBtn");

  // Credit Modal
  el.creditModal = byId("creditModal");
  el.creditForm = byId("creditForm");
  el.creditMemberSelect = byId("creditMemberSelect");
  el.creditQuickAddMemberBtn = byId("creditQuickAddMemberBtn");
  el.creditCurrentBalanceRow = byId("creditCurrentBalanceRow");
  el.creditCurrentBalanceText = byId("creditCurrentBalanceText");
  el.creditPurchaseAmount = byId("creditPurchaseAmount");
  el.creditAmountInput = byId("creditAmountInput");
  el.creditCashWorthPreview = byId("creditCashWorthPreview");
  el.creditNoteInput = byId("creditNoteInput");

  // Deduct Modal
  el.deductModal = byId("deductModal");
  el.deductForm = byId("deductForm");
  el.deductMemberSelect = byId("deductMemberSelect");
  el.deductAvailableText = byId("deductAvailableText");
  el.deductRedeemMode = byId("deductRedeemMode");
  el.modePurchaseDiscountBtn = byId("modePurchaseDiscountBtn");
  el.modeCashPayoutBtn = byId("modeCashPayoutBtn");
  el.purchaseDiscountFields = byId("purchaseDiscountFields");
  el.deductBillAmountInput = byId("deductBillAmountInput");
  el.deductCreditsInput = byId("deductCreditsInput");
  el.deductCashInput = byId("deductCashInput");
  el.deductValueLabel = byId("deductValueLabel");
  el.discountNetBanner = byId("discountNetBanner");
  el.deductNetPayableDisplay = byId("deductNetPayableDisplay");
  el.deductBreakdownDisplay = byId("deductBreakdownDisplay");
  el.cashPayoutBanner = byId("cashPayoutBanner");
  el.deductPayoutDisplay = byId("deductPayoutDisplay");
  el.deductNoteInput = byId("deductNoteInput");
  el.deductSendWhatsAppCheck = byId("deductSendWhatsAppCheck");
  el.confirmDeductBtn = byId("confirmDeductBtn");

  // Member History Modal
  el.memberHistoryModal = byId("memberHistoryModal");
  el.historyMemberName = byId("historyMemberName");
  el.historyMemberSub = byId("historyMemberSub");
  el.historyCurrentCredits = byId("historyCurrentCredits");
  el.historyCurrentCash = byId("historyCurrentCash");
  el.historyLifetimeEarned = byId("historyLifetimeEarned");
  el.historyLifetimeCashed = byId("historyLifetimeCashed");
  el.historyTableBody = byId("historyTableBody");

  // Cross-Tab Integration Elements
  el.customerMemberBadge = byId("customerMemberBadge");
  el.customerMemberBadgeText = byId("customerMemberBadgeText");
  el.customerMemberQuickCreditBtn = byId("customerMemberQuickCreditBtn");
  el.winnerAddMemberBtn = byId("winnerAddMemberBtn");

  // Prize History Direct Credit Modal Elements
  el.recordCreditModal = byId("recordCreditModal");
  el.recordCreditCustName = byId("recordCreditCustName");
  el.recordCreditCustPhone = byId("recordCreditCustPhone");
  el.recordCreditMemberStatusPill = byId("recordCreditMemberStatusPill");
  el.recordCreditBalanceRow = byId("recordCreditBalanceRow");
  el.recordCreditCurrentBal = byId("recordCreditCurrentBal");
  el.recordCreditCashWorth = byId("recordCreditCashWorth");
  el.recordCreditNotMemberNotice = byId("recordCreditNotMemberNotice");
  el.recordCreditRecId = byId("recordCreditRecId");
  el.recordCreditRecItem = byId("recordCreditRecItem");
  el.recordCreditRecAmount = byId("recordCreditRecAmount");
  el.recordCreditRecPrize = byId("recordCreditRecPrize");
  el.recordCreditAddBtn = byId("recordCreditAddBtn");
  el.recordCreditDeductBtn = byId("recordCreditDeductBtn");
  el.recordCreditViewMemberBtn = byId("recordCreditViewMemberBtn");
  el.recordCreditAddTitle = byId("recordCreditAddTitle");
  el.recordCreditAddSub = byId("recordCreditAddSub");
el.recordCreditDeductTitle = byId("recordCreditDeductTitle");
  el.recordCreditDeductSub = byId("recordCreditDeductSub");

  // View Gift Card Coupon Modal
  el.couponViewModal = byId("couponViewModal");
  el.couponViewCanvas = byId("couponViewCanvas");
  el.couponViewRecordId = byId("couponViewRecordId");
  el.couponViewCustomer = byId("couponViewCustomer");
  el.couponViewPrize = byId("couponViewPrize");
  el.couponViewStatus = byId("couponViewStatus");
  el.couponViewExpiry = byId("couponViewExpiry");
  el.downloadCouponBtn = byId("downloadCouponBtn");
  el.shareCouponWaBtn = byId("shareCouponWaBtn");

  // Member Loyalty Card Modal Elements
  el.memberCardModal = byId("memberCardModal");
  el.memberCardCanvas = byId("memberCardCanvas");
  el.memberCardName = byId("memberCardName");
  el.memberCardPhone = byId("memberCardPhone");
  el.memberCardType = byId("memberCardType");
  el.memberCardCredits = byId("memberCardCredits");
  el.memberCardCash = byId("memberCardCash");
  el.downloadMemberCardBtn = byId("downloadMemberCardBtn");
  el.shareMemberCardWaBtn = byId("shareMemberCardWaBtn");
  el.historyShareCardWaBtn = byId("historyShareCardWaBtn");

  if (el.wheelCanvas) wheelCtx = el.wheelCanvas.getContext("2d");
  if (el.couponCanvas) couponCtx = el.couponCanvas.getContext("2d");
  if (el.spinFullscreenCanvas) spinFullscreenCtx = el.spinFullscreenCanvas.getContext("2d");
  if (el.couponViewCanvas) couponViewCtx = el.couponViewCanvas.getContext("2d");
  if (el.memberCardCanvas) memberCardCtx = el.memberCardCanvas.getContext("2d");
}

function checkPendingSpinCustomer() {
  let data = null;

  // 1. Read from URL query params
  const params = new URLSearchParams(window.location.search);
  const urlName = params.get("customer_name") || params.get("customerName") || params.get("name") || "";
  const urlPhone = params.get("customer_phone") || params.get("customerPhone") || params.get("phone") || params.get("mobile") || "";
  const urlAmount = params.get("amount") || params.get("bill_amount") || params.get("total") || "";
  const urlItem = params.get("item_name") || params.get("itemName") || params.get("item") || "";

  // 2. Read from sessionStorage & localStorage
  try {
    const raw = sessionStorage.getItem("pending_spin_customer") || localStorage.getItem("pending_spin_customer");
    if (raw) {
      data = JSON.parse(raw);
      sessionStorage.removeItem("pending_spin_customer");
      localStorage.removeItem("pending_spin_customer");
    }
  } catch (e) {
    data = null;
  }

  const customerName = (urlName || (data && (data.customerName || data.buyer_name || data.customer_name || data.name)) || "").trim();
  const customerPhone = (urlPhone || (data && (data.customerPhone || data.buyer_phone || data.customer_phone || data.phone || data.mobile)) || "").trim();
  const rawAmt = urlAmount || (data && (data.amount || data.total_amount || data.total)) || "";
  const amount = parseFloat(rawAmt) || 0;
  const itemName = (urlItem || (data && (data.itemName || data.item || data.product_name)) || "").trim();

  // If no POS customer data was found, return
  if (!customerName && !customerPhone && amount <= 0 && !itemName) {
    return;
  }

  // Populate inputs
  if (el.customerName && customerName) {
    el.customerName.value = customerName;
  }
  if (el.customerNumber && customerPhone) {
    el.customerNumber.value = customerPhone;
  }
  if (el.purchaseAmount && amount > 0) {
    el.purchaseAmount.value = amount.toFixed(2);
  }

  // Auto-match purchased item with spin wheel condition
  if (itemName && el.spinConditionSelect && state.settings.conditions && state.settings.conditions.length) {
    const itemLower = itemName.toLowerCase();
    const matchedCond = state.settings.conditions.find((c) => {
      const cItem = (c.itemName || "").toLowerCase();
      const cLabel = (c.label || "").toLowerCase();
      return (cItem && (itemLower.includes(cItem) || cItem.includes(itemLower))) ||
             (cLabel && (itemLower.includes(cLabel) || cLabel.includes(itemLower)));
    });

    if (matchedCond) {
      el.spinConditionSelect.value = matchedCond.id;
      state.selectedConditionId = matchedCond.id;
      renderPrizeTable();
      drawWheel();
    }
  }

  // Trigger input events so member badge and validation updates
  if (el.customerName) el.customerName.dispatchEvent(new Event("input", { bubbles: true }));
  if (el.customerNumber) el.customerNumber.dispatchEvent(new Event("input", { bubbles: true }));
  if (el.purchaseAmount) el.purchaseAmount.dispatchEvent(new Event("input", { bubbles: true }));

  onEntryChange();

  // Clean URL query parameters cleanly without reloading the page
  if (window.history && window.history.replaceState && (urlName || urlPhone || urlAmount || urlItem)) {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("customer_name");
    cleanUrl.searchParams.delete("customerName");
    cleanUrl.searchParams.delete("customer_phone");
    cleanUrl.searchParams.delete("customerPhone");
    cleanUrl.searchParams.delete("phone");
    cleanUrl.searchParams.delete("mobile");
    cleanUrl.searchParams.delete("amount");
    cleanUrl.searchParams.delete("item_name");
    cleanUrl.searchParams.delete("itemName");
    window.history.replaceState({}, document.title, cleanUrl.toString());
  }

  // Give clear feedback to cashier
  if (customerName) {
    updateStatus(`Customer "${customerName}" loaded from POS. Ready to spin!`);
    showToast(`Loaded customer details: ${customerName} (₹${amount.toFixed(2)})`, "success");
    if (el.customerNumber && !el.customerNumber.value) {
      el.customerNumber.focus();
    }
  } else {
    updateStatus(`POS Bill of ₹${amount.toFixed(2)} loaded. Enter customer name to spin.`);
    showToast(`Loaded POS bill: ₹${amount.toFixed(2)}. Enter customer name to spin!`, "info");
    if (el.customerName) el.customerName.focus();
  }
}

function init() {
  bindEvents();
  initTabs();
  const activeScriptUrl = getAppsScriptUrl();
  if (activeScriptUrl) persistAppsScriptUrl(activeScriptUrl);
  syncSettingsToInputs();
  loadShopLogo();
  void loadReceiptQrImage();

  // Initialize conditions
  initConditions();

  // Initialize members club
  renderMembersSection();

  renderPrizeTable();
  drawWheel();
  drawCouponPlaceholder();
  renderRecordsTable();
  renderResult();
  refreshUI();

  if (getAppsScriptUrl()) {
    void hydrateFromSheets();
    void syncAppsScriptUrlFromSupabase();
  } else {
    syncAppsScriptUrlFromSupabase().finally(() => {
      if (getAppsScriptUrl()) {
        void hydrateFromSheets();
      }
    });
  }

  checkPendingSpinCustomer();
}

async function syncAppsScriptUrlFromSupabase() {
  try {
    const shopId = getActiveShopId();
    if (!shopId || typeof supabaseClient === "undefined") return;
    const { data, error } = await supabaseClient
      .from("shop_settings")
      .select("spinwin_apps_script_url")
      .eq("shop_id", shopId)
      .maybeSingle();
    if (error) {
      console.warn("Spin & Win URL sync skipped:", error.message);
      return;
    }
    const sharedUrl = data && data.spinwin_apps_script_url ? String(data.spinwin_apps_script_url).trim() : "";
    if (sharedUrl) {
      const currentUrl = getAppsScriptUrl();
      if (!currentUrl || currentUrl !== sharedUrl) {
        persistAppsScriptUrl(sharedUrl);
        state.settings.appsScriptUrl = sharedUrl;
        persistSettings();
        if (el.appsScriptUrlInput) el.appsScriptUrlInput.value = sharedUrl;
      }
    }
  } catch (e) {
    console.warn("Spin & Win URL sync skipped:", e);
  }
}

async function hydrateFromSheets() {
  // Staggered sequential load so Google Apps Script does not choke on concurrent requests
  try {
    await loadSettingsFromSheets(false);
  } catch (e) {
    console.warn("Hydrate settings warning:", e);
  }
  try {
    await loadRecordsFromSheets(false);
  } catch (e) {
    console.warn("Hydrate records warning:", e);
  }
  try {
    await loadMembersFromSheets(false);
  } catch (e) {
    console.warn("Hydrate members warning:", e);
  }
}

function bindEvents() {
  el.tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveTab(btn.dataset.tabTarget);
    });
  });

  if (el.tabMenuToggle && el.tabNav) {
    el.tabMenuToggle.addEventListener("click", () => {
      const shouldOpen = !el.tabNav.classList.contains("open");
      toggleTabMenu(shouldOpen);
    });
  }

  document.addEventListener("click", (event) => {
    if (!el.tabNav || !el.tabNav.classList.contains("open")) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".tab-nav-wrap") || target.closest("#tabMenuToggle")) return;
    toggleTabMenu(false);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) {
      toggleTabMenu(false);
    }
  });

  if (el.wheelCanvas) {
    el.wheelCanvas.addEventListener("click", onWheelClick);
    el.wheelCanvas.addEventListener("mouseenter", () => {
      if (!state.spinning) {
        state.wheelHovered = true;
        drawWheel();
      }
    });
    el.wheelCanvas.addEventListener("mouseleave", () => {
      state.wheelHovered = false;
      drawWheel();
    });
  }

  if (el.wheelWrap) {
    el.wheelWrap.addEventListener("click", (e) => {
      if (e.target !== el.wheelCanvas) {
        onWheelClick(e);
      }
    });
  }

  if (el.fullscreenBtn) el.fullscreenBtn.addEventListener("click", openFullscreenWheel);
  if (el.spinFullscreenClose) el.spinFullscreenClose.addEventListener("click", closeFullscreenWheel);
  if (el.spinFullscreenCanvas) el.spinFullscreenCanvas.addEventListener("click", onSpinClick);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeFullscreenWheel();
  });
  window.addEventListener("resize", sizeFullscreenCanvas);

  if (el.spinTimePills) {
    el.spinTimePills.addEventListener("click", (e) => {
      const btn = e.target.closest(".time-pill-btn");
      if (!btn) return;
      const dur = parseInt(btn.dataset.duration, 10);
      if (dur > 0) {
        setSpinDuration(dur);
      }
    });
  }

  if (el.spinDurationInput) {
    el.spinDurationInput.addEventListener("input", () => {
      const val = Math.max(2, Math.min(15, parseInt(el.spinDurationInput.value || "5", 10)));
      setSpinDuration(val, false);
    });
  }

  if (el.winnerViewCouponBtn) {
    el.winnerViewCouponBtn.addEventListener("click", () => {
      closeFullscreenWheel();
      closeWinnerModal();
      scrollToCouponPreview();
    });
  }

  if (el.winnerSpinAgainBtn) {
    el.winnerSpinAgainBtn.addEventListener("click", () => {
      closeFullscreenWheel();
      closeWinnerModal();
      resetFormForNewSpin();
    });
  }

  if (el.winnerModal) {
    el.winnerModal.addEventListener("click", (event) => {
      const target = event.target;
      if (target && target.getAttribute("data-close-winner-modal") === "true") {
        closeWinnerModal();
      }
    });
  }

  if (el.winnerAddMemberBtn) {
    el.winnerAddMemberBtn.addEventListener("click", () => {
      closeFullscreenWheel();
      void onAddWinnerToMembers();
    });
  }

  if (el.customerMemberQuickCreditBtn) {
    el.customerMemberQuickCreditBtn.addEventListener("click", () => {
      const memId = el.customerMemberQuickCreditBtn.dataset.memberId;
      if (memId) {
        setActiveTab("members");
        openCreditModal(memId, el.purchaseAmount.value);
      }
    });
  }

  bindMembersEvents();

  el.saveBtn.addEventListener("click", onSaveClick);
  el.downloadBtn.addEventListener("click", onDownloadCoupon);
  el.shareBtn.addEventListener("click", onShareWhatsApp);

  el.addPrizeBtn.addEventListener("click", () => {
    syncConditionDraftFromEditor();
    const cond = getActiveCondition();
    if (cond) {
      cond.prizes.push({
        id: uid(),
        name: "",
        probability: 0,
        enabled: true
      });
    }
    renderPrizeTable();
    persistSettings();
    refreshUI();
  });

  if (el.addMembershipTypeBtn) {
    el.addMembershipTypeBtn.addEventListener("click", () => addMembershipTypeRow());
  }

  // Condition management events
  if (el.addConditionBtn) {
    el.addConditionBtn.addEventListener("click", onAddCondition);
  }
  if (el.deleteConditionBtn) {
    el.deleteConditionBtn.addEventListener("click", onDeleteCondition);
  }
  if (el.conditionTabsBar) {
    el.conditionTabsBar.addEventListener("click", (e) => {
      const chip = e.target.closest(".condition-tab-chip");
      if (!chip) return;
      const condId = chip.dataset.conditionId;
      if (condId) {
        switchSettingsCondition(condId);
      }
    });
  }
  if (el.conditionItemNameInput) {
    el.conditionItemNameInput.addEventListener("input", syncConditionFieldsToActive);
  }
  if (el.conditionLabelInput) {
    el.conditionLabelInput.addEventListener("input", syncConditionFieldsToActive);
  }
  if (el.conditionIconInput) {
    el.conditionIconInput.addEventListener("input", syncConditionFieldsToActive);
  }
  if (el.conditionMinAmountInput) {
    el.conditionMinAmountInput.addEventListener("input", syncConditionFieldsToActive);
  }

  // Customer Spin tab: condition selector
  if (el.spinConditionSelect) {
    el.spinConditionSelect.addEventListener("change", () => {
      const condId = el.spinConditionSelect.value;
      if (condId) {
        state.selectedConditionId = condId;
        drawWheel();
        showToast(`Wheel switched to ${getConditionLabel(condId)}`, "info");
      }
    });
  }

  el.saveSettingsBtn.addEventListener("click", () => void onSaveSettings());
  if (el.testAppsScriptBtn) {
    el.testAppsScriptBtn.addEventListener("click", () => void testAppsScriptConnection());
  }
  el.resetDataBtn.addEventListener("click", onResetData);
  el.customerName.addEventListener("input", onEntryChange);
  el.customerNumber.addEventListener("input", onEntryChange);
  el.purchaseAmount.addEventListener("input", onEntryChange);
  el.shopNameInput.addEventListener("input", () => {
    el.shopNameDisplay.textContent = safeText(el.shopNameInput.value, DEFAULT_SETTINGS.shopName);
    state.settings.shopName = (el.shopNameInput.value || "").trim();
    const cur = getCurrentRecord();
    if (cur) drawCouponFromRecord(cur);
    else drawCouponPlaceholder();
  });
  if (el.shopLogoUrlInput) {
    el.shopLogoUrlInput.addEventListener("input", () => {
      state.settings.shopLogoUrl = (el.shopLogoUrlInput.value || "").trim();
      loadShopLogo();
    });
  }

  el.manualDateToggle.addEventListener("change", () => {
    el.manualDateInput.disabled = !el.manualDateToggle.checked;
  });

  el.recordSearchInput.addEventListener("input", () => {
    state.recordsPage = 1;
    renderRecordsTable();
  });
  el.recordFilterSortSelect.addEventListener("change", () => {
    state.recordsPage = 1;
    renderRecordsTable();
  });

  if (el.pageSizeSelect) {
    el.pageSizeSelect.addEventListener("change", () => {
      const size = parseInt(el.pageSizeSelect.value, 10);
      state.recordsPageSize = size > 0 ? size : 10;
      state.recordsPage = 1;
      renderRecordsTable();
    });
  }

  if (el.firstPageBtn) {
    el.firstPageBtn.addEventListener("click", () => goToRecordsPage(1));
  }
  if (el.prevPageBtn) {
    el.prevPageBtn.addEventListener("click", () => goToRecordsPage(state.recordsPage - 1));
  }
  if (el.nextPageBtn) {
    el.nextPageBtn.addEventListener("click", () => goToRecordsPage(state.recordsPage + 1));
  }
  if (el.lastPageBtn) {
    el.lastPageBtn.addEventListener("click", () => goToRecordsPage(getLastRecordsPage()));
  }
  if (el.exportRecordsBtn) {
    el.exportRecordsBtn.addEventListener("click", exportRecordsToCSV);
  }
  el.refreshRecordsBtn.addEventListener("click", async () => {
    await loadSettingsFromSheets(false);
    await loadRecordsFromSheets(true);
  });
  el.recordsTableBody.addEventListener("click", onRecordsActionClick);
  el.recordsTableBody.addEventListener("change", onRecordSelectionChange);
  if (el.selectAllRecords) {
    el.selectAllRecords.addEventListener("change", onSelectAllVisibleChange);
  }
  if (el.applyBulkActionBtn) {
    el.applyBulkActionBtn.addEventListener("click", () => void onApplyBulkAction());
  }
  if (el.clearSelectionBtn) {
    el.clearSelectionBtn.addEventListener("click", onClearSelection);
  }

  el.editRecordForm.addEventListener("submit", onEditRecordSubmit);
  el.cancelEditBtn.addEventListener("click", closeEditModal);
  el.editModal.addEventListener("click", (event) => {
    const target = event.target;
    if (target && target.getAttribute("data-close-modal") === "true") {
      closeEditModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeEditModal();
      closeWinnerModal();
      closeViewCouponModal();
      closeAllMemberModals();
    }
  });

  if (el.couponViewModal) {
    el.couponViewModal.addEventListener("click", (event) => {
      const target = event.target;
      if (target && target.getAttribute("data-close-coupon-modal") === "true") {
        closeViewCouponModal();
      }
    });
  }
  if (el.downloadCouponBtn) {
    el.downloadCouponBtn.addEventListener("click", onDownloadViewCoupon);
  }
  if (el.shareCouponWaBtn) {
    el.shareCouponWaBtn.addEventListener("click", () => void onShareViewCouponWhatsApp());
  }

  if (el.soundToggleBtn) {
    el.soundToggleBtn.addEventListener("click", () => {
      state.soundMuted = !state.soundMuted;
      localStorage.setItem("spinwin_sound_muted", String(state.soundMuted));
      updateSoundButtonUI();
    });
    updateSoundButtonUI();
  }
}

function initTabs() {
  if (!el.tabButtons || !el.tabButtons.length || !el.tabPanels || !el.tabPanels.length) {
    el.tabButtons = Array.from(document.querySelectorAll("[data-tab-target]"));
    el.tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));
  }
  if (!el.tabButtons.length || !el.tabPanels.length) return;
  const preferred = safeText(localStorage.getItem(ACTIVE_TAB_KEY), "customer-spin");
  setActiveTab(preferred, false);
}

function setActiveTab(tabId, persist = true) {
  if (!el.tabButtons || !el.tabButtons.length || !el.tabPanels || !el.tabPanels.length) {
    el.tabButtons = Array.from(document.querySelectorAll("[data-tab-target]"));
    el.tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));
  }
  if (!el.tabButtons.length || !el.tabPanels.length) return;
  const available = el.tabPanels.map((panel) => panel.dataset.tabPanel);
  const nextTab = available.includes(tabId) ? tabId : available[0];
  if (!nextTab) return;

  el.tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tabTarget === nextTab;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });

  el.tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === nextTab;
    panel.classList.toggle("hidden", !isActive);
    panel.classList.toggle("is-active", isActive);
  });

  if (persist) {
    localStorage.setItem(ACTIVE_TAB_KEY, nextTab);
  }
  toggleTabMenu(false);

  if (nextTab === "customer-spin") {
    drawWheel();
  }
}

function toggleTabMenu(forceOpen) {
  if (!el.tabNav || !el.tabMenuToggle) return;
  const open = typeof forceOpen === "boolean" ? forceOpen : !el.tabNav.classList.contains("open");
  el.tabNav.classList.toggle("open", open);
  el.tabMenuToggle.setAttribute("aria-expanded", String(open));
}

function onEntryChange() {
  const signature = getEntrySignature();
  if (signature !== state.lastEntrySignature) {
    state.spinLockedForEntry = false;
    state.currentResultId = null;
    state.lastEntrySignature = signature;
    clearWheelWinState();
    renderResult();
    drawCouponPlaceholder();
    updateStatus("Entry changed. Ready for a new spin.");
  }
  checkCustomerMemberMatch();
  refreshUI();
}

async function onSaveSettings() {
  // Sync current condition editor fields + prize table into active condition
  syncConditionDraftFromEditor();

  // Sync membership types from the settings editor
  syncMembershipTypesFromEditor();

  // Validate that all conditions have at least one prize
  const conditions = state.settings.conditions || [];
  if (!conditions.length) {
    showToast("Please add at least one spin condition.", "error");
    return;
  }
  for (const cond of conditions) {
    if (!cond.prizes || !cond.prizes.length) {
      showToast(`Condition "${cond.itemName || "Unnamed"}" has no prizes. Add at least one.`, "error");
      return;
    }
  }

  state.settings.shopName = safeText(el.shopNameInput.value, "Lucky Shop");
  state.settings.shopLogoUrl = (el.shopLogoUrlInput.value || "").trim();
  loadShopLogo();
  state.settings.expiryHours = Math.max(0, parseInt(el.expiryHoursInput.value || "0", 10));
  state.settings.spinDuration = Math.max(2, Math.min(15, parseInt(el.spinDurationInput ? el.spinDurationInput.value : "5", 10) || 5));
  state.settings.appsScriptUrl = (el.appsScriptUrlInput && el.appsScriptUrlInput.value) ? el.appsScriptUrlInput.value.trim() : getAppsScriptUrl();
  state.settings.manualDateEnabled = !!el.manualDateToggle.checked;
  state.settings.manualDateTime = el.manualDateInput.value || "";

  // Build flat prizes from all conditions for backward compatibility
  state.settings.prizes = getAllPrizesFlat();

  persistSettings();
  renderConditionTabs();
  renderConditionEditor();
  renderPrizeTable();
  renderMembershipTypeTable();
  renderMemberFormTypeOptions(el.memberFormType ? el.memberFormType.value : "");
  renderMemberFilterOptions();
  renderMembersSection();
  populateSpinConditionSelect();
  drawWheel();
  renderRecordsTable();
  renderResult();
  refreshUI();

  if (!getAppsScriptUrl()) {
    updateStatus("Settings saved locally.");
    showToast("Settings saved locally. Add Apps Script URL to sync with Google Sheets.", "info");
    return;
  }

  try {
    updateStatus("Saving settings to Google Sheets...");
    const res = await syncSaveSettings(state.settings);
    if (!res.ok) {
      throw new Error(res.message || "Settings sync failed.");
    }

    if (res.settings) {
      applySettingsFromServer(res.settings, true);
    }

    updateStatus("Settings saved to Google Sheets.");
    showToast("Settings saved to Google Sheets.", "success");
  } catch (err) {
    console.error(err);
    updateStatus("Settings saved locally. Google Sheets sync failed.");
    showToast(`Settings saved locally, but sync failed: ${err.message}`, "error");
  }
}

function onResetData() {
  const ok = confirm("Reset all local settings and prize records?");
  if (!ok) return;

  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(RECORDS_KEY);

  state.settings = loadSettings();
  state.records = [];
  state.currentResultId = null;
  state.spinning = false;
  state.spinLockedForEntry = false;
  state.lastEntrySignature = "";
  state.wheelAngle = 0;
  state.selectedRecordIds.clear();
  state.selectedConditionId = null;

  syncSettingsToInputs();
  initConditions();
  clearWheelWinState();
  renderPrizeTable();
  drawWheel();
  drawCouponPlaceholder();
  renderRecordsTable();
  renderResult();
  refreshUI();
  updateStatus("Local data reset complete.");
  showToast("Local settings and records were reset.", "info");
}

function onWheelClick(event) {
  if (state.spinning) return;
  if (!getSpinPayload()) return;
  updateStatus("Tap the big wheel to spin");
  openFullscreenWheel();
}

function getSpinPayload() {
  const customerName = safeText(el.customerName.value);
  const customerNumber = safeText(el.customerNumber.value);
  const amount = parseFloat(el.purchaseAmount.value || "0");

  if (!customerName) {
    highlightInputError(el.customerName);
    showToast("Please enter customer name to spin!", "error");
    updateStatus("Enter customer name above to spin!");
    return null;
  }
  if (!Number.isFinite(amount) || amount < 0) {
    highlightInputError(el.purchaseAmount);
    showToast("Please enter a valid purchase amount (>= 0).", "error");
    updateStatus("Enter purchase amount above to spin!");
    return null;
  }
  if (state.spinLockedForEntry) {
    showToast("This customer entry already spun once. Change name or amount for a new spin.", "info");
    updateStatus("This customer entry already spun once. Enter new details for a new spin.");
    return null;
  }

  const activeCond = getSpinCondition();
  if (!activeCond) {
    showToast("Please select a purchased item / spin condition.", "error");
    return null;
  }

  if (activeCond.minAmount && amount < activeCond.minAmount) {
    showToast(`Minimum purchase amount for "${activeCond.itemName}" is ${formatAmount(activeCond.minAmount)}.`, "error");
    return null;
  }

  const enabledPrizes = getEnabledPrizes(activeCond.prizes);
  const weightedPrizes = enabledPrizes.filter((p) => num(p.probability) > 0);

  if (!enabledPrizes.length) {
    showToast("No enabled prizes for this condition. Enable at least one prize in settings.", "error");
    return null;
  }
  if (!weightedPrizes.length) {
    showToast("All enabled prizes have 0% probability. Please set prize probability.", "error");
    return null;
  }

  const winner = chooseWeightedPrize(weightedPrizes);
  const wheelPrizes = enabledPrizes;
  const winnerIndex = wheelPrizes.findIndex((p) => p.id === winner.id);
  if (winnerIndex < 0) {
    showToast("Prize selection issue. Please save settings and try again.", "error");
    return null;
  }

  return { customerName, customerNumber, amount, activeCond, winner, wheelPrizes, winnerIndex };
}

async function onSpinClick() {
  if (state.spinning) return;
  const payload = getSpinPayload();
  if (!payload) return;
  const { customerName, customerNumber, amount, activeCond, winner, wheelPrizes, winnerIndex } = payload;

  state.spinning = true;
  if (el.wheelWrap) el.wheelWrap.classList.add("is-spinning");
  if (el.spinFullscreenWrap) el.spinFullscreenWrap.classList.add("is-spinning");
  refreshUI();
  updateStatus("Spinning lucky wheel...");
  playSpinStartSound();
  const spinDurMs = (state.settings.spinDuration || 5) * 1000;
  startSpinMusic(spinDurMs);

  await animateSpin(winnerIndex, wheelPrizes.length);
  stopSpinMusic();
  playWinFanfare();
  triggerConfetti();

  if (el.wheelWinPill) {
    el.wheelWinPill.classList.remove("hidden");
    if (el.wheelWinPillText) el.wheelWinPillText.textContent = winner.name;
  }
  if (el.wheelHint) el.wheelHint.textContent = "Winner locked in. New entry to spin again";
  drawWheel();

  const spunDate = getSpinDate();
  const expiryDate = addHours(spunDate, state.settings.expiryHours);
  const nowIso = new Date().toISOString();
  const record = {
    recordId: createRecordId(),
    shopName: state.settings.shopName,
    customerName,
    customerNumber,
    amount: round2(amount),
    prize: winner.name,
    purchasedItem: activeCond.itemName || "—",
    conditionId: activeCond.id,
    status: STATUS_PENDING,
    dateTimeIso: spunDate.toISOString(),
    expiryIso: expiryDate.toISOString(),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    synced: false
  };

  state.records.unshift(record);
  state.currentResultId = record.recordId;
  state.spinLockedForEntry = true;
  state.lastEntrySignature = getEntrySignature();
  state.spinning = false;
  if (el.wheelWrap) el.wheelWrap.classList.remove("is-spinning");
  if (el.spinFullscreenWrap) el.spinFullscreenWrap.classList.remove("is-spinning");

  persistRecords();
  renderRecordsTable();
  renderResult();
  drawCouponFromRecord(record);
  refreshUI();

  updateStatus(`Prize Won: ${record.prize}! Record ID: ${record.recordId}`);
  showToast(`Spin complete! Won: ${record.prize}`, "success");
  openWinnerModal(record);
}

async function onSaveClick() {
  const record = getCurrentRecord();
  if (!record) {
    alert("Spin first before saving.");
    return;
  }

  if (!getAppsScriptUrl()) {
    alert("Please add Apps Script Web App URL in settings.");
    return;
  }

  try {
    updateStatus("Saving to Google Sheets...");
    const res = await syncCreateRecord(record);
    if (!res.ok) {
      throw new Error(res.message || "Save failed");
    }

    markRecordSynced(record.recordId, true);
    updateStatus("Saved to Google Sheets successfully.");
    refreshUI();

    if (res.mode === "no-cors") {
      showToast("Request sent (no-cors). Check your Google Sheet to confirm.", "info");
    } else {
      showToast("Record saved to Google Sheets.", "success");
    }
  } catch (err) {
    console.error(err);
    updateStatus("Save failed. Check Apps Script deployment and URL.");
    showToast(`Save failed: ${err.message}`, "error");
  }
}

function onDownloadCoupon() {
  const record = getCurrentRecord();
  if (!record) {
    alert("Spin first to generate coupon.");
    return;
  }

  const fileName = `spin-win-${sanitizeFileName(record.customerName)}-${Date.now()}.png`;
  const dataUrl = el.couponCanvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  a.click();
}

async function onShareWhatsApp() {
  const record = getCurrentRecord();
  if (!record) {
    alert("Spin first before sharing.");
    return;
  }

  const summary = buildShareText(record);
  const blob = await canvasToBlob(el.couponCanvas);
  const fileName = `spin-win-${sanitizeFileName(record.customerName)}.png`;
  const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;

  if (navigator.share && file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: `${record.shopName} - Spin & Win`,
        text: summary,
        files: [file]
      });
      return;
    } catch (err) {
      console.warn("Web share canceled or failed", err);
    }
  }
  // Clean the customer phone number for WhatsApp (digits only, no +, spaces, dashes)
  const rawNumber = safeText(record.customerNumber);
  const cleanNumber = rawNumber.replace(/[^0-9]/g, "");
  const waUrl = cleanNumber
    ? `https://wa.me/${cleanNumber}?text=${encodeURIComponent(summary)}`
    : `https://wa.me/?text=${encodeURIComponent(summary)}`;
  window.open(waUrl, "_blank", "noopener");
}

function onRecordsActionClick(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const recordId = btn.dataset.id;
  if (!recordId) return;

  if (action === "view-coupon") {
    openViewCouponModal(recordId);
    return;
  }

  if (action === "manage-credits") {
    openRecordCreditModal(recordId);
    return;
  }

  if (action === "add-credit") {
    state.activeRecordForCredit = getRecordById(recordId);
    if (state.activeRecordForCredit) onRecordCreditAddClick();
    return;
  }

  if (action === "deduct-credit") {
    state.activeRecordForCredit = getRecordById(recordId);
    if (state.activeRecordForCredit) onRecordCreditDeductClick();
    return;
  }

  if (action === "edit") {
    const record = getRecordById(recordId);
    if (!record) return;
    openEditModal(record);
    return;
  }

  if (action === "complete") {
    void updateRecordStatus(recordId, STATUS_COMPLETED);
    return;
  }

  if (action === "reject") {
    void updateRecordStatus(recordId, STATUS_REJECTED);
    return;
  }

  if (action === "delete") {
    void deleteRecord(recordId);
  }
}

function onRecordSelectionChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.classList.contains("record-select-checkbox")) return;

  const recordId = safeText(target.dataset.id);
  if (!recordId) return;

  if (target.checked) {
    state.selectedRecordIds.add(recordId);
  } else {
    state.selectedRecordIds.delete(recordId);
  }
  updateBulkSelectionUI();
}

function onSelectAllVisibleChange() {
  if (!el.selectAllRecords) return;
  const visibleIds = getVisibleRecords().map((record) => record.recordId);
  if (el.selectAllRecords.checked) {
    visibleIds.forEach((id) => state.selectedRecordIds.add(id));
  } else {
    visibleIds.forEach((id) => state.selectedRecordIds.delete(id));
  }
  renderRecordsTable();
}

function onClearSelection() {
  state.selectedRecordIds.clear();
  renderRecordsTable();
}

async function onApplyBulkAction() {
  const action = safeText(el.bulkActionSelect && el.bulkActionSelect.value);
  const selectedIds = getSelectedExistingRecordIds();
  if (!action) {
    showToast("Choose a bulk action first.", "info");
    return;
  }
  if (!selectedIds.length) {
    showToast("Select at least one record.", "info");
    return;
  }

  if (action === "delete") {
    const confirmed = confirm(`Delete ${selectedIds.length} selected record(s)?`);
    if (!confirmed) return;
    await runBulkDelete(selectedIds);
    return;
  }

  const nextStatus = normalizeManualStatus(action);
  await runBulkStatusUpdate(selectedIds, nextStatus);
}

function getSelectedExistingRecordIds() {
  const existing = new Set(state.records.map((record) => record.recordId));
  return Array.from(state.selectedRecordIds).filter((id) => existing.has(id));
}

async function runBulkStatusUpdate(recordIds, nextStatus) {
  const nowIso = new Date().toISOString();
  let changed = 0;

  state.records = state.records.map((record) => {
    if (!recordIds.includes(record.recordId)) return record;
    changed += 1;
    return normalizeRecord({
      ...record,
      status: nextStatus,
      updatedAtIso: nowIso,
      synced: false
    });
  });

  if (!changed) return;

  persistRecords();
  renderResult();
  if (state.currentResultId) {
    const current = getCurrentRecord();
    if (current) drawCouponFromRecord(current);
  }
  renderRecordsTable();
  refreshUI();

  if (!getAppsScriptUrl()) {
    showToast(`Updated ${changed} record(s) locally. Add Apps Script URL to sync.`, "info");
    state.selectedRecordIds.clear();
    renderRecordsTable();
    return;
  }

  const syncPayload = { status: nextStatus, updatedAtIso: nowIso };
  const results = await Promise.allSettled(
    recordIds.map((recordId) => syncUpdateRecord(recordId, syncPayload))
  );

  let synced = 0;
  const syncedIds = [];
  results.forEach((result, idx) => {
    if (result.status === "fulfilled" && result.value && result.value.ok) {
      syncedIds.push(recordIds[idx]);
      synced += 1;
    }
  });

  if (syncedIds.length) {
    const syncedSet = new Set(syncedIds);
    state.records = state.records.map((record) => (
      syncedSet.has(record.recordId)
        ? { ...record, synced: true, updatedAtIso: new Date().toISOString() }
        : record
    ));
    persistRecords();
    renderRecordsTable();
    refreshUI();
  }

  const failed = recordIds.length - synced;
  if (failed > 0) {
    showToast(`Bulk status done. Synced ${synced}, failed ${failed}.`, "error");
  } else {
    showToast(`Bulk status updated for ${synced} record(s).`, "success");
  }

  state.selectedRecordIds.clear();
  renderRecordsTable();
}

async function runBulkDelete(recordIds) {
  const removeSet = new Set(recordIds);
  state.records = state.records.filter((record) => !removeSet.has(record.recordId));

  if (state.currentResultId && removeSet.has(state.currentResultId)) {
    state.currentResultId = null;
    renderResult();
    drawCouponPlaceholder();
  }

  persistRecords();
  renderRecordsTable();
  refreshUI();

  if (!getAppsScriptUrl()) {
    showToast(`Deleted ${recordIds.length} record(s) locally. Add Apps Script URL to sync.`, "info");
    state.selectedRecordIds.clear();
    renderRecordsTable();
    return;
  }

  const results = await Promise.allSettled(
    recordIds.map((recordId) => syncDeleteRecord(recordId))
  );

  let synced = 0;
  results.forEach((result) => {
    if (result.status === "fulfilled" && result.value && result.value.ok) {
      synced += 1;
    }
  });

  const failed = recordIds.length - synced;
  if (failed > 0) {
    showToast(`Bulk delete done. Synced ${synced}, failed ${failed}.`, "error");
  } else {
    showToast(`Deleted ${synced} record(s).`, "success");
  }

  state.selectedRecordIds.clear();
  renderRecordsTable();
}

async function onEditRecordSubmit(event) {
  event.preventDefault();
  const recordId = safeText(el.editRecordId.value);
  if (!recordId) return;

  const customerName = safeText(el.editCustomerName.value);
  const customerNumber = safeText(el.editCustomerNumber.value);
  const amount = num(el.editPurchaseAmount.value);
  const prize = safeText(el.editPrizeWon.value);
  const expiryIso = localInputToIso(el.editExpiryDate.value);

  if (!customerName) {
    alert("Customer name is required.");
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Purchase amount must be greater than 0.");
    return;
  }
  if (!prize) {
    alert("Prize is required.");
    return;
  }
  if (!expiryIso) {
    alert("Please choose a valid expiry date.");
    return;
  }

  const updates = {
    customerName,
    customerNumber,
    amount: round2(amount),
    prize,
    expiryIso,
    updatedAtIso: new Date().toISOString()
  };

  applyLocalRecordUpdate(recordId, updates);
  closeEditModal();
  showToast(`Record ${recordId} updated locally.`, "success");

  if (!getAppsScriptUrl()) {
    showToast("Add Apps Script URL to sync edit changes.", "info");
    return;
  }

  try {
    const res = await syncUpdateRecord(recordId, updates);
    if (!res.ok) {
      throw new Error(res.message || "Update sync failed.");
    }
    markRecordSynced(recordId, true);
    showToast(`Record ${recordId} synced to Google Sheets.`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Update sync failed: ${err.message}`, "error");
  }
}

async function updateRecordStatus(recordId, nextStatus) {
  const updates = {
    status: normalizeManualStatus(nextStatus),
    updatedAtIso: new Date().toISOString()
  };

  applyLocalRecordUpdate(recordId, updates);
  showToast(`Status set to ${updates.status}.`, "success");

  if (!getAppsScriptUrl()) {
    showToast("Add Apps Script URL to sync status updates.", "info");
    return;
  }

  try {
    const res = await syncUpdateRecord(recordId, updates);
    if (!res.ok) {
      throw new Error(res.message || "Status sync failed.");
    }
    markRecordSynced(recordId, true);
    showToast("Status synced to Google Sheets.", "success");
  } catch (err) {
    console.error(err);
    showToast(`Status sync failed: ${err.message}`, "error");
  }
}

async function deleteRecord(recordId) {
  const record = getRecordById(recordId);
  if (!record) return;

  const ok = confirm(`Delete record ${recordId} permanently?`);
  if (!ok) return;

  removeLocalRecord(recordId);
  showToast(`Record ${recordId} deleted locally.`, "info");

  if (!getAppsScriptUrl()) {
    showToast("Add Apps Script URL to sync deletions.", "info");
    return;
  }

  try {
    const res = await syncDeleteRecord(recordId);
    if (!res.ok) {
      throw new Error(res.message || "Delete sync failed.");
    }
    showToast(`Record ${recordId} deleted from Google Sheets.`, "success");
  } catch (err) {
    console.error(err);
    showToast(`Delete sync failed: ${err.message}`, "error");
  }
}

async function loadRecordsFromSheets(showToastMessage) {
  if (!getAppsScriptUrl()) {
    if (showToastMessage) showToast("Add Apps Script URL first.", "info");
    return;
  }

  try {
    const res = await apiListRecords();
    if (!res.ok) {
      throw new Error(res.message || "Failed to load records");
    }

    const serverRecords = normalizeRecords(Array.isArray(res.records) ? res.records : [])
      .map((record) => ({ ...record, synced: true }));

    const localUnsynced = state.records.filter((record) => !record.synced);
    const map = new Map();
    serverRecords.forEach((record) => map.set(record.recordId, record));
    localUnsynced.forEach((record) => {
      if (!map.has(record.recordId)) {
        map.set(record.recordId, record);
      }
    });

    state.records = Array.from(map.values()).sort((a, b) => getRecordTime(b) - getRecordTime(a));
    persistRecords();
    renderRecordsTable();
    refreshUI();

    if (showToastMessage) {
      showToast(`Loaded ${serverRecords.length} records from Google Sheets.`, "success");
    }
  } catch (err) {
    console.error(err);
    showToast(`Sync failed: ${err.message}`, "error");
  }
}

async function loadSettingsFromSheets(showToastMessage) {
  if (!getAppsScriptUrl()) {
    if (showToastMessage) showToast("Add Apps Script URL first.", "info");
    return;
  }

  try {
const res = await apiGetSettings();
    if (!res.ok) {
      throw new Error(res.message || "Failed to load settings.");
    }

    let serverSettings = res.settings;
    if (typeof serverSettings === "string") {
      try {
        serverSettings = JSON.parse(serverSettings);
      } catch (e) {
        serverSettings = null;
      }
    }

    if (!serverSettings || typeof serverSettings !== "object") {
      if (showToastMessage) {
        showToast("No saved settings found in Google Sheets yet.", "info");
      }
      return;
    }

    applySettingsFromServer(serverSettings, true);
    if (showToastMessage) {
      showToast("Settings loaded from Google Sheets.", "success");
    }
  } catch (err) {
    console.error(err);
    if (showToastMessage) {
      showToast(`Settings sync failed: ${err.message}`, "error");
    }
  }
}

async function testAppsScriptConnection() {
  const url = (el.appsScriptUrlInput ? el.appsScriptUrlInput.value : "").trim() || getAppsScriptUrl();
  if (!url) {
    showToast("Please enter a Google Apps Script URL first.", "error");
    return;
  }

  showToast("Testing connection to Google Apps Script...", "info");
  if (el.appsScriptStatusMsg) {
    el.appsScriptStatusMsg.className = "connection-status-msg";
    el.appsScriptStatusMsg.style.background = "rgba(99, 102, 241, 0.15)";
    el.appsScriptStatusMsg.style.border = "1px solid rgba(99, 102, 241, 0.35)";
    el.appsScriptStatusMsg.style.color = "#a5b4fc";
    el.appsScriptStatusMsg.textContent = "⏳ Testing connection to Google Apps Script...";
    el.appsScriptStatusMsg.classList.remove("hidden");
  }

  try {
    let res = await apiGetFromAppsScript("members", {}, 30000);

    if (res && res.ok) {
      if (el.appsScriptStatusMsg) {
        el.appsScriptStatusMsg.style.background = "rgba(16, 185, 129, 0.15)";
        el.appsScriptStatusMsg.style.border = "1px solid rgba(16, 185, 129, 0.35)";
        el.appsScriptStatusMsg.style.color = "#34d399";
        el.appsScriptStatusMsg.innerHTML = "✅ <strong>Connection Successful!</strong> Google Apps Script backend is active with full Members Club & Ledger support.";
      }
      showToast("Connection successful! Full backend support active.", "success");
      return;
    }

    if (res && res.message && (res.message.includes("Unknown") || res.message.includes("action"))) {
      if (el.appsScriptStatusMsg) {
        el.appsScriptStatusMsg.style.background = "rgba(239, 68, 68, 0.18)";
        el.appsScriptStatusMsg.style.border = "1px solid rgba(239, 68, 68, 0.35)";
        el.appsScriptStatusMsg.style.color = "#fca5a5";
        el.appsScriptStatusMsg.innerHTML = "❌ <strong>Outdated Script Deployed:</strong> This URL is still running the old script version without Members support.<br><br>👉 <strong>Fix:</strong> In Google Apps Script, click <strong>Deploy &gt; Manage deployments &gt; Edit (pencil) &gt; Version: New version &gt; Deploy</strong>.<br>Or if you created a <em>New deployment</em>, copy that new URL and paste it above.";
      }
      showToast("Outdated Apps Script version detected. Please redeploy.", "error", 6000);
      return;
    }

    if (el.appsScriptStatusMsg) {
      el.appsScriptStatusMsg.style.background = "rgba(245, 158, 11, 0.15)";
      el.appsScriptStatusMsg.style.border = "1px solid rgba(245, 158, 11, 0.35)";
      el.appsScriptStatusMsg.style.color = "#fbbf24";
      el.appsScriptStatusMsg.textContent = `⚠️ Response received: ${res && res.message ? res.message : "Check script deployment permissions (Who has access: Anyone)."}`;
    }
  } catch (err) {
    if (el.appsScriptStatusMsg) {
      el.appsScriptStatusMsg.style.background = "rgba(239, 68, 68, 0.18)";
      el.appsScriptStatusMsg.style.border = "1px solid rgba(239, 68, 68, 0.35)";
      el.appsScriptStatusMsg.style.color = "#fca5a5";
      el.appsScriptStatusMsg.textContent = `❌ Connection error: ${err.message}`;
    }
    showToast(`Connection error: ${err.message}`, "error");
  }
}

async function pushAllMembersToSheets(showToastMessage = true) {
  if (!getAppsScriptUrl()) {
    if (showToastMessage) showToast("Add Apps Script URL in Settings first.", "error");
    return;
  }

  if (!state.members.length) {
    if (showToastMessage) showToast("No members found to save to Google Sheets.", "info");
    return;
  }

  if (showToastMessage) {
    showToast(`Saving ${state.members.length} member(s) to Google Sheets...`, "info");
  }

  try {
    const res = await syncAllMembersToSheets();
    if (!res || !res.ok) {
      if (res && res.message && (res.message.includes("Missing required fields") || res.message.includes("Unknown"))) {
        showToast("⚠️ Outdated Web App: Deploy a New Version in Google Sheets.", "error", 8000);
        throw new Error("Apps Script Web App is outdated. Please deploy the updated apps_script.gs in Google Sheets.");
      }
      throw new Error((res && res.message) || "Failed to save members to Google Sheets.");
    }

    if (showToastMessage) {
      showToast(`Saved ${state.members.length} member(s) to Google Sheets successfully!`, "success");
    }
    markMembersSyncedAll();
  } catch (err) {
    console.error("pushAllMembersToSheets error:", err);
    if (showToastMessage) {
      showToast(`Save to Sheet failed: ${err.message}`, "error");
    }
  }
}

async function loadMembersFromSheets(showToastMessage) {
  if (!getAppsScriptUrl()) {
    if (showToastMessage) showToast("Add Apps Script URL in Settings to sync with Google Sheets.", "info");
    return;
  }

  if (showToastMessage) {
    showToast("Syncing members with Google Sheets...", "info");
  }

  try {
    const res = await apiListMembers();
    if (!res.ok) {
      if (res.message && (res.message.includes("Unknown") || res.message.includes("action"))) {
        showToast("⚠️ Outdated Web App: Deploy a New Version in Google Sheets.", "error", 8000);
        throw new Error("Apps Script Web App is outdated. Deploy the updated apps_script.gs in Google Sheets.");
      }
      throw new Error(res.message || "Failed to load members from Google Sheets.");
    }

    const serverMembers = Array.isArray(res.members) ? res.members : [];
    const localMap = new Map();
    state.members.forEach((lm) => localMap.set(String(lm.id), lm));

    const map = new Map();
    serverMembers.forEach((m) => {
      const normServer = normalizeMember(m);
      const existingLocal = localMap.get(String(normServer.id));
      if (existingLocal && !existingLocal.synced) {
        // Local has unsynced point updates from POS / lightbox - retain local!
        map.set(String(normServer.id), existingLocal);
      } else {
        map.set(String(normServer.id), normServer);
      }
    });

    state.members.forEach((localM) => {
      if (!map.has(String(localM.id))) {
        map.set(String(localM.id), localM);
        if (!localM.synced) {
          try { syncSaveMember(localM); } catch (e) { }
        }
      }
    });

    state.members = Array.from(map.values()).sort((a, b) => new Date(b.updatedAtIso || b.createdAtIso).getTime() - new Date(a.updatedAtIso || a.createdAtIso).getTime());
    persistMembers();
    renderMembersSection();
    refreshUI();

    if (showToastMessage) {
      showToast(`Synced ${state.members.length} member(s) with Google Sheets.`, "success");
    }
  } catch (err) {
    console.warn("Members cloud sync warning:", err);
    if (showToastMessage) {
      showToast(`Members sync: ${err.message}`, "error");
    }
  }
}

function applySettingsFromServer(serverSettings, keepCurrentUrl = true) {
  const currentUrl = safeText(state.settings.appsScriptUrl);
  const currentConditions = state.settings.conditions; // Preserve local conditions
  const next = { ...(serverSettings || {}) };
  if (keepCurrentUrl && !safeText(next.appsScriptUrl)) {
    next.appsScriptUrl = currentUrl;
  }
  // Google Sheets may store either newer "conditions" or older flat "prizes".
  // Import the flat format by rebuilding a single default condition.
  if (!Array.isArray(next.conditions) || !next.conditions.length) {
    if (Array.isArray(next.prizes) && next.prizes.length) {
      next.conditions = [{
        id: uid(),
        itemName: "Default",
        label: "Default Wheel",
        icon: "🎁",
        minAmount: 0,
        prizes: next.prizes
          .filter((p) => p && (p.name || p.prize || p.label) && num(p.probability) > 0)
          .map((p) => ({
            id: p.id || uid(),
            name: p.name || p.prize || p.label,
            probability: Math.max(0, num(p.probability)),
            enabled: p.enabled !== false
          }))
      }];
    } else {
      // Preserve local conditions if server has neither format
      next.conditions = currentConditions;
    }
  }

  state.settings = mergeSettings(next);
  state.settings.prizes = getAllPrizesFlat();
  persistSettings();
  syncSettingsToInputs();
  initConditions();
  renderPrizeTable();
  populateSpinConditionSelect();
  drawWheel();
  renderResult();
  refreshUI();
}

function syncSettingsToInputs() {
  el.shopNameInput.value = state.settings.shopName || "";
  el.shopLogoUrlInput.value = state.settings.shopLogoUrl || "";
  loadShopLogo();
  el.expiryHoursInput.value = String(num(state.settings.expiryHours));
  if (el.spinDurationInput) {
    el.spinDurationInput.value = String(state.settings.spinDuration || 5);
  }
  updateSpinPillsUI();
  if (el.appsScriptUrlInput) el.appsScriptUrlInput.value = state.settings.appsScriptUrl || getAppsScriptUrl();
  el.manualDateToggle.checked = !!state.settings.manualDateEnabled;
  el.manualDateInput.value = state.settings.manualDateTime || "";
  el.manualDateInput.disabled = !state.settings.manualDateEnabled;
  renderMembershipTypeTable();
  renderMemberFormTypeOptions(el.memberFormType ? el.memberFormType.value : "");
  renderMemberFilterOptions();
}

function updateStatus(msg) {
  if (el.wheelHint) el.wheelHint.textContent = msg || "";
}

function renderPrizeTable() {
  el.prizeTableBody.innerHTML = "";
  const cond = getActiveCondition();
  const prizes = cond ? cond.prizes : [];
  prizes.forEach((prize) => {
    const row = el.prizeRowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.id = prize.id;
    row.querySelector(".prize-name-input").value = prize.name;
    row.querySelector(".prize-prob-input").value = String(num(prize.probability));
    row.querySelector(".prize-enabled-input").checked = !!prize.enabled;
    row.querySelector(".remove-prize-btn").addEventListener("click", () => {
      syncConditionDraftFromEditor();
      const activeCond = getActiveCondition();
      if (activeCond) {
        activeCond.prizes = activeCond.prizes.filter((p) => p.id !== prize.id);
      }
      renderPrizeTable();
      persistSettings();
      drawWheel();
      refreshUI();
    });
    el.prizeTableBody.appendChild(row);
  });
  updateConditionProbSummary();
}

function collectPrizesFromTable() {
  const rows = Array.from(el.prizeTableBody ? el.prizeTableBody.querySelectorAll("tr") : []);
  return rows.map((row) => {
    const id = row.dataset.id || uid();
    const name = safeText(row.querySelector(".prize-name-input").value, "Unnamed Prize");
    const probabilityRaw = row.querySelector(".prize-prob-input").value;
    const probability = Math.max(0, num(probabilityRaw));
    const enabled = !!row.querySelector(".prize-enabled-input").checked;
    return { id, name, probability, enabled };
  });
}

function syncPrizeDraftFromTable() {
  const hasRows = el.prizeTableBody && el.prizeTableBody.querySelector("tr");
  if (!hasRows) return;
  const cond = getActiveCondition();
  if (cond) {
    cond.prizes = collectPrizesFromTable();
  }
}

/* ==================== MEMBERSHIP TYPES ==================== */

function getMembershipTypes() {
  if (!Array.isArray(state.settings.membershipTypes) || !state.settings.membershipTypes.length) {
    state.settings.membershipTypes = DEFAULT_SETTINGS.membershipTypes.map((t) => ({ ...t }));
  }
  return state.settings.membershipTypes;
}

function findMembershipTypeByName(name) {
  const target = safeText(name).toLowerCase();
  return getMembershipTypes().find((t) => safeText(t.name).toLowerCase() === target) || null;
}

function renderMembershipTypeTable() {
  if (!el.membershipTypeTableBody || !el.membershipTypeRowTemplate) return;
  el.membershipTypeTableBody.innerHTML = "";
  const types = getMembershipTypes();
  types.forEach((type) => {
    const row = el.membershipTypeRowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.id = type.id;
    row.querySelector(".mt-icon-input").value = type.icon || "";
    row.querySelector(".mt-name-input").value = type.name || "";
    row.querySelector(".remove-mt-btn").addEventListener("click", () => {
      removeMembershipType(type.id);
    });
    el.membershipTypeTableBody.appendChild(row);
  });
}

function collectMembershipTypesFromTable() {
  const rows = Array.from(el.membershipTypeTableBody ? el.membershipTypeTableBody.querySelectorAll("tr") : []);
  const seen = new Set();
  const types = [];
  rows.forEach((row) => {
    const name = safeText(row.querySelector(".mt-name-input").value);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const id = row.dataset.id || uid();
    const icon = safeText(row.querySelector(".mt-icon-input").value);
    types.push({ id, name, icon: icon || "🏅" });
  });
  return types;
}

function syncMembershipTypesFromEditor() {
  if (!el.membershipTypeTableBody || !el.membershipTypeTableBody.querySelector("tr")) return;
  const types = collectMembershipTypesFromTable();
  if (types.length) {
    state.settings.membershipTypes = types;
  }
}

function addMembershipTypeRow() {
  syncMembershipTypesFromEditor();
  getMembershipTypes().push({ id: uid(), name: "", icon: "🏅" });
  renderMembershipTypeTable();
  const rows = el.membershipTypeTableBody.querySelectorAll("tr");
  const last = rows[rows.length - 1];
  if (last) {
    const input = last.querySelector(".mt-name-input");
    if (input) input.focus();
  }
}

function removeMembershipType(id) {
  syncMembershipTypesFromEditor();
  const types = getMembershipTypes();
  if (types.length <= 1) {
    showToast("At least one membership type is required.", "error");
    return;
  }
  state.settings.membershipTypes = types.filter((t) => t.id !== id);
  renderMembershipTypeTable();
}

function renderMemberFormTypeOptions(selectedName = "") {
  if (!el.memberFormType) return;
  const types = getMembershipTypes();
  const desired = selectedName || "Direct Member";
  el.memberFormType.innerHTML = "";
  types.forEach((type) => {
    const opt = document.createElement("option");
    opt.value = type.name;
    opt.textContent = `${type.icon ? type.icon + " " : ""}${type.name}`;
    el.memberFormType.appendChild(opt);
  });
  const exists = types.some((t) => t.name === desired);
  el.memberFormType.value = exists ? desired : (types[0] ? types[0].name : "");
}

function renderMemberFilterOptions() {
  if (!el.memberFilterSelect) return;
  const current = el.memberFilterSelect.value || state.memberFilter || "all";
  const types = getMembershipTypes();
  el.memberFilterSelect.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All Members";
  el.memberFilterSelect.appendChild(allOpt);

  types.forEach((type) => {
    const opt = document.createElement("option");
    opt.value = `type:${type.name}`;
    opt.textContent = `${type.icon ? type.icon + " " : ""}${type.name}`;
    el.memberFilterSelect.appendChild(opt);
  });

  const balOpt = document.createElement("option");
  balOpt.value = "has_balance";
  balOpt.textContent = "Has Balance (> 0)";
  el.memberFilterSelect.appendChild(balOpt);

  const valid = Array.from(el.memberFilterSelect.options).some((o) => o.value === current);
  el.memberFilterSelect.value = valid ? current : "all";
  state.memberFilter = el.memberFilterSelect.value;
}

function refreshUI() {
  const currentRecord = getCurrentRecord();

  el.saveBtn.disabled = !currentRecord;
  el.downloadBtn.disabled = !currentRecord;
  el.shareBtn.disabled = !currentRecord;
  el.shopNameDisplay.textContent = state.settings.shopName || "Lucky Shop";
  el.saveBtn.innerHTML = currentRecord && currentRecord.synced
    ? `<span class="btn-icon">🔄</span> Re-Sync to Sheets`
    : `<span class="btn-icon">💾</span> Save to Sheets`;
}

function renderResult() {
  const record = getCurrentRecord();
  if (!record) {
    el.resultEmpty.classList.remove("hidden");
    el.resultDetails.classList.add("hidden");
    return;
  }

  el.resultEmpty.classList.add("hidden");
  el.resultDetails.classList.remove("hidden");

  el.resultRecordId.textContent = record.recordId;
  el.resultShop.textContent = record.shopName || state.settings.shopName;
  el.resultCustomer.textContent = record.customerName;
  el.resultCustomerNumber.textContent = record.customerNumber || "-";
  el.resultAmount.textContent = formatAmount(record.amount);
  el.resultPrize.textContent = record.prize;
  el.resultStatus.textContent = getEffectiveStatus(record);
  el.resultDate.textContent = formatIsoDateTime(record.dateTimeIso);
  el.resultExpiry.textContent = formatIsoDateTime(record.expiryIso);
}

function renderRecordsTable() {
  pruneSelectionForMissingRecords();
  const allFiltered = getAllFilteredRecords();
  const totalCount = allFiltered.length;
  const pageSize = state.recordsPageSize || 10;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  if (state.recordsPage > totalPages) state.recordsPage = totalPages;
  if (state.recordsPage < 1) state.recordsPage = 1;

  const startIndex = (state.recordsPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const visible = allFiltered.slice(startIndex, endIndex);

  const counts = getStatusCounts(state.records);
  const selectedCount = getSelectedExistingRecordIds().length;
  el.recordsSummary.textContent =
    `Total: ${state.records.length} | Filtered: ${totalCount} | Selected: ${selectedCount} | Pending: ${counts.pending} | Completed: ${counts.completed} | Rejected: ${counts.rejected} | Expired: ${counts.expired}`;

  el.recordsTableBody.innerHTML = "";
  if (!visible.length) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 11;
    td.textContent = totalCount === 0 ? "No matching prize records found." : "No records on this page.";
    td.className = "centered";
    row.appendChild(td);
    el.recordsTableBody.appendChild(row);
    updateBulkSelectionUI();
    renderPaginationControls(totalCount, 0, 0, totalPages);
    return;
  }

  visible.forEach((record) => {
    const tr = document.createElement("tr");
    const effectiveStatus = getEffectiveStatus(record);
    const isSelected = state.selectedRecordIds.has(record.recordId);
    if (isSelected) {
      tr.classList.add("record-row-selected");
    }

    const selectTd = document.createElement("td");
    selectTd.className = "centered";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "record-select-checkbox";
    check.dataset.id = record.recordId;
    check.checked = isSelected;
    check.setAttribute("aria-label", `Select record ${record.recordId}`);
    selectTd.appendChild(check);
    tr.appendChild(selectTd);

    // ID
    const tdId = document.createElement("td");
    tdId.innerHTML = `<span class="text-truncate mono" style="max-width:90px;" title="${record.recordId}">${record.recordId}</span>`;
    tr.appendChild(tdId);

    // Customer cell with interactive member loyalty badge
    const member = (record.customerNumber ? findMemberByPhone(record.customerNumber) : null) || findMemberByName(record.customerName);
    const custTd = document.createElement("td");
    const custWrap = document.createElement("div");
    custWrap.className = "customer-cell-wrap";

    const custNameSpan = document.createElement("span");
    custNameSpan.className = "customer-name-text text-truncate";
    custNameSpan.style.maxWidth = "110px";
    custNameSpan.textContent = record.customerName;
    custNameSpan.title = record.customerName;
    custWrap.appendChild(custNameSpan);


    const badgeBtn = document.createElement("button");
    badgeBtn.type = "button";
    badgeBtn.className = member ? "member-quick-badge is-member" : "member-quick-badge not-member";
    badgeBtn.innerHTML = member ? "👑 Member" : "+ Member";
    badgeBtn.title = member ? `${member.name} (${member.credits || 0} pts)` : "Click to register as member";
    badgeBtn.addEventListener("click", () => {
      if (member) {
        setActiveTab("members");
        openCreditModal(member.id);
      } else {
        openNewMemberModal({ name: record.customerName, phone: record.customerNumber });
      }
    });
    custWrap.appendChild(badgeBtn);
    custTd.appendChild(custWrap);
    tr.appendChild(custTd);

    // Phone
    const tdPhone = document.createElement("td");
    const rawPhone = safeText(record.customerNumber);
    const cleanPhone = rawPhone.replace(/[^0-9]/g, "");
    if (cleanPhone) {
      tdPhone.innerHTML = `<div class="phone-cell-wrap">
        <a href="tel:${rawPhone}" class="phone-icon-btn btn-call" title="Call ${rawPhone}">📞</a>
        <a href="https://wa.me/${cleanPhone}" target="_blank" rel="noopener" class="phone-icon-btn btn-wa" title="WhatsApp ${rawPhone}">💬</a>
        <span class="phone-number-text">${rawPhone}</span>
      </div>`;
    } else {
      tdPhone.textContent = "—";
    }
    tr.appendChild(tdPhone);

    // Purchased Item
    const tdItem = document.createElement("td");
    tdItem.innerHTML = `<span class="text-truncate" style="max-width:110px;" title="${record.purchasedItem || "—"}">${record.purchasedItem || "—"}</span>`;
    tr.appendChild(tdItem);

    // Bill Amount
    const tdAmount = document.createElement("td");
    tdAmount.innerHTML = `<strong style="color:#fbbf24;">${formatAmount(record.amount)}</strong>`;
    tr.appendChild(tdAmount);

    // Prize
    const tdPrize = document.createElement("td");
    tdPrize.innerHTML = `<span class="text-truncate" style="max-width:120px;" title="${record.prize}">${record.prize}</span>`;
    tr.appendChild(tdPrize);

    // Status
    const tdStatus = document.createElement("td");
    const stClass = effectiveStatus.toLowerCase();
    tdStatus.innerHTML = `<span class="status-pill status-${stClass}">${effectiveStatus}</span>`;
    tr.appendChild(tdStatus);

    // Date
    const tdDate = document.createElement("td");
    tdDate.textContent = formatIsoDateTime(record.dateTimeIso);
    tr.appendChild(tdDate);

    // Expiry
    const tdExpiry = document.createElement("td");
    tdExpiry.textContent = formatIsoDateTime(record.expiryIso);
    tr.appendChild(tdExpiry);

    // Actions
    const tdActions = document.createElement("td");
    tdActions.className = "centered";
tdActions.innerHTML = `<div class="record-actions">
      <button type="button" class="btn btn-ghost" data-action="view-coupon" data-id="${record.recordId}" title="View Gift Card">👁️</button>
      <button type="button" class="btn btn-ghost" data-action="manage-credits" data-id="${record.recordId}" title="Loyalty Credits">⭐</button>
      <button type="button" class="btn btn-ghost" data-action="edit" data-id="${record.recordId}" title="Edit Record">✏️</button>
      <button type="button" class="btn btn-ghost" data-action="complete" data-id="${record.recordId}" title="Mark Completed">✅</button>
      <button type="button" class="btn btn-ghost" data-action="reject" data-id="${record.recordId}" title="Mark Rejected">❌</button>
      <button type="button" class="btn btn-danger" data-action="delete" data-id="${record.recordId}" title="Delete Record">🗑️</button>
    </div>`;
    tr.appendChild(tdActions);

    el.recordsTableBody.appendChild(tr);
  });

  updateBulkSelectionUI();
  renderPaginationControls(totalCount, startIndex, visible.length, totalPages);
}

/* ==================== HELPER & UTILITY FUNCTIONS ==================== */

function byId(id) {
  return document.getElementById(id);
}

function uid() {
  return "u_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

function num(val) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : 0;
}

function round2(val) {
  return Math.round((num(val) + Number.EPSILON) * 100) / 100;
}

function safeText(str, fallback = "") {
  if (str === null || str === undefined) return fallback;
  const trimmed = String(str).trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function formatAmount(amt) {
  return "₹" + (num(amt)).toFixed(2);
}

function formatIsoDateTime(isoStr) {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  } catch (e) {
    return "—";
  }
}

function localInputToIso(val) {
  if (!val) return "";
  try {
    return new Date(val).toISOString();
  } catch (e) {
    return "";
  }
}

function isoToLocalInput(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (e) {
    return "";
  }
}

function getActiveShopId() {
  try {
    if (typeof authManager !== 'undefined' && authManager && authManager.shopId) {
      return authManager.shopId;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const urlShopId = urlParams.get('shop_id');
    const visitorShopId = sessionStorage.getItem('visitorShopId');
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    return urlShopId || visitorShopId || currentUser.shop_id || '';
  } catch (e) {
    return '';
  }
}

function getSettingsKey() {
  const shopId = getActiveShopId();
  return shopId ? `spinwin_settings_${shopId}` : SETTINGS_KEY;
}

function getRecordsKey() {
  const shopId = getActiveShopId();
  return shopId ? `spinwin_history_${shopId}` : RECORDS_KEY;
}

function getMembersKey() {
  const shopId = getActiveShopId();
  return shopId ? `spinwin_members_${shopId}` : MEMBERS_KEY;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(getSettingsKey());
    if (!raw) return mergeSettings(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return mergeSettings(parsed);
  } catch (e) {
    return mergeSettings(DEFAULT_SETTINGS);
  }
}

function mergeSettings(userSettings) {
  const s = { ...DEFAULT_SETTINGS, ...(userSettings || {}) };
  if (!Array.isArray(s.conditions) || !s.conditions.length) {
    s.conditions = DEFAULT_SETTINGS.conditions;
  }
  if (!Array.isArray(s.membershipTypes) || !s.membershipTypes.length) {
    s.membershipTypes = DEFAULT_SETTINGS.membershipTypes.map((t) => ({ ...t }));
  } else {
    s.membershipTypes = s.membershipTypes
      .filter((t) => t && t.name)
      .map((t) => ({ id: t.id || uid(), name: String(t.name), icon: t.icon || "🏅" }));
    if (!s.membershipTypes.length) {
      s.membershipTypes = DEFAULT_SETTINGS.membershipTypes.map((t) => ({ ...t }));
    }
  }
  return s;
}

function persistSettings() {
  localStorage.setItem(getSettingsKey(), JSON.stringify(state.settings));
  const url = getAppsScriptUrl();
  if (url) persistAppsScriptUrl(url);
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(getRecordsKey());
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? normalizeRecords(arr) : [];
  } catch (e) {
    return [];
  }
}

function persistRecords() {
  localStorage.setItem(getRecordsKey(), JSON.stringify(state.records));
}

function loadMembers() {
  try {
    const raw = localStorage.getItem(getMembersKey());
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(normalizeMember) : [];
  } catch (e) {
    return [];
  }
}

function persistMembers() {
  localStorage.setItem(getMembersKey(), JSON.stringify(state.members));
}

function getAppsScriptUrl() {
  const shopId = getActiveShopId();
  const secondaryUrl = shopId ? (localStorage.getItem(`gs_secondary_sheet_url_${shopId}`) || "") : "";
  const spinShopUrl = shopId ? (localStorage.getItem(`spinwin_apps_script_url_${shopId}`) || "") : "";
  const globalUrl = localStorage.getItem(APPS_SCRIPT_URL_KEY) || "";
  const settingsUrl = (state.settings && state.settings.appsScriptUrl) || "";
  const candidate = secondaryUrl || spinShopUrl || globalUrl || settingsUrl || "";
  return candidate;
}

function persistAppsScriptUrl(url) {
  if (!url) return;
  const shopId = getActiveShopId();
  if (shopId) {
    localStorage.setItem(`spinwin_apps_script_url_${shopId}`, url);
    localStorage.setItem(`gs_secondary_sheet_url_${shopId}`, url);
  }
  localStorage.setItem(APPS_SCRIPT_URL_KEY, url);
}

/* ==================== CONDITION MANAGEMENT ==================== */

function initConditions() {
  if (!Array.isArray(state.settings.conditions) || !state.settings.conditions.length) {
    state.settings.conditions = DEFAULT_SETTINGS.conditions;
  }
  if (!state.selectedConditionId && state.settings.conditions[0]) {
    state.selectedConditionId = state.settings.conditions[0].id;
  }
  populateSpinConditionSelect();
  renderConditionTabs();
  renderConditionEditor();
}

function getActiveCondition() {
  const list = state.settings.conditions || [];
  return list.find((c) => c.id === state.selectedConditionId) || list[0] || null;
}

function getSpinCondition() {
  const condId = el.spinConditionSelect ? el.spinConditionSelect.value : state.selectedConditionId;
  const list = state.settings.conditions || [];
  return list.find((c) => c.id === condId) || getActiveCondition();
}

function getConditionLabel(id) {
  const list = state.settings.conditions || [];
  const found = list.find((c) => c.id === id);
  return found ? (found.label || found.itemName || "Wheel") : "Wheel";
}

function switchSettingsCondition(condId) {
  syncConditionDraftFromEditor();
  state.selectedConditionId = condId;
  renderConditionTabs();
  renderConditionEditor();
  renderPrizeTable();
  drawWheel();
}

function onAddCondition() {
  syncConditionDraftFromEditor();
  const count = (state.settings.conditions || []).length + 1;
  const newCond = {
    id: uid(),
    itemName: `Item ${count}`,
    label: `Item ${count} (Wheel ${count})`,
    icon: "🎁",
    minAmount: 0,
    prizes: [
      { id: uid(), name: "10% Discount", probability: 40, enabled: true },
      { id: uid(), name: "Special Gift", probability: 30, enabled: true },
      { id: uid(), name: "Try Again", probability: 29.9, enabled: true },
      { id: uid(), name: "Grand Prize", probability: 0.1, enabled: true }
    ]
  };
  state.settings.conditions.push(newCond);
  state.selectedConditionId = newCond.id;
  persistSettings();
  initConditions();
  renderPrizeTable();
  drawWheel();
  showToast(`Added new condition: ${newCond.label}`, "success");
}

function onDeleteCondition() {
  const list = state.settings.conditions || [];
  if (list.length <= 1) {
    showToast("At least one spin condition is required!", "error");
    return;
  }
  const active = getActiveCondition();
  if (!active) return;
  const confirmed = confirm(`Delete condition "${active.label}"?`);
  if (!confirmed) return;

  state.settings.conditions = list.filter((c) => c.id !== active.id);
  state.selectedConditionId = state.settings.conditions[0].id;
  persistSettings();
  initConditions();
  renderPrizeTable();
  drawWheel();
  showToast("Condition deleted.", "info");
}

function syncConditionFieldsToActive() {
  const cond = getActiveCondition();
  if (!cond) return;
  if (el.conditionItemNameInput) cond.itemName = safeText(el.conditionItemNameInput.value, cond.itemName);
  if (el.conditionLabelInput) cond.label = safeText(el.conditionLabelInput.value, cond.label);
  if (el.conditionIconInput) cond.icon = safeText(el.conditionIconInput.value, "🎯");
  if (el.conditionMinAmountInput) cond.minAmount = Math.max(0, num(el.conditionMinAmountInput.value));
  renderConditionTabs();
  populateSpinConditionSelect();
}

function syncConditionDraftFromEditor() {
  syncConditionFieldsToActive();
  syncPrizeDraftFromTable();
}

function updateConditionProbSummary() {
  if (!el.conditionProbSummary) return;
  const cond = getActiveCondition();
  if (!cond) return;
  const sum = (cond.prizes || []).reduce((acc, p) => acc + (p.enabled ? num(p.probability) : 0), 0);
  const rounded = Math.round(sum * 100) / 100;
  el.conditionProbSummary.textContent = `Total Probability: ${rounded}%`;
  el.conditionProbSummary.style.color = Math.abs(rounded - 100) < 0.1 ? "#34d399" : "#fbbf24";
}

function renderConditionTabs() {
  if (!el.conditionTabsBar) return;
  el.conditionTabsBar.innerHTML = "";
  const list = state.settings.conditions || [];
  list.forEach((cond) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `condition-tab-chip ${cond.id === state.selectedConditionId ? "is-active" : ""}`;
    chip.dataset.conditionId = cond.id;
    chip.innerHTML = `<span class="chip-icon">${cond.icon || "🎯"}</span><span class="chip-label">${cond.label || cond.itemName}</span>`;
    el.conditionTabsBar.appendChild(chip);
  });
}

function renderConditionEditor() {
  const cond = getActiveCondition();
  if (!cond || !el.conditionEditorCard) return;
  if (el.conditionEditorTitle) el.conditionEditorTitle.textContent = `Condition: ${cond.label || cond.itemName}`;
  if (el.conditionItemNameInput) el.conditionItemNameInput.value = cond.itemName || "";
  if (el.conditionLabelInput) el.conditionLabelInput.value = cond.label || "";
  if (el.conditionIconInput) el.conditionIconInput.value = cond.icon || "";
  if (el.conditionMinAmountInput) el.conditionMinAmountInput.value = cond.minAmount ? String(cond.minAmount) : "";
}

function populateSpinConditionSelect() {
  if (!el.spinConditionSelect) return;
  const list = state.settings.conditions || [];
  const currentVal = el.spinConditionSelect.value;
  el.spinConditionSelect.innerHTML = "";
  list.forEach((cond) => {
    const opt = document.createElement("option");
    opt.value = cond.id;
    opt.textContent = `${cond.icon || "🛍️"} ${cond.label || cond.itemName}`;
    el.spinConditionSelect.appendChild(opt);
  });

  if (currentVal && list.some((c) => c.id === currentVal)) {
    el.spinConditionSelect.value = currentVal;
  } else if (state.selectedConditionId) {
    el.spinConditionSelect.value = state.selectedConditionId;
  }
}

function getAllPrizesFlat() {
  const list = state.settings.conditions || [];
  const flat = [];
  list.forEach((cond) => {
    (cond.prizes || []).forEach((p) => flat.push(p));
  });
  return flat.length ? flat : DEFAULT_SETTINGS.prizes;
}

/* ==================== WHEEL CANVAS & ANIMATION ==================== */

const SEGMENT_COLORS = [
  ["#f59e0b", "#d97706"],
  ["#6366f1", "#4f46e5"],
  ["#10b981", "#059669"],
  ["#ef4444", "#dc2626"],
  ["#8b5cf6", "#7c3aed"],
  ["#ec4899", "#db2777"],
  ["#06b6d4", "#0891b2"],
  ["#f97316", "#ea580c"]
];

function shade(hex, amt) {
  const num = parseInt(String(hex).replace("#", ""), 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  r = Math.max(0, Math.min(255, Math.round(r + amt * 255)));
  g = Math.max(0, Math.min(255, Math.round(g + amt * 255)));
  b = Math.max(0, Math.min(255, Math.round(b + amt * 255)));
  return `rgb(${r},${g},${b})`;
}

function drawWheel() {
  const canvas = el.wheelCanvas;
  if (!canvas) return;
  const ctx = wheelCtx || canvas.getContext("2d");
  drawWheelCore(ctx, canvas.width, canvas.height, performance.now());
}

function drawWheelCore(ctx, w, h, now) {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(cx, cy) - 14;
  const scale = Math.max(1, Math.min(2.4, Math.min(w, h) / 480));
  state.rimPhase = now * 0.004;

  ctx.clearRect(0, 0, w, h);

  const activeCond = getSpinCondition();
  const prizes = getEnabledPrizes(activeCond ? activeCond.prizes : []);
  if (!prizes.length) {
    ctx.save();
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = "#94a3b8";
    ctx.font = `bold ${Math.round(18 * scale)}px 'Plus Jakarta Sans', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("No Prizes Configured", cx, cy);
    ctx.restore();
    return;
  }

  const n = prizes.length;
  const arc = (2 * Math.PI) / n;

  // Ambient backlight (screen space)
  const ambient = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 1.3);
  ambient.addColorStop(0, "rgba(245,158,11,0.12)");
  ambient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, w, h);

  // Soft cast shadow under the wheel (screen space)
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.fillStyle = "#10151f";
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(state.wheelAngle);

  // ---- Outer metallic gold frame ----
  const frameIn = R * 0.862;
  const frameGrad = ctx.createRadialGradient(0, 0, frameIn, 0, 0, R);
  frameGrad.addColorStop(0, "#78350f");
  frameGrad.addColorStop(0.32, "#d97706");
  frameGrad.addColorStop(0.5, "#fbd38d");
  frameGrad.addColorStop(0.66, "#f59e0b");
  frameGrad.addColorStop(0.9, "#92400e");
  frameGrad.addColorStop(1, "#451a03");
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, 2 * Math.PI);
  ctx.fillStyle = frameGrad;
  ctx.fill();

  // Inner frame edge shading
  ctx.beginPath();
  ctx.arc(0, 0, frameIn, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, frameIn + 6, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fill();

  // -- RGB LED rim: animated rainbow underglow ring --
  const ringPulse = 0.4 + 0.3 * (0.5 + 0.5 * Math.sin(state.rimPhase * 0.8));
  if (typeof ctx.createConicGradient === "function") {
    const conic = ctx.createConicGradient(state.rimPhase * 0.5, 0, 0);
    if (conic) {
      const rgbStops = [
        [0, "rgba(255,0,90,"], [0.16, "rgba(255,180,0,"],
        [0.33, "rgba(40,255,90,"], [0.5, "rgba(0,210,255,"],
        [0.66, "rgba(150,80,255,"], [0.83, "rgba(255,50,190,"], [1, "rgba(255,0,90,"]
      ];
      rgbStops.forEach(([p, c]) => conic.addColorStop(p, `${c}${ringPulse.toFixed(3)})`));
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.92, 0, 2 * Math.PI);
      ctx.arc(0, 0, R * 0.845, 0, 2 * Math.PI, true);
      ctx.fillStyle = conic;
      ctx.fill();
    }
  }

  // Bulb lights: rainbow hue chase with bright halos and white-hot peaks
  const bulbCount = 32;
  const bulbRadius = R * 0.88;
  for (let b = 0; b < bulbCount; b++) {
    const a = (b / bulbCount) * 2 * Math.PI;
    const bx = Math.cos(a) * bulbRadius;
    const by = Math.sin(a) * bulbRadius;
    const wave = 0.5 + 0.5 * Math.sin(state.rimPhase * 0.7 - b * 1.25);
    const bright = 0.15 + 0.85 * wave;
    const hue = (state.rimPhase * 20 + (b / bulbCount) * 360) % 360;

    const halo = ctx.createRadialGradient(bx, by, 0, bx, by, R * 0.052);
    halo.addColorStop(0, `hsla(${hue.toFixed(0)}, 100%, 72%, ${(0.6 * bright).toFixed(2)})`);
    halo.addColorStop(1, `hsla(${hue.toFixed(0)}, 100%, 60%, 0)`);
    ctx.beginPath();
    ctx.arc(bx, by, R * 0.052, 0, 2 * Math.PI);
    ctx.fillStyle = halo;
    ctx.fill();

    ctx.save();
    ctx.shadowColor = `hsla(${hue.toFixed(0)}, 100%, 70%, 0.95)`;
    ctx.shadowBlur = R * 0.04;
    ctx.beginPath();
    ctx.arc(bx, by, R * (0.011 + 0.009 * bright), 0, 2 * Math.PI);
    ctx.fillStyle = `hsla(${hue.toFixed(0)}, 100%, ${58 + 40 * bright}%, 1)`;
    ctx.fill();
    ctx.restore();

    if (bright > 0.82) {
      ctx.beginPath();
      ctx.arc(bx, by, R * 0.023, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fill();
    }
  }

  // ---- Prize segments ----
  const segOut = frameIn - 4;
  const segIn = R * 0.3;
  for (let i = 0; i < n; i++) {
    const a0 = i * arc - Math.PI / 2 + 0.014;
    const a1 = (i + 1) * arc - Math.PI / 2 - 0.014;
    const cp = SEGMENT_COLORS[i % SEGMENT_COLORS.length];

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, segOut, a0, a1);
    ctx.arc(0, 0, segIn, a1, a0, true);
    ctx.closePath();

    const g = ctx.createRadialGradient(0, 0, segIn, 0, 0, segOut);
    g.addColorStop(0, shade(cp[0], 0.2));
    g.addColorStop(0.55, cp[0]);
    g.addColorStop(1, shade(cp[1], -0.12));
    ctx.fillStyle = g;
    ctx.fill();

    // Glossy sheen clipped to the wedge (modern glass-like finish)
    ctx.save();
    ctx.clip();
    const ring = ctx.createRadialGradient(0, 0, segOut * 0.82, 0, 0, segOut);
    ring.addColorStop(0, "rgba(255,255,255,0)");
    ring.addColorStop(0.78, "rgba(255,255,255,0)");
    ring.addColorStop(1, "rgba(255,255,255,0.2)");
    ctx.fillStyle = ring;
    ctx.fillRect(-segOut, -segOut, segOut * 2, segOut * 2);
    ctx.restore();
  }

  // ---- Metallic separators between segments ----
  for (let i = 0; i < n; i++) {
    const a = i * arc - Math.PI / 2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(segIn, -1.7);
    ctx.lineTo(segOut + 2, -1.7);
    ctx.lineTo(segOut + 2, 1.7);
    ctx.lineTo(segIn, 1.7);
    ctx.closePath();
    const g2 = ctx.createLinearGradient(0, -1.7, 0, 1.7);
    g2.addColorStop(0, "#fde68a");
    g2.addColorStop(0.5, "#b45309");
    g2.addColorStop(1, "#451a03");
    ctx.fillStyle = g2;
    ctx.fill();
    ctx.restore();
  }

  // Prize labels (radial layout)
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.rotate(i * arc - Math.PI / 2 + arc / 2);
    ctx.fillStyle = "#ffffff";
    const fontSize = Math.round((n > 8 ? 13 : n > 5 ? 15 : 17) * scale);
    ctx.font = `700 ${fontSize}px 'Sora', sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1.5;
    const prizeName = prizes[i].name;
    const maxTextWidth = segOut - segIn - 16;
    ctx.fillText(prizeName, segOut - 12, 4.5, maxTextWidth);
    ctx.restore();
  }

  // ---- Winning wedge highlight (pulses when stopped) ----
  if (!state.spinning && state.lastWinnerIndex !== null && state.lastWinnerSegments === n) {
    const wMid = state.lastWinnerIndex * arc + arc / 2 - Math.PI / 2;
    const pulse = 0.5 + 0.5 * Math.sin(now / 170);
    ctx.save();
    ctx.rotate(wMid);
    const wg = ctx.createLinearGradient(0, segIn, 0, segOut);
    wg.addColorStop(0, "rgba(255,255,255,0)");
    wg.addColorStop(0.45, `rgba(254,240,138,${0.22 + 0.18 * pulse})`);
    wg.addColorStop(1, `rgba(251,191,36,${0.45 + 0.3 * pulse})`);
    ctx.beginPath();
    ctx.moveTo(0, segIn);
    ctx.arc(0, 0, segOut, -arc / 2 + 0.06, arc / 2 - 0.06);
    ctx.closePath();
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.restore();
  }

  // ---- Center hub (machined gold dowel) ----
  ctx.beginPath();
  ctx.arc(0, 0, segIn, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill();

  const hubR = segIn * 0.86;
  const hubGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, hubR);
  hubGrad.addColorStop(0, "#fef9c3");
  hubGrad.addColorStop(0.35, "#fbbf24");
  hubGrad.addColorStop(0.7, "#d97706");
  hubGrad.addColorStop(1, "#78350f");
  ctx.beginPath();
  ctx.arc(0, 0, hubR, 0, 2 * Math.PI);
  ctx.fillStyle = hubGrad;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, hubR * 0.7, 0, 2 * Math.PI);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(120,53,15,0.65)";
  ctx.stroke();

  ctx.fillStyle = "#78350f";
  ctx.font = `800 ${Math.round(20 * scale)}px 'Sora', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SPIN", 0, 1);

  // Glass glint on hub
  ctx.beginPath();
  ctx.arc(-hubR * 0.28, -hubR * 0.34, hubR * 0.5, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fill();

  ctx.restore();

  // ---- Full-wheel glass reflection (screen space) ----
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, -R * 0.08, R * 0.72, -Math.PI * 0.92, -Math.PI * 0.08);
  ctx.arc(0, -R * 0.08, R * 0.62, -Math.PI * 0.08, -Math.PI * 0.92, true);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fill();
  ctx.restore();
}

function chooseWeightedPrize(prizes) {
  const total = prizes.reduce((acc, p) => acc + num(p.probability), 0);
  if (total <= 0) return prizes[0];
  let rand = Math.random() * total;
  for (const prize of prizes) {
    if (rand < num(prize.probability)) {
      return prize;
    }
    rand -= num(prize.probability);
  }
  return prizes[prizes.length - 1];
}

function getEnabledPrizes(prizes) {
  if (!Array.isArray(prizes)) return [];
  return prizes.filter((p) => p.enabled);
}

function setSpinDuration(sec, updateInput = true) {
  state.settings.spinDuration = sec;
  if (updateInput && el.spinDurationInput) {
    el.spinDurationInput.value = String(sec);
  }
  updateSpinPillsUI();
  persistSettings();
}

function updateSpinPillsUI() {
  if (!el.spinTimePills) return;
  const pills = el.spinTimePills.querySelectorAll(".time-pill-btn");
  const dur = state.settings.spinDuration || 5;
  pills.forEach((p) => {
    p.classList.toggle("is-active", parseInt(p.dataset.duration, 10) === dur);
  });
}

function animateSpin(winnerIndex, totalSegments) {
  return new Promise((resolve) => {
    const durationMs = (state.settings.spinDuration || 5) * 1000;
    const segmentAngle = (2 * Math.PI) / totalSegments;
    const targetSegmentCenter = winnerIndex * segmentAngle + segmentAngle / 2;
    const targetAngle = 2 * Math.PI - targetSegmentCenter;
    const extraRounds = 6 * (2 * Math.PI);
    const startAngle = state.wheelAngle % (2 * Math.PI);
    const finalAngle = startAngle + extraRounds + (targetAngle - startAngle);
    const settleMs = Math.min(420, durationMs * 0.1);

    const startTime = performance.now();
    let lastTickSegment = Math.floor(startAngle / segmentAngle);

    if (el.wheelWrap) {
      el.wheelWrap.classList.add("spin-kick");
      setTimeout(() => el.wheelWrap.classList.remove("spin-kick"), 600);
    }

    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

    function step(now) {
      const elapsed = now - startTime;

      if (elapsed < durationMs) {
        if (elapsed < durationMs - settleMs) {
          // Long, heavy deceleration (realistic physical spin)
          const progress = Math.min(1, elapsed / (durationMs - settleMs));
          state.wheelAngle = startAngle + (finalAngle - startAngle) * easeOutQuart(progress);
        } else {
          // Damped spring "stick" into the landing slot
          const st = (elapsed - (durationMs - settleMs)) / settleMs;
          const wobble = Math.sin(st * Math.PI * 2.2) * Math.exp(-st * 2.6) * 0.045;
          state.wheelAngle = finalAngle + wobble;
        }
      } else {
        state.wheelAngle = finalAngle % (2 * Math.PI);
        state.lastWinnerIndex = winnerIndex;
        state.lastWinnerSegments = totalSegments;
        drawWheel();
        if (el.wheelWrap) {
          el.wheelWrap.classList.add("reel-settle");
          el.wheelWrap.classList.add("spin-bounce");
          setTimeout(() => {
            el.wheelWrap.classList.remove("reel-settle");
            el.wheelWrap.classList.remove("spin-bounce");
          }, 650);
        }
        resolve();
        return;
      }

      const currentSegment = Math.floor(state.wheelAngle / segmentAngle);
      if (currentSegment !== lastTickSegment) {
        lastTickSegment = currentSegment;
        playTickSound();
        triggerNeedleWobble();
      }

      drawWheel();
      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  });
}

function clearWheelWinState() {
  state.lastWinnerIndex = null;
  state.lastWinnerSegments = 0;
  if (el.wheelWinPill) el.wheelWinPill.classList.add("hidden");
  if (el.wheelHint) el.wheelHint.textContent = "Tap the wheel to spin";
  drawWheel();
}

function triggerNeedleWobble() {
  const wobble = (p) => {
    if (!p) return;
    p.classList.remove("tick-wobble");
    void p.offsetWidth;
    p.classList.add("tick-wobble");
  };
  wobble(el.wheelPointer);
  wobble(el.spinFullscreenPointer);
}

/* ==================== FULLSCREEN WHEEL ==================== */

let spinFullscreenRAF = 0;
let spinFullscreenLastDraw = 0;

function openFullscreenWheel() {
  if (!el.spinFullscreen || !el.spinFullscreenCanvas || !spinFullscreenCtx) return;
  el.spinFullscreen.classList.remove("hidden");
  sizeFullscreenCanvas();
  drawWheelCore(spinFullscreenCtx, el.spinFullscreenCanvas.width, el.spinFullscreenCanvas.height, performance.now());
  if (el.spinFullscreenHint && el.wheelHint) el.spinFullscreenHint.textContent = el.wheelHint.textContent;
  if (!spinFullscreenRAF) {
    spinFullscreenRAF = requestAnimationFrame(renderFullscreenWheel);
  }
}

function closeFullscreenWheel() {
  if (!el.spinFullscreen) return;
  el.spinFullscreen.classList.add("hidden");
  if (spinFullscreenRAF) {
    cancelAnimationFrame(spinFullscreenRAF);
    spinFullscreenRAF = 0;
  }
}

function renderFullscreenWheel(now) {
  spinFullscreenRAF = requestAnimationFrame(renderFullscreenWheel);
  const ov = el.spinFullscreen;
  const c = el.spinFullscreenCanvas;
  if (!ov || !c || ov.classList.contains("hidden")) return;
  const needsFrame = state.spinning || now - spinFullscreenLastDraw > 60;
  if (!needsFrame) return;
  spinFullscreenLastDraw = now;
  if (spinFullscreenCtx) drawWheelCore(spinFullscreenCtx, c.width, c.height, now);
  if (el.spinFullscreenHint && el.wheelHint) el.spinFullscreenHint.textContent = el.wheelHint.textContent;
}

function sizeFullscreenCanvas() {
  const c = el.spinFullscreenCanvas;
  if (!c) return;
  const wrap = el.spinFullscreenWrap;
  const base = Math.max(480, Math.min(1200, Math.round((wrap && wrap.clientWidth > 0 ? wrap.clientWidth : c.clientWidth) || 640)));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.round(base * dpr);
  if (c.width !== px) c.width = px;
  if (c.height !== px) c.height = px;
}

/* ==================== AUDIO SYNTHESIZER ==================== */

let audioCtx = null;
let activeSpinMusicStopFn = null;

function getAudioContext() {
  if (state.soundMuted) return null;
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) audioCtx = new AudioCtx();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

// Unlock audio on first user gesture anywhere on the page
if (typeof window !== "undefined") {
  const unlockAudio = () => {
    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
  };
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });
}

// Aerodynamic whoosh launch sound (from p3.jini24.in)
function playSpinStartSound() {
  if (state.soundMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.35);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(260, now);
    filter.frequency.exponentialRampToValueAtTime(2800, now + 0.35);

    // Loud, energetic punch
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.5);
  } catch (e) {
    // Ignore audio restrictions
  }
}

// Upbeat energetic game-show spin music with dynamic tempo deceleration (from p3.jini24.in)
function startSpinMusic(durationMs) {
  stopSpinMusic();
  if (state.soundMuted) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Master Dynamics Compressor for loud, punchy, distortion-free arcade sound
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-14, ctx.currentTime);
    comp.knee.setValueAtTime(18, ctx.currentTime);
    comp.ratio.setValueAtTime(5, ctx.currentTime);
    comp.attack.setValueAtTime(0.003, ctx.currentTime);
    comp.release.setValueAtTime(0.15, ctx.currentTime);
    comp.connect(ctx.destination);

    let isPlaying = true;
    const activeNodes = [];
    const startTime = ctx.currentTime;
    const totalDuration = (durationMs || ((state.settings.spinDuration || 5) * 1000)) / 1000;

    // Upbeat energetic game-show arpeggio scale notes in Hz
    const notes = [
      261.63, 329.63, 392.00, 440.00,
      523.25, 587.33, 659.25, 783.99,
      659.25, 523.25, 440.00, 392.00
    ];
    const bassNotes = [130.81, 164.81, 196.00, 146.83]; // C3, E3, G3, D3

    let noteIdx = 0;
    let nextNoteTime = startTime + 0.04;

    function scheduleNotes() {
      if (!isPlaying) return;
      const currentCtxTime = ctx.currentTime;
      const elapsed = currentCtxTime - startTime;
      const progress = Math.min(1, elapsed / totalDuration);

      if (progress >= 0.98) {
        return;
      }

      // Tempo sync: fast upbeat (105ms) in early spin, slowing down towards end (up to 320ms) for dramatic suspense
      const noteInterval = progress < 0.65
        ? 0.105
        : 0.105 + Math.pow((progress - 0.65) / 0.35, 2) * 0.22;

      while (nextNoteTime < currentCtxTime + 0.32 && isPlaying) {
        if (nextNoteTime > startTime + totalDuration - 0.08) break;

        const noteProgress = (nextNoteTime - startTime) / totalDuration;
        const noteFreq = notes[noteIdx % notes.length];

        // Synthesize lead pulse
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = noteIdx % 2 === 0 ? "sawtooth" : "square";
        osc.frequency.setValueAtTime(noteFreq, nextNoteTime);

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(Math.max(450, 2200 - noteProgress * 900), nextNoteTime);
        filter.Q.setValueAtTime(3.5, nextNoteTime);

        // Loud, energetic game-show volume
        const volume = 0.28 * (1 - noteProgress * 0.25);
        gain.gain.setValueAtTime(0.001, nextNoteTime);
        gain.gain.linearRampToValueAtTime(volume, nextNoteTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + noteInterval * 0.85);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(comp);

        osc.start(nextNoteTime);
        osc.stop(nextNoteTime + noteInterval);
        activeNodes.push(osc);

        // Every 4th note: punchy synth bass note
        if (noteIdx % 4 === 0) {
          const bassOsc = ctx.createOscillator();
          const bassGain = ctx.createGain();
          const bassFreq = bassNotes[(noteIdx / 4) % bassNotes.length];

          bassOsc.type = "triangle";
          bassOsc.frequency.setValueAtTime(bassFreq, nextNoteTime);

          // Loud punchy bass
          bassGain.gain.setValueAtTime(0.38, nextNoteTime);
          bassGain.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + noteInterval * 1.8);

          bassOsc.connect(bassGain);
          bassGain.connect(comp);

          bassOsc.start(nextNoteTime);
          bassOsc.stop(nextNoteTime + noteInterval * 2);
          activeNodes.push(bassOsc);
        }

        noteIdx++;
        nextNoteTime += noteInterval;
      }

      if (isPlaying && elapsed < totalDuration) {
        setTimeout(scheduleNotes, 65);
      }
    }

    scheduleNotes();

    activeSpinMusicStopFn = () => {
      isPlaying = false;
      activeNodes.forEach((node) => {
        try {
          node.stop();
          node.disconnect();
        } catch (_) {}
      });
      activeNodes.length = 0;
    };
  } catch (err) {
    console.warn("Spin audio error:", err);
  }
}

function stopSpinMusic() {
  if (typeof activeSpinMusicStopFn === "function") {
    activeSpinMusicStopFn();
    activeSpinMusicStopFn = null;
  }
}

// Crisp mechanical clicker sound (from p3.jini24.in)
function playTickSound() {
  if (state.soundMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const detune = (Math.random() - 0.5) * 60;
    osc.type = "triangle";
    osc.frequency.setValueAtTime(720 + detune, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.028);

    // Loud, crisp mechanical click
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.032);
  } catch (e) {
    // Ignore audio restrictions
  }
}

// Victory fanfare chords + sparkling chimes (from p3.jini24.in)
function playWinFanfare() {
  if (state.soundMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Victory fanfare chords (Grand game show victory style)
    const chords = [
      { time: 0.0, freqs: [261.63, 329.63, 392.00], dur: 0.22, vol: 0.32 },
      { time: 0.22, freqs: [349.23, 440.00, 523.25], dur: 0.22, vol: 0.35 },
      { time: 0.44, freqs: [392.00, 493.88, 587.33], dur: 0.28, vol: 0.38 },
      { time: 0.72, freqs: [523.25, 659.25, 783.99, 1046.50], dur: 1.3, vol: 0.45 }
    ];

    chords.forEach(({ time, freqs, dur, vol }) => {
      const chordStart = now + time;
      freqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, chordStart);

        gain.gain.setValueAtTime(0.001, chordStart);
        gain.gain.linearRampToValueAtTime(vol / freqs.length, chordStart + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, chordStart + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(chordStart);
        osc.stop(chordStart + dur);
      });
    });

    // Sparkling victory chimes on finale chord
    const chimes = [1046.50, 1318.51, 1567.98, 2093.00, 2637.02];
    chimes.forEach((freq, idx) => {
      const chimeStart = now + 0.85 + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, chimeStart);

      gain.gain.setValueAtTime(0.001, chimeStart);
      gain.gain.linearRampToValueAtTime(0.24, chimeStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, chimeStart + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(chimeStart);
      osc.stop(chimeStart + 0.65);
    });
  } catch (e) {
    // Ignore
  }
}

function updateSoundButtonUI() {
  if (!el.soundIcon) return;
  el.soundIcon.textContent = state.soundMuted ? "🔇" : "🔊";
  if (el.soundToggleBtn) {
    el.soundToggleBtn.setAttribute("title", state.soundMuted ? "Unmute Sound" : "Mute Sound");
  }
}

/* ==================== CONFETTI ANIMATION ==================== */

function triggerConfetti() {
  const canvas = el.confettiCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ["#fbbf24", "#6366f1", "#10b981", "#ef4444", "#ec4899", "#38bdf8"];

  for (let i = 0; i < 90; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2 - 50,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.7) * 16,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rSpeed: (Math.random() - 0.5) * 10,
      opacity: 1
    });
  }

  const startTime = performance.now();
  function animate(now) {
    const elapsed = now - startTime;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let activeCount = 0;
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // Gravity
      p.rotation += p.rSpeed;
      p.opacity = Math.max(0, 1 - elapsed / 2800);

      if (p.opacity > 0) {
        activeCount++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    });

    if (activeCount > 0 && elapsed < 2800) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  requestAnimationFrame(animate);
}

/* ==================== COUPON CANVAS GENERATION ==================== */

function formatCouponDateTime(isoStr) {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = String(d.getFullYear()).slice(-2);
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${month} ${day}, ${year}, ${hours}:${minutes} ${ampm}`;
  } catch (e) {
    return String(isoStr);
  }
}

function roundRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    const r = typeof radius === "number" ? radius : 8;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

function drawImageContain(ctx, img, x, y, w, h) {
  if (!img) return false;
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) return false;
  const scale = Math.min(w / nw, h / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  return true;
}

function drawImageCover(ctx, img, x, y, w, h) {
  if (!img) return false;
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) return false;
  const scale = Math.max(w / nw, h / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  return true;
}

function shrinkToFit(ctx, text, maxW, startSize, family, weight) {  let size = startSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > maxW && size > 14) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function loadShopLogo() {
  if (!state.defaultLogoImage) {
    const dImg = new Image();
    dImg.crossOrigin = "anonymous";
    dImg.onload = () => {
      state.defaultLogoImage = dImg;
      const cur = getCurrentRecord();
      if (cur) drawCouponFromRecord(cur);
      else drawCouponPlaceholder();
    };
    dImg.src = "assets/dolphin_voucher.jpg";
  }

  const url = (state.settings.shopLogoUrl || "").trim();
  if (url) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      state.logoImage = img;
      const cur = getCurrentRecord();
      if (cur) drawCouponFromRecord(cur);
      else drawCouponPlaceholder();
    };
    img.onerror = () => {
      console.warn("Could not load shop logo from URL:", url);
      state.logoImage = null;
      const cur = getCurrentRecord();
      if (cur) drawCouponFromRecord(cur);
      else drawCouponPlaceholder();
    };
    img.src = url;
  } else {
    state.logoImage = null;
    const cur = getCurrentRecord();
    if (cur) drawCouponFromRecord(cur);
    else drawCouponPlaceholder();
  }
}

async function loadReceiptQrImage() {
  if (state.receiptQrLoaded) return;
  state.receiptQrLoaded = true;
  try {
    const shopId = getActiveShopId();
    if (!shopId || typeof supabaseClient === "undefined") return;
    const { data, error } = await supabaseClient
      .from("shop_settings")
      .select("receipt_qr_image_url")
      .eq("shop_id", shopId)
      .maybeSingle();
    if (error) {
      console.warn("Receipt QR load skipped:", error.message);
      return;
    }
    const url = data && data.receipt_qr_image_url ? String(data.receipt_qr_image_url).trim() : "";
    if (!url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      state.receiptQrImage = img;
      if (state.activeMemberForCard && el.memberCardModal && !el.memberCardModal.classList.contains("hidden")) {
        drawMemberCard(state.activeMemberForCard, el.memberCardCanvas, memberCardCtx);
      }
    };
    img.onerror = () => {
      console.warn("Could not load receipt QR image from:", url);
      state.receiptQrImage = null;
    };
    img.src = url;
  } catch (e) {
    console.warn("Receipt QR load error:", e);
  }
}

function drawCouponPlaceholder() {
  const canvas = el.couponCanvas;
  if (!canvas) return;
  const ctx = couponCtx;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Outer dark canvas background
  ctx.fillStyle = "#070b16";
  ctx.fillRect(0, 0, w, h);

  // Card margins and dimensions
  const cardMargin = 32;
  const cardX = cardMargin;
  const cardY = cardMargin;
  const cardW = w - cardMargin * 2;
  const cardH = h - cardMargin * 2;
  const cardR = 14;

  // Inner card background
  roundRectPath(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.fillStyle = "#090e1a";
  ctx.fill();

  // Top header banner (burnt amber / orange)
  const headerH = 92;
  ctx.save();
  roundRectPath(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.clip();
  ctx.fillStyle = "#a84e0c";
  ctx.fillRect(cardX, cardY, cardW, headerH);
  ctx.restore();

  // Outer card amber border
  roundRectPath(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.strokeStyle = "#92400e";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Shop Name in top header banner
  const shopName = state.settings.shopName || "Dolphinmore";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  const shopFontSize = shrinkToFit(ctx, shopName, cardW - 64, 38, "'Sora', sans-serif", "800");
  ctx.font = `800 ${shopFontSize}px 'Sora', sans-serif`;
  ctx.fillText(shopName, cardX + 32, cardY + headerH / 2);

  // Subheader Row: Left Title & Right Status Badge
  const subY = cardY + headerH + 34;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f8fafc";
  ctx.font = "800 21px 'Sora', 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("OFFICIAL REWARD VOUCHER", cardX + 32, subY);

  const statusLabel = "STATUS: READY";
  ctx.font = "700 15px 'Plus Jakarta Sans', sans-serif";
  const statusW = ctx.measureText(statusLabel).width + 26;
  const statusH = 34;
  const statusX = cardX + cardW - 32 - statusW;

  roundRectPath(ctx, statusX, subY - statusH / 2, statusW, statusH, 4);
  ctx.strokeStyle = "#e9970c";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = "rgba(10, 16, 28, 0.7)";
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e9970c";
  ctx.fillText(statusLabel, statusX + statusW / 2, subY);

  // Watermark Logo in Center
  const watermarkLogo = state.logoImage || state.defaultLogoImage;
  if (watermarkLogo && watermarkLogo.complete && watermarkLogo.naturalWidth > 0) {
    ctx.save();
    const wmCenterX = cardX + 440;
    const wmCenterY = cardY + 365;
    const wmTargetSize = 230;
    const nw = watermarkLogo.naturalWidth;
    const nh = watermarkLogo.naturalHeight;
    const aspect = nw / nh;
    let dw = wmTargetSize;
    let dh = wmTargetSize;
    if (aspect > 1) dh = dw / aspect;
    else dw = dh * aspect;
    ctx.globalAlpha = state.logoImage ? 0.40 : 0.30;
    ctx.drawImage(watermarkLogo, wmCenterX - dw / 2, wmCenterY - dh / 2, dw, dh);
    ctx.restore();
  }

  // Placeholder message in center
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(236, 180, 36, 0.9)";
  ctx.font = "800 24px 'Sora', sans-serif";
  ctx.fillText("SPIN & WIN VOUCHER PREVIEW", cardX + cardW / 2 - 80, cardY + 280);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 17px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("Spin the wheel to generate your official reward coupon voucher", cardX + cardW / 2 - 80, cardY + 325);

  // Right column: QR Code container placeholder
  const qrBoxW = 224;
  const qrBoxH = 224;
  const qrBoxX = cardX + cardW - 32 - qrBoxW;
  const qrBoxY = cardY + headerH + 68;
  roundRectPath(ctx, qrBoxX, qrBoxY, qrBoxW, qrBoxH, 6);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 14px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("QR Code Preview", qrBoxX + qrBoxW / 2, qrBoxY + qrBoxH / 2);

  ctx.textBaseline = "alphabetic";
  ctx.fillText("Scan for Live Status", qrBoxX + qrBoxW / 2, qrBoxY + qrBoxH + 28);

  // Footer
  const footerY = cardY + cardH - 22;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "700 15px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = "#e9970c";
  ctx.fillText("★ Official Store Reward Voucher • Present at Cashier Counter to Redeem ★", w / 2, footerY);
}

function drawCouponFromRecord(record, canvas, ctx) {
  canvas = canvas || el.couponCanvas;
  if (!canvas) return;
  ctx = ctx || couponCtx;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Outer dark canvas background
  ctx.fillStyle = "#070b16";
  ctx.fillRect(0, 0, w, h);

  // Card margins and dimensions
  const cardMargin = 32;
  const cardX = cardMargin;
  const cardY = cardMargin;
  const cardW = w - cardMargin * 2;
  const cardH = h - cardMargin * 2;
  const cardR = 14;

  // Inner card background
  roundRectPath(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.fillStyle = "#090e1a";
  ctx.fill();

  // Top header banner (burnt amber / orange)
  const headerH = 92;
  ctx.save();
  roundRectPath(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.clip();
  ctx.fillStyle = "#a84e0c";
  ctx.fillRect(cardX, cardY, cardW, headerH);
  ctx.restore();

  // Outer card amber border
  roundRectPath(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.strokeStyle = "#92400e";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Shop Name in top header banner
  const shopName = record.shopName || state.settings.shopName || "Dolphinmore";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  const shopFontSize = shrinkToFit(ctx, shopName, cardW - 64, 38, "'Sora', sans-serif", "800");
  ctx.font = `800 ${shopFontSize}px 'Sora', sans-serif`;
  ctx.fillText(shopName, cardX + 32, cardY + headerH / 2);

  // Subheader Row: Left Title & Right Status Badge
  const subY = cardY + headerH + 34;

  // Title: OFFICIAL REWARD VOUCHER
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f8fafc";
  ctx.font = "800 21px 'Sora', 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("OFFICIAL REWARD VOUCHER", cardX + 32, subY);

  // Status Badge
  const statusStr = (record.status || "PENDING").toUpperCase();
  const statusLabel = `STATUS: ${statusStr}`;
  ctx.font = "700 15px 'Plus Jakarta Sans', sans-serif";
  const statusW = ctx.measureText(statusLabel).width + 26;
  const statusH = 34;
  const statusX = cardX + cardW - 32 - statusW;

  roundRectPath(ctx, statusX, subY - statusH / 2, statusW, statusH, 4);
  ctx.strokeStyle = "#e9970c";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = "rgba(10, 16, 28, 0.7)";
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e9970c";
  ctx.fillText(statusLabel, statusX + statusW / 2, subY);

  // Prize Won Box
  const prizeBoxX = cardX + 32;
  const prizeBoxY = cardY + headerH + 68;
  const qrBoxW = 224;
  const qrBoxH = 224;
  const qrBoxX = cardX + cardW - 32 - qrBoxW;
  const qrBoxY = prizeBoxY;
  const prizeBoxW = qrBoxX - prizeBoxX - 32;
  const prizeBoxH = 78;

  roundRectPath(ctx, prizeBoxX, prizeBoxY, prizeBoxW, prizeBoxH, 4);
  ctx.fillStyle = "rgba(38, 30, 24, 0.75)";
  ctx.fill();
  ctx.strokeStyle = "rgba(233, 151, 12, 0.35)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "800 13px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = "#ecb424";
  ctx.fillText("PRIZE WON:", prizeBoxX + 18, prizeBoxY + 26);

  const prizeText = record.prize || "Prize";
  const prizeFontSize = shrinkToFit(ctx, prizeText, prizeBoxW - 36, 25, "'Sora', sans-serif", "800");
  ctx.font = `800 ${prizeFontSize}px 'Sora', sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(prizeText, prizeBoxX + 18, prizeBoxY + 58);

  // Center Watermark Logo
  // Priority: 1. state.logoImage (from Shop Logo Image URL) 2. state.defaultLogoImage (Dolphin mascot)
  const watermarkLogo = state.logoImage || state.defaultLogoImage;
  if (watermarkLogo && watermarkLogo.complete && watermarkLogo.naturalWidth > 0) {
    ctx.save();
    const wmCenterX = cardX + 440;
    const wmCenterY = cardY + 365;
    const wmTargetSize = 230;
    const nw = watermarkLogo.naturalWidth;
    const nh = watermarkLogo.naturalHeight;
    const aspect = nw / nh;
    let dw = wmTargetSize;
    let dh = wmTargetSize;
    if (aspect > 1) {
      dh = dw / aspect;
    } else {
      dw = dh * aspect;
    }
    ctx.globalAlpha = state.logoImage ? 0.75 : 0.65;
    ctx.drawImage(watermarkLogo, wmCenterX - dw / 2, wmCenterY - dh / 2, dw, dh);
    ctx.restore();
  }

  // Left Column: Details List
  const detailsTop = prizeBoxY + prizeBoxH + 34;
  const formattedAmount = (Number(record.amount || 0)).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const issuedDateStr = formatCouponDateTime(record.dateTimeIso || record.created_at || new Date().toISOString());
  const expiryDateStr = formatCouponDateTime(record.expiryIso || record.expiry_date);

  const rows = [
    { label: "Unique ID: ", value: record.recordId || record.id || "—", valColor: "#fde047", isId: true },
    { label: "Customer Name: ", value: record.customerName || "—", valColor: "#ffffff" },
    { label: "Customer Number: ", value: record.customerNumber || "—", valColor: "#ffffff" },
    { label: "Purchased Item: ", value: record.purchasedItem || record.item || "—", valColor: "#ffffff" },
    { label: "Purchase Amount: ", value: formattedAmount, valColor: "#ffffff" },
    { label: "Issued Date: ", value: issuedDateStr, valColor: "#ffffff" },
    { label: "Expiry Date: ", value: expiryDateStr, valColor: "#ffffff" }
  ];

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  rows.forEach((row, i) => {
    const y = detailsTop + i * 36;
    ctx.font = "600 16px 'Plus Jakarta Sans', sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(row.label, cardX + 32, y);

    const labelW = ctx.measureText(row.label).width;
    ctx.font = row.isId ? "800 16px monospace, 'Plus Jakarta Sans'" : "700 16px 'Plus Jakarta Sans', sans-serif";
    ctx.fillStyle = row.valColor;
    ctx.fillText(row.value, cardX + 32 + labelW, y);
  });

  // Right Column: QR Code Container
  roundRectPath(ctx, qrBoxX, qrBoxY, qrBoxW, qrBoxH, 6);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (typeof qrcode !== "undefined") {
    try {
      const qrPayload = JSON.stringify({
        id: record.recordId,
        shop: shopName,
        customer: record.customerName,
        amount: record.amount,
        prize: record.prize,
        status: record.status || "Pending",
        expiry: record.expiryIso
      });
      const qr = qrcode(0, "M");
      qr.addData(qrPayload);
      qr.make();
      const qrPad = 14;
      const qrSize = qrBoxW - qrPad * 2;
      const qrInnerX = qrBoxX + qrPad;
      const qrInnerY = qrBoxY + qrPad;
      const count = qr.getModuleCount();
      const cellScale = qrSize / count;
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          ctx.fillStyle = qr.isDark(r, c) ? "#070c18" : "#ffffff";
          ctx.fillRect(qrInnerX + c * cellScale, qrInnerY + r * cellScale, cellScale + 0.5, cellScale + 0.5);
        }
      }
    } catch (e) {
      console.warn("QR render failed", e);
    }
  }

  // Text below QR Code: Scan for Live Status
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "600 15px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Scan for Live Status", qrBoxX + qrBoxW / 2, qrBoxY + qrBoxH + 28);

  // Bottom Footer
  const footerY = cardY + cardH - 22;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "700 15px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = "#e9970c";
  ctx.fillText("★ Official Store Reward Voucher • Present at Cashier Counter to Redeem ★", w / 2, footerY);
}

/* ==================== TOAST & MODALS ==================== */

function showToast(msg, type = "info", duration = 3500) {
  const container = el.toastContainer;
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function openWinnerModal(record) {
  if (!el.winnerModal) return;
  el.winnerPrizeName.textContent = record.prize;
  el.winnerCustomerMsg.textContent = `Prize won by ${record.customerName} (${formatAmount(record.amount)})`;
  el.winnerRecordId.textContent = record.recordId;
  if (el.winnerItemText) el.winnerItemText.textContent = `Purchased: ${record.purchasedItem || "—"}`;
  if (el.winnerItemPill) el.winnerItemPill.classList.toggle("hidden", !record.purchasedItem);

  el.winnerModal.classList.remove("hidden");
  el.winnerModal.setAttribute("aria-hidden", "false");
}

function closeWinnerModal() {
  if (!el.winnerModal) return;
  el.winnerModal.classList.add("hidden");
  el.winnerModal.setAttribute("aria-hidden", "true");
}

function openEditModal(record) {
  if (!el.editModal) return;
  el.editRecordId.value = record.recordId;
  el.editCustomerName.value = record.customerName;
  el.editCustomerNumber.value = record.customerNumber || "";
  el.editPurchaseAmount.value = String(record.amount);
  el.editPrizeWon.value = record.prize;
  el.editExpiryDate.value = isoToLocalInput(record.expiryIso);

  el.editModal.classList.remove("hidden");
  el.editModal.setAttribute("aria-hidden", "false");
}

function closeEditModal() {
  if (!el.editModal) return;
  el.editModal.classList.add("hidden");
  el.editModal.setAttribute("aria-hidden", "true");
}

/* ==================== VIEW GIFT CARD COUPON MODAL ==================== */

function openViewCouponModal(recordId) {
  const record = getRecordById(recordId);
  if (!record || !el.couponViewModal || !el.couponViewCanvas) return;
  state.activeViewRecord = record;

  drawCouponFromRecord(record, el.couponViewCanvas, couponViewCtx);

  if (el.couponViewRecordId) el.couponViewRecordId.textContent = record.recordId;
  if (el.couponViewCustomer) {
    el.couponViewCustomer.textContent = record.customerNumber
      ? `${record.customerName} · ${record.customerNumber}`
      : record.customerName;
  }
  if (el.couponViewPrize) el.couponViewPrize.textContent = record.prize;
  if (el.couponViewStatus) {
    const st = getEffectiveStatus(record);
    el.couponViewStatus.textContent = st;
    el.couponViewStatus.className = `meta-val status-pill status-${st.toLowerCase()}`;
  }
  if (el.couponViewExpiry) el.couponViewExpiry.textContent = formatIsoDateTime(record.expiryIso);

  if (el.shareCouponWaBtn) {
    const phone = safeText(record.customerNumber).replace(/[^0-9]/g, "");
    el.shareCouponWaBtn.disabled = !phone;
    el.shareCouponWaBtn.title = phone
      ? `Share gift card via WhatsApp on ${record.customerNumber}`
      : "No customer phone number available to share via WhatsApp";
  }

  el.couponViewModal.classList.remove("hidden");
  el.couponViewModal.setAttribute("aria-hidden", "false");
}

function closeViewCouponModal() {
  if (!el.couponViewModal) return;
  el.couponViewModal.classList.add("hidden");
  el.couponViewModal.setAttribute("aria-hidden", "true");
}

function onDownloadViewCoupon() {
  const record = state.activeViewRecord;
  if (!record || !el.couponViewCanvas) return;
  const fileName = `spin-win-${sanitizeFileName(record.customerName)}-${record.recordId}.png`;
  const dataUrl = el.couponViewCanvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  a.click();
}

async function onShareViewCouponWhatsApp() {
  const record = state.activeViewRecord;
  if (!record || !el.couponViewCanvas) return;

  const summary = buildShareText(record);
  const blob = await canvasToBlob(el.couponViewCanvas);
  const fileName = `spin-win-${sanitizeFileName(record.customerName)}-${record.recordId}.png`;
  const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;

  if (navigator.share && file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: `${record.shopName} - Spin & Win Gift Card`,
        text: summary,
        files: [file]
      });
      return;
    } catch (err) {
      console.warn("Web share canceled or failed", err);
    }
  }

  // Fallback: copy the voucher image to the clipboard so the cashier can paste it into WhatsApp
  let copiedImage = false;
  try {
    if (blob && navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      copiedImage = true;
    }
  } catch (e) {
    copiedImage = false;
  }

  const rawNumber = safeText(record.customerNumber);
  const cleanNumber = rawNumber.replace(/[^0-9]/g, "");
  const waUrl = cleanNumber
    ? `https://wa.me/${cleanNumber}?text=${encodeURIComponent(summary)}`
    : `https://wa.me/?text=${encodeURIComponent(summary)}`;
  window.open(waUrl, "_blank", "noopener");

  if (copiedImage) {
    showToast("Voucher image copied - long-press / paste it into the WhatsApp chat.", "success");
  } else {
    showToast("WhatsApp opened with the voucher text. Attach the downloaded gift card image.", "info");
  }
}

function openNewMemberModal(initialData = null) {
  if (!el.memberModal) return;
  el.memberFormId.value = "";
  el.memberFormName.value = (initialData && initialData.name) || "";
  el.memberFormPhone.value = (initialData && initialData.phone) || "";
  syncMembershipTypesFromEditor();
  renderMemberFormTypeOptions((initialData && initialData.type) || "Direct Member");
  el.memberFormInitialCredits.value = "";
  if (el.memberInitialCreditsGroup) el.memberInitialCreditsGroup.classList.remove("hidden");
  if (el.memberCreditsFieldLabel) el.memberCreditsFieldLabel.textContent = "Initial Welcome Credits (Optional)";
  if (el.memberFormNotes) el.memberFormNotes.value = "";
  if (el.memberModalTitle) el.memberModalTitle.textContent = "Add New Member";
  if (el.saveMemberBtn) el.saveMemberBtn.textContent = "Save Member";

  el.memberModal.classList.remove("hidden");
  el.memberModal.setAttribute("aria-hidden", "false");
}

function openEditMemberModal(memberId) {
  if (!el.memberModal) return;
  const m = state.members.find((x) => x.id === memberId);
  if (!m) return;
  el.memberFormId.value = m.id;
  el.memberFormName.value = m.name || "";
  el.memberFormPhone.value = m.phone || "";
  syncMembershipTypesFromEditor();
  renderMemberFormTypeOptions(m.type || "Direct Member");
  el.memberFormInitialCredits.value = String(m.credits || 0);
  if (el.memberInitialCreditsGroup) el.memberInitialCreditsGroup.classList.remove("hidden");
  if (el.memberCreditsFieldLabel) el.memberCreditsFieldLabel.textContent = "Points / Credits Balance";
  if (el.memberFormNotes) el.memberFormNotes.value = m.notes || "";
  if (el.memberModalTitle) el.memberModalTitle.textContent = "Edit Member";
  if (el.saveMemberBtn) el.saveMemberBtn.textContent = "Save Changes";

  el.memberModal.classList.remove("hidden");
  el.memberModal.setAttribute("aria-hidden", "false");
}

function openCreditModal(memberId, initialAmount = "") {
  if (!el.creditModal) return;
  populateMemberSelect(el.creditMemberSelect, memberId);
  updateCreditModalBalance();
  if (el.creditPurchaseAmount) el.creditPurchaseAmount.value = initialAmount || "";
  if (el.creditAmountInput) el.creditAmountInput.value = initialAmount ? String(Math.floor(num(initialAmount) * 0.1)) : "100";
  updateCreditWorthPreview();

  el.creditModal.classList.remove("hidden");
  el.creditModal.setAttribute("aria-hidden", "false");
}

function openDeductModal(memberId) {
  if (!el.deductModal) return;
  populateMemberSelect(el.deductMemberSelect, memberId);
  updateDeductModalBalance();

  el.deductModal.classList.remove("hidden");
  el.deductModal.setAttribute("aria-hidden", "false");
}

function openHistoryModal(memberId) {
  const member = state.members.find((m) => m.id === memberId);
  if (!member || !el.memberHistoryModal) return;
  state.activeHistoryMemberId = memberId;

  if (el.historyMemberName) el.historyMemberName.textContent = `${member.name} - Ledger`;
  if (el.historyMemberSub) el.historyMemberSub.textContent = `Phone: ${member.phone} · Joined: ${formatIsoDateTime(member.createdAtIso)}`;
  if (el.historyCurrentCredits) el.historyCurrentCredits.textContent = `${member.credits || 0} pts`;
  if (el.historyCurrentCash) el.historyCurrentCash.textContent = formatAmount((member.credits || 0) / 100);
  if (el.historyLifetimeEarned) el.historyLifetimeEarned.textContent = `+${member.lifetimeEarned || 0} pts`;
  if (el.historyLifetimeCashed) el.historyLifetimeCashed.textContent = formatAmount(member.totalCashedOut || 0);

  renderHistoryTable(member);

  el.memberHistoryModal.classList.remove("hidden");
  el.memberHistoryModal.setAttribute("aria-hidden", "false");
}

function closeAllMemberModals() {
  [el.memberModal, el.creditModal, el.deductModal, el.memberHistoryModal, el.recordCreditModal, el.memberCardModal].forEach((m) => {
    if (m) {
      m.classList.add("hidden");
      m.setAttribute("aria-hidden", "true");
    }
  });
}

function openMemberCardModal(memberId) {
  const member = state.members.find((m) => m.id === memberId);
  if (!member || !el.memberCardModal) return;
  state.activeMemberForCard = member;

  void loadReceiptQrImage();
  drawMemberCard(member, el.memberCardCanvas, memberCardCtx);

  if (el.memberCardName) el.memberCardName.textContent = member.name;
  if (el.memberCardPhone) el.memberCardPhone.textContent = member.phone || "—";
  if (el.memberCardType) el.memberCardType.textContent = member.type || "Direct Member";
  if (el.memberCardCredits) el.memberCardCredits.textContent = `${member.credits || 0} pts`;
  if (el.memberCardCash) el.memberCardCash.textContent = formatAmount((member.credits || 0) / 100);

  if (el.shareMemberCardWaBtn) {
    const phone = safeText(member.phone).replace(/[^0-9]/g, "");
    el.shareMemberCardWaBtn.disabled = !phone;
    el.shareMemberCardWaBtn.title = phone
      ? `Share loyalty card via WhatsApp on ${member.phone}`
      : "No customer phone number available to share via WhatsApp";
  }

  el.memberCardModal.classList.remove("hidden");
  el.memberCardModal.setAttribute("aria-hidden", "false");
}

function closeMemberCardModal() {
  if (!el.memberCardModal) return;
  el.memberCardModal.classList.add("hidden");
  el.memberCardModal.setAttribute("aria-hidden", "true");
}

function buildMemberCardShareText(member) {
  const shopName = (state.settings && state.settings.shopName) || "Our Store";
  const credits = member.credits || 0;
  const tier = member.type || "Direct Member";

  return `👑 *${shopName} — MEMBER LOYALTY CARD* 👑\n\n` +
    `Hello *${member.name}*!\n` +
    `Here is your latest Member Club reward card & points balance:\n\n` +
    `⭐ *Available Credits:* ${credits} pts\n` +
    `🎖️ *Membership Type:* ${tier}\n` +
    `📱 *Registered Phone:* ${member.phone || "—"}\n\n` +
    `🎁 *How to Redeem:* Show this card or give your mobile number at our checkout counter to receive an instant discount on your bill!\n\n` +
    `_Thank you for being our valued member at ${shopName}!_`;
}

async function onShareMemberCardWhatsApp() {
  const member = state.activeMemberForCard;
  if (!member || !el.memberCardCanvas) return;

  const summary = buildMemberCardShareText(member);
  const blob = await canvasToBlob(el.memberCardCanvas);
  const fileName = `member-card-${sanitizeFileName(member.name)}.png`;
  const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;

  if (navigator.share && file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: `${state.settings.shopName || "Shop"} - Member Loyalty Card`,
        text: summary,
        files: [file]
      });
      return;
    } catch (err) {
      console.warn("Web share canceled or failed", err);
    }
  }

  let copiedImage = false;
  try {
    if (blob && navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      copiedImage = true;
    }
  } catch (e) {
    copiedImage = false;
  }

  const rawNumber = safeText(member.phone);
  const cleanNumber = rawNumber.replace(/[^0-9]/g, "");
  const waUrl = cleanNumber
    ? `https://wa.me/${cleanNumber}?text=${encodeURIComponent(summary)}`
    : `https://wa.me/?text=${encodeURIComponent(summary)}`;
  window.open(waUrl, "_blank", "noopener");

  if (copiedImage) {
    showToast("Loyalty Card image copied — paste it (Ctrl+V) into the WhatsApp chat.", "success");
  } else {
    showToast("WhatsApp opened with member balance. Attach downloaded card image.", "info");
  }
}

function getMemberCardBlob(member) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = el.memberCardCanvas ? el.memberCardCanvas.width : 960;
    canvas.height = el.memberCardCanvas ? el.memberCardCanvas.height : 540;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawMemberCard(member, canvas, ctx);

    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1] || "";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: "image/png" });
  } catch (e) {
    console.warn("Member card image generation failed:", e);
    return null;
  }
}

async function copyMemberCardToClipboard(member) {
  if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === "undefined") {
    return false;
  }
  try {
    const blob = getMemberCardBlob(member);
    if (!blob) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch (e) {
    console.warn("Member card clipboard copy failed:", e);
    return false;
  }
}

async function messageMemberWithCard(memberId) {
  const member = state.members.find((m) => m.id === memberId);
  if (!member) return;

  const copied = await copyMemberCardToClipboard(member);
  showToast(
    copied
      ? "Loyalty Card image copied — paste it (Ctrl+V) into the WhatsApp chat."
      : "Could not copy the card image. You can still download it from the card view.",
    copied ? "success" : "info"
  );

  const cleanNumber = safeText(member.phone).replace(/[^0-9]/g, "");
  const waUrl = cleanNumber ? `https://wa.me/${cleanNumber}` : "https://wa.me/";
  window.open(waUrl, "_blank", "noopener");
}

function onDownloadMemberCard() {
  const member = state.activeMemberForCard;
  if (!member || !el.memberCardCanvas) return;
  const fileName = `member-card-${sanitizeFileName(member.name)}.png`;
  const dataUrl = el.memberCardCanvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  a.click();
}

function drawMemberCard(member, canvas, ctx) {
  canvas = canvas || el.memberCardCanvas;
  if (!canvas) return;
  ctx = ctx || memberCardCtx || canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#05070f";
  ctx.fillRect(0, 0, w, h);

  const mX = 28;
  const mY = 28;
  const cW = w - mX * 2;
  const cH = h - mY * 2;
  const cR = 24;

  ctx.save();
  roundRectPath(ctx, mX, mY, cW, cH, cR);
  ctx.clip();

  const bgGrad = ctx.createLinearGradient(mX, mY, mX + cW, mY + cH);
  bgGrad.addColorStop(0, "#0a0f1e");
  bgGrad.addColorStop(0.4, "#0c1226");
  bgGrad.addColorStop(0.75, "#1a1533");
  bgGrad.addColorStop(1, "#070a14");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(mX, mY, cW, cH);

  const goldGlow = ctx.createRadialGradient(mX + cW - 150, mY + 70, 20, mX + cW - 150, mY + 70, 420);
  goldGlow.addColorStop(0, "rgba(245, 158, 11, 0.30)");
  goldGlow.addColorStop(1, "rgba(245, 158, 11, 0)");
  ctx.fillStyle = goldGlow;
  ctx.fillRect(mX, mY, cW, cH);

  const purpleGlow = ctx.createRadialGradient(mX + 120, mY + cH - 40, 10, mX + 120, mY + cH - 40, 340);
  purpleGlow.addColorStop(0, "rgba(124, 58, 237, 0.26)");
  purpleGlow.addColorStop(1, "rgba(124, 58, 237, 0)");
  ctx.fillStyle = purpleGlow;
  ctx.fillRect(mX, mY, cW, cH);

  const watermark = state.logoImage;
  if (watermark && watermark.complete && watermark.naturalWidth > 0) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    drawImageContain(ctx, watermark, mX + cW / 2 - 170, mY + 120, 340, 340);
    ctx.restore();
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(mX + cW + 40, mY + 60, 130 + i * 58, 0, Math.PI * 2);
    ctx.stroke();
  }

  const headH = 100;
  const headGrad = ctx.createLinearGradient(mX, mY, mX + cW, mY);
  headGrad.addColorStop(0, "rgba(217, 119, 6, 0.42)");
  headGrad.addColorStop(0.5, "rgba(180, 83, 9, 0.22)");
  headGrad.addColorStop(1, "rgba(15, 23, 42, 0.35)");
  ctx.fillStyle = headGrad;
  ctx.fillRect(mX, mY, cW, headH);

  ctx.strokeStyle = "rgba(245, 158, 11, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mX, mY + headH);
  ctx.lineTo(mX + cW, mY + headH);
  ctx.stroke();

  const logoSize = 68;
  const logoX = mX + 30;
  const logoY = mY + (headH - logoSize) / 2;
  roundRectPath(ctx, logoX, logoY, logoSize, logoSize, 18);
  ctx.fillStyle = "rgba(2, 6, 23, 0.55)";
  ctx.fill();

  const logoImg = state.logoImage;
  ctx.save();
  roundRectPath(ctx, logoX + 3, logoY + 3, logoSize - 6, logoSize - 6, 15);
  ctx.clip();
  const logoDrawn = logoImg && logoImg.complete && logoImg.naturalWidth > 0
    && drawImageCover(ctx, logoImg, logoX + 3, logoY + 3, logoSize - 6, logoSize - 6);
  if (!logoDrawn) {
    ctx.fillStyle = "rgba(245, 158, 11, 0.18)";
    ctx.fillRect(logoX + 3, logoY + 3, logoSize - 6, logoSize - 6);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "800 34px 'Sora', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("👑", logoX + logoSize / 2, logoY + logoSize / 2 + 1);
  }
  ctx.restore();

  roundRectPath(ctx, logoX, logoY, logoSize, logoSize, 18);
  ctx.strokeStyle = "rgba(251, 191, 36, 0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const shopName = (state.settings && state.settings.shopName ? state.settings.shopName : "Our Store").toUpperCase();
  const textX = logoX + logoSize + 20;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 27px 'Sora', sans-serif";
  ctx.fillText(shopName, textX, mY + 40, cW - logoSize - 280);

  ctx.fillStyle = "#fbbf24";
  ctx.font = "700 12px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("PREMIUM MEMBERSHIP • LOYALTY CLUB", textX, mY + 68);

  const tier = member.type || "Direct Member";
  const tierMeta = findMembershipTypeByName(tier);
  const tierIcon = tierMeta && tierMeta.icon ? tierMeta.icon + " " : (tier === "Spin Winner" ? "🏆 " : tier === "VIP Member" ? "⭐ " : "💎 ");
  const badgeText = tierIcon + tier.toUpperCase();
  ctx.font = "800 13px 'Plus Jakarta Sans', sans-serif";
  const badgeW = ctx.measureText(badgeText).width + 34;
  const badgeH = 36;
  const badgeX = mX + cW - badgeW - 30;
  const badgeY = mY + (headH - badgeH) / 2;

  roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, 18);
  const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY + badgeH);
  badgeGrad.addColorStop(0, "rgba(245, 158, 11, 0.35)");
  badgeGrad.addColorStop(1, "rgba(217, 119, 6, 0.2)");
  ctx.fillStyle = badgeGrad;
  ctx.fill();
  ctx.strokeStyle = "rgba(251, 191, 36, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#fef08a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);

  const colX = mX + 32;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 12px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("MEMBER NAME", colX, mY + 156);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 32px 'Sora', sans-serif";
  const displayName = member.name && member.name.length > 22 ? member.name.substring(0, 20) + "..." : (member.name || "Member");
  ctx.fillText(displayName, colX, mY + 196, 430);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 12px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("REGISTERED MOBILE", colX, mY + 246);

  ctx.fillStyle = "#38bdf8";
  ctx.font = "700 22px monospace";
  ctx.fillText(member.phone || "No Mobile Registered", colX, mY + 278);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(colX, mY + 308);
  ctx.lineTo(colX + 400, mY + 308);
  ctx.stroke();

  const memCode = "MID-" + String(member.id || "").replace(/[^a-zA-Z0-9]/g, "").substring(0, 8).toUpperCase();
  ctx.fillStyle = "#64748b";
  ctx.font = "600 13px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("Card ID: " + memCode, colX, mY + 338);
  ctx.fillText("Joined: " + formatIsoDateTime(member.createdAtIso), colX, mY + 362);

  const colW = 372;
  const colRX = mX + cW - colW - 30;

  const bCardY = mY + 116;
  const bCardH = 148;
  roundRectPath(ctx, colRX, bCardY, colW, bCardH, 18);
  const bCardBg = ctx.createLinearGradient(colRX, bCardY, colRX + colW, bCardY + bCardH);
  bCardBg.addColorStop(0, "rgba(30, 41, 59, 0.8)");
  bCardBg.addColorStop(1, "rgba(15, 23, 42, 0.92)");
  ctx.fillStyle = bCardBg;
  ctx.fill();
  ctx.strokeStyle = "rgba(245, 158, 11, 0.45)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fbbf24";
  ctx.font = "800 12.5px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("⭐  AVAILABLE REWARD BALANCE  ⭐", colRX + colW / 2, bCardY + 30);

  const credits = member.credits || 0;
  ctx.fillStyle = "#fef08a";
  const creditFontSize = shrinkToFit(ctx, String(credits), colW - 48, 52, "'Sora', sans-serif", "800");
  void creditFontSize;
  ctx.fillText(String(credits), colRX + colW / 2, bCardY + 90);

  ctx.fillStyle = "#fde68a";
  ctx.font = "700 15px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("CREDIT POINTS", colRX + colW / 2, bCardY + 116);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 11px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("Total Lifetime Earned: +" + (member.lifetimeEarned || 0) + " pts", colRX + colW / 2, bCardY + 138);

  const qrY = bCardY + bCardH + 12;
  const qrH = 146;
  roundRectPath(ctx, colRX, qrY, colW, qrH, 18);
  const qrBg = ctx.createLinearGradient(colRX, qrY, colRX + colW, qrY + qrH);
  qrBg.addColorStop(0, "rgba(30, 41, 59, 0.8)");
  qrBg.addColorStop(1, "rgba(15, 23, 42, 0.92)");
  ctx.fillStyle = qrBg;
  ctx.fill();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const qrBoxSize = qrH - 28;
  const qrBoxX = colRX + 14;
  const qrBoxY = qrY + 14;
  roundRectPath(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 12);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  const qrImg = state.receiptQrImage;
  if (qrImg && qrImg.complete && qrImg.naturalWidth > 0) {
    ctx.save();
    roundRectPath(ctx, qrBoxX + 6, qrBoxY + 6, qrBoxSize - 12, qrBoxSize - 12, 8);
    ctx.clip();
    drawImageContain(ctx, qrImg, qrBoxX + 6, qrBoxY + 6, qrBoxSize - 12, qrBoxSize - 12);
    ctx.restore();
  } else {
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "700 12px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("QR", qrBoxX + qrBoxSize / 2, qrBoxY + qrBoxSize / 2);
  }

  const qrTextX = qrBoxX + qrBoxSize + 18;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fbbf24";
  ctx.font = "800 13px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("SCAN TO CONNECT", qrTextX, qrY + 50);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "600 11.5px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("Scan this QR code to reach", qrTextX, qrY + 74);
  ctx.fillText("our store online.", qrTextX, qrY + 92);

  ctx.fillStyle = "#64748b";
  ctx.font = "600 10.5px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("Redeemable at checkout.", qrTextX, qrY + 118);

  const footH = 48;
  const footY = mY + cH - footH;
  ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
  ctx.fillRect(mX, footY, cW, footH);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mX, footY);
  ctx.lineTo(mX + cW, footY);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "600 12px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("🛍️  Redeemable for instant discounts or cash rewards on every store purchase", mX + 28, footY + 30);

  ctx.textAlign = "right";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 12px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("Rule: 100 Credits = ₹1.00", mX + cW - 28, footY + 30);

  ctx.restore();

  roundRectPath(ctx, mX, mY, cW, cH, cR);
  ctx.strokeStyle = "rgba(245, 158, 11, 0.55)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  roundRectPath(ctx, mX + 3, mY + 3, cW - 6, cH - 6, cR - 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function openRecordCreditModal(recordId) {
  const record = getRecordById(recordId);
  if (!record || !el.recordCreditModal) return;
  state.activeRecordForCredit = record;

  const member = (record.customerNumber ? findMemberByPhone(record.customerNumber) : null) || findMemberByName(record.customerName);

  if (el.recordCreditCustName) el.recordCreditCustName.textContent = record.customerName;
  if (el.recordCreditCustPhone) el.recordCreditCustPhone.textContent = record.customerNumber || "No Phone";
  if (el.recordCreditRecId) el.recordCreditRecId.textContent = record.recordId;
  if (el.recordCreditRecItem) el.recordCreditRecItem.textContent = record.purchasedItem || "—";
  if (el.recordCreditRecAmount) el.recordCreditRecAmount.textContent = formatAmount(record.amount);
  if (el.recordCreditRecPrize) el.recordCreditRecPrize.textContent = record.prize;

  if (member) {
    if (el.recordCreditMemberStatusPill) {
      el.recordCreditMemberStatusPill.className = "status-pill status-member";
      el.recordCreditMemberStatusPill.textContent = `👑 ${member.type || "Member"}`;
    }
    if (el.recordCreditCurrentBal) el.recordCreditCurrentBal.textContent = `${member.credits || 0} Credits`;
    if (el.recordCreditCashWorth) el.recordCreditCashWorth.textContent = formatAmount((member.credits || 0) / 100);
    if (el.recordCreditBalanceRow) el.recordCreditBalanceRow.classList.remove("hidden");
    if (el.recordCreditNotMemberNotice) el.recordCreditNotMemberNotice.classList.add("hidden");
  } else {
    if (el.recordCreditMemberStatusPill) {
      el.recordCreditMemberStatusPill.className = "status-pill status-not-member";
      el.recordCreditMemberStatusPill.textContent = "Not Registered";
    }
    if (el.recordCreditBalanceRow) el.recordCreditBalanceRow.classList.add("hidden");
    if (el.recordCreditNotMemberNotice) el.recordCreditNotMemberNotice.classList.remove("hidden");
  }

  el.recordCreditModal.classList.remove("hidden");
  el.recordCreditModal.setAttribute("aria-hidden", "false");
}

/* ==================== MEMBERS CLUB LOGIC ==================== */

function normalizeMember(m) {
  return {
    id: safeText(m.id, uid()),
    name: safeText(m.name, "Unnamed"),
    phone: safeText(m.phone, ""),
    type: safeText(m.type, "Direct Member"),
    credits: Math.max(0, parseInt(m.credits || 0, 10)),
    lifetimeEarned: Math.max(0, parseInt(m.lifetimeEarned || 0, 10)),
    totalCashedOut: Math.max(0, num(m.totalCashedOut)),
    notes: safeText(m.notes, ""),
    createdAtIso: m.createdAtIso || new Date().toISOString(),
    updatedAtIso: m.updatedAtIso || new Date().toISOString(),
    ledger: Array.isArray(m.ledger) ? m.ledger : [],
    synced: !!m.synced
  };
}

function findMemberByPhone(phone) {
  if (!phone) return null;
  const clean = String(phone).replace(/[^0-9]/g, "");
  if (!clean) return null;
  return state.members.find((m) => String(m.phone).replace(/[^0-9]/g, "") === clean);
}

function findMemberByName(name) {
  if (!name) return null;
  const clean = String(name).trim().toLowerCase();
  return state.members.find((m) => String(m.name).trim().toLowerCase() === clean);
}

function checkCustomerMemberMatch() {
  if (!el.customerMemberBadge) return;
  const phone = safeText(el.customerNumber ? el.customerNumber.value : "");
  const name = safeText(el.customerName ? el.customerName.value : "");

  const member = (phone ? findMemberByPhone(phone) : null) || (name ? findMemberByName(name) : null);
  if (member) {
    if (el.customerMemberBadgeText) {
      el.customerMemberBadgeText.textContent = `Club Member: ${member.name} | ${member.credits || 0} Credits (≈ ${formatAmount((member.credits || 0) / 100)})`;
    }
    if (el.customerMemberQuickCreditBtn) {
      el.customerMemberQuickCreditBtn.dataset.memberId = member.id;
    }
    el.customerMemberBadge.classList.remove("hidden");
  } else {
    el.customerMemberBadge.classList.add("hidden");
  }
}

function onAddWinnerToMembers() {
  const currentRecord = getCurrentRecord();
  closeWinnerModal();
  if (currentRecord) {
    const existing = (currentRecord.customerNumber ? findMemberByPhone(currentRecord.customerNumber) : null) || findMemberByName(currentRecord.customerName);
    if (existing) {
      setActiveTab("members");
      openCreditModal(existing.id, currentRecord.amount);
    } else {
      setActiveTab("members");
      openNewMemberModal({
        name: currentRecord.customerName,
        phone: currentRecord.customerNumber
      });
    }
  } else {
    setActiveTab("members");
    openNewMemberModal();
  }
}

function bindMembersEvents() {
  if (el.openNewMemberModalBtn) el.openNewMemberModalBtn.addEventListener("click", () => openNewMemberModal());
  if (el.emptyAddMemberBtn) el.emptyAddMemberBtn.addEventListener("click", () => openNewMemberModal());
  if (el.openAddCreditModalBtn) el.openAddCreditModalBtn.addEventListener("click", () => openCreditModal());
  if (el.openDeductModalBtn) el.openDeductModalBtn.addEventListener("click", () => openDeductModal());
  if (el.pushMembersBtn) el.pushMembersBtn.addEventListener("click", () => pushAllMembersToSheets(true));
  if (el.refreshMembersBtn) el.refreshMembersBtn.addEventListener("click", () => loadMembersFromSheets(true));
  if (el.exportMembersBtn) el.exportMembersBtn.addEventListener("click", exportMembersToCSV);

  if (el.memberForm) el.memberForm.addEventListener("submit", onSaveMemberSubmit);
  if (el.creditForm) el.creditForm.addEventListener("submit", onSaveCreditSubmit);
  if (el.deductForm) el.deductForm.addEventListener("submit", onSaveDeductSubmit);

  if (el.creditMemberSelect) el.creditMemberSelect.addEventListener("change", updateCreditModalBalance);
  if (el.creditAmountInput) el.creditAmountInput.addEventListener("input", updateCreditWorthPreview);
  if (el.deductMemberSelect) el.deductMemberSelect.addEventListener("change", updateDeductModalBalance);
  if (el.deductCreditsInput) el.deductCreditsInput.addEventListener("input", () => syncDeductCalc("credits"));
  if (el.deductCashInput) el.deductCashInput.addEventListener("input", () => syncDeductCalc("cash"));

  if (el.memberSearchInput) {
    el.memberSearchInput.addEventListener("input", () => {
      state.memberSearchQuery = el.memberSearchInput.value;
      state.membersPage = 1;
      if (el.clearMemberSearchBtn) el.clearMemberSearchBtn.classList.toggle("hidden", !state.memberSearchQuery);
      renderMembersSection();
    });
  }
  if (el.clearMemberSearchBtn) {
    el.clearMemberSearchBtn.addEventListener("click", () => {
      if (el.memberSearchInput) el.memberSearchInput.value = "";
      state.memberSearchQuery = "";
      state.membersPage = 1;
      el.clearMemberSearchBtn.classList.add("hidden");
      renderMembersSection();
    });
  }
  if (el.memberFilterSelect) {
    el.memberFilterSelect.addEventListener("change", () => {
      state.memberFilter = el.memberFilterSelect.value;
      state.membersPage = 1;
      renderMembersSection();
    });
  }

  if (el.membersTableBody) el.membersTableBody.addEventListener("click", onMemberActionClick);
  if (el.recordCreditAddBtn) el.recordCreditAddBtn.addEventListener("click", onRecordCreditAddClick);
  if (el.recordCreditDeductBtn) el.recordCreditDeductBtn.addEventListener("click", onRecordCreditDeductClick);
  if (el.recordCreditViewMemberBtn) el.recordCreditViewMemberBtn.addEventListener("click", onRecordCreditViewMemberClick);

  // Close modals backdrop handlers
  document.querySelectorAll("[data-close-member-modal]").forEach((b) => b.addEventListener("click", () => el.memberModal.classList.add("hidden")));
  document.querySelectorAll("[data-close-credit-modal]").forEach((b) => b.addEventListener("click", () => el.creditModal.classList.add("hidden")));
  document.querySelectorAll("[data-close-deduct-modal]").forEach((b) => b.addEventListener("click", () => el.deductModal.classList.add("hidden")));
  document.querySelectorAll("[data-close-history-modal]").forEach((b) => b.addEventListener("click", () => el.memberHistoryModal.classList.add("hidden")));
  document.querySelectorAll("[data-close-record-credit]").forEach((b) => b.addEventListener("click", () => el.recordCreditModal.classList.add("hidden")));
  document.querySelectorAll("[data-close-member-card-modal]").forEach((b) => b.addEventListener("click", () => el.memberCardModal && el.memberCardModal.classList.add("hidden")));

  if (el.downloadMemberCardBtn) el.downloadMemberCardBtn.addEventListener("click", onDownloadMemberCard);
  if (el.shareMemberCardWaBtn) el.shareMemberCardWaBtn.addEventListener("click", () => void onShareMemberCardWhatsApp());
  if (el.historyShareCardWaBtn) el.historyShareCardWaBtn.addEventListener("click", () => {
    if (state.activeHistoryMemberId) openMemberCardModal(state.activeHistoryMemberId);
  });
}

function renderMembersSection() {
  const allFiltered = getFilteredMembers();
  const totalCount = allFiltered.length;
  const pageSize = state.membersPageSize || 10;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  if (state.membersPage > totalPages) state.membersPage = totalPages;
  if (state.membersPage < 1) state.membersPage = 1;

  const startIndex = (state.membersPage - 1) * pageSize;
  const visible = allFiltered.slice(startIndex, startIndex + pageSize);

  // Stats KPI Update
  const totalMembers = state.members.length;
  const winnerCount = state.members.filter((m) => m.type === "Spin Winner").length;
  const directCount = totalMembers - winnerCount;
  const totalCredits = state.members.reduce((acc, m) => acc + (m.credits || 0), 0);
  const totalEarned = state.members.reduce((acc, m) => acc + (m.lifetimeEarned || 0), 0);
  const totalCashPaid = state.members.reduce((acc, m) => acc + (m.totalCashedOut || 0), 0);

  if (el.statTotalMembers) el.statTotalMembers.textContent = String(totalMembers);
  if (el.statMembersSubtitle) el.statMembersSubtitle.textContent = `${winnerCount} Winners · ${directCount} Direct`;
  if (el.statTotalCredits) el.statTotalCredits.textContent = String(totalCredits);
  if (el.statCreditsWorth) el.statCreditsWorth.textContent = `Worth ≈ ${formatAmount(totalCredits / 100)} cash`;
  if (el.statTotalEarned) el.statTotalEarned.textContent = String(totalEarned);
  if (el.statEarnedWorth) el.statEarnedWorth.textContent = `Issued value ≈ ${formatAmount(totalEarned / 100)}`;
  if (el.statTotalCashPaid) el.statTotalCashPaid.textContent = formatAmount(totalCashPaid);

  if (!el.membersTableBody) return;
  el.membersTableBody.innerHTML = "";

  if (!visible.length) {
    if (el.membersEmptyState) el.membersEmptyState.classList.remove("hidden");
    renderMembersPaginationControls(totalCount, totalPages);
    return;
  }
  if (el.membersEmptyState) el.membersEmptyState.classList.add("hidden");

  visible.forEach((m) => {
    const tr = document.createElement("tr");

    // Checkbox
    const selectTd = document.createElement("td");
    selectTd.className = "centered";
    selectTd.innerHTML = `<input type="checkbox" class="member-select-checkbox" data-id="${m.id}">`;
    tr.appendChild(selectTd);

    // Member Name & Avatar
    const nameTd = document.createElement("td");
    const initial = (m.name || "U")[0].toUpperCase();
    nameTd.innerHTML = `<div class="member-name-cell">
      <div class="member-avatar">${initial}</div>
      <span class="member-name-text">${m.name}</span>
    </div>`;
    tr.appendChild(nameTd);

    // Phone
    const phoneTd = document.createElement("td");
    const cleanPhone = String(m.phone).replace(/[^0-9]/g, "");
    if (cleanPhone) {
      phoneTd.innerHTML = `<div class="phone-cell-wrap">
        <a href="tel:${m.phone}" class="phone-icon-btn btn-call" title="Call ${m.phone}">📞</a>
        <button type="button" class="phone-icon-btn btn-wa" data-member-action="message" data-id="${m.id}" title="Message ${m.phone} on WhatsApp (copies card to clipboard)">💬</button>
        <button type="button" class="phone-icon-btn btn-share-wa" data-member-action="share-card" data-id="${m.id}" title="Share Member Loyalty Card on WhatsApp">💳</button>
        <span class="phone-number-text">${m.phone}</span>
      </div>`;
    } else {
      phoneTd.textContent = "—";
    }
    tr.appendChild(phoneTd);

    // Type Badge
    const typeTd = document.createElement("td");
    const typeName = m.type || "Direct Member";
    const typeMeta = findMembershipTypeByName(typeName);
    const typeClass = typeName === "Spin Winner" ? "winner" : typeName === "VIP Member" ? "vip" : "direct";
    const typeIcon = typeMeta && typeMeta.icon ? typeMeta.icon + " " : "";
    typeTd.innerHTML = `<span class="badge-type badge-type-${typeClass}">${typeIcon}${typeName}</span>`;
    tr.appendChild(typeTd);

    // Credits
    const creditsTd = document.createElement("td");
    creditsTd.className = "centered";
    creditsTd.innerHTML = `<span class="credit-balance-pill">⭐ ${m.credits || 0} pts</span>`;
    tr.appendChild(creditsTd);

    // Cash Worth
    const cashTd = document.createElement("td");
    cashTd.className = "centered";
    cashTd.innerHTML = `<span class="cash-worth-pill">${formatAmount((m.credits || 0) / 100)}</span>`;
    tr.appendChild(cashTd);

    // Lifetime Earned
    const earnedTd = document.createElement("td");
    earnedTd.className = "centered";
    earnedTd.innerHTML = `<strong style="color:#a7f3d0;">+${m.lifetimeEarned || 0}</strong>`;
    tr.appendChild(earnedTd);

    // Joined Date
    const joinedTd = document.createElement("td");
    joinedTd.textContent = formatIsoDateTime(m.createdAtIso);
    tr.appendChild(joinedTd);

    // Actions
    const actionsTd = document.createElement("td");
    actionsTd.className = "centered";
    actionsTd.innerHTML = `<div class="member-actions-group">
      <button type="button" class="action-btn-sm btn-edit-member" data-member-action="edit" data-id="${m.id}" title="Edit Member"><i class="fas fa-pen"></i> <span>Edit</span></button>
      <button type="button" class="action-btn-sm btn-view-hist" data-member-action="history" data-id="${m.id}" title="View Transaction History"><i class="fas fa-eye"></i> <span>History</span></button>
      <button type="button" class="btn-icon-del" data-member-action="delete" data-id="${m.id}" title="Delete Member">🗑️</button>
    </div>`;
    tr.appendChild(actionsTd);

    el.membersTableBody.appendChild(tr);
  });
  renderMembersPaginationControls(totalCount, totalPages);
}

function getFilteredMembers() {
  let list = [...state.members];
  const q = safeText(state.memberSearchQuery).toLowerCase();
  if (q) {
    list = list.filter((m) => m.name.toLowerCase().includes(q) || m.phone.toLowerCase().includes(q));
  }
  const filter = state.memberFilter || "all";
  if (filter.startsWith("type:")) {
    const typeName = filter.slice(5);
    list = list.filter((m) => (m.type || "Direct Member") === typeName);
  } else if (filter === "winner") {
    list = list.filter((m) => m.type === "Spin Winner");
  } else if (filter === "direct") {
    list = list.filter((m) => m.type === "Direct Member");
  } else if (filter === "has_balance") {
    list = list.filter((m) => (m.credits || 0) > 0);
  }
  return list;
}

function populateMemberSelect(selectEl, selectedId = "") {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  if (!state.members.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No members registered yet";
    selectEl.appendChild(opt);
    return;
  }
  state.members.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = `${m.name} (${m.phone || "No Phone"}) — ${m.credits || 0} Credits`;
    selectEl.appendChild(opt);
  });
  if (selectedId) selectEl.value = selectedId;
}

function updateCreditModalBalance() {
  if (!el.creditMemberSelect || !el.creditCurrentBalanceText) return;
  const memberId = el.creditMemberSelect.value;
  const m = state.members.find((x) => x.id === memberId);
  if (m) {
    el.creditCurrentBalanceText.textContent = `${m.credits || 0} Credits (${formatAmount((m.credits || 0) / 100)})`;
  } else {
    el.creditCurrentBalanceText.textContent = "0 Credits (₹0.00)";
  }
}

function updateCreditWorthPreview() {
  if (!el.creditAmountInput || !el.creditCashWorthPreview) return;
  const pts = Math.max(0, parseInt(el.creditAmountInput.value || "0", 10));
  el.creditCashWorthPreview.textContent = formatAmount(pts / 100);
}

function updateDeductModalBalance() {
  if (!el.deductMemberSelect || !el.deductAvailableText) return;
  const memberId = el.deductMemberSelect.value;
  const m = state.members.find((x) => x.id === memberId);
  if (m) {
    el.deductAvailableText.textContent = `${m.credits || 0} Credits (Max Value: ${formatAmount((m.credits || 0) / 100)})`;
    if (el.deductCreditsInput) el.deductCreditsInput.max = String(m.credits || 0);
  } else {
    el.deductAvailableText.textContent = "0 Credits (Max Value: ₹0.00)";
  }
}

function syncDeductCalc(source) {
  if (source === "credits" && el.deductCreditsInput && el.deductCashInput) {
    const pts = Math.max(0, parseInt(el.deductCreditsInput.value || "0", 10));
    el.deductCashInput.value = (pts / 100).toFixed(2);
  } else if (source === "cash" && el.deductCashInput && el.deductCreditsInput) {
    const cash = Math.max(0, num(el.deductCashInput.value));
    el.deductCreditsInput.value = String(Math.round(cash * 100));
  }
  updateDeductBanners();
}

function updateDeductBanners() {
  const cashVal = Math.max(0, num(el.deductCashInput ? el.deductCashInput.value : "0"));
  const billVal = Math.max(0, num(el.deductBillAmountInput ? el.deductBillAmountInput.value : "0"));
  const netPayable = Math.max(0, billVal - cashVal);

  if (el.deductNetPayableDisplay) el.deductNetPayableDisplay.textContent = formatAmount(netPayable);
  if (el.deductBreakdownDisplay) el.deductBreakdownDisplay.textContent = `Bill: ${formatAmount(billVal)} - Discount: ${formatAmount(cashVal)}`;
  if (el.deductPayoutDisplay) el.deductPayoutDisplay.textContent = formatAmount(cashVal);
}

function onSaveMemberSubmit(e) {
  e.preventDefault();
  const editId = safeText(el.memberFormId.value);
  const name = safeText(el.memberFormName.value);
  const phone = safeText(el.memberFormPhone.value);
  const type = el.memberFormType.value || "Direct Member";
  const credits = Math.max(0, parseInt(el.memberFormInitialCredits.value || "0", 10));
  const notes = safeText(el.memberFormNotes.value);

  if (!name || !phone) {
    showToast("Name and phone number are required.", "error");
    return;
  }

  const nowIso = new Date().toISOString();

  if (editId) {
    const member = state.members.find((x) => x.id === editId);
    if (!member) {
      showToast("Member not found.", "error");
      return;
    }
    const delta = credits - (member.credits || 0);
    member.name = name;
    member.phone = phone;
    member.type = type;
    member.notes = notes;
    member.credits = credits;
    member.updatedAtIso = nowIso;
    member.synced = false;

    if (!Array.isArray(member.ledger)) member.ledger = [];
    if (delta !== 0) {
      member.ledger.unshift({
        id: uid(),
        type: "ADJUST",
        credits: delta,
        cashValue: Math.abs(delta) / 100,
        note: `Manual points correction (${delta > 0 ? "+" : ""}${delta})`,
        dateTimeIso: nowIso,
        balanceAfter: credits
      });
    }

    persistMembers();
    renderMembersSection();
    checkCustomerMemberMatch();
    el.memberModal.classList.add("hidden");
    showToast(`Member ${member.name} updated successfully!`, "success");

    if (getAppsScriptUrl()) {
      void syncSaveMember(member);
    }
    return;
  }

  const member = normalizeMember({
    id: uid(),
    name,
    phone,
    type,
    credits,
    lifetimeEarned: credits,
    notes,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    ledger: credits > 0 ? [{
      id: uid(),
      type: "CREDIT",
      credits,
      cashValue: credits / 100,
      note: "Welcome bonus credits",
      dateTimeIso: nowIso,
      balanceAfter: credits
    }] : []
  });

  state.members.unshift(member);
  persistMembers();
  renderMembersSection();
  checkCustomerMemberMatch();
  el.memberModal.classList.add("hidden");
  showToast(`Member ${member.name} registered successfully!`, "success");

  if (getAppsScriptUrl()) {
    void syncSaveMember(member);
  }
}

function onSaveCreditSubmit(e) {
  e.preventDefault();
  const memberId = el.creditMemberSelect.value;
  const pts = Math.max(1, parseInt(el.creditAmountInput.value || "0", 10));
  const note = safeText(el.creditNoteInput.value, "Purchase bill credits");

  const m = state.members.find((x) => x.id === memberId);
  if (!m) {
    showToast("Please select a valid member.", "error");
    return;
  }

  const nowIso = new Date().toISOString();
  m.credits = (m.credits || 0) + pts;
  m.lifetimeEarned = (m.lifetimeEarned || 0) + pts;
  m.updatedAtIso = nowIso;
  m.synced = false;

  m.ledger.unshift({
    id: uid(),
    type: "CREDIT",
    credits: pts,
    cashValue: pts / 100,
    note,
    dateTimeIso: nowIso,
    balanceAfter: m.credits
  });

  persistMembers();
  renderMembersSection();
  checkCustomerMemberMatch();
  el.creditModal.classList.add("hidden");
  showToast(`Awarded ${pts} credits to ${m.name}!`, "success");

  if (getAppsScriptUrl()) {
    void syncSaveMember(m);
  }
}

function onSaveDeductSubmit(e) {
  e.preventDefault();
  const memberId = el.deductMemberSelect.value;
  const pts = Math.max(1, parseInt(el.deductCreditsInput.value || "0", 10));
  const note = safeText(el.deductNoteInput.value, "Redeemed purchase discount");

  const m = state.members.find((x) => x.id === memberId);
  if (!m) {
    showToast("Please select a valid member.", "error");
    return;
  }
  if ((m.credits || 0) < pts) {
    showToast(`Insufficient balance! Customer only has ${m.credits || 0} credits.`, "error");
    return;
  }

  const nowIso = new Date().toISOString();
  const cashVal = pts / 100;
  m.credits = (m.credits || 0) - pts;
  m.totalCashedOut = (m.totalCashedOut || 0) + cashVal;
  m.updatedAtIso = nowIso;
  m.synced = false;

  m.ledger.unshift({
    id: uid(),
    type: "DEBIT",
    credits: pts,
    cashValue: cashVal,
    note,
    dateTimeIso: nowIso,
    balanceAfter: m.credits
  });

  persistMembers();
  renderMembersSection();
  checkCustomerMemberMatch();
  el.deductModal.classList.add("hidden");
  showToast(`Redeemed ${pts} credits (${formatAmount(cashVal)}) for ${m.name}!`, "success");

  if (getAppsScriptUrl()) {
    void syncSaveMember(m);
  }
}

function onMemberActionClick(e) {
  const btn = e.target.closest("button[data-member-action]");
  if (!btn) return;
  const action = btn.dataset.memberAction;
  const id = btn.dataset.id;
  if (!id) return;

  if (action === "edit") openEditMemberModal(id);
  if (action === "add") openCreditModal(id);
  if (action === "deduct") openDeductModal(id);
  if (action === "history") openHistoryModal(id);
  if (action === "message") void messageMemberWithCard(id);
  if (action === "share-card") openMemberCardModal(id);
  if (action === "delete") {
    const m = state.members.find((x) => x.id === id);
    if (!m) return;
    const ok = confirm(`Delete member "${m.name}" permanently?`);
    if (!ok) return;
    state.members = state.members.filter((x) => x.id !== id);
    persistMembers();
    renderMembersSection();
    showToast("Member deleted.", "info");
  }
}

function onRecordCreditAddClick() {
  if (el.recordCreditModal) el.recordCreditModal.classList.add("hidden");
  const rec = state.activeRecordForCredit;
  if (!rec) return;

  const member = (rec.customerNumber ? findMemberByPhone(rec.customerNumber) : null) || findMemberByName(rec.customerName);
  if (member) {
    openCreditModal(member.id, rec.amount);
  } else {
    openNewMemberModal({ name: rec.customerName, phone: rec.customerNumber });
  }
}

function onRecordCreditDeductClick() {
  if (el.recordCreditModal) el.recordCreditModal.classList.add("hidden");
  const rec = state.activeRecordForCredit;
  if (!rec) return;

  const member = (rec.customerNumber ? findMemberByPhone(rec.customerNumber) : null) || findMemberByName(rec.customerName);
  if (member) {
    openDeductModal(member.id);
  } else {
    showToast("Customer is not registered in Members Club yet.", "info");
    openNewMemberModal({ name: rec.customerName, phone: rec.customerNumber });
  }
}

function onRecordCreditViewMemberClick() {
  if (el.recordCreditModal) el.recordCreditModal.classList.add("hidden");
  setActiveTab("members");
}

function renderHistoryTable(member) {
  if (!el.historyTableBody) return;
  el.historyTableBody.innerHTML = "";
  const ledger = member.ledger || [];

  if (!ledger.length) {
    el.historyTableBody.innerHTML = `<tr><td colspan="6" class="centered" style="color:#64748b;padding:20px;">No transactions recorded yet.</td></tr>`;
    return;
  }

  ledger.forEach((tx) => {
    const tr = document.createElement("tr");
    const isAdjust = tx.type === "ADJUST";
    const signedCredits = isAdjust ? (tx.credits || 0) : tx.type === "CREDIT" ? (tx.credits || 0) : -(tx.credits || 0);
    const isPositive = signedCredits >= 0;
    const label = isAdjust ? "✎ Adjusted" : isPositive ? "+ Earned" : "- Redeemed";

    tr.innerHTML = `<td>${formatIsoDateTime(tx.dateTimeIso)}</td>
      <td><span class="${isPositive ? "badge-tx-credit" : "badge-tx-debit"}">${label}</span></td>
      <td><strong>${isPositive ? "+" : "-"}${Math.abs(signedCredits)} pts</strong></td>
      <td>${formatAmount(tx.cashValue)}</td>
      <td>${tx.note || "—"}</td>
      <td>${tx.balanceAfter} pts</td>`;

    el.historyTableBody.appendChild(tr);
  });
}

function markMembersSyncedAll() {
  state.members = state.members.map((m) => ({ ...m, synced: true }));
  persistMembers();
}

function exportMembersToCSV() {
  if (!state.members.length) {
    showToast("No members to export.", "info");
    return;
  }

  const headers = ["Member ID", "Name", "Phone", "Type", "Credits Balance", "Cash Worth", "Lifetime Earned", "Total Cashed Out", "Joined Date", "Notes"];
  const rows = state.members.map((m) => [
    m.id,
    `"${m.name.replace(/"/g, '""')}"`,
    `"${m.phone}"`,
    m.type,
    m.credits,
    ((m.credits || 0) / 100).toFixed(2),
    m.lifetimeEarned,
    (m.totalCashedOut || 0).toFixed(2),
    m.createdAtIso,
    `"${(m.notes || "").replace(/"/g, '""')}"`
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `members-club-${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ==================== RECORDS MANAGEMENT HELPERS ==================== */

function normalizeRecord(r) {
  return {
    recordId: safeText(r.recordId || r.id, uid()),
    shopName: safeText(r.shopName, "Lucky Shop"),
    customerName: safeText(r.customerName, "Unnamed Customer"),
    customerNumber: safeText(r.customerNumber, ""),
    amount: round2(r.amount),
    prize: safeText(r.prize, "No Prize"),
    purchasedItem: safeText(r.purchasedItem || r.itemName, "—"),
    conditionId: safeText(r.conditionId, ""),
    status: normalizeManualStatus(r.status),
    dateTimeIso: r.dateTimeIso || new Date().toISOString(),
    expiryIso: r.expiryIso || addHours(new Date(r.dateTimeIso || Date.now()), 24).toISOString(),
    createdAtIso: r.createdAtIso || new Date().toISOString(),
    updatedAtIso: r.updatedAtIso || new Date().toISOString(),
    synced: !!r.synced
  };
}

function normalizeRecords(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeRecord);
}

function normalizeManualStatus(st) {
  const s = safeText(st).toLowerCase();
  if (s === "completed") return STATUS_COMPLETED;
  if (s === "rejected") return STATUS_REJECTED;
  if (s === "expired") return STATUS_EXPIRED;
  return STATUS_PENDING;
}

function getEffectiveStatus(record) {
  if (record.status && record.status !== STATUS_PENDING) return record.status;
  if (record.expiryIso) {
    const exp = new Date(record.expiryIso).getTime();
    if (!isNaN(exp) && Date.now() > exp) return STATUS_EXPIRED;
  }
  return STATUS_PENDING;
}

function getRecordById(id) {
  return state.records.find((r) => r.recordId === id) || null;
}

function getCurrentRecord() {
  if (!state.currentResultId) return null;
  return getRecordById(state.currentResultId);
}

function getEntrySignature() {
  const name = safeText(el.customerName ? el.customerName.value : "").toLowerCase();
  const phone = safeText(el.customerNumber ? el.customerNumber.value : "").toLowerCase();
  const amt = num(el.purchaseAmount ? el.purchaseAmount.value : "0");
  const cond = el.spinConditionSelect ? el.spinConditionSelect.value : "";
  return `${name}|${phone}|${amt}|${cond}`;
}

function getSpinDate() {
  if (state.settings.manualDateEnabled && state.settings.manualDateTime) {
    const d = new Date(state.settings.manualDateTime);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function addHours(date, h) {
  const result = new Date(date.getTime());
  result.setHours(result.getHours() + h);
  return result;
}

function createRecordId() {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.floor(1000 + Math.random() * 9000);
  return `DPM-${y}${m}${d}-${r}`;
}

function markRecordSynced(id, isSynced = true) {
  state.records = state.records.map((r) => (r.recordId === id ? { ...r, synced: isSynced } : r));
  persistRecords();
  renderRecordsTable();
}

function applyLocalRecordUpdate(id, updates) {
  state.records = state.records.map((r) => (r.recordId === id ? normalizeRecord({ ...r, ...updates, synced: false }) : r));
  persistRecords();
  renderRecordsTable();
  renderResult();
  if (state.currentResultId === id) {
    const cur = getCurrentRecord();
    if (cur) drawCouponFromRecord(cur);
  }
}

function removeLocalRecord(id) {
  state.records = state.records.filter((r) => r.recordId !== id);
  if (state.currentResultId === id) {
    state.currentResultId = null;
    renderResult();
    drawCouponPlaceholder();
  }
  persistRecords();
  renderRecordsTable();
}

function getStatusCounts(records) {
  const counts = { pending: 0, completed: 0, rejected: 0, expired: 0 };
  records.forEach((r) => {
    const st = getEffectiveStatus(r);
    if (st === STATUS_COMPLETED) counts.completed++;
    else if (st === STATUS_REJECTED) counts.rejected++;
    else if (st === STATUS_EXPIRED) counts.expired++;
    else counts.pending++;
  });
  return counts;
}

function getAllFilteredRecords() {
  let list = [...state.records];
  const q = safeText(el.recordSearchInput ? el.recordSearchInput.value : "").toLowerCase();
  if (q) {
    list = list.filter((r) => r.recordId.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q) || r.customerNumber.toLowerCase().includes(q));
  }

  const sortFilter = el.recordFilterSortSelect ? el.recordFilterSortSelect.value : "recent_old";
  if (sortFilter === "recent_old") list.sort((a, b) => getRecordTime(b) - getRecordTime(a));
  else if (sortFilter === "old_recent") list.sort((a, b) => getRecordTime(a) - getRecordTime(b));
  else if (sortFilter === "big_small") list.sort((a, b) => b.amount - a.amount);
  else if (sortFilter === "small_big") list.sort((a, b) => a.amount - b.amount);
  else if (sortFilter === "completed") list = list.filter((r) => getEffectiveStatus(r) === STATUS_COMPLETED);
  else if (sortFilter === "pending") list = list.filter((r) => getEffectiveStatus(r) === STATUS_PENDING);
  else if (sortFilter === "rejected") list = list.filter((r) => getEffectiveStatus(r) === STATUS_REJECTED);
  else if (sortFilter === "expired") list = list.filter((r) => getEffectiveStatus(r) === STATUS_EXPIRED);

  return list;
}

function getRecordTime(r) {
  const t = new Date(r.dateTimeIso || r.createdAtIso).getTime();
  return isNaN(t) ? 0 : t;
}

function getVisibleRecords() {
  const all = getAllFilteredRecords();
  const size = state.recordsPageSize || 10;
  const start = (state.recordsPage - 1) * size;
  return all.slice(start, start + size);
}

function pruneSelectionForMissingRecords() {
  const existing = new Set(state.records.map((r) => r.recordId));
  state.selectedRecordIds.forEach((id) => {
    if (!existing.has(id)) state.selectedRecordIds.delete(id);
  });
}

function updateBulkSelectionUI() {
  if (!el.bulkActionsBar || !el.applyBulkActionBtn) return;
  const count = getSelectedExistingRecordIds().length;
  el.bulkActionsBar.classList.toggle("hidden", count === 0);
  el.bulkActionsBar.classList.toggle("visible", count > 0);
  el.applyBulkActionBtn.disabled = count === 0;

  if (el.selectAllRecords) {
    const visibleIds = getVisibleRecords().map((r) => r.recordId);
    el.selectAllRecords.checked = visibleIds.length > 0 && visibleIds.every((id) => state.selectedRecordIds.has(id));
  }
}

function renderPaginationControls(totalCount, startIndex, visibleCount, totalPages) {
  const container = document.getElementById("recordsPaginationContainer");
  if (!container) return;

  const perPage = state.recordsPageSize || 50;
  const currentPage = state.recordsPage || 1;
  const perPageHtml = window.renderPerPageControlHTML ? window.renderPerPageControlHTML('spin_records', perPage) : '';
  const showStart = totalCount > 0 ? (currentPage - 1) * perPage + 1 : 0;
  const showEnd = Math.min(currentPage * perPage, totalCount);

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:white;border:1px solid #e2e8f0;border-radius:10px;margin-top:12px;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:0.8rem;color:#64748b;">Showing ${showStart}-${showEnd} of ${totalCount}</span>
        ${perPageHtml}
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <button id="_spinRecFirst" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-left"></i></button>
        <button id="_spinRecPrev" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-left"></i></button>
        <span style="padding:6px 12px;background:var(--primary, #6366f1);color:white;border-radius:6px;font-size:0.75rem;font-weight:700;">${currentPage} / ${totalPages}</span>
        <button id="_spinRecNext" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-right"></i></button>
        <button id="_spinRecLast" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-right"></i></button>
      </div>
    </div>
  `;

  // Nav button listeners
  const firstBtn = document.getElementById("_spinRecFirst");
  const prevBtn = document.getElementById("_spinRecPrev");
  const nextBtn = document.getElementById("_spinRecNext");
  const lastBtn = document.getElementById("_spinRecLast");
  if (firstBtn) firstBtn.onclick = () => goToRecordsPage(1);
  if (prevBtn) prevBtn.onclick = () => goToRecordsPage(currentPage - 1);
  if (nextBtn) nextBtn.onclick = () => goToRecordsPage(currentPage + 1);
  if (lastBtn) lastBtn.onclick = () => goToRecordsPage(totalPages);

  // Per-page select listeners
  const selectEl = container.querySelector('#perPageSelect_spin_records');
  const customInputEl = container.querySelector('#perPageCustomInput_spin_records');
  if (selectEl) {
    selectEl.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') {
        if (customInputEl) { customInputEl.style.display = 'inline-block'; customInputEl.focus(); }
      } else {
        if (customInputEl) customInputEl.style.display = 'none';
        const n = parseInt(val);
        if (!isNaN(n) && n > 0) {
          state.recordsPageSize = n;
          if (window.saveStoredPerPage) window.saveStoredPerPage('spin_records', n);
          state.recordsPage = 1;
          renderRecordsTable();
        }
      }
    });
  }
  if (customInputEl) {
    const handleCustom = (e) => {
      const n = parseInt(e.target.value);
      if (!isNaN(n) && n > 0) {
        state.recordsPageSize = n;
        if (window.saveStoredPerPage) window.saveStoredPerPage('spin_records', n);
        state.recordsPage = 1;
        renderRecordsTable();
      }
    };
    customInputEl.addEventListener('change', handleCustom);
    customInputEl.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleCustom(e); });
  }
}

function renderMembersPaginationControls(totalCount, totalPages) {
  const container = document.getElementById("membersPaginationContainer");
  if (!container) return;

  const perPage = state.membersPageSize || 50;
  const currentPage = state.membersPage || 1;
  const perPageHtml = window.renderPerPageControlHTML ? window.renderPerPageControlHTML('spin_members', perPage) : '';
  const showStart = totalCount > 0 ? (currentPage - 1) * perPage + 1 : 0;
  const showEnd = Math.min(currentPage * perPage, totalCount);

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:white;border:1px solid #e2e8f0;border-radius:10px;margin-top:12px;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:0.8rem;color:#64748b;">Showing ${showStart}-${showEnd} of ${totalCount}</span>
        ${perPageHtml}
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <button id="_spinMemFirst" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-left"></i></button>
        <button id="_spinMemPrev" ${currentPage <= 1 ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage <= 1 ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-left"></i></button>
        <span style="padding:6px 12px;background:var(--primary, #6366f1);color:white;border-radius:6px;font-size:0.75rem;font-weight:700;">${currentPage} / ${totalPages}</span>
        <button id="_spinMemNext" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-chevron-right"></i></button>
        <button id="_spinMemLast" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;background:white;cursor:pointer;font-size:0.75rem;${currentPage >= totalPages ? 'opacity:0.4;' : ''}"><i class="fas fa-angle-double-right"></i></button>
      </div>
    </div>
  `;

  // Nav button listeners
  const firstBtn = document.getElementById("_spinMemFirst");
  const prevBtn = document.getElementById("_spinMemPrev");
  const nextBtn = document.getElementById("_spinMemNext");
  const lastBtn = document.getElementById("_spinMemLast");
  if (firstBtn) firstBtn.onclick = () => goToMembersPage(1);
  if (prevBtn) prevBtn.onclick = () => goToMembersPage(currentPage - 1);
  if (nextBtn) nextBtn.onclick = () => goToMembersPage(currentPage + 1);
  if (lastBtn) lastBtn.onclick = () => goToMembersPage(totalPages);

  // Per-page select listeners
  const selectEl = container.querySelector('#perPageSelect_spin_members');
  const customInputEl = container.querySelector('#perPageCustomInput_spin_members');
  if (selectEl) {
    selectEl.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') {
        if (customInputEl) { customInputEl.style.display = 'inline-block'; customInputEl.focus(); }
      } else {
        if (customInputEl) customInputEl.style.display = 'none';
        const n = parseInt(val);
        if (!isNaN(n) && n > 0) {
          state.membersPageSize = n;
          if (window.saveStoredPerPage) window.saveStoredPerPage('spin_members', n);
          state.membersPage = 1;
          renderMembersSection();
        }
      }
    });
  }
  if (customInputEl) {
    const handleCustom = (e) => {
      const n = parseInt(e.target.value);
      if (!isNaN(n) && n > 0) {
        state.membersPageSize = n;
        if (window.saveStoredPerPage) window.saveStoredPerPage('spin_members', n);
        state.membersPage = 1;
        renderMembersSection();
      }
    };
    customInputEl.addEventListener('change', handleCustom);
    customInputEl.addEventListener('keyup', (e) => { if (e.key === 'Enter') handleCustom(e); });
  }
}

function goToMembersPage(p) {
  const totalCount = getFilteredMembers().length;
  const size = state.membersPageSize || 50;
  const max = Math.max(1, Math.ceil(totalCount / size));
  state.membersPage = Math.max(1, Math.min(p, max));
  renderMembersSection();
}

function goToRecordsPage(p) {
  const max = getLastRecordsPage();
  state.recordsPage = Math.max(1, Math.min(p, max));
  renderRecordsTable();
}

function getLastRecordsPage() {
  const totalCount = getAllFilteredRecords().length;
  const size = state.recordsPageSize || 50;
  return Math.max(1, Math.ceil(totalCount / size));
}

function exportRecordsToCSV() {
  if (!state.records.length) {
    showToast("No prize records to export.", "info");
    return;
  }
  const headers = ["Record ID", "Shop Name", "Customer Name", "Phone", "Purchased Item", "Bill Amount", "Prize Won", "Status", "Issued Date", "Expiry Date"];
  const rows = state.records.map((r) => [
    r.recordId,
    `"${r.shopName.replace(/"/g, '""')}"`,
    `"${r.customerName.replace(/"/g, '""')}"`,
    `"${r.customerNumber}"`,
    `"${r.purchasedItem}"`,
    r.amount.toFixed(2),
    `"${r.prize.replace(/"/g, '""')}"`,
    getEffectiveStatus(r),
    r.dateTimeIso,
    r.expiryIso
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `prize-history-${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function sanitizeFileName(name) {
  return String(name).replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}

function buildShareText(r) {
  return `🎉 *${r.shopName} - Reward Voucher* 🎉\n\nDear *${r.customerName}*, congratulations!\nYou won: *${r.prize}* on your purchase of ${formatAmount(r.amount)} (${r.purchasedItem})!\n\nVoucher Record ID: *${r.recordId}*\nValid Until: ${formatIsoDateTime(r.expiryIso)}\n\nPlease show this voucher at our store counter to redeem your reward.`;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch (e) {
      resolve(null);
    }
  });
}

function highlightInputError(inputEl) {
  if (!inputEl) return;
  inputEl.classList.remove("shake-input");
  void inputEl.offsetWidth;
  inputEl.classList.add("shake-input");
  inputEl.focus();
}

function resetFormForNewSpin() {
  if (el.customerName) el.customerName.value = "";
  if (el.customerNumber) el.customerNumber.value = "";
  if (el.purchaseAmount) el.purchaseAmount.value = "";
state.spinLockedForEntry = false;
  state.currentResultId = null;
  state.lastEntrySignature = "";
  clearWheelWinState();
  renderResult();
  drawCouponPlaceholder();
  refreshUI();
  if (el.customerName) el.customerName.focus();
}

function scrollToCouponPreview() {
  if (el.couponCanvas) {
    el.couponCanvas.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/* ==================== GOOGLE APPS SCRIPT BACKEND API ==================== */

async function syncSaveSettings(settings) {
  return await postToAppsScript({ action: "save_settings", settings });
}

async function syncCreateRecord(record) {
  return await postToAppsScript({ action: "create", record });
}

async function syncUpdateRecord(recordId, updates) {
  return await postToAppsScript({ action: "update", recordId, updates });
}

async function syncDeleteRecord(recordId) {
  return await postToAppsScript({ action: "delete", recordId });
}

async function syncSaveMember(member) {
  return await postToAppsScript({ action: "save_member", member });
}

async function syncAllMembersToSheets(membersList = null) {
  const members = membersList || state.members;
  return await postToAppsScript({ action: "sync_members", members });
}

async function apiGetFromAppsScript(action, extraParams = {}, timeoutMs = 30000) {
  const url = getAppsScriptUrl();
  if (!url) return { ok: false, message: "No Apps Script URL configured." };

  const fullParams = { action, ...extraParams };
  const getUrl = appendQueryParams(url, fullParams);

  // Strategy 1: Direct modern fetch with AbortController
  // Google Apps Script redirects (302) to script.googleusercontent.com which returns Access-Control-Allow-Origin: *
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const fetchRes = await fetch(getUrl, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timer);
    if (fetchRes.ok) {
      const data = await fetchRes.json();
      if (data && typeof data === "object") {
        return { ok: data.ok !== false, ...data };
      }
    }
  } catch (fetchErr) {
    if (fetchErr.name === "AbortError") {
      console.warn(`Direct fetch for '${action}' timed out after ${timeoutMs}ms, trying JSONP fallback...`);
    } else {
      console.warn(`Direct fetch for '${action}' failed (${fetchErr.message}), trying JSONP fallback...`);
    }
  }

  // Strategy 2: JSONP fallback with generous 30s timeout
  return await jsonpRequest(url, fullParams, timeoutMs);
}

async function apiListRecords() {
  return await apiGetFromAppsScript("list");
}

async function apiGetSettings() {
  return await apiGetFromAppsScript("settings");
}

async function apiListMembers() {
  return await apiGetFromAppsScript("members");
}

async function postToAppsScript(payload) {
  const url = getAppsScriptUrl();
  if (!url) return { ok: false, message: "Apps Script URL not set." };

  try {
    // Mode 'no-cors' sends to Google Apps Script without failing on 302 cross-origin redirect
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    return { ok: true };
  } catch (err) {
    console.warn("postToAppsScript error:", err);
    return { ok: false, message: err.message };
  }
}

function appendQueryParams(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.keys(params).forEach((k) => url.searchParams.set(k, params[k]));
  return url.toString();
}

async function parseApiResponse(res) {
  try {
    const data = await res.json();
    return { ok: data.ok !== false, ...data };
  } catch (e) {
    return { ok: res.ok, status: res.status };
  }
}

function jsonpRequest(baseUrl, params, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const callbackName = "jsonp_cb_" + Math.random().toString(36).substring(2, 9);
    let script = null;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try { delete window[callbackName]; } catch (e) {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
    };

    window[callbackName] = (data) => {
      cleanup();
      resolve({ ok: true, ...data });
    };

    const url = appendQueryParams(baseUrl, { ...params, callback: callbackName });
    script = document.createElement("script");
    script.src = url;
    script.onerror = () => {
      cleanup();
      resolve({ ok: false, message: "Network error loading from Google Sheets. Ensure Web App deployment access is set to 'Anyone'." });
    };

    timer = setTimeout(() => {
      cleanup();
      resolve({ ok: false, message: "Google Sheets request timed out after 30s. The sheet may be waking up or permissions may be restricted." });
    }, timeoutMs);

    document.head.appendChild(script);
  });
}


if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initDOM();
    init();
  });
} else {
  initDOM();
  init();
}
