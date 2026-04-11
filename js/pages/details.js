/**
 * ============================================================
 * FİLM ARŞİVİ - DETAY SAYFASI (details.js)
 * Supabase auth + Optimistik UI + Landscape Fullscreen Trailer
 * ============================================================
 */

// ——— Toast Stili ———
const _toastStyle = document.createElement('style');
_toastStyle.textContent = `
    .custom-toast {
        position: fixed; top: 20px; left: 50%;
        transform: translate(-50%, -100px);
        background: rgba(220, 38, 38, 0.95);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255,255,255,0.1); color: white;
        padding: 14px 22px; border-radius: 18px;
        font-size: 11px; font-weight: 900; letter-spacing: 1.5px;
        text-transform: uppercase; z-index: 9999;
        transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        display: flex; align-items: center; gap: 10px;
        box-shadow: 0 15px 30px rgba(0,0,0,0.5);
        pointer-events: none; opacity: 0;
    }
    .custom-toast.show { transform: translate(-50%, 0); opacity: 1; }
`;
document.head.appendChild(_toastStyle);

function showToast(message, icon = "fa-triangle-exclamation") {
    const old = document.querySelector('.custom-toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, 2500);
}

// ——— Ebeveyn Kılavuzu (IMDb Parental Guide) ———
function openParentalGuide(imdbId) {
    if (imdbId) {
        window.open(`https://www.imdb.com/title/${imdbId}/parentalguide`, '_blank');
    } else {
        showToast("IMDb ID bulunamadı", "fa-circle-info");
    }
}

// ——— Init ———
window.addEventListener('load', async () => {
    const session = await SupabaseManager.requireAuth();
    if (!session) return;

    await loadCache();

    const params = new URLSearchParams(window.location.search);
    const movieId = params.get('id');
    const type = params.get('type') || 'movie';

    if (movieId) {
        showDetailsSkeleton();
        await renderDetails(movieId, type);
    } else {
        window.location.href = 'index.html';
    }

    document.getElementById('backBtn')?.addEventListener('click', handleSmartBack);
});

window.addEventListener('pageshow', async (event) => {
    if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
        const params = new URLSearchParams(window.location.search);
        const movieId = params.get('id');
        const type = params.get('type') || 'movie';
        if (movieId) await renderDetails(movieId, type);
    }
});

// Sayfadan ayrılırken scroll pozisyonunu kaydet
window.addEventListener('pagehide', () => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) sessionStorage.setItem('details_scroll_' + id, window.scrollY);
});

// ——— Skeleton loading ———
function showDetailsSkeleton() {
    const trailerArea = document.getElementById('trailerArea');
    const movieDetails = document.getElementById('movieDetails');
    if (trailerArea) trailerArea.innerHTML = `<div style="width:100%;height:100%;background:linear-gradient(110deg,rgba(255,255,255,0.03) 8%,rgba(255,255,255,0.06) 18%,rgba(255,255,255,0.03) 33%);background-size:200% 100%;animation:skeletonShimmer 1.4s linear infinite;"></div>`;
    if (movieDetails) movieDetails.innerHTML = `<div style="height:200px;background:linear-gradient(110deg,rgba(255,255,255,0.03) 8%,rgba(255,255,255,0.06) 18%,rgba(255,255,255,0.03) 33%);background-size:200% 100%;animation:skeletonShimmer 1.4s linear infinite;border-radius:16px;"></div>`;

    if (!document.getElementById('skeletonKeyframe')) {
        const s = document.createElement('style');
        s.id = 'skeletonKeyframe';
        s.textContent = `@keyframes skeletonShimmer { to { background-position: -200% 0; } }`;
        document.head.appendChild(s);
    }
}

// ——— Placeholder'lar ———
function getPlaceholder(text = "GÖRSEL BULUNAMADI") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750">
        <defs><linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#1c1c1c"/><stop offset="100%" style="stop-color:#050505"/>
        </linearGradient></defs>
        <rect width="100%" height="100%" fill="url(#pg)"/>
        <text x="50%" y="460" font-family="Arial" font-size="14" font-weight="900" fill="#666" text-anchor="middle" letter-spacing="4">${text}</text>
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function getUserPlaceholder() {
    return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="185" height="278" viewBox="0 0 185 278"><rect width="100%" height="100%" fill="#1a1a1a"/><path d="M92.5 110c13.8 0 25-11.2 25-25s-11.2-25-25-25-25 11.2-25 25 11.2 25 25 25zm0 10c-23.3 0-70 11.7-70 35v15h140v-15c0-23.3-46.7-35-70-35z" fill="#333" opacity="0.5"/></svg>`)}`;
}

