/**
 * ============================================================
 * FİLM ARŞİVİ - OYUNCU PROFİLİ (person.js)
 * Supabase auth + Optimistik UI + Infinite Scroll
 * ============================================================
 */

let allMovies = [];
let displayedCount = 0;
const itemsPerPage = 12;
let isLoading = false;
let lastScrollY = window.scrollY;

const IMAGE_PATH = "https://image.tmdb.org/t/p/w185";

const PLACEHOLDER_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='185' height='278' viewBox='0 0 185 278'%3e%3cdefs%3e%3clinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3e%3cstop offset='0%25' stop-color='%231a1a1a'/%3e%3cstop offset='100%25' stop-color='%230f0f0f'/%3e%3c/linearGradient%3e%3c/defs%3e%3crect width='100%25' height='100%25' fill='url(%23g)'/%3e%3cg fill='none' stroke='%23333' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' transform='translate(77%2c 110)'%3e%3crect x='2' y='2' width='28' height='22' rx='3'/%3e%3cpath d='M2 10h28M10 2v22'/%3e%3c/g%3e%3ctext x='50%25' y='60%25' font-family='sans-serif' font-size='9' font-weight='700' fill='%23444' text-anchor='middle' style='letter-spacing%3a2px'%3eGÖRSEL YOK%3c%2ftext%3e%3c%2fsvg%3e";

const USER_PLACEHOLDER_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='185' height='278' viewBox='0 0 185 278'%3e%3cdefs%3e%3clinearGradient id='ug' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3e%3cstop offset='0%25' stop-color='%23111'/%3e%3cstop offset='100%25' stop-color='%23050505'/%3e%3c/linearGradient%3e%3c/defs%3e%3crect width='100%25' height='100%25' fill='url(%23ug)'/%3e%3cg fill='%23222' transform='translate(67%2c 100)'%3e%3ccircle cx='25' cy='18' r='14'/%3e%3cpath d='M25 36c-18 0-25 10-25 18v4h50v-4c0-8-7-18-25-18z'/%3e%3c%2fg%3e%3ctext x='50%25' y='68%25' font-family='sans-serif' font-size='9' font-weight='700' fill='%23333' text-anchor='middle' style='letter-spacing%3a2px'%3eGÖRSEL YOK%3c%2ftext%3e%3c%2fsvg%3e";

// ——— Init ———
window.addEventListener('load', async () => {
    const session = await SupabaseManager.requireAuth();
    if (!session) return;

    await loadCache();
    initPersonPage();
});

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        refreshPersonMoviesUI();
        // bfcache'den dönüşte scroll pozisyonunu koru
        const key = 'person_scroll_' + new URLSearchParams(window.location.search).get('id');
        const savedY = sessionStorage.getItem(key);
        if (savedY) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => window.scrollTo({ top: parseInt(savedY), behavior: 'instant' }));
            });
        }
    }
});

// Sayfadan ayrılırken scroll pozisyonunu kaydet
window.addEventListener('pagehide', () => {
    const key = 'person_scroll_' + new URLSearchParams(window.location.search).get('id');
    sessionStorage.setItem(key, window.scrollY);
});

function initPersonPage() {
    const params = new URLSearchParams(window.location.search);
    const personId = params.get('id');

    if (personId) {
        renderPerson(personId);
        setupInfiniteScroll();
        createSmartScrollButton();
    } else {
        window.location.href = 'index.html';
    }

    document.getElementById('backBtn')?.addEventListener('click', () => {
        if (document.referrer && !document.referrer.includes('login')) history.back();
        else window.location.replace('index.html');
    });
}

// ——— Toast ———
function showToast(message) {
    const old = document.querySelector('.pro-toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'pro-toast';
    toast.style.cssText = "white-space: nowrap; width: max-content; min-width: 150px;";
    toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '1'; toast.style.top = '30px'; }, 10);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.top = '-100px'; setTimeout(() => toast.remove(), 500); }, 2500);
}

