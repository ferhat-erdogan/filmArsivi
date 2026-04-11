/**
 * ============================================================
 * FİLM ARŞİVİ - ÖNERİLER SAYFASI (recommendations.js)
 * Supabase auth + Infinite Scroll + pageshow state koruma
 * ============================================================
 */

let pagination = { currentPage: 1, isLoading: false, hasMore: true };
let lastScrollY = window.scrollY;
let currentId = null;
let currentType = 'movie';

const IMAGE_PATH = "https://image.tmdb.org/t/p/w185";
const PLACEHOLDER_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='185' height='278' viewBox='0 0 185 278'%3e%3cdefs%3e%3clinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3e%3cstop offset='0%25' stop-color='%231a1a1a'/%3e%3cstop offset='100%25' stop-color='%230f0f0f'/%3e%3c/linearGradient%3e%3c/defs%3e%3crect width='100%25' height='100%25' fill='url(%23g)'/%3e%3cg fill='none' stroke='%23333' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' transform='translate(77%2c 110)'%3e%3crect x='2' y='2' width='28' height='22' rx='3'/%3e%3cpath d='M2 10h28M10 2v22'/%3e%3c%2fg%3e%3ctext x='50%25' y='60%25' font-family='sans-serif' font-size='9' font-weight='700' fill='%23444' text-anchor='middle' style='letter-spacing%3a2px'%3eGÖRSEL YOK%3c%2ftext%3e%3c%2fsvg%3e";

// ——— Init ———
window.addEventListener('load', async () => {
    const session = await SupabaseManager.requireAuth();
    if (!session) return;

    await loadCache();
    initRecommendationsPage();
});

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        refreshGridStatus();
        const key = 'rec_scroll_' + new URLSearchParams(window.location.search).get('id');
        const savedY = sessionStorage.getItem(key);
        if (savedY) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => window.scrollTo({ top: parseInt(savedY), behavior: 'instant' }));
            });
        }
    }
});

// Sayfadan ayrılırken scroll kaydet
window.addEventListener('pagehide', () => {
    const key = 'rec_scroll_' + new URLSearchParams(window.location.search).get('id');
    sessionStorage.setItem(key, window.scrollY);
});

async function initRecommendationsPage() {
    const params = new URLSearchParams(window.location.search);
    currentId = params.get('id');
    currentType = params.get('type') || 'movie';
    const title = params.get('title');

    const subTitle = document.getElementById('subTitle');
    if (subTitle && title) subTitle.innerText = `${title} benzeri yapımlar`;

    if (currentId) {
        await loadMoreRecommendations();
        setupInfiniteScroll();
        createSmartScrollButton();
    } else {
        window.location.href = 'index.html';
    }
}

