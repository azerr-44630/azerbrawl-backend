const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./azerbrawl.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS otp_codes (
    email TEXT PRIMARY KEY,
    code TEXT,
    attempts INTEGER DEFAULT 0,
    expires_at DATETIME
  )`);
});

module.exports = db;