// ——— Yaş Hesaplama ———
const calculateAge = (birthDate) => {
    if (!birthDate) return null;
    const today = new Date(), birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    if (new Date(today.getFullYear(), today.getMonth(), today.getDate()) <
        new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--;
    return age;
};

// ——— Oyuncu Profili Render ———
async function renderPerson(id) {
    const personProfile = document.getElementById('personProfile');
    const person = await getPersonDetails(id);
    if (!person) return;

    const isFav = isPersonFav(id);
    const cast = person.combined_credits?.cast || [];
    const crew = person.combined_credits?.crew || [];
    const allWorksMap = new Map();
    [...cast, ...crew].forEach(item => { if (!allWorksMap.has(item.id)) allWorksMap.set(item.id, item); });
    allMovies = Array.from(allWorksMap.values()).sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));

    const age = calculateAge(person.birthday);
    const departmentMap = { "Acting": "Oyunculuk", "Directing": "Yönetmenlik", "Production": "Yapımcı", "Writing": "Yazarlık" };
    const profileImgHD = person.profile_path ? "https://image.tmdb.org/t/p/original" + person.profile_path : USER_PLACEHOLDER_SVG;
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(person.name)}`;

    personProfile.innerHTML = `
        <div class="flex flex-col items-center pt-4 animate-fadeIn">
            <div class="relative mb-6 cursor-zoom-in group">
                <img src="${person.profile_path ? IMAGE_PATH + person.profile_path : USER_PLACEHOLDER_SVG}"
                     onerror="this.src='${USER_PLACEHOLDER_SVG}'"
                     class="person-photo shadow-2xl transition-transform duration-500 group-hover:scale-[1.02] bg-[#000]"
                     onclick="openImageModal('${profileImgHD}')">
            </div>

            <div class="flex flex-col items-center gap-4 mb-8 w-full px-4 text-center">
                <h1 class="text-3xl font-black uppercase tracking-tight text-white leading-tight">${person.name}</h1>
                <div class="flex items-center justify-center gap-3">
                    <a href="${googleSearchUrl}" target="_blank"
                       class="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/80 hover:bg-[#7cfc00]/20 hover:text-[#7cfc00] transition-all shadow-lg">
                        <i class="fa-brands fa-google text-lg"></i>
                    </a>
                    <button onclick="handlePersonFav(${person.id})"
                            id="personFavBtn"
                            class="w-11 h-11 rounded-xl border transition-all flex items-center justify-center shadow-lg ${isFav ? 'bg-red-600/20 border-red-600 text-red-500' : 'bg-white/5 border-white/10 text-white/30'}">
                        <i class="fa-solid fa-heart text-lg"></i>
                    </button>
                </div>
            </div>

            <h3 class="w-full text-[10px] font-black uppercase tracking-[3px] text-[#7cfc00] mb-4 opacity-50 text-center">Kişisel Bilgi</h3>
            <div class="personal-info-grid w-full mb-8">
                <div class="info-item"><span class="info-label">BİLİNEN İŞİ</span><span class="info-value">${departmentMap[person.known_for_department] || person.known_for_department || '-'}</span></div>
                <div class="info-item"><span class="info-label">BİLİNEN FİLMLERİ</span><span class="info-value text-[#7cfc00] font-black">${allMovies.length}</span></div>
                <div class="info-item"><span class="info-label">CİNSİYET</span><span class="info-value">${person.gender === 1 ? 'Kadın' : 'Erkek'}</span></div>
                <div class="info-item"><span class="info-label">DOĞUM TARİHİ</span><span class="info-value">${person.birthday ? person.birthday.split('-').reverse().join('.') : '-'} ${age ? `(${age} Yaşında)` : ''}</span></div>
                <div class="info-item border-none"><span class="info-label">DOĞUM YERİ</span><span class="info-value line-clamp-1">${person.place_of_birth || 'Bilinmiyor'}</span></div>
            </div>

            <div class="bio-container w-full relative">
                <h3 class="text-[10px] font-black uppercase tracking-[3px] text-[#7cfc00] mb-3">Biyografi</h3>
                <div id="bioText" class="text-white/60 text-[13px] leading-relaxed font-light bio-collapsed">
                    ${person.biography ? person.biography.replace(/\n/g, '<br>') : 'Biyografi mevcut değil.'}
                </div>
                ${person.biography && person.biography.length > 200 ?
                    `<button id="toggleBio" class="bio-btn">DAHA FAZLA <i class="fa-solid fa-chevron-down ml-1"></i></button>` : ''}
            </div>
        </div>
    `;

    prepareImageModal();

    const toggleBtn = document.getElementById('toggleBio');
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            const bioText = document.getElementById('bioText');
            bioText.classList.toggle('bio-collapsed');
            toggleBtn.innerHTML = bioText.classList.contains('bio-collapsed') ?
                'DAHA FAZLA <i class="fa-solid fa-chevron-down ml-1"></i>' :
                'DAHA AZ <i class="fa-solid fa-chevron-up ml-1"></i>';
        };
    }

    loadMoreMovies();
}

// ——— Favori Toggle (Oyuncu) ———
async function handlePersonFav(id) {
    const btn = document.getElementById('personFavBtn');
    const currentFav = btn.classList.contains('bg-red-600\\/20');

    // Optimistik güncelleme
    const favClass = "w-11 h-11 rounded-xl border bg-red-600/20 border-red-600 text-red-500 flex items-center justify-center shadow-lg transition-all";
    const unfavClass = "w-11 h-11 rounded-xl border bg-white/5 border-white/10 text-white/30 flex items-center justify-center shadow-lg transition-all";

    const isCurrent = isPersonFav(id);
    btn.className = isCurrent ? unfavClass : favClass;

    const result = await togglePersonFav(id);
    if (result !== null) {
        showToast(result ? "OYUNCU FAVORİLERE EKLENDİ" : "OYUNCU FAVORİLERDEN ÇIKARILDI");
    } else {
        // Hata → geri al
        btn.className = isCurrent ? favClass : unfavClass;
        showToast("HATA OLUŞTU");
    }
}

// ——— Oyuncu Filmlerini Yükle ———
function loadMoreMovies() {
    if (isLoading || displayedCount >= allMovies.length) return;
    isLoading = true;

    const personMovies = document.getElementById('personMovies');
    const nextBatch = allMovies.slice(displayedCount, displayedCount + itemsPerPage);
    const archive = getArchive() || [];

    const html = nextBatch.map(movie => {
        const movieInArchive = archive.find(m => m.id === movie.id);
        const isWatched = movieInArchive ? movieInArchive.isWatched : false;
        const isFav = movieInArchive ? movieInArchive.isFav : false;
        const year = (movie.release_date || movie.first_air_date || "").split('-')[0] || "N/A";
        const typeLabel = (movie.media_type === 'tv' || movie.first_air_date) ? 'Dizi' : 'Film';
        const rating = (movie.vote_average || 0).toFixed(1);
        const posterSrc = movie.poster_path ? IMAGE_PATH + movie.poster_path : PLACEHOLDER_SVG;
        const mediaType = movie.media_type || (movie.first_air_date ? 'tv' : 'movie');

        return `
        <div class="movie-card animate-fadeIn" data-id="${movie.id}" onclick="window.location.href='details.html?id=${movie.id}&type=${mediaType}'">
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
                <div class="text-[11px] font-black text-white text-center line-clamp-2 px-2 uppercase tracking-tight">${movie.title || movie.name}</div>
            </div>
        </div>`;
    }).join('');

    personMovies.insertAdjacentHTML('beforeend', html);
    displayedCount += nextBatch.length;
    isLoading = false;
}

// ——— Geri döndüğünde izleme/fav durumlarını güncelle ———
function refreshPersonMoviesUI() {
    const personMovies = document.getElementById('personMovies');
    if (!personMovies) return;
    const archive = getArchive() || [];
    const movieCards = personMovies.querySelectorAll('.movie-card');

    movieCards.forEach(card => {
        const movieId = parseInt(card.dataset.id);
        const movieData = archive.find(m => m.id === movieId);
        const watchDiv = card.querySelector('.watch-status-icon');
        if (watchDiv) {
            const watched = movieData ? movieData.isWatched : false;
            watchDiv.className = `watch-status-icon bg-black/80 ${watched ? 'text-[#7cfc00]' : 'text-white/20'} p-2 rounded-xl border border-white/5 flex items-center justify-center`;
            watchDiv.innerHTML = `<i class="fa-solid ${watched ? 'fa-check' : 'fa-eye-slash'} text-[12px]"></i>`;
        }
        const favContainer = card.querySelector('.fav-status-container');
        if (favContainer) {
            favContainer.innerHTML = (movieData && movieData.isFav)
                ? `<div class="bg-black/80 text-[#FF0000] p-2 rounded-xl border border-white/5"><i class="fa-solid fa-heart text-[12px]"></i></div>`
                : '';
        }
    });
}

// ——— Lightbox ———
function prepareImageModal() {
    if (document.getElementById('imageModal')) return;
    const modal = document.createElement('div');
    modal.id = 'imageModal';
    modal.className = 'fixed inset-0 z-[10000] bg-black/95 backdrop-blur-xl flex items-center justify-center opacity-0 pointer-events-none transition-all duration-300';
    modal.innerHTML = `
        <div class="absolute top-6 right-6 z-[10001] w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform" onclick="closeImageModal()">
            <i class="fa-solid fa-xmark text-xl"></i>
        </div>
        <img id="modalImg" src="" class="max-w-[90%] max-h-[80vh] rounded-2xl shadow-2xl transform scale-95 transition-transform duration-300">
    `;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) closeImageModal(); };
}

function openImageModal(src) {
    const modal = document.getElementById('imageModal');
    const img = document.getElementById('modalImg');
    img.src = src;
    modal.classList.remove('opacity-0', 'pointer-events-none');
    setTimeout(() => img.classList.replace('scale-95', 'scale-100'), 10);
    document.body.style.overflow = 'hidden';
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    const img = document.getElementById('modalImg');
    modal.classList.add('opacity-0', 'pointer-events-none');
    img.classList.replace('scale-100', 'scale-95');
    document.body.style.overflow = '';
}

// ——— Infinite Scroll ———
function setupInfiniteScroll() {
    window.addEventListener('scroll', () => {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 1000) {
            loadMoreMovies();
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