// ——— Sayfa Yükle ———
async function loadMoreRecommendations() {
    if (pagination.isLoading || !pagination.hasMore) return;
    pagination.isLoading = true;

    const grid = document.getElementById('recommendationGrid');

    const data = await fetchData(`/${currentType}/${currentId}/recommendations`, `&page=${pagination.currentPage}`);

    if (data?.results?.length > 0) {
        const archive = (typeof getArchive === 'function') ? getArchive() : [];

        const html = data.results.map(item => {
            const movieInArchive = archive.find(m => m.id === item.id);
            const isWatched = movieInArchive ? movieInArchive.isWatched : false;
            const isFav = movieInArchive ? movieInArchive.isFav : false;
            const year = (item.release_date || item.first_air_date || "").split('-')[0] || "N/A";
            const mediaType = item.media_type || currentType;
            const typeLabel = mediaType === 'tv' ? 'Dizi' : 'Film';
            const rating = (item.vote_average || 0).toFixed(1);
            const posterSrc = item.poster_path ? IMAGE_PATH + item.poster_path : PLACEHOLDER_SVG;

            return `
            <div class="movie-card animate-fadeIn" data-id="${item.id}" onclick="window.location.href='details.html?id=${item.id}&type=${mediaType}'">
                <div class="absolute top-2 left-2 z-20 pointer-events-none">
                    <div class="watch-status-icon bg-black/80 ${isWatched ? 'text-[#7cfc00]' : 'text-white/20'} p-2 rounded-xl border border-white/5 flex items-center justify-center">
                        <i class="fa-solid ${isWatched ? 'fa-check' : 'fa-eye-slash'} text-[12px]"></i>
                    </div>
                </div>
                <div class="absolute top-2 right-2 z-20 flex flex-col gap-1 items-end pointer-events-none">
                    <div class="bg-black/80 text-[#FFAD1D] text-[10px] font-black px-1.5 py-0.5 rounded-md border border-white/5">⭐ ${rating}</div>
                    <div class="bg-black/80 text-white/70 text-[8px] font-black px-1.5 py-0.5 rounded-md border border-white/5 uppercase">${year} • ${typeLabel}</div>
                    <div class="fav-status-container">
                        ${isFav ? `<div class="bg-black/80 text-[#FF0000] p-2 rounded-xl border border-white/5"><i class="fa-solid fa-heart text-[12px]"></i></div>` : ''}
                    </div>
                </div>
                <img src="${posterSrc}" onerror="this.src='${PLACEHOLDER_SVG}'" loading="lazy" decoding="async"
                     class="w-full h-full object-cover transition-opacity duration-500 bg-[#111]"
                     style="opacity: 0;" onload="this.style.opacity='1'">
                <div class="movie-overlay" style="background: linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%);">
                    <div class="text-[11px] font-black text-white text-center line-clamp-2 px-2 uppercase tracking-tight">${item.title || item.name}</div>
                </div>
            </div>`;
        }).join('');

        grid.insertAdjacentHTML('beforeend', html);
        pagination.currentPage++;
        pagination.hasMore = pagination.currentPage <= data.total_pages;
    } else {
        pagination.hasMore = false;
        if (pagination.currentPage === 1 && grid) {
            grid.innerHTML = '<div class="text-white/30 text-center py-20 uppercase tracking-widest text-xs col-span-2">Benzer yapım bulunamadı</div>';
        }
    }

    pagination.isLoading = false;
}

// ——— Geri döndüğünde durumları güncelle ———
function refreshGridStatus() {
    const grid = document.getElementById('recommendationGrid');
    if (!grid) return;
    const archive = (typeof getArchive === 'function') ? getArchive() : [];
    grid.querySelectorAll('.movie-card').forEach(card => {
        const movieId = parseInt(card.dataset.id);
        const movieData = archive.find(m => m.id === movieId);
        const watchDiv = card.querySelector('.watch-status-icon');
        if (watchDiv) {
            const w = movieData ? movieData.isWatched : false;
            watchDiv.className = `watch-status-icon bg-black/80 ${w ? 'text-[#7cfc00]' : 'text-white/20'} p-2 rounded-xl border border-white/5 flex items-center justify-center`;
            watchDiv.innerHTML = `<i class="fa-solid ${w ? 'fa-check' : 'fa-eye-slash'} text-[12px]"></i>`;
        }
        const favContainer = card.querySelector('.fav-status-container');
        if (favContainer) {
            favContainer.innerHTML = (movieData && movieData.isFav)
                ? `<div class="bg-black/80 text-[#FF0000] p-2 rounded-xl border border-white/5"><i class="fa-solid fa-heart text-[12px]"></i></div>`
                : '';
        }
    });
}

// ——— Infinite Scroll ———
function setupInfiniteScroll() {
    window.addEventListener('scroll', () => {
        if (!pagination.isLoading && pagination.hasMore &&
            (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 1000) {
            loadMoreRecommendations();
        }
    }, { passive: true });
}

// ——— Akıllı Scroll Butonu ———
function createSmartScrollButton() {
    let btn = document.getElementById('smartScrollBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'smartScrollBtn';
        btn.className = 'fixed bottom-8 right-8 z-[2000] w-14 h-14 rounded-2xl bg-[#7cfc00]/10 backdrop-blur-xl border border-[#7cfc00]/30 text-[#7cfc00] flex items-center justify-center text-xl shadow-[0_0_20px_rgba(124,252,0,0.2)] transition-all duration-300 active:scale-90 opacity-0 pointer-events-none';
        btn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
        document.body.appendChild(btn);
    }
    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;
        const icon = btn.querySelector('i');
        if (currentScrollY > 200) btn.classList.remove('opacity-0', 'pointer-events-none');
        else btn.classList.add('opacity-0', 'pointer-events-none');
        if (currentScrollY > lastScrollY) {
            icon.style.transform = 'rotate(0deg)';
            btn.onclick = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        } else {
            icon.style.transform = 'rotate(180deg)';
            btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        lastScrollY = currentScrollY;
    }, { passive: true });
}