function formatRuntime(minutes) {
    if (!minutes) return "";
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return h > 0 ? `${h}s ${m}dk` : `${m}dk`;
}

function handleSmartBack() {
    const referrer = document.referrer;
    if (!referrer || referrer.includes('index.html') || referrer === window.location.origin + '/') {
        window.location.replace('index.html');
    } else {
        history.back();
    }
}

function checkStatusFromArchive(id) {
    const archive = getArchive();
    const movie = archive.find(m => m.id == id);
    return {
        isWatched: movie ? movie.isWatched : false,
        isFav: movie ? movie.isFav : false,
        isSaved: !!movie
    };
}

// ——— Ana Render ———
async function renderDetails(id, type) {
    const movieDetailsContainer = document.getElementById('movieDetails');
    const trailerArea = document.getElementById('trailerArea');
    if (!movieDetailsContainer || !trailerArea) return;

    const [movie] = await Promise.all([getMovieDetails(id, type)]);
    const { isWatched, isFav, isSaved } = checkStatusFromArchive(id);

    if (!movie) {
        movieDetailsContainer.innerHTML = '<div class="text-white p-10 text-center font-black">VERİ YÜKLENEMEDİ</div>';
        return;
    }

    // Trailer bul
    let trailer = null;
    if (movie.videos?.results?.length > 0) {
        const vids = movie.videos.results;
        trailer = vids.find(v => v.type === 'Trailer' && v.site === 'YouTube') ||
                  vids.find(v => v.type === 'Teaser' && v.site === 'YouTube');
    }

    const title = movie.title || movie.name;
    const releaseDate = movie.release_date || movie.first_air_date || "";
    const year = releaseDate ? releaseDate.split('-')[0] : "N/A";
    const mediaTypeText = type === 'tv' ? 'Dizi' : 'Film';
    const durationText = type === 'movie' ? ` • ${formatRuntime(movie.runtime)}` : "";
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(title + ' ' + year)}`;

    // TV / Koleksiyon bilgisi
    let extraInfoHTML = '';
    if (type === 'tv') {
        extraInfoHTML = `<div class="flex gap-4 mt-2 text-[10px] font-black text-[#7cfc00] uppercase tracking-[1px]">
            <span><i class="fa-solid fa-layer-group mr-1"></i> ${movie.number_of_seasons} SEZON</span>
            <span><i class="fa-solid fa-tv mr-1"></i> ${movie.number_of_episodes} BÖLÜM</span>
        </div>`;
    } else if (type === 'movie' && movie.belongs_to_collection) {
        const cleanName = movie.belongs_to_collection.name
            .replace(/\[Seri\]|\(Seri\)|Koleksiyonu|Collection|Series|Serisi/gi, '').trim();
        extraInfoHTML = `<div class="inline-block mt-2 text-[10px] font-black text-[#01b4e4] uppercase tracking-[1px]">
            <i class="fa-solid fa-rectangle-list mr-1"></i> SERİ: ${cleanName}
        </div>`;
    }

    // Öneriler / Koleksiyon
    let recItems = [], recTitle = "Önerilen Yapımlar", recColor = "#7cfc00", showAllLink = true;
    try {
        if (type === 'movie' && movie.belongs_to_collection) {
            const collection = await getCollectionDetails(movie.belongs_to_collection.id);
            if (collection?.parts) {
                recItems = collection.parts.filter(p => p.id != movie.id);
                recTitle = "Serinin Diğer Filmleri";
                recColor = "#01b4e4";
                showAllLink = false;
            }
        }
        if (recItems.length === 0) {
            const recommendations = await getRecommendations(id, type);
            recItems = recommendations?.results?.slice(0, 10) || [];
            showAllLink = recommendations && recommendations.total_results > 10;
        }
    } catch (e) { console.error("Öneri hatası:", e); }

    // Oyuncu kadrosu HTML
    const castHTML = movie.credits?.cast ? movie.credits.cast.slice(0, 15).map(person => {
        const pImg = person.profile_path ? 'https://image.tmdb.org/t/p/w200' + person.profile_path : getUserPlaceholder();
        const isFavPerson = typeof isPersonFav === 'function' && isPersonFav(person.id);
        return `
        <div class="movie-card min-w-[120px] h-[180px] cursor-pointer relative" onclick="window.location.href='person.html?id=${person.id}'">
            ${isFavPerson ? `<div class="absolute top-1.5 right-1.5 z-30 pointer-events-none">
                <div class="bg-black/60 text-[#FF0000] w-6 h-6 rounded-lg border border-white/10 flex items-center justify-center backdrop-blur-md">
                    <i class="fa-solid fa-heart text-[10px]"></i>
                </div></div>` : ''}
            <img src="${pImg}" loading="lazy" decoding="async" class="w-full h-full object-cover" onerror="this.src='${getUserPlaceholder()}'">
            <div class="movie-overlay">
                <div class="text-[10px] font-bold text-white text-center leading-tight px-1 uppercase">${person.name}</div>
                <div class="text-[8px] text-white/50 text-center truncate w-full px-1 uppercase mt-1">${person.character}</div>
            </div>
        </div>`;
    }).join('') : '';

    // Öneriler HTML
    const recommendationsHTML = recItems.map(item => {
        const itemStatus = checkStatusFromArchive(item.id);
        const itemYear = (item.release_date || item.first_air_date || '').split('-')[0] || 'N/A';
        const itemRating = (item.vote_average || 0).toFixed(1);
        const itemTypeLabel = (item.media_type || type) === 'tv' ? 'Dizi' : 'Film';
        const itemImg = item.poster_path ? 'https://image.tmdb.org/t/p/w200' + item.poster_path : getPlaceholder(itemTypeLabel);
        return `
        <div class="movie-card min-w-[140px] h-[210px] cursor-pointer" onclick="window.location.href='details.html?id=${item.id}&type=${item.media_type || type}'">
            <div class="absolute top-2 left-2 z-20">
                <div class="bg-black/60 ${itemStatus.isWatched ? 'text-[#7cfc00]' : 'text-white/20'} p-2 rounded-xl border border-white/10 flex items-center justify-center backdrop-blur-md">
                    <i class="fa-solid ${itemStatus.isWatched ? 'fa-check' : 'fa-eye-slash'} text-[12px]"></i>
                </div>
            </div>
            <div class="absolute top-2 right-2 z-20 flex flex-col gap-1 items-end">
                <div class="bg-black/60 text-[#FFAD1D] text-[10px] font-black px-1.5 py-0.5 rounded-md border border-white/10 backdrop-blur-md">⭐ ${itemRating}</div>
                <div class="bg-black/60 text-white/70 text-[8px] font-black px-1.5 py-0.5 rounded-md border border-white/5 uppercase">${itemYear} • ${itemTypeLabel}</div>
                ${itemStatus.isFav ? `<div class="bg-black/60 text-[#FF0000] p-2 rounded-xl border border-white/10 backdrop-blur-md"><i class="fa-solid fa-heart text-[12px]"></i></div>` : ''}
            </div>
            <img src="${itemImg}" loading="lazy" decoding="async" class="w-full h-full object-cover" onerror="this.src='${getPlaceholder(itemTypeLabel)}'">
            <div class="movie-overlay"><div class="text-[10px] font-black text-white text-center line-clamp-2 px-2 uppercase tracking-tight">${item.title || item.name}</div></div>
        </div>`;
    }).join('');

    movieDetailsContainer.innerHTML = `
        <div class="flex justify-between items-start mb-1">
            <h1 class="text-3xl font-black uppercase tracking-tight leading-none flex-1 pr-4 text-white">${title}</h1>
            <div class="flex items-center gap-4">
                <a href="${googleSearchUrl}" target="_blank" class="text-white/20 hover:text-[#EA4335] transition-colors text-xl"><i class="fa-brands fa-google"></i></a>
                <a href="https://www.themoviedb.org/${type}/${id}" target="_blank" class="text-white/20 hover:text-[#01b4e4] transition-colors text-xl"><i class="fa-solid fa-up-right-from-square"></i></a>
                <div class="text-[#ffaa00] font-black text-2xl flex items-center"><i class="fa-solid fa-star text-sm mr-2"></i>${(movie.vote_average || 0).toFixed(1)}</div>
            </div>
        </div>
        <div class="text-[10px] font-bold text-white/30 uppercase tracking-[2px] mb-4">${mediaTypeText} • ${year}${durationText}</div>
        ${extraInfoHTML}

        <div class="flex gap-2 my-8">
            <button onclick="handleFavoriteToggle(${movie.id})" id="favoriteBtn"
                class="w-16 h-16 rounded-2xl transition-all duration-300 flex items-center justify-center text-xl ${isFav ? 'bg-[#FF0000] text-white shadow-[0_0_20px_rgba(255,0,0,0.3)]' : 'bg-white/5 border border-white/10 text-white/40'}">
                <i class="fa-solid fa-heart"></i>
            </button>
            <button onclick="handleWatchedToggle(${movie.id})" id="watchedBtn"
                class="flex-1 h-16 rounded-2xl font-black uppercase tracking-[2px] text-[10px] transition-all duration-300 flex items-center justify-center gap-2 ${isWatched ? 'bg-[#7cfc00] text-black shadow-[0_0_20px_rgba(124,252,0,0.3)]' : 'bg-white/5 border border-white/10 text-white/40'}">
                <i class="fa-solid ${isWatched ? 'fa-check' : 'fa-eye-slash'}"></i>
                <span>${isWatched ? 'İZLENDİ' : 'İZLEMEDİM'}</span>
            </button>
        </div>

        <div class="flex gap-2 mb-8 overflow-x-auto no-scrollbar">
            ${movie.genres ? movie.genres.map(g => `<span class="genre-badge">${g.name}</span>`).join('') : ''}
        </div>

        <div class="flex gap-2 mb-8">
            ${trailer
                ? `<button onclick="playTrailer('${trailer.key}')" class="flex-1 h-16 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-[3px] text-[10px] flex items-center justify-center gap-2"><i class="fa-solid fa-circle-play text-[#7cfc00]"></i> FRAGMAN</button>`
                : `<button disabled class="flex-1 h-16 rounded-2xl bg-white/5 border border-white/5 text-white/10 font-black uppercase tracking-[3px] text-[10px] flex items-center justify-center gap-2 opacity-50"><i class="fa-solid fa-circle-xmark"></i> FRAGMAN YOK</button>`
            }
            <div id="dynamicActionBtn" class="w-16">
                ${isSaved
                    ? `<button onclick="handleRemove(${movie.id})" class="w-full h-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center text-xl"><i class="fa-solid fa-house-circle-xmark"></i></button>`
                    : `<button onclick="handleAdd(${movie.id}, '${type}')" class="w-full h-16 rounded-2xl bg-[#7cfc00]/10 border border-[#7cfc00]/20 text-[#7cfc00] flex items-center justify-center text-xl"><i class="fa-solid fa-house-medical"></i></button>`
                }
            </div>
        </div>

        <!-- Ebeveyn Kılavuzu Butonu (IMDb Parental Guide) -->
        <div class="flex gap-2 mb-8">
            ${movie.imdb_id ? 
                `<button onclick="openParentalGuide('${movie.imdb_id}')" class="flex-1 h-16 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-[2px] text-[10px] flex items-center justify-center gap-2 hover:bg-white/10 transition-colors">
                    <i class="fa-solid fa-child-reaching"></i> EBEVEYN KILAVUZU
                </button>` : 
                `<button disabled class="flex-1 h-16 rounded-2xl bg-white/5 border border-white/5 text-white/20 font-black uppercase tracking-[2px] text-[10px] flex items-center justify-center gap-2 opacity-50">
                    <i class="fa-solid fa-circle-xmark"></i> EBEVEYN KILAVUZU YOK
                </button>`
            }
        </div>

        <p class="text-white/60 text-sm leading-relaxed mb-10 font-light">${movie.overview || 'Bu yapım için henüz bir özet eklenmemiş.'}</p>

        <h3 class="text-[10px] font-black text-[#7cfc00] mb-6 uppercase tracking-[4px]">Oyuncu Kadrosu</h3>
        <div class="flex gap-4 overflow-x-auto pb-6 no-scrollbar mb-10">${castHTML}</div>

        ${recItems.length > 0 ? `
        <div class="flex justify-between items-center mb-6">
            <h3 class="text-[10px] font-black uppercase tracking-[4px]" style="color: ${recColor}">${recTitle}</h3>
            ${showAllLink ? `<a href="recommendations.html?id=${id}&type=${type}&title=${encodeURIComponent(movie.title || movie.name)}" class="text-[9px] font-black text-white/40 hover:text-[#7cfc00] transition-colors tracking-[1px]">TÜMÜNÜ GÖR <i class="fa-solid fa-chevron-right ml-1"></i></a>` : ''}
        </div>
        <div class="flex gap-4 overflow-x-auto pb-10 no-scrollbar">${recommendationsHTML}</div>` : ''}
    `;

    // Backdrop / poster göster
    const backdrop = movie.backdrop_path || movie.poster_path;
    const imgBase = 'https://image.tmdb.org/t/p/original';
    trailerArea.innerHTML = `<img src="${backdrop ? imgBase + backdrop : getPlaceholder()}" decoding="async" class="w-full h-full object-cover opacity-40" onerror="this.src='${getPlaceholder()}'">`;
}

// ——— Aksiyon Butonları ———
async function handleFavoriteToggle(id) {
    const { isSaved } = checkStatusFromArchive(id);
    if (!isSaved) { showToast("ÖNCE ARŞİVE EKLEYİN"); return; }

    const btn = document.getElementById('favoriteBtn');
    // Optimistik: hemen güncelle
    const currentFav = btn.classList.contains('bg-[#FF0000]');
    btn.className = `w-16 h-16 rounded-2xl transition-all duration-300 flex items-center justify-center text-xl ${!currentFav ? 'bg-[#FF0000] text-white shadow-[0_0_20px_rgba(255,0,0,0.3)]' : 'bg-white/5 border border-white/10 text-white/40'}`;

    const result = await toggleFavStatus(id);
    if (result === null) {
        // Hata → geri al
        btn.className = `w-16 h-16 rounded-2xl transition-all duration-300 flex items-center justify-center text-xl ${currentFav ? 'bg-[#FF0000] text-white shadow-[0_0_20px_rgba(255,0,0,0.3)]' : 'bg-white/5 border border-white/10 text-white/40'}`;
        showToast("HATA OLUŞTU");
    }
}

async function handleWatchedToggle(id) {
    const { isSaved } = checkStatusFromArchive(id);
    if (!isSaved) { showToast("ÖNCE ARŞİVE EKLEYİN"); return; }

    const btn = document.getElementById('watchedBtn');
    const currentWatched = btn.classList.contains('bg-[#7cfc00]');

    // Optimistik güncelleme
    btn.className = `flex-1 h-16 rounded-2xl font-black uppercase tracking-[2px] text-[10px] transition-all duration-300 flex items-center justify-center gap-2 ${!currentWatched ? 'bg-[#7cfc00] text-black shadow-[0_0_20px_rgba(124,252,0,0.3)]' : 'bg-white/5 border border-white/10 text-white/40'}`;
    btn.innerHTML = `<i class="fa-solid ${!currentWatched ? 'fa-check' : 'fa-eye-slash'}"></i><span>${!currentWatched ? 'İZLENDİ' : 'İZLEMEDİM'}</span>`;

    const result = await toggleWatchedStatus(id);
    if (result === null) {
        btn.className = `flex-1 h-16 rounded-2xl font-black uppercase tracking-[2px] text-[10px] transition-all duration-300 flex items-center justify-center gap-2 ${currentWatched ? 'bg-[#7cfc00] text-black shadow-[0_0_20px_rgba(124,252,0,0.3)]' : 'bg-white/5 border border-white/10 text-white/40'}`;
        btn.innerHTML = `<i class="fa-solid ${currentWatched ? 'fa-check' : 'fa-eye-slash'}"></i><span>${currentWatched ? 'İZLENDİ' : 'İZLEMEDİM'}</span>`;
        showToast("HATA OLUŞTU");
    }
}

async function handleAdd(id, type) {
    const addBtn = document.querySelector('#dynamicActionBtn button');
    if (addBtn) { addBtn.disabled = true; addBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-white/40 text-xl"></i>'; }

    const success = await saveToArchive(id, type);
    if (success) {
        document.getElementById('dynamicActionBtn').innerHTML =
            `<button onclick="handleRemove(${id})" class="w-full h-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center text-xl"><i class="fa-solid fa-house-circle-xmark"></i></button>`;
    } else {
        if (addBtn) { addBtn.disabled = false; addBtn.innerHTML = '<i class="fa-solid fa-house-medical text-xl"></i>'; }
    }
}

function handleRemove(id) {
    const exist = document.getElementById('customConfirm');
    if (exist) exist.remove();
    const confirmDiv = document.createElement('div');
    confirmDiv.id = 'customConfirm';
    confirmDiv.className = 'confirm-toast';
    confirmDiv.innerHTML = `
        <div class="confirm-content">
            <div class="text-[14px] font-black text-white mb-2 uppercase tracking-[2px] text-center">ARŞİVDEN SİLİNSİN Mİ?</div>
            <div class="flex gap-3 mt-6">
                <button id="realDelBtn" class="flex-1 bg-[#E3242B] text-white text-[10px] font-black py-4 rounded-2xl uppercase">SİL</button>
                <button id="realCancelBtn" class="flex-1 bg-white/10 text-white text-[10px] font-black py-4 rounded-2xl uppercase">İPTAL</button>
            </div>
        </div>`;
    document.body.appendChild(confirmDiv);
    document.getElementById('realDelBtn').addEventListener('click', async () => {
        confirmDiv.remove();
        await removeFromArchive(id);

        const params = new URLSearchParams(window.location.search);
        document.getElementById('dynamicActionBtn').innerHTML =
            `<button onclick="handleAdd(${id}, '${params.get('type') || 'movie'}')" class="w-full h-16 rounded-2xl bg-[#7cfc00]/10 border border-[#7cfc00]/20 text-[#7cfc00] flex items-center justify-center text-xl"><i class="fa-solid fa-house-medical"></i></button>`;

        const favBtn = document.getElementById('favoriteBtn');
        if (favBtn) favBtn.className = "w-16 h-16 rounded-2xl bg-white/5 border border-white/10 text-white/40 transition-all duration-300 flex items-center justify-center text-xl";

        const watchedBtn = document.getElementById('watchedBtn');
        if (watchedBtn) {
            watchedBtn.className = "flex-1 h-16 rounded-2xl bg-white/5 border border-white/10 text-white/40 font-black uppercase tracking-[2px] text-[10px] transition-all duration-300 flex items-center justify-center gap-2";
            watchedBtn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> <span>İZLEMEDİM</span>`;
        }
    });
    document.getElementById('realCancelBtn').addEventListener('click', () => {
        confirmDiv.classList.remove('show');
        setTimeout(() => confirmDiv.remove(), 400);
    });
    requestAnimationFrame(() => confirmDiv.classList.add('show'));
}

// ——— Trailer + Landscape Fullscreen ———
function playTrailer(videoKey) {
    const trailerArea = document.getElementById('trailerArea');
    if (!trailerArea) return;

    trailerArea.innerHTML = `
        <iframe
            id="trailerIframe"
            src="https://www.youtube.com/embed/${videoKey}?autoplay=1&rel=0"
            class="w-full h-full border-0"
            allow="autoplay; encrypted-media; fullscreen"
            allowfullscreen
            webkitallowfullscreen
            mozallowfullscreen>
        </iframe>`;

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Mobil fullscreen landscape desteği
    const iframe = document.getElementById('trailerIframe');
    if (iframe) {
        iframe.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        iframe.addEventListener('fullscreenchange', handleFullscreenChange);
        iframe.addEventListener('mozfullscreenchange', handleFullscreenChange);
    }
}

function handleFullscreenChange() {
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
    if (isFullscreen && screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
    } else if (!isFullscreen && screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
    }
}
