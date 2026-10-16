-- ============================================================
-- SUPABASE SCHEMA FOR SHOP MANAGEMENT SYSTEM
-- ============================================================
-- Copy and paste this entire file into Supabase SQL Editor
-- (Dashboard → SQL Editor → New Query → Paste → Run)
--
-- This schema is aligned with every section of the app:
--   Login/Users, Shops, POS, Sales, Credits, Inventory/Products,
--   Expenses, Payments/Subscriptions, Settings, Activity/Audit,
--   Call History, Backups, Storefront (public), Spin & Win.
--
-- NOTES:
--   * This app uses CUSTOM auth (a `profiles` table + anon key),
--     NOT Supabase Auth accounts. All tables are created with
--     ROW LEVEL SECURITY DISABLED so the anon key can read/write.
--   * The script is IDEMPOTENT — safe to run more than once
--     (CREATE ... IF NOT EXISTS / ALTER ... IF NOT EXISTS).
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. SHOPS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS shops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_name TEXT NOT NULL,
    slug TEXT UNIQUE,
    address TEXT,
    phone TEXT,
    shop_logo TEXT,
    business_type TEXT DEFAULT 'general',
    current_balance NUMERIC(12,2) DEFAULT 0,
    currency TEXT DEFAULT 'INR',
    status TEXT DEFAULT 'active',
    admin_phone TEXT,
    admin_whatsapp TEXT,
    admin_telegram TEXT,
    admin_note TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. PROFILES (USERS) TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'shop_admin', 'shop_staff')),
    shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
    permissions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    active_session_id TEXT,
    last_login TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    category TEXT,
    type TEXT,
    stock INTEGER DEFAULT 0,
    cost_price NUMERIC(12,2) DEFAULT 0,
    selling_price NUMERIC(12,2) DEFAULT 0,
    product_image TEXT,
    product_images JSONB DEFAULT '[]',
    description TEXT,
    show_in_store BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 1000,
    low_stock_alert INTEGER DEFAULT 10,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster shop product lookups
CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(shop_id, sku);

-- ============================================================
-- 3b. PRODUCT VARIANTS TABLE (1-to-Many with products)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    variant_name TEXT NOT NULL,
    attributes JSONB DEFAULT '{}',
    sku TEXT,
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    cost_price NUMERIC(12,2) DEFAULT 0,
    stock INTEGER DEFAULT 0,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_shop_id ON product_variants(shop_id);

-- ============================================================
-- 4. SALES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    invoice_number TEXT,
    total_amount NUMERIC(12,2) DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    payment_method TEXT DEFAULT 'cash',
    sold_by TEXT,
    buyer_name TEXT,
    buyer_phone TEXT,
    buyer_address TEXT,
    amount_paid NUMERIC(12,2) DEFAULT 0,
    pending_amount NUMERIC(12,2) DEFAULT 0,
    sale_status TEXT DEFAULT 'completed' CHECK (sale_status IN ('completed', 'credit', 'refunded')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster sales queries by shop and date
CREATE INDEX IF NOT EXISTS idx_sales_shop_date ON sales(shop_id, created_at DESC);

-- ============================================================
-- 5. SALE ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT,
    sku TEXT,
    product_image TEXT,
    quantity INTEGER DEFAULT 1,
    unit_price NUMERIC(12,2) DEFAULT 0,
    original_price NUMERIC(12,2),
    cost_price NUMERIC(12,2),
    total_price NUMERIC(12,2) DEFAULT 0,
    price_changed BOOLEAN DEFAULT false
);

-- Index for faster sale item lookups
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);

-- ============================================================
-- 6. CREDITS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS credits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    buyer_name TEXT NOT NULL,
    buyer_phone TEXT,
    buyer_address TEXT,
    total_amount NUMERIC(12,2) DEFAULT 0,
    amount_paid NUMERIC(12,2) DEFAULT 0,
    pending_amount NUMERIC(12,2) DEFAULT 0,
    credit_date DATE DEFAULT CURRENT_DATE,
    due_date DATE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'completed')),
    notes TEXT,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credits_shop_id ON credits(shop_id);

