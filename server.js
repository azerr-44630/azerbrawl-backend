require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { getJson } = require('serpapi');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.get("/", (req, res) => res.send("ClashAzeri API Backend Server Aktivdir!"));
app.use(cookieParser());

app.use((req, res, next) => {
  const banCookie = req.cookies.azerbrawl_ban;
  if (banCookie) {
    const ban = JSON.parse(banCookie);
    if (new Date(ban.expiresAt) > new Date()) {
      return res.status(403).json({ error: 'Bye Bye! Siz 7 gün müddətinə banlanmısınız.' });
    }
  }
  next();
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

app.post('/api/auth/send-otp', (req, res) => {
  const { email } = req.body;
  const code = Math.random().toString(36).substring(2, 8);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  db.run(`INSERT OR REPLACE INTO otp_codes (email, code, attempts, expires_at) VALUES (?, ?, 0, ?)`, 
    [email, code, expiresAt], (err) => {
      if (err) return res.status(500).json({ error: 'Baza xətası' });
      
      transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'AzerBrawl Təsdiq Kodu',
        text: `Qeydiyyat təsdiq kodunuz: ${code}`
      }).then(() => res.json({ success: true, message: 'Kod Gmail ünvanınıza göndərildi.' }))
        .catch(() => res.status(500).json({ error: 'Mail göndərilə bilmədi.' }));
  });
});

app.post('/api/auth/verify', (req, res) => {
  const { email, code, password } = req.body;

  db.get(`SELECT * FROM otp_codes WHERE email = ?`, [email], async (err, record) => {
    if (!record || new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Kodun vaxtı bitib və ya yanlışdır.' });
    }

    if (record.code !== code) {
      const attempts = record.attempts + 1;
      if (attempts >= 3) {
        const banExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        res.cookie('azerbrawl_ban', JSON.stringify({ reason: '3 dəfə yanlış OTP', expiresAt: banExpires }), { maxAge: 7 * 24 * 60 * 60 * 1000 });
        db.run(`DELETE FROM otp_codes WHERE email = ?`, [email]);
        return res.status(403).json({ error: 'Bye Bye! 3 yanlış cəhdə görə 7 günlük ban aldınız.' });
      }
      db.run(`UPDATE otp_codes SET attempts = ? WHERE email = ?`, [attempts, email]);
      return res.status(400).json({ error: `Yanlış kod! Qalan cəhd: ${3 - attempts}` });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (email, password) VALUES (?, ?)`, [email, hashedPassword], (err) => {
      if (err) return res.status(400).json({ error: 'Bu email artıq qeydiyyatdan keçib.' });
      db.run(`DELETE FROM otp_codes WHERE email = ?`, [email]);
      res.json({ success: true, message: 'Qeydiyyat tamamlandı!' });
    });
  });
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

io.on('connection', (socket) => {
  socket.on('send_message', (data) => {
    if (LINK_REGEX.test(data.text) && !data.isAdmin) {
      socket.emit('ban_event', { message: 'Link paylaşmaq qadağandır! 7 gün banlandınız.' });
      socket.disconnect(true);
      return;
    }
    io.emit('receive_message', data);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server ${PORT} portunda aktivdir.`));

