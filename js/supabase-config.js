// Supabase Configuration
const SUPABASE_URL = 'https://ksokktaqnojhuiutgquq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzb2trdGFxbm9qaHVpdXRncXVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1Njg5NzQsImV4cCI6MjEwNzE0NDk3NH0.PfZHoJxbh2BHbmtAJ6D5O8nBXA2-PGKPwanxDh8Qay4';

// Create Supabase client
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test connection
async function testSupabaseConnection() {
    try {
        const { data, error } = await supabaseClient.from('profiles').select('count', { count: 'exact', head: true });
        if (error) throw error;
        return true;
    } catch (error) {
        showNotification('Failed to connect to database. Please check your connection.', 'error');
        return false;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    testSupabaseConnection();
});

// Export for use in other files
window.supabaseClient = supabaseClient;