-- ============================================================
-- 7. CREDIT PAYMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credit_id UUID NOT NULL REFERENCES credits(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    payment_amount NUMERIC(12,2) NOT NULL,
    payment_date DATE DEFAULT CURRENT_DATE,
    payment_method TEXT DEFAULT 'cash',
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_payments_credit_id ON credit_payments(credit_id);

-- ============================================================
-- 8. EXPENSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    expense_date DATE DEFAULT CURRENT_DATE,
    expense_type TEXT DEFAULT 'expense' CHECK (expense_type IN ('expense', 'income')),
    category TEXT,
    amount NUMERIC(12,2) NOT NULL,
    description TEXT,
    receipt_number TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurring_frequency TEXT,
    recurring_end_date DATE,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_shop_date ON expenses(shop_id, expense_date DESC);

-- ============================================================
-- 9. AUDIT LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    username TEXT,
    shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
    action TEXT,
    action_type TEXT,
    table_name TEXT,
    record_id TEXT,
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_shop_id ON audit_logs(shop_id, created_at DESC);

-- ============================================================
-- 10. CATEGORIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name TEXT NOT NULL,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_categories_shop_id ON categories(shop_id);

-- ============================================================
-- 11. SYSTEM CONFIGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS system_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 12. SHOP SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS shop_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID UNIQUE NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    business_type TEXT DEFAULT 'general',
    currency TEXT DEFAULT 'INR',
    tax_rate NUMERIC(5,2) DEFAULT 0,
    default_profit_margin NUMERIC(5,2) DEFAULT 30,
    enable_tax_calculation BOOLEAN DEFAULT false,
    enable_low_stock_alert BOOLEAN DEFAULT true,
    low_stock_threshold INTEGER DEFAULT 10,
    default_payment_method TEXT DEFAULT 'cash',
    enable_barcode_scanner BOOLEAN DEFAULT true,
    enable_quick_sale BOOLEAN DEFAULT true,
    auto_print_invoice BOOLEAN DEFAULT false,
    receipt_header TEXT DEFAULT 'Thank you for shopping with us!',
    receipt_footer TEXT DEFAULT 'Please visit again!',
    receipt_qr_image_url TEXT DEFAULT '',
    whatsapp_number TEXT,
    telegram_id TEXT,
    facebook_url TEXT,
    instagram_url TEXT,
    google_maps_url TEXT,
    google_sheet_url TEXT,
    spinwin_apps_script_url TEXT,
    opening_hours TEXT,
    about_us TEXT,
    theme_color TEXT DEFAULT '#0f6425',
    theme_layout TEXT DEFAULT 'default',
    banner_text TEXT,
    custom_domain TEXT,
    seo_keywords TEXT,
    seo_title TEXT,
    seo_description TEXT,
    custom_scripts TEXT,
    category_order TEXT,
    carousel_images JSONB DEFAULT '[]',
    discount_codes JSONB DEFAULT '[]',
    extra_contacts JSONB DEFAULT '[]',
    enable_auto_backup BOOLEAN DEFAULT false,
    auto_backup_time TEXT,
    enable_tryon BOOLEAN DEFAULT true,
    gemini_api_key TEXT DEFAULT '',
    gemini_image_model TEXT DEFAULT 'gemini-2.5-flash-image',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 13. SHOP SUBSCRIPTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS shop_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    subscription_type TEXT DEFAULT 'monthly' CHECK (subscription_type IN ('weekly', 'monthly', 'yearly', 'once')),
    amount NUMERIC(12,2) DEFAULT 0,
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'frozen', 'suspended', 'stopped')),
    next_payment_date TIMESTAMPTZ,
    last_payment_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_shop_id ON shop_subscriptions(shop_id);

-- ============================================================
-- 14. PAYMENT TRANSACTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES shop_subscriptions(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL,
    payment_date DATE DEFAULT CURRENT_DATE,
    payment_method TEXT,
    transaction_reference TEXT,
    notes TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('completed', 'pending', 'failed')),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_shop_id ON payment_transactions(shop_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);

-- ============================================================
-- 15. PAYMENT NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    title TEXT,
    message TEXT,
    notification_type TEXT DEFAULT 'info' CHECK (notification_type IN ('warning', 'payment_due', 'freeze', 'suspension', 'info')),
    is_read BOOLEAN DEFAULT false,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_notifications_shop_id ON payment_notifications(shop_id);

