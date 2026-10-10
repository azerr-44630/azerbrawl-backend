import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { banUser, unbanUser } from '../services/banService.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/users', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const { rows } = await query(
      'SELECT id, mask, role, tickets, xp, level, banned_until, ban_reason, player_tag, referral_code, created_at, last_login_at FROM users ORDER BY id DESC LIMIT $1',
      [limit]
    );
    res.json({ users: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/activities', async (req, res, next) => {
  try {
    const userId = req.query.userId;
    const action = req.query.action;
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);

    const conds = [];
    const params = [];

    if (userId) {
      params.push(userId);
      conds.push('a.user_id = $' + params.length);
    }
    if (action) {
      params.push(action);
      conds.push('a.action = $' + params.length);
    }
    params.push(limit);

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const sql =
      'SELECT a.id, a.user_id, COALESCE(a.mask, u.mask) AS mask, a.action, a.metadata, a.ip, a.created_at ' +
      'FROM user_activities a LEFT JOIN users u ON u.id = a.user_id ' +
      where +
      ' ORDER BY a.id DESC LIMIT $' +
      params.length;

    const { rows } = await query(sql, params);
    res.json({ activities: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/devices', async (_req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT d.id, d.user_id, u.mask, d.device_label, d.ip, d.last_seen_at, d.created_at, d.expires_at FROM device_sessions d LEFT JOIN users u ON u.id = d.user_id WHERE d.revoked_at IS NULL AND d.expires_at > NOW() ORDER BY d.last_seen_at DESC LIMIT 200'
    );
    res.json({ devices: rows });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/ban',
  validate(
    z.object({
      userId: z.number().int().positive(),
      days: z.number().int().min(1).max(3650).default(7),
      reason: z.string().max(255).optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const result = await banUser(req.body);
      res.json({ success: true, banned_until: result.banned_until, reason: result.reason });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/unban',
  validate(z.object({ userId: z.number().int().positive() })),
  async (req, res, next) => {
    try {
      await unbanUser(req.body.userId);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  }
);

router.get('/stats', async (_req, res, next) => {
  try {
    const results = await Promise.all([
      query('SELECT COUNT(*)::int c FROM users'),
      query('SELECT COUNT(*)::int c FROM tournaments'),
      query('SELECT COUNT(*)::int c FROM decks'),
      query('SELECT COUNT(*)::int c FROM chat_messages'),
      query(
        'SELECT COUNT(DISTINCT user_id)::int c FROM device_sessions WHERE last_seen_at > NOW() - INTERVAL 24 hours'
      ),
    ]);

    res.json({
      users: results[0].rows[0].c,
      tournaments: results[1].rows[0].c,
      decks: results[2].rows[0].c,
      messages: results[3].rows[0].c,
      active_24h: results[4].rows[0].c,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
