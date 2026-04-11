/**
 * ============================================================
 * FİLM ARŞİVİ - SUPABASE CLIENT MANAGER
 * Kimlik bilgileri localStorage'da saklanır → tüm sekmelerde geçerli.
 * Supabase session yönetimi tamamen Supabase SDK'ya bırakılmıştır.
 * ============================================================
 */

let _supabaseClient = null;
let _supabaseSession = null;
let _tmdbApiKey = null;

// ——— Depolama anahtarları ———
const KEYS = {
    URL:     'fa_sb_url',   // Supabase proje URL
    KEY:     'fa_sb_key',   // Supabase anon key
    TMDB:    'fa_tmdb_key', // TMDB API key (30 gün)
    TMDB_EXP:'fa_tmdb_exp'  // TMDB key expire timestamp
};

// ——— localStorage yardımcıları ———
const Store = {
    set(k, v) { try { localStorage.setItem(k, v); } catch(e) {} },
    get(k)    { try { return localStorage.getItem(k); } catch(e) { return null; } },
    del(k)    { try { localStorage.removeItem(k); } catch(e) {} }
};

// ——— Supabase client oluştur ———
function initSupabase() {
    const url = Store.get(KEYS.URL);
    const key = Store.get(KEYS.KEY);

    if (!url || !key) {
        redirectToLogin();
        return false;
    }

    if (!_supabaseClient) {
        _supabaseClient = window.supabase.createClient(url, key, {
            auth: {
                persistSession: true,       // Supabase kendi oturumunu localStorage'a yazar
                autoRefreshToken: true,     // Token otomatik yenilenir
                storageKey: 'fa_supabase_auth', // Supabase'in kendi localStorage key'i
                detectSessionInUrl: false
            }
        });
    }

    return true;
}

// ——— Auth kontrolü — her sayfada çağrılır ———
async function requireAuth() {
    if (!initSupabase()) return null;

    const { data: { session }, error } = await _supabaseClient.auth.getSession();

    if (error || !session) {
        // Token süresi dolmuş olabilir, SDK otomatik refresh dener
        // Yine de null dönerse login'e at
        redirectToLogin();
        return null;
    }

    _supabaseSession = session;
    return session;
}

// ——— Login sayfasına yönlendir ———
function redirectToLogin() {
    // URL ve key'i silme — kullanıcı tekrar login olmak zorunda kalmasın
    // Sadece aktif sekmedeki geçici state'i temizle
    _supabaseClient = null;
    _supabaseSession = null;
    _tmdbApiKey = null;
    window.location.replace('login.html');
}

// ——— Kullanıcı ID ———
function getCurrentUserId() {
    return _supabaseSession?.user?.id || null;
}

// ——— TMDB Key (memory → localStorage → DB) ———
async function getTmdbApiKey() {
    // 1. Memory
    if (_tmdbApiKey) return _tmdbApiKey;

    // 2. localStorage (expire kontrolü ile)
    const cached  = Store.get(KEYS.TMDB);
    const exp     = Store.get(KEYS.TMDB_EXP);
    if (cached && exp && Date.now() < parseInt(exp)) {
        _tmdbApiKey = cached;
        return cached;
    }

    // 3. Veritabanından çek
    return await fetchTmdbKeyFromDB();
}

async function fetchTmdbKeyFromDB() {
    if (!_supabaseClient) return null;
    try {
        const { data, error } = await _supabaseClient
            .from('app_config')
            .select('value')
            .eq('key', 'tmdb_api_key')
            .single();

        if (error || !data) { console.error('TMDB key alınamadı:', error); return null; }

        _tmdbApiKey = data.value;
        // 30 gün localStorage'da sakla
        Store.set(KEYS.TMDB,     data.value);
        Store.set(KEYS.TMDB_EXP, Date.now() + 30 * 24 * 60 * 60 * 1000);
        return data.value;
    } catch(e) { console.error('TMDB fetch hatası:', e); return null; }
}

async function refreshTmdbKey() {
    Store.del(KEYS.TMDB);
    Store.del(KEYS.TMDB_EXP);
    _tmdbApiKey = null;
    return await fetchTmdbKeyFromDB();
}

// ——— Çıkış Yap ———
async function logout() {
    if (_supabaseClient) await _supabaseClient.auth.signOut();
    // Tüm kalıcı verileri temizle
    Store.del(KEYS.URL);
    Store.del(KEYS.KEY);
    Store.del(KEYS.TMDB);
    Store.del(KEYS.TMDB_EXP);
    _supabaseClient  = null;
    _supabaseSession = null;
    _tmdbApiKey      = null;
    window.location.replace('login.html');
}

// ——— Global erişim ———
window.SupabaseManager = {
    get client()  { return _supabaseClient; },
    get session() { return _supabaseSession; },
    initSupabase,
    requireAuth,
    getCurrentUserId,
    getTmdbApiKey,
    refreshTmdbKey,
    redirectToLogin,
    logout,
    Store,
    KEYS
};

