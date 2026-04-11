/**
 * ============================================================
 * FİLM ARŞİVİ - TMDB API KATMANI
 * TMDB key artık frontend'e gömülü değil — Supabase'den çekiliyor.
 * Hata durumunda key otomatik yenilenir.
 * ============================================================
 */

const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL  = 'https://image.tmdb.org/t/p/w500';
const LANG     = 'tr-TR';

// İstek başına API çağrı önbelleği (sayfa ömrü boyunca geçerli)
const _apiCache = new Map();

/**
 * Temel API isteği — key gerektiğinde otomatik yeniler
 */
async function fetchData(endpoint, params = "", useLang = true, _retried = false) {
    const apiKey = await SupabaseManager.getTmdbApiKey();

    if (!apiKey) {
        console.error('TMDB API Key bulunamadı.');
        return null;
    }

    const langParam = useLang ? `&language=${LANG}` : '';
    const url = `${BASE_URL}${endpoint}?api_key=${apiKey}${langParam}${params}`;
    const cacheKey = url;

    // Cache kontrolü
    if (_apiCache.has(cacheKey)) return _apiCache.get(cacheKey);

    try {
        const response = await fetch(url);

        // 401 → key geçersiz, yenile ve tekrar dene
        if (response.status === 401 && !_retried) {
            console.warn('TMDB key geçersiz, yenileniyor...');
            await SupabaseManager.refreshTmdbKey();
            return fetchData(endpoint, params, useLang, true);
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        _apiCache.set(cacheKey, data);

        // Cache'i 5dk sonra temizle
        setTimeout(() => _apiCache.delete(cacheKey), 5 * 60 * 1000);

        return data;
    } catch (error) {
        console.error('API isteği başarısız:', error);
        return null;
    }
}

/**
 * Keşfet / Popüler filmler
 */
async function fetchDiscoverMovies(page = 1, extraParams = "") {
    // extraParams içinde with_genres vs. var ise discover kullan
    const hasFilter = extraParams.includes('with_genres') || extraParams.includes('primary_release') ||
                      extraParams.includes('with_original_language') || extraParams.includes('without_genres') ||
                      extraParams.includes('sort_by=') && !extraParams.includes('sort_by=popularity.desc');

    const endpoint = hasFilter ? '/discover/movie' : '/movie/popular';
    const sortParam = !hasFilter ? '' : '';

    const data = await fetchData(endpoint, `&page=${page}${extraParams}`);
    return data ? data.results.map(m => ({ ...m, media_type: 'movie' })) : [];
}

/**
 * Canlı arama (film, dizi, kişi)
 */
async function searchMovies(query) {
    const data = await fetchData('/search/multi', `&query=${encodeURIComponent(query)}&include_adult=false`);
    return data ? data.results : [];
}

/**
 * Film/Dizi detayı (external_ids ile birlikte)
 */
async function getMovieDetails(id, type = 'movie') {
    // external_ids eklendi
    const data = await fetchData(
        `/${type}/${id}`,
        `&append_to_response=videos,credits,external_ids&include_video_language=tr,en,null`
    );
    
    // external_ids içinden imdb_id'yi ana objeye ekleyelim
    if (data && data.external_ids) {
        data.imdb_id = data.external_ids.imdb_id;
    }
    
    return data;
}

/**
 * Oyuncu detayı — TR biyografi yoksa EN fallback
 */
async function getPersonDetails(personId) {
    const data = await fetchData(`/person/${personId}`, `&append_to_response=combined_credits`);
    if (!data) return null;

    // TR biyografisi boşsa İngilizce çek
    if (!data.biography || data.biography.trim() === '') {
        const enData = await fetchData(`/person/${personId}`, `&append_to_response=combined_credits`, false);
        if (enData && enData.biography) {
            data.biography = enData.biography;
        }
    }
    return data;
}

/**
 * Tür listesi
 */
async function getGenres(type = 'movie') {
    const data = await fetchData(`/genre/${type}/list`);
    return data ? data.genres : [];
}

/**
 * Koleksiyon detayı
 */
async function getCollectionDetails(collectionId) {
    return await fetchData(`/collection/${collectionId}`);
}

/**
 * Öneri listesi
 */
async function getRecommendations(id, type) {
    return await fetchData(`/${type}/${id}/recommendations`);
}

