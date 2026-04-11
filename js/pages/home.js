/**
 * ============================================================
 * FİLM ARŞİVİ - ANA SAYFA (home.js)
 * Supabase + Optimistik UI + Adult Gizle + Skeleton Loading
 * ============================================================
 */

// ——— Global State ———
const DEFAULT_FILTER = {
    status: 'all',
    isFavOnly: false,
    isPersonOnly: false,
    isDiscover: false,
    genreIds: [],
    yearRange: { start: null, end: null },
    isTurkish: false,
    hideAnimation: false,
    hideAdult: true,
    sortBy: 'created_at.desc'
};

let activeFilter = { ...DEFAULT_FILTER };
let pagination = { currentPage: 1, itemsPerPage: 12, isLoading: false, hasMore: true };
let cachedFilteredData = [];
const IMAGE_PATH = "https://image.tmdb.org/t/p/w185";

// ——— STATE & SCROLL KAYDET / RESTORE ———
const STATE_KEY = 'home_state';

function savePageState() {
    const searchInput = document.getElementById('tmdbSearch');
    const resultsDiv  = document.getElementById('searchResults');
    const query = searchInput ? searchInput.value.trim() : '';
    // Arama sonuçları açıksa HTML'ini de kaydet
    const searchResultsHTML = (resultsDiv && resultsDiv.style.display !== 'none' && query)
        ? resultsDiv.innerHTML : '';
    const state = {
        filter: activeFilter,
        scrollY: window.scrollY,
        searchQuery: query,
        searchResultsHTML,
        searchOpen: !!(searchResultsHTML && query),
        loadedCount: pagination.currentPage
    };
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function loadPageState() {
    try {
        const raw = sessionStorage.getItem(STATE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function clearPageState() {
    sessionStorage.removeItem(STATE_KEY);
}

// Sayfadan ayrılırken state kaydet
window.addEventListener('pagehide', savePageState);

// Android back / bfcache için de kaydet
window.addEventListener('beforeunload', savePageState);

// ——— Başlatma ———
window.addEventListener('load', async () => {
    const session = await SupabaseManager.requireAuth();
    if (!session) return;

    const container = document.getElementById('movieContainer');
    const savedState = loadPageState();

    if (savedState) {
        // Önceki state varsa skeleton göstermeden direk restore et
        activeFilter = { ...DEFAULT_FILTER, ...savedState.filter };
    } else {
        if (container) showSkeletonCards(container, 8);
    }

    await loadCache();

    const resultsDiv = document.getElementById('searchResults');
    if (resultsDiv) { resultsDiv.innerHTML = ''; resultsDiv.style.display = 'none'; }

    refreshFilterCache();
    renderGenreFilters();

    if (savedState) {
        // Kaydedilmiş sayfa sayısı kadar içerik yükle, sonra scroll'a git
        await restoreHomeState(savedState);
    } else {
        initHome();
    }

    setupEventListeners();
    createScrollButton();
    setupSearchClear();
});

window.addEventListener('pageshow', async (event) => {
    // bfcache'den dönüş (iOS Safari / Android)
    if (event.persisted) {
        const savedState = loadPageState();
        if (savedState) {
            activeFilter = { ...DEFAULT_FILTER, ...savedState.filter };
            await loadCache();
            refreshFilterCache();
            renderGenreFilters();
            await restoreHomeState(savedState);
            refreshSearchResultsUI();
        } else {
            refreshFilterCache();
            initHome(true);
            refreshSearchResultsUI();
        }
        document.body.style.overflow = '';
    }
});

// Yeni sayfaya (details vb.) gidilirken state kaydet
document.addEventListener('click', (e) => {
    const link = e.target.closest('[onclick]');
    if (link) {
        const onclick = link.getAttribute('onclick') || '';
        if (onclick.includes('location.href') || onclick.includes('location.replace')) {
            savePageState();
        }
    }
}, true);

// ——— State Restore ———
async function restoreHomeState(savedState) {
    const container = document.getElementById('movieContainer');
    if (!container) return;

    pagination.currentPage = 1;
    pagination.hasMore = true;
    container.innerHTML = '';

    // Kaydedilen sayfaya kadar yükle
    const targetPage = savedState.loadedCount || 2;
    for (let i = 0; i < targetPage - 1 && pagination.hasMore; i++) {
        await renderHome();
    }

    // Scroll pozisyonunu restore et
    const targetScrollY = savedState.scrollY || 0;
    if (targetScrollY > 0) {
        // RAF zinciriyle DOM tam render olduktan sonra scroll yap
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                window.scrollTo({ top: targetScrollY, behavior: 'instant' });
            });
        });
    }

    // Arama kutusunu ve sonuçlarını restore et
    const searchInput = document.getElementById('tmdbSearch');
    if (searchInput && savedState.searchQuery) {
        searchInput.value = savedState.searchQuery;
        // clearSearch butonu setupSearchClear tarafından yönetiliyor,
        // value set edildikten sonra input eventi dispatch ederek opacity'yi tetikle
        searchInput.dispatchEvent(new Event('input'));
    }
    // Arama sonuçlarını geri yükle
    if (savedState.searchOpen && savedState.searchResultsHTML) {
        const resultsDiv = document.getElementById('searchResults');
        if (resultsDiv) {
            resultsDiv.innerHTML = savedState.searchResultsHTML;
            resultsDiv.style.display = 'block';
            document.body.style.overflow = 'hidden';
            // Ekleme butonlarının ikonlarını güncel archive'a göre yenile
            refreshSearchResultsUI();
        }
    }
}

