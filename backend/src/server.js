import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Server as SocketServer } from 'socket.io';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { runMigrations } from './db/migrate.js';
import { errorHandler } from './middleware/errorHandler.js';
import { globalLimiter } from './middleware/rateLimit.js';

import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import gameRoutes from './routes/game.routes.js';
import newsRoutes from './routes/news.routes.js';
import { initChatSocket } from './sockets/chat.socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
const server = http.createServer(app);

const allowedOrigins = env.CORS_ORIGINS.split(',')
  .map(function (s) { return s.trim(); })
  .filter(Boolean);

const io = new SocketServer(server, {
  cors: { origin: allowedOrigins, credentials: true },
});

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(globalLimiter);

app.get('/health', function (_req, res) {
  res.json({ ok: true, ts: Date.now() });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', gameRoutes);
app.use('/api/news', newsRoutes);

app.use(express.static(PUBLIC_DIR, { index: false }));

app.get(/^\/(?!api|socket\.io|health).*/, function (_req, res) {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use('/api', function (_req, res) {
  res.status(404).json({ error: 'Tapilmadi' });
});

app.use(errorHandler);

initChatSocket(io);

(async function () {
  try {
    await runMigrations();
    server.listen(env.PORT, function () {
      logger.info('Server ' + env.PORT + ' portunda (' + env.NODE_ENV + ')');
      logger.info('Frontend: http://localhost:' + env.PORT);
      logger.info('API:      http://localhost:' + env.PORT + '/api');
    });
  } catch (err) {
    logger.fatal({ err }, 'Baslatma xetasi');
    process.exit(1);
  }
})();

process.on('unhandledRejection', function (err) {
  logger.error({ err }, 'Unhandled rejection');
});

process.on('uncaughtException', function (err) {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
