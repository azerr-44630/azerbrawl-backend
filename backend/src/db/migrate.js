import { pool } from '../config/db.js';
import { logger } from '../config/logger.js';

const SQL = `
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS user_achievements CASCADE;
DROP TABLE IF EXISTS achievements CASCADE;
DROP TABLE IF EXISTS decks CASCADE;
DROP TABLE IF EXISTS tournament_participants CASCADE;
DROP TABLE IF EXISTS tournaments CASCADE;
DROP TABLE IF EXISTS user_activities CASCADE;
DROP TABLE IF EXISTS device_sessions CASCADE;
DROP TABLE IF EXISTS otp_codes CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  mask            VARCHAR(12) UNIQUE NOT NULL,
  email_hmac      VARCHAR(64) UNIQUE NOT NULL,
  phone_hmac      VARCHAR(64) UNIQUE NOT NULL,
  email_enc       TEXT NOT NULL,
  phone_enc       TEXT NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  password_enc    TEXT NOT NULL,
  role            VARCHAR(20) NOT NULL DEFAULT 'user',
  player_tag      VARCHAR(50),
  referral_code   VARCHAR(20) UNIQUE,
  referred_by     INT REFERENCES users(id) ON DELETE SET NULL,
  tickets         INT NOT NULL DEFAULT 0,
  xp              INT NOT NULL DEFAULT 0,
  level           INT NOT NULL DEFAULT 1,
  banned_until    TIMESTAMPTZ,
  ban_reason      TEXT,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email_hmac ON users(email_hmac);
CREATE INDEX idx_users_phone_hmac ON users(phone_hmac);

CREATE TABLE otp_codes (
  id                SERIAL PRIMARY KEY,
  email_hmac        VARCHAR(64) NOT NULL,
  phone_hmac        VARCHAR(64) NOT NULL,
  email_code_hash   VARCHAR(255) NOT NULL,
  phone_code_hash   VARCHAR(255) NOT NULL,
  email_attempts    INT NOT NULL DEFAULT 0,
  phone_attempts    INT NOT NULL DEFAULT 0,
  expires_at        TIMESTAMPTZ NOT NULL,
  ip                VARCHAR(45),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_otp_email ON otp_codes(email_hmac);
CREATE INDEX idx_otp_phone ON otp_codes(phone_hmac);

CREATE TABLE device_sessions (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INT REFERENCES users(id) ON DELETE CASCADE,
  device_hash     VARCHAR(255) NOT NULL,
  device_label    VARCHAR(120),
  ip              VARCHAR(45),
  user_agent      TEXT,
  fingerprint     VARCHAR(64),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_devices_user ON device_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_devices_expires ON device_sessions(expires_at);

CREATE TABLE user_activities (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE SET NULL,
  mask        VARCHAR(12),
  action      VARCHAR(50) NOT NULL,
  metadata    JSONB,
  ip          VARCHAR(45),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_activities_user ON user_activities(user_id, created_at DESC);
CREATE INDEX idx_activities_action ON user_activities(action, created_at DESC);

CREATE TABLE tournaments (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(255) NOT NULL,
  game          VARCHAR(50) NOT NULL,
  mode          VARCHAR(50) DEFAULT '1v1',
  ticket_price  INT NOT NULL DEFAULT 1,
  prize_pool    INT NOT NULL DEFAULT 0,
  max_players   INT NOT NULL DEFAULT 16,
  status        VARCHAR(20) NOT NULL DEFAULT 'open',
  starts_at     TIMESTAMPTZ,
  created_by    INT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tournament_participants (
  id              SERIAL PRIMARY KEY,
  tournament_id   INT REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id         INT REFERENCES users(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  placement       INT,
  UNIQUE(tournament_id, user_id)
);

CREATE TABLE decks (
  id          SERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  game        VARCHAR(50) NOT NULL,
  cards_json  JSONB NOT NULL,
  likes       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INT REFERENCES users(id) ON DELETE SET NULL,
  room        VARCHAR(50) NOT NULL DEFAULT 'general',
  mask        VARCHAR(12),
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_chat_room ON chat_messages(room, id DESC);

CREATE TABLE achievements (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(50) UNIQUE NOT NULL,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  icon        VARCHAR(50),
  xp_reward   INT NOT NULL DEFAULT 0
);

CREATE TABLE user_achievements (
  user_id         INT REFERENCES users(id) ON DELETE CASCADE,
  achievement_id  INT REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

INSERT INTO achievements (code, title, description, icon, xp_reward) VALUES
  ('first_login',        'Ilk Addim',     'Sistema ilk defe daxil oldunuz',   'R',   10),
  ('profile_complete',   'Sexsiyyet',     'Profilinizi tamamladiniz',         'U',   25),
  ('first_tournament',   'Reqabet',       'Ilk turnirinize qatildiniz',       'T',   50),
  ('first_win',          'Qalib',         'Ilk turniri qazandiniz',           'K',  200),
  ('chat_veteran',       'Sohbetci',      '100 mesaj gonderdiniz',            'C',  100),
  ('referral_master',    'Devetci',       '5 dostunuzu getirdiniz',           'D',  150)
ON CONFLICT (code) DO NOTHING;
`;

export async function runMigrations() {
  logger.info('Migrationlar baslayir...');
  await pool.query(SQL);
  logger.info('Migrationlar tamamlandi');
}

if (import.meta.url === 'file://' + process.argv[1]) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'Migration xetasi');
      process.exit(1);
    });
}