// ——— Logout (onaylı) ———
function handleLogout() {
    // Mevcut onay dialogu varsa kaldır
    const existing = document.getElementById('logoutConfirm');
    if (existing) { existing.remove(); return; }

    const overlay = document.createElement('div');
    overlay.id = 'logoutConfirm';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.25s ease;';
    overlay.innerHTML = `
        <div style="background:#0f1218;border:1px solid rgba(255,255,255,0.08);border-radius:28px;padding:32px 28px;width:280px;text-align:center;transform:scale(0.92);transition:transform 0.25s cubic-bezier(0.175,0.885,0.32,1.275);">
            <div style="width:52px;height:52px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                <i class="fa-solid fa-right-from-bracket" style="color:#f87171;font-size:20px;"></i>
            </div>
            <div style="font-size:14px;font-weight:900;color:#fff;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">Çıkış Yap</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-bottom:24px;line-height:1.6;">Oturumunuz kapatılacak.<br>Devam etmek istiyor musunuz?</div>
            <div style="display:flex;gap:10px;">
                <button id="logoutCancelBtn" style="flex:1;padding:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:14px;color:rgba(255,255,255,0.5);font-family:Outfit,sans-serif;font-size:10px;font-weight:900;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">İPTAL</button>
                <button id="logoutConfirmBtn" style="flex:1;padding:12px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:14px;color:#f87171;font-family:Outfit,sans-serif;font-size:10px;font-weight:900;letter-spacing:2px;text-transform:uppercase;cursor:pointer;">ÇIKIŞ YAP</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    // Animasyon
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        overlay.querySelector('div').style.transform = 'scale(1)';
    });

    function closeDialog() {
        overlay.style.opacity = '0';
        overlay.querySelector('div').style.transform = 'scale(0.92)';
        setTimeout(() => overlay.remove(), 250);
    }

    document.getElementById('logoutCancelBtn').onclick = closeDialog;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });
    document.getElementById('logoutConfirmBtn').onclick = async () => {
        document.getElementById('logoutConfirmBtn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        await SupabaseManager.logout();
    };
}

// ——— SVG Placeholder ———
function generatePlaceholderSVG(isPerson = false) {
    const text = isPerson ? "OYUNCU" : "FILM / DIZI";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="185" height="278" viewBox="0 0 185 278">
        <defs><linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#252525;stop-opacity:1"/>
            <stop offset="100%" style="stop-color:#151515;stop-opacity:1"/>
        </linearGradient></defs>
        <rect width="100%" height="100%" fill="url(#grad)"/>
        ${!isPerson ? `<path d="M110 90h-35c-2.76 0-5 2.24-5 5v55c0 2.76 2.24 5 5 5h35c2.76 0 5-2.24 5-5v-55c0-2.76-2.24-5-5-5zm-30 15h25v10h-25v-10zm0 20h25v10h-25v-10zm0 20h25v10h-25v-10z" fill="#333" opacity="0.8"/>` : ''}
        ${isPerson ? `<path d="M92.5 130c12.426 0 22.5-10.074 22.5-22.5S104.926 85 92.5 85s-22.5 10.074-22.5 22.5 10.074 22.5 22.5 22.5zm0 10c-15.01 0-45 7.53-45 22.5V175h90v-12.5c0-14.97-29.99-22.5-45-22.5z" fill="#333" opacity="0.8"/>` : ''}
        <text x="50%" y="75%" font-family="Arial" font-size="10" font-weight="bold" fill="#444" text-anchor="middle" letter-spacing="1">${text}</text>
        <text x="50%" y="82%" font-family="Arial" font-size="8" fill="#333" text-anchor="middle">GORSEL YOK</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ——— Yaş Hesaplama ———
function calculateAge(birthDate) {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

// ——— Arama Sonuçları UI Yenile ———
function refreshSearchResultsUI() {
    const resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv || resultsDiv.style.display === 'none') return;

    const archive = getArchive() || [];
    const items = resultsDiv.querySelectorAll('[data-search-id]');

    items.forEach(item => {
        const id = parseInt(item.dataset.searchId);
        const type = item.dataset.searchType;
        const btn = item.querySelector('.add-btn-premium');
        if (!btn) return;

        if (type === 'person') {
            const isFav = isPersonFav(id);
            btn.innerHTML = `<i class="fa-solid ${isFav ? 'fa-heart text-red-500' : 'fa-heart-circle-plus'}"></i>`;
        } else {
            const exists = archive.some(m => m.id === id);
            btn.innerHTML = `<i class="fa-solid ${exists ? 'fa-check text-[#7cfc00]' : 'fa-plus'}"></i>`;
        }
    });
}

// ——— Adult İçerik Tespiti ———
// TMDB'nin adult=true alanı çok az filmde set edilir.
// Başlık + orijinal başlık + overview üzerinden keyword taraması yapılır.
const ADULT_KEYWORDS = [
    // Genel
    'erotic', 'erotik', 'porn', 'porno', 'pornographic', 'xxx', 'sex tape',
    'nude', 'nudist', 'naked', 'softcore', 'hardcore', 'explicit',
    // Türkçe yaygın pattern'ler
    'seks', 'seksi', 'cinsel', 'müstehcen', 'yasak aşk', 'gece hayatı',
    'playgirl', 'playboy', 'striptiz', 'strip tease',
    // Yaygın franchise isimleri
    'emanuelle', 'caligula', 'lolita', 'o\'s story', 'story of o',
    // Ek anahtar kelimeler
    'sex günlüğü', 'sex diary', 'sexual', 'sexuality', 'seduction',
    'lap dance', 'escort', 'geisha', 'bordel', 'brothel', 'red light',
    'desire', 'arzular', 'yasak zevk', 'gizli zevk', 'özel dersler'
];

function isAdultContent(movie) {
    // TMDB'nin kendi adult flag'i
    if (movie.adult === true) return true;

    // Başlık + orijinal başlık + overview birleştir, küçük harfe çevir
    const haystack = [
        movie.title || '',
        movie.name || '',
        movie.original_title || '',
        movie.original_name || '',
        movie.overview || ''
    ].join(' ').toLowerCase();

    return ADULT_KEYWORDS.some(kw => haystack.includes(kw.toLowerCase()));
}

// ——— Cache Yenile ———
function refreshFilterCache() {
    if (activeFilter.isDiscover) {
        cachedFilteredData = [];
        updateTotalCount();
        return;
    }

    let allData = [];
    if (activeFilter.isPersonOnly) {
        allData = (getPersonArchive() || []).map(p => ({ ...p, media_type: 'person' }));
    } else {
        allData = (getArchive() || []);
    }

    let filtered = [...allData];

    if (!activeFilter.isPersonOnly) {
        // Adult gizle (varsayılan açık)
        // NOT: TMDB'nin adult alanı güvenilir değil, çoğu filmde false gelir.
        // Bu yüzden başlık, orijinal başlık ve overview'a dayalı keyword filtresi kullanıyoruz.
        if (activeFilter.hideAdult) {
            filtered = filtered.filter(m => !isAdultContent(m));
        }

        // Animasyon gizle
        if (activeFilter.hideAnimation) {
            filtered = filtered.filter(m => {
                const isAnimation = m.genres && m.genres.some(g => g.id === 16);
                if (!isAnimation) return true;
                const cast = (m.credits && m.credits.cast) || [];
                return cast.some(c =>
                    !c.character.toLowerCase().includes("(voice)") &&
                    !c.character.toLowerCase().includes("(ses)") &&
                    c.known_for_department === "Acting"
                );
            });
        }

        if (activeFilter.isFavOnly) filtered = filtered.filter(m => m.isFav);
        if (activeFilter.status === 'watched') filtered = filtered.filter(m => m.isWatched);
        else if (activeFilter.status === 'unwatched') filtered = filtered.filter(m => !m.isWatched);

        if (activeFilter.isTurkish) filtered = filtered.filter(m => m.original_language === 'tr');

        if (activeFilter.yearRange.start || activeFilter.yearRange.end) {
            filtered = filtered.filter(m => {
                const y = parseInt((m.release_date || m.first_air_date || "").split('-')[0]);
                if (isNaN(y)) return false;
                const s = activeFilter.yearRange.start ? y >= activeFilter.yearRange.start : true;
                const e = activeFilter.yearRange.end ? y <= activeFilter.yearRange.end : true;
                return s && e;
            });
        }

        if (activeFilter.genreIds.length > 0) {
            filtered = filtered.filter(movie =>
                activeFilter.genreIds.every(id =>
                    movie.genres && movie.genres.some(g => g.id == id)
                )
            );
        }
    }

    // Sıralama
    if (activeFilter.sortBy === 'vote_average.desc') {
        filtered.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    } else if (activeFilter.sortBy === 'popularity.desc') {
        filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    } else if (activeFilter.sortBy === 'original_title.asc') {
        filtered.sort((a, b) => (a.title || a.name || "").localeCompare(b.title || b.name || "", 'tr'));
    } else if (activeFilter.sortBy === 'primary_release_date.desc') {
        filtered.sort((a, b) => new Date(b.release_date || b.first_air_date || 0) - new Date(a.release_date || a.first_air_date || 0));
    }

    cachedFilteredData = filtered;
    updateTotalCount();
}

// ——— Sayaç Güncelle ———
function updateTotalCount(isDiscoverNoResults = false) {
    const countText = activeFilter.isDiscover ? (isDiscoverNoResults ? '0' : '∞') : cachedFilteredData.length;
    const isZero = countText === '0' || countText === 0;

    const homeCounter = document.getElementById('totalCountContainer');
    if (homeCounter) {
        let label = 'LİSTE';
        if (activeFilter.isPersonOnly) label = 'OYUNCU';
        if (activeFilter.isDiscover) label = 'KEŞFET';
        const colorClass = isZero ? 'text-red-500' : 'text-[#7cfc00]';
        homeCounter.innerHTML = `${label} <span class="status-count ${colorClass}">${countText}</span>`;
    }

    const modalCounter = document.getElementById('modalTotalBadge');
    const modalBadgeDiv = document.getElementById('modalBadgeContainer');
    if (modalCounter && modalBadgeDiv) {
        modalCounter.innerText = countText;
        if (isZero) {
            modalCounter.classList.replace('text-[#7cfc00]', 'text-red-500');
            modalBadgeDiv.classList.replace('bg-[#7cfc00]/10', 'bg-red-500/10');
            modalBadgeDiv.classList.replace('border-[#7cfc00]/20', 'border-red-500/20');
        } else {
            modalCounter.classList.add('text-[#7cfc00]');
            modalCounter.classList.remove('text-red-500');
            modalBadgeDiv.classList.add('bg-[#7cfc00]/10', 'border-[#7cfc00]/20');
            modalBadgeDiv.classList.remove('bg-red-500/10', 'border-red-500/20');
        }
    }
}

// ——— Ana Sayfa Init ———
function initHome(isFiltering = false) {
    const container = document.getElementById('movieContainer');
    if (!container) return;
    if (isFiltering) {
        // Filtre değişti → eski state geçersiz
        clearPageState();
        refreshFilterCache();
    }
    pagination.currentPage = 1;
    pagination.hasMore = true;
    container.innerHTML = '';
    renderHome();
}

async function renderHome() {
    if (pagination.isLoading || !pagination.hasMore) return;
    pagination.isLoading = true;

    const container = document.getElementById('movieContainer');
    let displayData = [];

    if (activeFilter.isDiscover) {
        const genreParam = activeFilter.genreIds.length ? `&with_genres=${activeFilter.genreIds.join(',')}` : '';
        const yearParam = activeFilter.yearRange.start ? `&primary_release_date.gte=${activeFilter.yearRange.start}-01-01` : '';
        const yearEndParam = activeFilter.yearRange.end ? `&primary_release_date.lte=${activeFilter.yearRange.end}-12-31` : '';
        const langParam = activeFilter.isTurkish ? '&with_original_language=tr' : '';
        const animationParam = activeFilter.hideAnimation ? '&without_genres=16' : '';
        const adultParam = activeFilter.hideAdult ? '&include_adult=false' : '';

        let tmdbSort = activeFilter.sortBy;
        if (tmdbSort === 'created_at.desc') tmdbSort = 'popularity.desc';

        const raw = await fetchDiscoverMovies(
            pagination.currentPage,
            `${genreParam}${yearParam}${yearEndParam}${langParam}${animationParam}${adultParam}&sort_by=${tmdbSort}`
        );

        if (!raw || raw.length === 0) {
            pagination.hasMore = false;
            if (pagination.currentPage === 1) updateTotalCount(true);
        } else {
            const archive = getArchive() || [];
            displayData = raw
                .filter(movie => !activeFilter.hideAdult || !isAdultContent(movie))
                .map(movie => {
                    const local = archive.find(m => m.id === movie.id);
                    return { ...movie, isWatched: local ? local.isWatched : false, isFav: local ? local.isFav : false };
                });
            if (pagination.currentPage === 1) updateTotalCount(false);
        }
    } else {
        const start = (pagination.currentPage - 1) * pagination.itemsPerPage;
        displayData = cachedFilteredData.slice(start, start + pagination.itemsPerPage);
        if (start + displayData.length >= cachedFilteredData.length) pagination.hasMore = false;
    }

    if (displayData.length === 0 && pagination.currentPage === 1) {
        container.innerHTML = `<div class="col-span-2 text-center py-20 opacity-20 uppercase tracking-[4px] text-[10px]">İçerik Yok</div>`;
        pagination.isLoading = false;
        return;
    }

    const fragment = document.createDocumentFragment();
    displayData.forEach(movie => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = "contain: content; min-height: 250px; transform: translateZ(0);";
        wrapper.innerHTML = createMovieCardHTML(movie);
        fragment.appendChild(wrapper.firstElementChild);
    });

    container.appendChild(fragment);
    setupInfiniteScroll();
    pagination.isLoading = false;
    pagination.currentPage++;
}

// ——— Kart HTML ———
function createMovieCardHTML(movie) {
    const isPerson = movie.media_type === 'person';
    const year = (movie.release_date || movie.first_air_date || "").split('-')[0] || "N/A";
    const rating = (movie.vote_average || 0).toFixed(1);
    const path = isPerson ? movie.profile_path : movie.poster_path;
    const placeholder = generatePlaceholderSVG(isPerson);
    const posterSrc = path ? IMAGE_PATH + path : placeholder;
    const typeLabel = isPerson ? 'Oyuncu' : (movie.media_type === 'tv' ? 'Dizi' : 'Film');
    const redirectUrl = isPerson ? `person.html?id=${movie.id}` : `details.html?id=${movie.id}&type=${movie.media_type || 'movie'}`;
    let personSubText = "OYUNCU";
    if (isPerson && movie.birthday) {
        const age = calculateAge(movie.birthday);
        personSubText = age ? `${age} YAŞINDA` : "OYUNCU";
    }

    return `
    <div class="movie-card" onclick="savePageState(); window.location.href='${redirectUrl}'">
        <div class="absolute top-2 left-2 z-20 pointer-events-none">
            ${!isPerson ? `
            <div class="bg-black/80 ${movie.isWatched ? 'text-[#7cfc00]' : 'text-white/20'} p-2 rounded-xl border border-white/5 flex items-center justify-center">
                <i class="fa-solid ${movie.isWatched ? 'fa-check' : 'fa-eye-slash'} text-[12px]"></i>
            </div>` : ''}
        </div>
        <div class="absolute top-2 right-2 z-20 flex flex-col gap-1 items-end pointer-events-none">
            ${!isPerson ? `<div class="bg-black/80 text-[#FFAD1D] text-[10px] font-black px-1.5 py-0.5 rounded-md border border-white/5">⭐ ${rating}</div>` : ''}
            <div class="bg-black/80 text-white/70 text-[8px] font-black px-1.5 py-0.5 rounded-md border border-white/5 uppercase">
                ${isPerson ? personSubText : year + ' • ' + typeLabel}
            </div>
            ${movie.isFav || (isPerson) ? `<div class="bg-black/80 text-[#FF0000] p-2 rounded-xl border border-white/5"><i class="fa-solid fa-heart text-[12px]"></i></div>` : ''}
        </div>
        <img src="${posterSrc}" onerror="this.src='${placeholder}'" loading="lazy" class="w-full h-full object-cover" style="opacity:0;" onload="this.style.opacity='1';this.style.transition='opacity 0.3s';">
        <div class="movie-overlay">
            <div class="text-[11px] font-black text-white text-center line-clamp-2 px-2 uppercase tracking-tight">${movie.title || movie.name || ''}</div>
        </div>
    </div>`;
}

// ——— Filtre Çubukları ———
function renderGenreFilters() {
    const filterSection = document.getElementById('filterSection');
    if (!filterSection) return;

    const scrollContainer = filterSection.querySelector('.overflow-x-auto');
    const currentScrollPos = scrollContainer ? scrollContainer.scrollLeft : 0;

    const isAllActive = activeFilter.status === 'all' && !activeFilter.isFavOnly && !activeFilter.isPersonOnly &&
        !activeFilter.isDiscover && activeFilter.genreIds.length === 0 && !activeFilter.isTurkish &&
        !activeFilter.yearRange.start && !activeFilter.hideAnimation;

    filterSection.innerHTML = `
    <div class="w-full flex flex-col gap-3">
        <div class="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            <button class="genre-badge ${isAllActive ? 'active' : ''}" data-type="all">Listem</button>
            <button class="genre-badge ${activeFilter.isDiscover ? 'active' : ''}" data-type="discover">Keşfet</button>
            <button class="genre-badge ${activeFilter.isPersonOnly ? 'active' : ''}" data-type="persons">Oyuncular</button>
            <button class="genre-badge ${activeFilter.isFavOnly ? 'active' : ''}" data-type="favorites">Favoriler</button>
            <button class="genre-badge ${activeFilter.status === 'watched' ? 'active' : ''}" data-type="watched">İzledim</button>
            <button class="genre-badge ${activeFilter.status === 'unwatched' ? 'active' : ''}" data-type="unwatched">İzlemedim</button>
        </div>
        <div class="flex items-center justify-between bg-white/[0.02] p-2 rounded-2xl border border-white/5">
            <div id="totalCountContainer" class="text-[10px] font-black tracking-[2px] text-white/30 uppercase pl-2"></div>
            <button onclick="toggleGenreModal(true)" class="flex items-center gap-2 bg-[#7cfc00]/10 border border-[#7cfc00]/20 px-4 py-2 rounded-xl active:scale-95 transition-all">
                <span class="text-[9px] font-black text-[#7cfc00] tracking-widest uppercase">Gelişmiş Filtre</span>
                <i class="fa-solid fa-sliders text-[#7cfc00] text-[10px]"></i>
            </button>
        </div>
    </div>`;

    const newScroll = filterSection.querySelector('.overflow-x-auto');
    if (newScroll) newScroll.scrollLeft = currentScrollPos;

    setupFilterClicks();
    updateTotalCount();
}

function setupFilterClicks() {
    document.querySelectorAll('.genre-badge').forEach(btn => {
        btn.onclick = function () {
            const { type } = this.dataset;
            if (type === 'all') {
                activeFilter = { ...activeFilter, status: 'all', isFavOnly: false, isPersonOnly: false, isDiscover: false, genreIds: [], yearRange: { start: null, end: null }, isTurkish: false, hideAnimation: false };
            } else if (type === 'discover') {
                activeFilter.isDiscover = !activeFilter.isDiscover;
                activeFilter.isPersonOnly = false; activeFilter.isFavOnly = false; activeFilter.status = 'all';
            } else if (type === 'persons') {
                activeFilter.isPersonOnly = !activeFilter.isPersonOnly;
                activeFilter.isDiscover = false; activeFilter.isFavOnly = false; activeFilter.status = 'all';
            } else if (type === 'favorites') {
                activeFilter.isFavOnly = !activeFilter.isFavOnly;
                activeFilter.isPersonOnly = false; activeFilter.isDiscover = false;
            } else {
                activeFilter.status = (activeFilter.status === type) ? 'all' : type;
                activeFilter.isPersonOnly = false; activeFilter.isDiscover = false;
            }
            renderGenreFilters();
            initHome(true);
        };
    });
}

// ——— Genre Modal ———
function toggleGenreModal(show) {
    const modal = document.getElementById('genreModal');
    if (!modal) return;
    if (show) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        renderModalGenres();
    } else {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

async function renderModalGenres() {
    const container = document.getElementById('modalGenreList');
    if (!container) return;

    const count = activeFilter.isDiscover ? '∞' : cachedFilteredData.length;
    const isZero = count === 0 || count === '0';
    const colorClass = isZero ? 'text-red-500' : 'text-[#7cfc00]';
    const bgClass = isZero ? 'bg-red-500/10 border-red-500/20' : 'bg-[#7cfc00]/10 border-[#7cfc00]/20';

    const headerEl = document.getElementById('genreModalHeader');
    if (headerEl) {
        headerEl.innerHTML = `
        <div class="flex items-center gap-3">
            <h3 class="text-[12px] font-black tracking-[4px] uppercase text-white/50">GELİŞMİŞ FİLTRE</h3>
            <div id="modalBadgeContainer" class="${bgClass} border px-2 py-0.5 rounded-lg">
                <span id="modalTotalBadge" class="text-[11px] font-black ${colorClass} tabular-nums">${count}</span>
            </div>
        </div>
        <button onclick="toggleGenreModal(false)" class="text-white/20 hover:text-white text-xl p-2">
            <i class="fa-solid fa-xmark"></i>
        </button>`;
    }

    const yearFilterHTML = `
    <div class="col-span-full mb-4 bg-white/[0.03] p-4 rounded-2xl border border-white/5">
        <div class="text-[9px] font-black text-white/30 uppercase tracking-[2px] mb-3">Yıl Aralığı</div>
        <div class="flex items-center gap-3">
            <input type="number" id="yearStart" placeholder="BAŞ" value="${activeFilter.yearRange.start || ''}" class="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-[10px] outline-none">
            <input type="number" id="yearEnd" placeholder="SON" value="${activeFilter.yearRange.end || ''}" class="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-[10px] outline-none">
            <button onclick="applyYearFilter()" class="bg-[#7cfc00] text-black px-4 py-3 rounded-xl font-black text-[10px]">OK</button>
        </div>
    </div>`;

    // Toggle butonları (Yerli + Anime Gizle + Adult Gizle)
    const toggleOptionsHTML = `
    <div class="col-span-full grid grid-cols-2 gap-2 mb-4">
        <button onclick="toggleFilterItem('isTurkish')"
            class="flex items-center justify-between p-4 rounded-xl border transition-all ${activeFilter.isTurkish ? 'bg-[#7cfc00]/10 border-[#7cfc00] text-[#7cfc00]' : 'bg-white/5 border-white/10 text-white/40'}">
            <span class="text-[10px] font-black uppercase tracking-widest">Yerli</span>
            <i class="fa-solid ${activeFilter.isTurkish ? 'fa-check-circle' : 'fa-circle'} text-[10px]"></i>
        </button>
        <button onclick="toggleHideAnimation()"
            class="flex items-center justify-between p-4 rounded-xl border transition-all ${activeFilter.hideAnimation ? 'bg-red-500/10 border-red-500/50 text-red-500' : 'bg-white/5 border-white/10 text-white/40'}">
            <span class="text-[10px] font-black uppercase tracking-widest">Anime Gizle</span>
            <i class="fa-solid ${activeFilter.hideAnimation ? 'fa-eye-slash' : 'fa-eye'} text-[10px]"></i>
        </button>
        <button onclick="toggleHideAdult()"
            class="col-span-full flex items-center justify-between p-4 rounded-xl border transition-all ${activeFilter.hideAdult ? 'bg-red-500/10 border-red-500/50 text-red-500' : 'bg-white/5 border-white/10 text-white/40'}">
            <span class="text-[10px] font-black uppercase tracking-widest">Adult İçerik Gizle</span>
            <i class="fa-solid ${activeFilter.hideAdult ? 'fa-eye-slash' : 'fa-eye'} text-[10px]"></i>
        </button>
    </div>`;

    const sortOptions = [
        { id: 'created_at.desc', name: 'Son Eklenen' },
        { id: 'popularity.desc', name: 'Popülerlik' },
        { id: 'vote_average.desc', name: 'IMDb Puanı' },
        { id: 'original_title.asc', name: 'A - Z' },
        { id: 'primary_release_date.desc', name: 'Vizyon Tarihi' }
    ];

    const sortFilterHTML = `
    <div class="col-span-full mb-4 bg-white/[0.03] p-4 rounded-2xl border border-white/5">
        <div class="text-[9px] font-black text-white/30 uppercase tracking-[2px] mb-3">Sıralama Düzeni</div>
        <div class="grid grid-cols-2 gap-2">
            ${sortOptions.map(opt => `
                <button onclick="setSort('${opt.id}')"
                    class="p-3 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${activeFilter.sortBy === opt.id ? 'bg-[#7cfc00]/10 border-[#7cfc00] text-[#7cfc00]' : 'bg-white/[0.02] border-white/5 text-white/40'}">
                    ${opt.name}
                </button>`).join('')}
        </div>
    </div>`;

    const allGenres = [
        {id:28,name:"Aksiyon"},{id:12,name:"Macera"},{id:16,name:"Animasyon"},
        {id:35,name:"Komedi"},{id:80,name:"Suç"},{id:18,name:"Dram"},
        {id:14,name:"Fantastik"},{id:27,name:"Korku"},{id:878,name:"Bilim Kurgu"},
        {id:53,name:"Gerilim"},{id:10752,name:"Savaş"},{id:9648,name:"Gizem"},
        {id:10751,name:"Aile"},{id:37,name:"Vahşi Batı"},{id:36,name:"Tarih"},
        {id:10402,name:"Müzik"},{id:10749,name:"Romantik"},{id:99,name:"Belgesel"},
        {id:10770,name:"TV Film"},{id:10759,name:"Aksiyon & Macera"},{id:10762,name:"Çocuk"},
        {id:10763,name:"Haber"},{id:10764,name:"Reality"},{id:10765,name:"Bilim Kurgu & Fantazi"},
        {id:10766,name:"Pembe Dizi"},{id:10767,name:"Talk Show"},{id:10768,name:"Savaş & Politika"}
    ].sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    const genresHTML = allGenres.map(g => {
        const isActive = activeFilter.genreIds.includes(g.id.toString());
        return `<button onclick="toggleGenreSelection('${g.id}')"
            class="flex items-center justify-between p-4 rounded-2xl border transition-all ${isActive ? 'bg-[#7cfc00]/10 border-[#7cfc00] text-[#7cfc00]' : 'bg-white/[0.03] border-white/5 text-white/50'}">
            <span class="text-[10px] font-black uppercase tracking-widest text-left pr-2">${g.name}</span>
            ${isActive ? '<i class="fa-solid fa-check-circle text-[10px]"></i>' : ''}
        </button>`;
    }).join('');

    container.innerHTML = yearFilterHTML + toggleOptionsHTML + sortFilterHTML + genresHTML;
}

function toggleFilterItem(key) { activeFilter[key] = !activeFilter[key]; renderModalGenres(); initHome(true); }
function toggleHideAnimation() { activeFilter.hideAnimation = !activeFilter.hideAnimation; renderModalGenres(); initHome(true); }
function toggleHideAdult() { activeFilter.hideAdult = !activeFilter.hideAdult; renderModalGenres(); initHome(true); }
function setSort(type) { activeFilter.sortBy = type; renderModalGenres(); initHome(true); }

function applyYearFilter() {
    const start = parseInt(document.getElementById('yearStart')?.value);
    const end = parseInt(document.getElementById('yearEnd')?.value);
    activeFilter.yearRange.start = start || null;
    activeFilter.yearRange.end = end || null;
    initHome(true);
    renderModalGenres();
    showToast("FİLTRE UYGULANDI");
}

function toggleGenreSelection(id) {
    const gid = id.toString();
    if (activeFilter.genreIds.includes(gid)) activeFilter.genreIds = activeFilter.genreIds.filter(x => x !== gid);
    else activeFilter.genreIds.push(gid);
    renderModalGenres();
    initHome(true);
}

function clearAllFilters() {
    activeFilter = {
        status: 'all', isFavOnly: false, isPersonOnly: false, isDiscover: false,
        genreIds: [], yearRange: { start: null, end: null },
        isTurkish: false, hideAnimation: false, hideAdult: true,
        sortBy: 'created_at.desc'
    };
    renderGenreFilters();
    renderModalGenres();
    initHome(true);
    showToast("FİLTRELER SIFIRLANDI");
}

// ——— Arama ———
function setupEventListeners() {
    const input = document.getElementById('tmdbSearch');
    const resultsDiv = document.getElementById('searchResults');
    let timer;

    input?.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        const clearBtn = document.getElementById('clearSearch');
        if (clearBtn) clearBtn.style.opacity = query.length > 0 ? "1" : "0";

        clearTimeout(timer);
        timer = setTimeout(async () => {
            if (query.length < 2) {
                if (resultsDiv) { resultsDiv.innerHTML = ''; resultsDiv.style.display = 'none'; document.body.style.overflow = ''; }
                return;
            }
            const movies = await searchMovies(query);
            const archive = getArchive() || [];
            if (movies.length > 0) {
                resultsDiv.style.display = 'block';
                document.body.style.overflow = 'hidden';
                resultsDiv.innerHTML = movies.slice(0, 20).map(item => {
                    const isPerson = item.media_type === 'person';
                    const path = isPerson ? item.profile_path : item.poster_path;
                    const placeholder = generatePlaceholderSVG(isPerson);
                    const itemPoster = path ? IMAGE_PATH + path : placeholder;
                    const favoriteStatus = isPerson && isPersonFav(item.id);
                    const redirectUrl = isPerson ? `person.html?id=${item.id}` : `details.html?id=${item.id}&type=${item.media_type}`;
                    const subInfo = isPerson ? (item.known_for_department || "Oyuncu") : ((item.release_date || item.first_air_date || "").split('-')[0] || "N/A");
                    const typeText = isPerson ? 'Kişi' : (item.media_type === 'tv' ? 'Dizi' : 'Film');
                    const exists = !isPerson && archive.some(m => m.id === item.id);

                    return `<div class="flex items-center gap-3 p-3 hover:bg-white/5 border-b border-white/[0.03] cursor-pointer"
                        data-search-id="${item.id}" data-search-type="${isPerson ? 'person' : item.media_type}"
                        onclick="savePageState(); window.location.href='${redirectUrl}'">
                        <img src="${itemPoster}" onerror="this.src='${placeholder}'" class="w-10 h-14 rounded-lg object-cover shadow-md flex-shrink-0">
                        <div class="flex-1 min-w-0">
                            <div class="text-[12px] font-bold text-white truncate">${item.title || item.name}</div>
                            <div class="text-[10px] text-white/40 uppercase font-black">${subInfo} • ${typeText}</div>
                        </div>
                        <button class="add-btn-premium" onclick="event.stopPropagation(); ${isPerson ? `togglePersonAndRefresh(${item.id})` : `saveAndRefresh(${item.id}, '${item.media_type}')`}">
                            <i class="fa-solid ${isPerson ? (favoriteStatus ? 'fa-heart text-red-500' : 'fa-heart-circle-plus') : (exists ? 'fa-check text-[#7cfc00]' : 'fa-plus')}"></i>
                        </button>
                    </div>`;
                }).join('');
            } else {
                resultsDiv.innerHTML = ''; resultsDiv.style.display = 'none'; document.body.style.overflow = '';
            }
        }, 350);
    });
}

async function togglePersonAndRefresh(personId) {
    const result = await togglePersonFav(personId);
    if (result !== null) {
        showToast(result ? "OYUNCU EKLENDİ" : "OYUNCU ÇIKARILDI");
        refreshSearchResultsUI();
        if (activeFilter.isPersonOnly) initHome(true);
    }
}

async function saveAndRefresh(id, type) {
    const archive = getArchive() || [];
    const exists = archive.some(m => m.id === id);
    if (exists) {
        await removeFromArchive(id);
        showToast("FİLM ÇIKARILDI");
        refreshSearchResultsUI();
        initHome(true);
    } else {
        const btn = document.querySelector(`[data-search-id="${id}"] .add-btn-premium`);
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-white/40"></i>';
        if (await saveToArchive(id, type)) {
            showToast("FİLM EKLENDİ");
            refreshSearchResultsUI();
            initHome(true);
        }
    }
}

function setupSearchClear() {
    const input = document.getElementById('tmdbSearch');
    if (!input) return;
    let btn = document.getElementById('clearSearch');
    if (!btn) {
        btn = document.createElement('div');
        btn.id = 'clearSearch';
        btn.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
        btn.style.cssText = 'position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;opacity:0;color:#ff4444;z-index:1001;font-size:18px;transition:0.2s;';
        input.parentElement.appendChild(btn);
    }
    // Değer değiştiğinde opacity güncelle
    const syncOpacity = () => {
        btn.style.opacity = input.value.length > 0 ? '1' : '0';
    };
    input.addEventListener('input', syncOpacity);
    // Sayfa restore edildiğinde mevcut değere göre ayarla
    syncOpacity();
    btn.onclick = () => {
        input.value = '';
        const resultsDiv = document.getElementById('searchResults');
        if (resultsDiv) { resultsDiv.innerHTML = ''; resultsDiv.style.display = 'none'; }
        btn.style.opacity = '0';
        document.body.style.overflow = '';
    };
}

// ——— Toast ———
function showToast(message) {
    const oldToast = document.querySelector('.pro-toast');
    if (oldToast) oldToast.remove();
    const toast = document.createElement('div');
    toast.className = 'pro-toast';
    toast.style.cssText = "white-space: nowrap; width: max-content; min-width: 150px;";
    toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '1'; toast.style.top = '30px'; }, 10);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.top = '-100px'; setTimeout(() => toast.remove(), 500); }, 2500);
}

// ——— Infinite Scroll ———
function setupInfiniteScroll() {
    let sentinel = document.getElementById('infinite-sentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.id = 'infinite-sentinel';
        sentinel.style.cssText = "height: 50px; width: 100%; clear: both;";
        document.getElementById('movieContainer').after(sentinel);
    }
    const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && !pagination.isLoading && pagination.hasMore) renderHome();
    }, { rootMargin: '1200px' });
    observer.observe(sentinel);
}

// ——— Scroll Butonu ———
function createScrollButton() {
    let btn = document.querySelector('.scroll-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.className = 'scroll-btn';
        btn.style.zIndex = "900";
        btn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
        document.body.appendChild(btn);
    }
    let lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;
        const icon = btn.querySelector('i');
        btn.style.opacity = currentScrollY > 200 ? "1" : "0";
        btn.style.pointerEvents = currentScrollY > 200 ? "auto" : "none";
        if (currentScrollY > lastScrollY) {
            icon.className = 'fa-solid fa-chevron-down';
            btn.onclick = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        } else {
            icon.className = 'fa-solid fa-chevron-up';
            btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        lastScrollY = currentScrollY;
    }, { passive: true });
}


