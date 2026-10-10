import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { logger } from '../config/logger.js';
import { containsLink } from '../utils/urlDetector.js';
import { clean } from '../utils/sanitize.js';
import { banUser } from '../services/banService.js';
import { logActivity } from '../services/activityService.js';

const ROOMS = ['general', 'brawl', 'clash', 'turnir'];
const BAN_DAYS = 7;

export function initChatSocket(io) {
  io.use(async (socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie || '';
      const match = cookie.match(/access_token=([^;]+)/);
      const token = (socket.handshake.auth && socket.handshake.auth.token) || (match ? match[1] : null);

      if (!token) return next(new Error('NO_TOKEN'));

      let payload;
      try {
        payload = jwt.verify(token, env.JWT_SECRET);
      } catch (e) {
        return next(new Error('AUTH_FAIL'));
      }

      const { rows } = await query(
        'SELECT id, mask, role, banned_until FROM users WHERE id = $1',
        [payload.sub]
      );
      const user = rows[0];
      if (!user) return next(new Error('NO_USER'));
      if (user.banned_until && new Date(user.banned_until) > new Date()) {
        return next(new Error('BANNED'));
      }

      socket.user = user;
      next();
    } catch (err) {
      logger.warn({ err: err.message }, 'Socket auth xetasi');
      next(new Error('AUTH_FAIL'));
    }
  });

  io.on('connection', async (socket) => {
    let currentRoom = 'general';
    socket.join(currentRoom);

    try {
      const { rows } = await query(
        'SELECT mask AS "user", text, room, created_at FROM chat_messages WHERE room = $1 ORDER BY id DESC LIMIT 50',
        [currentRoom]
      );
      socket.emit('chat:history', rows.reverse());
    } catch (err) {
      logger.warn({ err: err.message }, 'History xetasi');
    }

    socket.on('chat:switch', async (room) => {
      if (ROOMS.indexOf(room) === -1) return;

      socket.leave(currentRoom);
      currentRoom = room;
      socket.join(room);

      try {
        const { rows } = await query(
          'SELECT mask AS "user", text, room, created_at FROM chat_messages WHERE room = $1 ORDER BY id DESC LIMIT 50',
          [room]
        );
        socket.emit('chat:history', rows.reverse());
      } catch (e) {
        // sessiz
      }
    });

    socket.on('chat:send', async (payload, ack) => {
      try {
        const text = clean(payload && payload.text);
        if (!text || text.length > 500) {
          return ack && ack({ error: 'Mesaj bos ve ya cox uzundur' });
        }

        if (containsLink(text) && socket.user.role !== 'admin') {
          await banUser({
            userId: socket.user.id,
            days: BAN_DAYS,
            reason: 'Link paylasmaq qadagandir',
          });

          await logActivity({
            userId: socket.user.id,
            mask: socket.user.mask,
            action: 'auto_ban_link',
            metadata: { text: text.slice(0, 80) },
            ip: socket.handshake.address,
          });

          socket.emit('chat:ban', {
            message: 'Link paylasdiginiz ucun 7 gun banlandiniz',
            days: BAN_DAYS,
          });

          return socket.disconnect(true);
        }

        const { rows } = await query(
          'INSERT INTO chat_messages (user_id, room, mask, text) VALUES ($1, $2, $3, $4) RETURNING id, created_at',
          [socket.user.id, currentRoom, socket.user.mask, text]
        );

        io.to(currentRoom).emit('chat:message', {
          id: rows[0].id,
          user: socket.user.mask,
          role: socket.user.role,
          room: currentRoom,
          text,
          created_at: rows[0].created_at,
        });

        if (ack) ack({ ok: true });
      } catch (err) {
        logger.error({ err: err.message }, 'Chat mesaj xetasi');
        if (ack) ack({ error: 'Server xetasi' });
      }
    });
  });
}
