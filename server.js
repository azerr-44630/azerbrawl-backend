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
  message: { error: 'Çoxlu sorğu gönderildi. 15 dəqiqə gözləyin.' }
});

const authenticateToken = (req, res, next) => {
  const token = req.cookies.auth_token || req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'İcazə verilmədi: Token yoxdur' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Etibarsız Token' });
    req.user = user;
    next();
  });
};

app.get("/", (req, res) => res.send("ClashAzeri Full API Server Active!"));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

// OTP Göndərmə
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
      text: `Təsdiq kodunuz: ${code}`
    });

    res.json({ success: true, message: 'Kod göndərildi.' });
  } catch (err) {
    res.status(500).json({ error: 'Mail göndərilə bilmədi.' });
  }
});

// Qeydiyyat və Giriş (Referal dəstəkli)
app.post('/api/auth/verify', async (req, res) => {
  const { email, code, password, refCode } = req.body;

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
      const myRefCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      let inviterId = null;
      if (refCode) {
        const inviterRes = await pool.query(`SELECT id FROM users WHERE referral_code = $1`, [refCode]);
        if (inviterRes.rows[0]) {
          inviterId = inviterRes.rows[0].id;
          await pool.query(`UPDATE users SET tickets = tickets + 1 WHERE id = $1`, [inviterId]);
        }
      }

      const newUser = await pool.query(
        `INSERT INTO users (email, password, referral_code, referred_by, tickets) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, email, role, tickets, player_tag, referral_code`,
        [email, hashedPassword, myRefCode, inviterId, refCode ? 1 : 0]
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

    res.json({ success: true, token, user });
  } catch (err) {
    res.status(500).json({ error: 'Daxili server xətası.' });
  }
});

// 2.1 Player Tag Yeniləmə
app.post('/api/user/tag', authenticateToken, async (req, res) => {
  const { playerTag } = req.body;
  try {
    await pool.query(`UPDATE users SET player_tag = $1 WHERE id = $2`, [playerTag, req.user.id]);
    res.json({ success: true, playerTag });
  } catch (err) {
    res.status(500).json({ error: 'Tag yadda saxlanıla bilmədi.' });
  }
});

// 1. Turnirlər
app.get('/api/tournaments', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM tournaments ORDER BY created_at DESC`);
    res.json({ tournaments: rows });
  } catch (err) {
    res.status(500).json({ error: 'Turnirlər gətirilmədi.' });
  }
});

app.post('/api/tournaments/join', authenticateToken, async (req, res) => {
  const { tournamentId } = req.body;
  try {
    const userRes = await pool.query(`SELECT tickets FROM users WHERE id = $1`, [req.user.id]);
    const user = userRes.rows[0];
    
    if (user.tickets < 1) return res.status(400).json({ error: 'Kifayət qədər biletiniz yoxdur.' });

    await pool.query(`UPDATE users SET tickets = tickets - 1 WHERE id = $1`, [req.user.id]);
    await pool.query(`INSERT INTO tournament_participants (tournament_id, user_id) VALUES ($1, $2)`, [tournamentId, req.user.id]);
    
    res.json({ success: true, message: 'Turnirə qatıldınız!' });
  } catch (err) {
    res.status(400).json({ error: 'Turnirə qatılmaq mümkün olmadı və ya artıq qatılmısınız.' });
  }
});

// 4.1 Destə (Deck) Paylaşımı
app.get('/api/decks', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT d.*, u.email FROM decks d 
      JOIN users u ON d.user_id = u.id 
      ORDER BY d.likes DESC LIMIT 20
    `);
    res.json({ decks: rows });
  } catch (err) {
    res.status(500).json({ error: 'Destələr gətirilmədi.' });
  }
});

app.post('/api/decks', authenticateToken, async (req, res) => {
  const { title, game, cardsJson } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO decks (user_id, title, game, cards_json) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, title, game, JSON.stringify(cardsJson)]
    );
    res.json({ success: true, deck: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Destə saxlanılmadı.' });
  }
});

// 5. Admin Paneli Endpoint-ləri
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'İcazəniz yoxdur.' });
  try {
    const { rows } = await pool.query(`SELECT id, email, role, tickets, banned_until, player_tag FROM users`);
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: 'İstifadəçilər gətirilmədi.' });
  }
});

app.post('/api/admin/create-tournament', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'İcazəniz yoxdur.' });
  const { title, game, ticketPrice, maxPlayers } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO tournaments (title, game, ticket_price, max_players) VALUES ($1, $2, $3, $4) RETURNING *`,
      [title, game, ticketPrice || 1, maxPlayers || 16]
    );
    res.json({ success: true, tournament: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Turnir yaradılmadı.' });
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

// Socket.IO Çat
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