-- ============================================================
-- 16. PAYMENT SETTINGS TABLE (Global - Single Row)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code_url TEXT,
    upi_id TEXT,
    bank_name TEXT,
    account_holder_name TEXT,
    account_number TEXT,
    ifsc_code TEXT,
    phone_number TEXT,
    payment_instructions TEXT,
    additional_details JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 17. BACKUPS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS backups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    backup_type TEXT DEFAULT 'manual',
    backup_date TIMESTAMPTZ DEFAULT NOW(),
    format TEXT DEFAULT 'json',
    size INTEGER DEFAULT 0,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_backups_shop_id ON backups(shop_id);

-- ============================================================
-- 18. CALL HISTORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS call_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    buyer_name TEXT,
    buyer_phone TEXT,
    call_type TEXT DEFAULT 'outgoing_call',
    called_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    call_time TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_history_shop_id ON call_history(shop_id);

-- ============================================================
-- 19. STOREFRONT TABLES (public shopping site @ /shop/)
-- ============================================================
-- Used by the storefront (folder: shop/) and by the admin orders
-- page (orders.html). Shoppers place orders, create accounts,
-- write reviews; the store owner can ban shoppers. Each order is
-- linked to the shop it was placed on. The storefront's products,
-- shop details and settings come from the existing multishop
-- tables above (products, shops, shop_settings) — not new ones.
-- ============================================================

-- Customer orders placed from the storefront
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_shop_date ON orders(shop_id, created_at DESC);

-- Storefront shopper accounts (mobile number + password)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT DEFAULT '',
    phone TEXT,
    password TEXT DEFAULT '',
    addresses JSONB DEFAULT '[]'::jsonb,
    cart JSONB DEFAULT '[]'::jsonb,
    cart_removed JSONB DEFAULT '[]'::jsonb,
    visits INTEGER DEFAULT 0,
    last_visit TIMESTAMPTZ,
    banned BOOLEAN DEFAULT false,
    last_ip TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- Product reviews & ratings written by shoppers
CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    product_id TEXT,
    user_id TEXT,
    data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);

-- Blocked shoppers (matched by ip address / account id / mobile)
CREATE TABLE IF NOT EXISTS bans (
    id TEXT PRIMARY KEY,
    ip TEXT,
    user_id TEXT,
    phone TEXT,
    reason TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bans_ip ON bans(ip);
CREATE INDEX IF NOT EXISTS idx_bans_user_id ON bans(user_id);
CREATE INDEX IF NOT EXISTS idx_bans_phone ON bans(phone);

-- ============================================================
-- ACCESS CONTROL
-- ============================================================
-- This app authenticates through the `profiles` table with the
-- anon key (custom auth). The anon key CANNOT read or write the
-- tables unless either (a) RLS is disabled, or (b) RLS policies
-- exist. We DISABLE RLS everywhere so the whole system works
-- immediately. (The app already handles its own auth/roles.)
-- ============================================================

ALTER TABLE shops DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE credits DISABLE ROW LEVEL SECURITY;
ALTER TABLE credit_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_configs DISABLE ROW LEVEL SECURITY;
ALTER TABLE shop_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE shop_subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE backups DISABLE ROW LEVEL SECURITY;
ALTER TABLE call_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE reviews DISABLE ROW LEVEL SECURITY;
ALTER TABLE bans DISABLE ROW LEVEL SECURITY;

-- Catch-all: force RLS OFF on EVERY table in the public schema.
-- This guarantees the anon key works even if a table was created
-- elsewhere (e.g. via the Dashboard, which enables RLS by default).
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tablename);
    END LOOP;
END $$;

-- Make sure anon / authenticated / service_role can use the tables.
-- (Supabase usually grants these by default, but this guarantees it.)
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
-- Run these in Supabase SQL Editor or create manually in Dashboard → Storage
-- (The app uploads product images to ImgBB, so buckets are optional.)

