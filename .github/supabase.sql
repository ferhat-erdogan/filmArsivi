-- ============================================================
-- FİLM ARŞİVİ - SUPABASE VERİTABANI ŞEMASI
-- ============================================================

-- 1. APP CONFIG (TMDB API KEY burada saklanır)
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TMDB API Key'i buraya gir (tek satır)
INSERT INTO app_config (key, value) VALUES ('tmdb_api_key', 'TMDB_KEY')
ON CONFLICT (key) DO NOTHING;

-- 2. KULLANICI FİLM ARŞİVİ
CREATE TABLE IF NOT EXISTS user_movies (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tmdb_id INTEGER NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'movie', -- 'movie' | 'tv'
    movie_data JSONB NOT NULL, -- TMDB'den gelen tam veri
    is_fav BOOLEAN NOT NULL DEFAULT FALSE,
    is_watched BOOLEAN NOT NULL DEFAULT FALSE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, tmdb_id, media_type)
);

-- 3. KULLANICI OYUNCU ARŞİVİ
CREATE TABLE IF NOT EXISTS user_persons (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tmdb_person_id INTEGER NOT NULL,
    person_data JSONB NOT NULL, -- TMDB'den gelen tam veri
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, tmdb_person_id)
);

-- 4. ROW LEVEL SECURITY (RLS) — Her kullanıcı yalnızca kendi verisine erişebilir
ALTER TABLE user_movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_persons ENABLE ROW LEVEL SECURITY;

-- app_config: sadece authenticated okuyabilir, kimse yazamaz (service role hariç)
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_config_read" ON app_config
    FOR SELECT TO authenticated USING (TRUE);

-- user_movies policies
CREATE POLICY "movies_select_own" ON user_movies
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "movies_insert_own" ON user_movies
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "movies_update_own" ON user_movies
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "movies_delete_own" ON user_movies
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- user_persons policies
CREATE POLICY "persons_select_own" ON user_persons
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "persons_insert_own" ON user_persons
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "persons_delete_own" ON user_persons
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5. updated_at otomatik güncelleme trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_movies_updated_at
    BEFORE UPDATE ON user_movies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 6. Performans için indexler
CREATE INDEX IF NOT EXISTS idx_user_movies_user_id ON user_movies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_movies_tmdb_id ON user_movies(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_user_movies_added_at ON user_movies(user_id, added_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_movies_is_fav ON user_movies(user_id, is_fav) WHERE is_fav = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_movies_is_watched ON user_movies(user_id, is_watched);
CREATE INDEX IF NOT EXISTS idx_user_persons_user_id ON user_persons(user_id);

-- ============================================================
-- KURULUM TAMAMLANDI
-- Supabase Dashboard > Authentication > Providers bölümünden
-- Email auth'u aktif etmeyi unutma.
-- app_config tablosuna TMDB API Key'ini girmeyi unutma!
-- ============================================================

