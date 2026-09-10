const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      player_tag VARCHAR(50) DEFAULT NULL,
      referral_code VARCHAR(50) UNIQUE,
      referred_by INT DEFAULT NULL,
      tickets INT DEFAULT 0,
      banned_until TIMESTAMP DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      email VARCHAR(255) PRIMARY KEY,
      code VARCHAR(10) NOT NULL,
      attempts INT DEFAULT 0,
      expires_at TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      game VARCHAR(50) NOT NULL,
      ticket_price INT DEFAULT 1,
      max_players INT DEFAULT 16,
      status VARCHAR(50) DEFAULT 'open',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tournament_participants (
      id SERIAL PRIMARY KEY,
      tournament_id INT REFERENCES tournaments(id) ON DELETE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tournament_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS decks (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      game VARCHAR(50) NOT NULL,
      cards_json JSONB NOT NULL,
      likes INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

module.exports = { pool, initDb };