-- 1. Products bucket (for product images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('products', 'products', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Payment QR Codes bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-qr-codes', 'payment-qr-codes', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STORAGE POLICIES (Allow public read, authenticated upload)
-- ============================================================
-- NOTE: This section is OPTIONAL. The app uploads product images
-- to ImgBB, not Supabase Storage. On some Supabase projects the
-- storage.objects table is locked to an internal role, so policy
-- statements can fail with "must be owner of table objects".
-- The whole section is wrapped in an exception handler so it can
-- never stop the rest of the schema from running. If you want
-- storage policies, create them in Dashboard → Storage → Policies.
-- ============================================================

DO $$
BEGIN
    BEGIN
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DROP POLICY IF EXISTS "Public read access for products" ON storage.objects;
        CREATE POLICY "Public read access for products" ON storage.objects
            FOR SELECT USING (bucket_id = 'products');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DROP POLICY IF EXISTS "Allow uploads to products" ON storage.objects;
        CREATE POLICY "Allow uploads to products" ON storage.objects
            FOR INSERT WITH CHECK (bucket_id = 'products');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DROP POLICY IF EXISTS "Allow updates to products" ON storage.objects;
        CREATE POLICY "Allow updates to products" ON storage.objects
            FOR UPDATE USING (bucket_id = 'products');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DROP POLICY IF EXISTS "Allow deletes from products" ON storage.objects;
        CREATE POLICY "Allow deletes from products" ON storage.objects
            FOR DELETE USING (bucket_id = 'products');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DROP POLICY IF EXISTS "Public read access for payment-qr-codes" ON storage.objects;
        CREATE POLICY "Public read access for payment-qr-codes" ON storage.objects
            FOR SELECT USING (bucket_id = 'payment-qr-codes');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DROP POLICY IF EXISTS "Allow uploads to payment-qr-codes" ON storage.objects;
        CREATE POLICY "Allow uploads to payment-qr-codes" ON storage.objects
            FOR INSERT WITH CHECK (bucket_id = 'payment-qr-codes');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        DROP POLICY IF EXISTS "Allow updates to payment-qr-codes" ON storage.objects;
        CREATE POLICY "Allow updates to payment-qr-codes" ON storage.objects
            FOR UPDATE USING (bucket_id = 'payment-qr-codes');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- ============================================================
-- DEFAULT DATA
-- ============================================================

-- Insert default system configs
INSERT INTO system_configs (key, value) VALUES
    ('mgmt_domain', ''),
    ('public_shop_domain', '')
ON CONFLICT (key) DO NOTHING;

-- Insert default payment settings (single row)
INSERT INTO payment_settings (id, payment_instructions)
VALUES (uuid_generate_v4(), 'Please make payment using the details above and share the screenshot.')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CREATE DEFAULT SUPER ADMIN USER
-- ============================================================
-- IMPORTANT: Change the password after first login!
INSERT INTO profiles (username, password, full_name, role, is_active)
VALUES ('admin', 'admin123', 'Super Admin', 'super_admin', true)
ON CONFLICT (username) DO NOTHING;


-- ============================================================
-- UPGRADES FOR EXISTING INSTALLATIONS
-- Run these once if your database was created before AI Try-On,
-- the Customer section, or the IP-address audit logging existed.
-- Safe to run more than once.
-- ============================================================

ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS enable_tryon BOOLEAN DEFAULT true;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS gemini_api_key TEXT DEFAULT '';
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS gemini_image_model TEXT DEFAULT 'gemini-2.5-flash-image';
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS receipt_qr_image_url TEXT DEFAULT '';
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS extra_contacts JSONB DEFAULT '[]';
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS spinwin_apps_script_url TEXT DEFAULT '';

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';

-- Storefront shopper-table upgrades (safe to run more than once).
-- Brings an older `users` table up to date with cart/visit/ban columns.
ALTER TABLE users ADD COLUMN IF NOT EXISTS cart_removed JSONB DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS visits INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_visit TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip TEXT;

-- Adds the shop link to an older `orders` table created without it.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE CASCADE;


-- ============================================================
-- DONE! Your database is ready.
-- ============================================================
-- Next steps:
-- 1. Go to Authentication → Settings → Disable email confirmations (since we use custom auth)
-- 2. Go to Settings → API → Copy your Project URL and anon key
-- 3. Update js/supabase-config.js with your credentials
-- 4. Login with username: admin, password: admin123
-- 5. CHANGE THE DEFAULT PASSWORD IMMEDIATELY
-- ============================================================