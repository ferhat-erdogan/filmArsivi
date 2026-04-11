/**
 * ============================================================
 * FİLM ARŞİVİ - ARŞİV SERVİSİ (SUPABASE + OPTİMİSTİK UI)
 * Tüm işlemler önce local cache'e, sonra Supabase'e yazılır.
 * Hata olursa UI geri alınır.
 * ============================================================
 */

// ——— In-memory cache (sayfa ömrü boyunca) ———
let _moviesCache = null;      // user_movies []
let _personsCache = null;     // user_persons []
let _cacheLoaded = false;

// ——— Skeleton / loading göstergesi ———
function showSkeletonCards(container, count = 6) {
    if (!container) return;
    const skeletons = Array.from({ length: count }).map(() => `
        <div class="movie-card skeleton-card" style="background: rgba(255,255,255,0.04); animation: skeletonPulse 1.4s ease infinite;">
            <div style="width:100%;height:100%;background:linear-gradient(110deg,rgba(255,255,255,0.03) 8%,rgba(255,255,255,0.07) 18%,rgba(255,255,255,0.03) 33%);background-size:200% 100%;animation:skeletonShimmer 1.4s linear infinite;"></div>
        </div>`).join('');
    container.innerHTML = skeletons;
}

// ——— Cache yükle (ilk açılışta bir kez) ———
async function loadCache() {
    if (_cacheLoaded) return;
    const db = SupabaseManager.client;
    const userId = SupabaseManager.getCurrentUserId();
    if (!db || !userId) return;

    const [moviesRes, personsRes] = await Promise.all([
        db.from('user_movies').select('*').eq('user_id', userId).order('added_at', { ascending: false }),
        db.from('user_persons').select('*').eq('user_id', userId).order('added_at', { ascending: false })
    ]);

    _moviesCache = (moviesRes.data || []).map(row => ({
        ...row.movie_data,
        _rowId: row.id,
        media_type: row.media_type,
        isFav: row.is_fav,
        isWatched: row.is_watched,
        addedDate: row.added_at
    }));

    _personsCache = (personsRes.data || []).map(row => ({
        ...row.person_data,
        _rowId: row.id,
        addedDate: row.added_at
    }));

    _cacheLoaded = true;
}

// ——— Cache'i zorla yenile ———
async function invalidateCache() {
    _cacheLoaded = false;
    _moviesCache = null;
    _personsCache = null;
    await loadCache();
}

// ——— Film Arşivi ———
function getArchive() {
    return _moviesCache || [];
}

async function saveToArchive(movieId, type = 'movie') {
    await loadCache();
    const db = SupabaseManager.client;
    const userId = SupabaseManager.getCurrentUserId();
    if (!db || !userId) return false;

    // Zaten var mı?
    if (_moviesCache.find(m => m.id == movieId && m.media_type === type)) {
        if (typeof showToast === 'function') showToast('ZATEN ARŞİVDE');
        return false;
    }

    // TMDB'den veri çek
    const movieData = await getMovieDetails(movieId, type);
    if (!movieData) {
        if (typeof showToast === 'function') showToast('VERİ ÇEKİLEMEDİ');
        return false;
    }

    const newEntry = {
        ...movieData,
        media_type: type,
        isFav: false,
        isWatched: false,
        addedDate: new Date().toISOString()
    };

    // OPTİMİSTİK: önce cache'e ekle
    _moviesCache.unshift(newEntry);

    // Sonra DB'ye yaz
    const { data, error } = await db.from('user_movies').insert({
        user_id: userId,
        tmdb_id: movieId,
        media_type: type,
        movie_data: movieData,
        is_fav: false,
        is_watched: false
    }).select('id').single();

    if (error) {
        // Hata → cache'i geri al
        _moviesCache = _moviesCache.filter(m => !(m.id == movieId && m.media_type === type));
        if (typeof showToast === 'function') showToast('HATA OLUŞTU');
        return false;
    }

    // DB'den dönen row id'yi ekle
    _moviesCache[0]._rowId = data.id;
    return true;
}

async function removeFromArchive(movieId) {
    await loadCache();
    const db = SupabaseManager.client;
    const userId = SupabaseManager.getCurrentUserId();
    if (!db || !userId) return;

    const idx = _moviesCache.findIndex(m => m.id == movieId);
    if (idx === -1) return;

    const removed = _moviesCache[idx];

    // OPTİMİSTİK: önce cache'den çıkar
    _moviesCache.splice(idx, 1);

    // DB'den sil
    const { error } = await db.from('user_movies')
        .delete()
        .eq('user_id', userId)
        .eq('tmdb_id', movieId);

    if (error) {
        // Hata → geri ekle
        _moviesCache.splice(idx, 0, removed);
        if (typeof showToast === 'function') showToast('SİLME HATASI');
    }
}

async function toggleFavStatus(movieId) {
    await loadCache();
    const db = SupabaseManager.client;
    const userId = SupabaseManager.getCurrentUserId();
    if (!db || !userId) return null;

    const movie = _moviesCache.find(m => m.id == movieId);
    if (!movie) return null;

    const newFav = !movie.isFav;

    // OPTİMİSTİK
    movie.isFav = newFav;

    const { error } = await db.from('user_movies')
        .update({ is_fav: newFav })
        .eq('user_id', userId)
        .eq('tmdb_id', movieId);

    if (error) {
        movie.isFav = !newFav; // geri al
        return null;
    }

    return newFav;
}

async function toggleWatchedStatus(movieId) {
    await loadCache();
    const db = SupabaseManager.client;
    const userId = SupabaseManager.getCurrentUserId();
    if (!db || !userId) return null;

    const movie = _moviesCache.find(m => m.id == movieId);
    if (!movie) return null;

    const newWatched = !movie.isWatched;

    // OPTİMİSTİK
    movie.isWatched = newWatched;

    const { error } = await db.from('user_movies')
        .update({ is_watched: newWatched })
        .eq('user_id', userId)
        .eq('tmdb_id', movieId);

    if (error) {
        movie.isWatched = !newWatched;
        return null;
    }

    return newWatched;
}

// ——— Oyuncu Arşivi ———
function getPersonArchive() {
    return _personsCache || [];
}

function isPersonFav(personId) {
    return (_personsCache || []).some(p => p.id == personId);
}

async function togglePersonFav(personId) {
    await loadCache();
    const db = SupabaseManager.client;
    const userId = SupabaseManager.getCurrentUserId();
    if (!db || !userId) return null;

    const idx = _personsCache.findIndex(p => p.id == personId);

    if (idx !== -1) {
        // Var → çıkar (OPTİMİSTİK)
        const removed = _personsCache[idx];
        _personsCache.splice(idx, 1);

        const { error } = await db.from('user_persons')
            .delete()
            .eq('user_id', userId)
            .eq('tmdb_person_id', personId);

        if (error) {
            _personsCache.splice(idx, 0, removed);
            return null;
        }
        return false;
    } else {
        // Yok → ekle
        const personData = await getPersonDetails(personId);
        if (!personData) return null;

        const newEntry = { ...personData, addedDate: new Date().toISOString() };

        // OPTİMİSTİK
        _personsCache.unshift(newEntry);

        const { error } = await db.from('user_persons').insert({
            user_id: userId,
            tmdb_person_id: personId,
            person_data: personData
        });

        if (error) {
            _personsCache.shift();
            return null;
        }
        return true;
    }
}

