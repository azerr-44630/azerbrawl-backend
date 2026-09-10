require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { getJson } = require('serpapi');
const { pool, initDb } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const JWT_SECRET = process.env.JWT_SECRET || 'azerbrawl-super-secret-key';

app.use(express.json());
app.use(cookieParser());

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Çoxlu sorğu gönderildi. Xahiş olunur 15 dəqiqə gözləyin.' }
});

app.get("/", (req, res) => res.send("ClashAzeri API Backend Server Aktivdir!"));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

app.post('/api/auth/send-otp', otpLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email daxil edilməlidir.' });

  const code = Math.random().toString(36).substring(2, 8);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  try {
    await pool.query(
      `INSERT INTO otp_codes (email, code, attempts, expires_at)
       VALUES ($1, $2, 0, $3)
       ON CONFLICT (email)
       DO UPDATE SET code = $2, attempts = 0, expires_at = $3`,
      [email, code, expiresAt]
    );

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'AzerBrawl Təsdiq Kodu',
      text: `Qeydiyyat/Giriş təsdiq kodunuz: ${code}`
    });

    res.json({ success: true, message: 'Kod Gmail ünvanınıza göndərildi.' });
  } catch (err) {
    res.status(500).json({ error: 'Baza xətası və ya mail göndərilə bilmədi.' });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  const { email, code, password } = req.body;

  try {
    const { rows } = await pool.query(`SELECT * FROM otp_codes WHERE email = $1`, [email]);
    const record = rows[0];

    if (!record || new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Kodun vaxtı bitib və ya yanlışdır.' });
    }

    if (record.code !== code) {
      const attempts = record.attempts + 1;
      if (attempts >= 3) {
        const banExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await pool.query(`UPDATE users SET banned_until = $1 WHERE email = $2`, [banExpires, email]);
        await pool.query(`DELETE FROM otp_codes WHERE email = $1`, [email]);
        return res.status(403).json({ error: '3 yanlış cəhdə görə 7 günlük ban aldınız.' });
      }
      await pool.query(`UPDATE otp_codes SET attempts = $1 WHERE email = $2`, [attempts, email]);
      return res.status(400).json({ error: `Yanlış kod! Qalan cəhd: ${3 - attempts}` });
    }

    let userRes = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
    let user = userRes.rows[0];

    if (!user) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await pool.query(
        `INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email, role, tickets, banned_until`,
        [email, hashedPassword]
      );
      user = newUser.rows[0];
    }

    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      return res.status(403).json({ error: 'Hesabınız banlanıb.', bannedUntil: user.banned_until });
    }

    await pool.query(`DELETE FROM otp_codes WHERE email = $1`, [email]);

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, role: user.role, tickets: user.tickets }
    });
  } catch (err) {
    res.status(500).json({ error: 'Daxili server xətası.' });
  }
});

app.get('/api/news', (req, res) => {
  getJson({
    engine: "google_news",
    q: "Brawl Stars",
    api_key: process.env.SERPAPI_KEY
  }, (json) => {
    res.json({ news: json.news_results || [] });
  });
});

const LINK_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9]+\.[a-zA-Z]{2,})/gi;

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers.cookie?.split('auth_token=')[1]?.split(';')[0];
  if (!token) return next(new Error('Auth xətası: Token tapılmadı'));

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return next(new Error('Etibarsız Token'));
    try {
      const { rows } = await pool.query('SELECT id, email, role, banned_until FROM users WHERE id = $1', [decoded.id]);
      const user = rows[0];
      if (!user) return next(new Error('İstifadəçi tapılmadı'));
      if (user.banned_until && new Date(user.banned_until) > new Date()) {
        return next(new Error('Hesabınız banlanıb'));
      }
      socket.user = user;
      next();
    } catch (dbErr) {
      next(new Error('DB Xətası'));
    }
  });
});

io.on('connection', (socket) => {
  socket.on('send_message', async (data) => {
    if (LINK_REGEX.test(data.text) && socket.user.role !== 'admin') {
      const banExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await pool.query('UPDATE users SET banned_until = $1 WHERE id = $2', [banExpires, socket.user.id]);
      socket.emit('ban_event', { message: 'Link paylaşmaq qadağandır! 7 gün banlandınız.' });
      socket.disconnect(true);
      return;
    }
    io.emit('receive_message', {
      user: socket.user.email,
      text: data.text,
      role: socket.user.role
    });
  });
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    server.listen(PORT, () => console.log(`Server ${PORT} portunda aktivdir.`));
  })
  .catch((err) => {
    console.error('DB init xətası:', err);
    process.exit(1);
  });
