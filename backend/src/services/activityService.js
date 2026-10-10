import { query } from '../config/db.js';
import { logger } from '../config/logger.js';

export async function logActivity({ userId, mask, action, metadata, ip, userAgent }) {
  try {
    await query(
      'INSERT INTO user_activities (user_id, mask, action, metadata, ip, user_agent) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        userId || null,
        mask || null,
        action,
        metadata ? JSON.stringify(metadata) : null,
        ip,
        userAgent,
      ]
    );
  } catch (err) {
    logger.error({ err: err.message }, 'Activity log xetasi');
  }
}

export async function addXp(userId, amount) {
  const { rows } = await query(
    'UPDATE users SET xp = xp + $1, level = GREATEST(1, FLOOR(SQRT((xp + $1) / 100.0)) + 1) WHERE id = $2 RETURNING xp, level',
    [amount, userId]
  );
  return rows[0];
}

export async function unlockAchievement(userId, code) {
  try {
    const { rows } = await query(
      'INSERT INTO user_achievements (user_id, achievement_id) SELECT $1, id FROM achievements WHERE code = $2 ON CONFLICT DO NOTHING RETURNING achievement_id',
      [userId, code]
    );

    if (rows.length > 0) {
      const ach = await query('SELECT xp_reward FROM achievements WHERE code = $1', [code]);
      if (ach.rows[0] && ach.rows[0].xp_reward) {
        await addXp(userId, ach.rows[0].xp_reward);
      }
      return true;
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Achievement xetasi');
  }
  return false;
}
