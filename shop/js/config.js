/* ============================================================
   NovaCart — backend configuration

   All keys now live in js/connect.js (window.NC_CONNECT).
   Edit that file, not this one. The values below are applied
   on top of whatever js/connect.js defines, so you can also
   just set them here if you prefer.

   1. Supabase  -> https://app.supabase.com  (Project Settings > API)
        - supabaseUrl : your Project URL, e.g. https://abcd1234.supabase.co
        - supabaseAnonKey : the "anon public" API key
        - apiSchema : optional, defaults to "public"
      Run supabase-schema.sql (repository root) once in the Supabase SQL editor to create
      the tables this panel needs.

   2. imgbb     -> https://api.imgbb.com/  (Get API key)
        - imgbbKey : used by the admin panel to upload product images.

   3. Admin password : no longer set in JavaScript. The admin gate password
      lives in your Supabase settings row (salted + SHA-256 hashed) and is set
      or changed from Admin panel > Security. Until you set one, the default
      is "admin123". This is convenience protection only, NOT real security —
      keep the anon key's Row Level Security policies in mind.

   4. Auth : the storefront lets shoppers sign up / sign in with a mobile
      number + password. When Supabase is configured, accounts are stored
      in the public.users table (see supabase-schema.sql). With Supabase
      unconfigured, accounts live in this browser only.

   If Supabase is left unconfigured the site keeps working with data
   stored in this browser's localStorage instead.
   ============================================================ */
(function () {
    var connect = window.NC_CONNECT || {};
    var connectSupabase = connect.supabase || {};
    var connectImgbb = connect.imgbb || {};
    var connectAuth = connect.auth || {};

    window.NC_CONFIG = {
        supabase: {
            url: connectSupabase.url || '',
            anonKey: connectSupabase.anonKey || '',
            apiSchema: connectSupabase.apiSchema || 'public'
        },
        imgbb: {
            key: connectImgbb.key || ''
        },
        auth: {
            // Shoppers sign up / sign in with a mobile number + password.
            // When Supabase is configured the accounts live in public.users;
            // otherwise they live in this browser only.
            required: connectAuth.required === true, // true = block until signed in
            domain: connectAuth.domain || 'phone.novacart.local'
        }
    };
})();
