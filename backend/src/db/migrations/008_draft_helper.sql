-- ═══════════════════════════════════════════════════════════════
-- DRAFT HELPER — Cədvəllər
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS brawlers (
  id           SERIAL PRIMARY KEY,
  slug         VARCHAR(50) UNIQUE NOT NULL,
  name         VARCHAR(50) NOT NULL,
  rarity       VARCHAR(30),
  role         VARCHAR(30),
  attack_range VARCHAR(20),
  hp_base      INT,
  damage_base  INT,
  icon_url     TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS counter_matrix (
  id           BIGSERIAL PRIMARY KEY,
  attacker_id  INT REFERENCES brawlers(id) ON DELETE CASCADE,
  defender_id  INT REFERENCES brawlers(id) ON DELETE CASCADE,
  winrate      DECIMAL(5,2),
  sample_size  INT DEFAULT 0,
  source       VARCHAR(30),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(attacker_id, defender_id)
);

CREATE TABLE IF NOT EXISTS meta_trends (
  id            BIGSERIAL PRIMARY KEY,
  brawler_id    INT REFERENCES brawlers(id) ON DELETE CASCADE,
  patch_version VARCHAR(20),
  pickrate      DECIMAL(5,2),
  winrate       DECIMAL(5,2),
  trend         VARCHAR(20),
  recorded_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maps (
  id           SERIAL PRIMARY KEY,
  slug         VARCHAR(50) UNIQUE NOT NULL,
  name         VARCHAR(80) NOT NULL,
  mode         VARCHAR(30),
  image_url    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS map_counters (
  id           BIGSERIAL PRIMARY KEY,
  map_id       INT REFERENCES maps(id) ON DELETE CASCADE,
  attacker_id  INT REFERENCES brawlers(id) ON DELETE CASCADE,
  winrate      DECIMAL(5,2),
  tier         VARCHAR(2),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(map_id, attacker_id)
);

CREATE TABLE IF NOT EXISTS draft_requests (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            INT REFERENCES users(id) ON DELETE SET NULL,
  mode               VARCHAR(30),
  map_slug           VARCHAR(50),
  enemy_brawlers     JSONB,
  suggested_brawlers JSONB,
  user_picked        VARCHAR(50),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_draft_user ON draft_requests(user_id, created_at DESC);
