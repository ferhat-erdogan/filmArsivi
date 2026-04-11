/**
 * ============================================================
 * FİLM ARŞİVİ - ARAMA & FİLTRE SERVİSİ
 * getArchive() artık Supabase cache'den geliyor — API aynı.
 * ============================================================
 */

/**
 * Arşivdeki verileri kriterlere göre filtrele
 */
function filterArchive(criteria = { status: 'all', genre: 'all' }) {
    let myMovies = getArchive();

    return myMovies.filter(movie => {
        const statusMatch =
            criteria.status === 'all' ? true :
            criteria.status === 'watched' ? movie.isWatched : !movie.isWatched;

        const genreMatch =
            criteria.genre === 'all' ? true :
            (movie.genres && movie.genres.some(g => g.id == criteria.genre));

        return statusMatch && genreMatch;
    });
}

/**
 * Arşiv içinde metin araması (başlık bazlı)
 */
function searchInArchive(query) {
    let myMovies = getArchive();
    if (!query) return myMovies;

    const lowerQuery = query.toLowerCase();
    return myMovies.filter(movie =>
        (movie.title || '').toLowerCase().includes(lowerQuery) ||
        (movie.name || '').toLowerCase().includes(lowerQuery) ||
        (movie.original_title && movie.original_title.toLowerCase().includes(lowerQuery))
    );
}

/**
 * Sıralama
 */
function sortArchive(movies, sortBy = 'newest') {
    switch (sortBy) {
        case 'newest':
            return movies.sort((a, b) => new Date(b.addedDate) - new Date(a.addedDate));
        case 'oldest':
            return movies.sort((a, b) => new Date(a.addedDate) - new Date(b.addedDate));
        case 'rating':
            return movies.sort((a, b) => b.vote_average - a.vote_average);
        case 'alpha':
            return movies.sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || ''));
        default:
            return movies;
    }
}

