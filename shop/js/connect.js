/* ============================================================
   NovaCart — connection keys
   ------------------------------------------------------------
   Put ALL of your keys and secrets in this one file.

   After editing, reload the site. If a value is left empty the
   site falls back to storing data in this browser only (localStorage),
   so nothing breaks.

   1. Supabase  -> https://app.supabase.com  (Project Settings > API)
        url     : your Project URL, e.g. https://abcd1234.supabase.co
        anonKey : the "anon public" API key
        Run supabase-schema.sql (repository root) once in the Supabase SQL editor.

   2. imgbb     -> https://api.imgbb.com/  (Get API key)
        Used by the admin panel to upload product images.

   3. Admin password : set/changed from the admin panel (Security tab).
      It is stored in your Supabase settings row, salted + hashed.
      Convenience protection only, NOT real security.

   Shoppers sign up / sign in with a mobile number + password.
   Anything in a front-end file is public. The Supabase anon
   key is designed to be public — keep your RLS policies restrictive.
   ============================================================ */
window.NC_CONNECT = {
    supabase: {
        // Multishop project URL (NOT the /rest/v1/ endpoint).
        url: 'https://ksokktaqnojhuiutgquq.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzb2trdGFxbm9qaHVpdXRncXVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1Njg5NzQsImV4cCI6MjEwNzE0NDk3NH0.PfZHoJxbh2BHbmtAJ6D5O8nBXA2-PGKPwanxDh8Qay4',
        apiSchema: 'public'
    },

    imgbb: {
        key: '7b541261ad09636b74fee714473fe7fc'
    },

    auth: {
        // true = block shopping until the user signs in.
        required: false,
        // Internal domain used to turn a mobile number into an email
        // (Supabase Auth needs an email under the hood).
        domain: 'phone.novacart.local'
    }
};
