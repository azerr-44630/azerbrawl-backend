import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as ts from '../services/tournamentService.js';
import * as draftService from '../services/draftService.js';
import { logActivity, unlockAchievement } from '../services/activityService.js';
import { clean } from '../utils/sanitize.js';

const router = Router();

router.get('/tournaments', async (_req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT t.*, (SELECT COUNT(*)::int FROM tournament_participants WHERE tournament_id = t.id) AS players FROM tournaments t ORDER BY t.status = 'open' DESC, t.starts_at ASC NULLS LAST, t.created_at DESC LIMIT 50"
    );
    res.json({ tournaments: rows });
  } catch (e) { next(e); }
});

router.post('/tournaments/join', authenticate,
  validate(z.object({ tournamentId: z.number().int().positive() })),
  async (req, res, next) => {
    try {
      await ts.joinTournament({
        tournamentId: req.body.tournamentId,
        userId: req.user.id,
      });
      await logActivity({
        userId: req.user.id, mask: req.user.mask,
        action: 'join_tournament',
        metadata: { tournamentId: req.body.tournamentId },
        ip: req.ip, userAgent: req.headers['user-agent'],
      });
      await unlockAchievement(req.user.id, 'first_tournament');
      res.json({ success: true });
    } catch (e) { next(e); }
  }
);

router.get('/decks', async (_req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT d.id, d.title, d.game, d.cards_json, d.likes, d.created_at, u.mask FROM decks d JOIN users u ON u.id = d.user_id ORDER BY d.likes DESC LIMIT 50'
    );
    res.json({ decks: rows });
  } catch (e) { next(e); }
});

router.post('/decks', authenticate,
  validate(z.object({
    title: z.string().min(2).max(120),
    game: z.string().min(2).max(50),
    cards: z.array(z.any()).min(1).max(20),
  })),
  async (req, res, next) => {
    try {
      const { rows } = await query(
        'INSERT INTO decks (user_id, title, game, cards_json) VALUES ($1,$2,$3,$4) RETURNING *',
        [req.user.id, clean(req.body.title), clean(req.body.game), JSON.stringify(req.body.cards)]
      );
      res.json({ success: true, deck: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get('/achievements', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT a.*, (ua.unlocked_at IS NOT NULL) AS unlocked, ua.unlocked_at FROM achievements a LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1 ORDER BY a.id',
      [req.user.id]
    );
    res.json({ achievements: rows });
  } catch (e) { next(e); }
});

router.post('/profile', authenticate,
  validate(z.object({ playerTag: z.string().min(2).max(50) })),
  async (req, res, next) => {
    try {
      await query('UPDATE users SET player_tag = $1 WHERE id = $2',
        [clean(req.body.playerTag), req.user.id]);
      await unlockAchievement(req.user.id, 'profile_complete');
      res.json({ success: true });
    } catch (e) { next(e); }
  }
);

// ═══════════════════════════════════════════════════════════════
// DRAFT HELPER
// ═══════════════════════════════════════════════════════════════

router.get('/draft/brawlers', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT slug, name, role, rarity, attack_range FROM brawlers ORDER BY name');
    res.json({ brawlers: rows });
  } catch (e) { next(e); }
});

router.get('/draft/maps', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT slug, name, mode FROM maps ORDER BY mode, name');
    res.json({ maps: rows });
  } catch (e) { next(e); }
});

router.post('/draft/suggest', authenticate,
  validate(z.object({
    enemyBrawlers: z.array(z.string()).min(1).max(3),
    mapSlug: z.string().optional(),
    mode: z.string().optional(),
  })),
  async (req, res, next) => {
    try {
      const result = await draftService.suggestDraft({
        enemyBrawlers: req.body.enemyBrawlers,
        mapSlug: req.body.mapSlug,
        mode: req.body.mode,
      });

      await query(
        'INSERT INTO draft_requests (user_id, mode, map_slug, enemy_brawlers, suggested_brawlers) VALUES ($1,$2,$3,$4,$5)',
        [req.user.id, req.body.mode || null, req.body.mapSlug || null,
         JSON.stringify(req.body.enemyBrawlers), JSON.stringify(result.suggestions)]
      );

      res.json(result);
    } catch (e) { next(e); }
  }
);

export default router;
