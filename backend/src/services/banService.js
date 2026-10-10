import { query } from '../config/db.js';

export async function banUser({ userId, days, reason }) {
  const d = days || 7;
  const r = reason || 'Qayda pozuntusu';
  const until = new Date(Date.now() + d * 86400 * 1000);

  await query(
    'UPDATE users SET banned_until = $1, ban_reason = $2 WHERE id = $3',
    [until, r, userId]
  );

  await query(
    'UPDATE device_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );

  return { banned_until: until, reason: r };
}

export async function unbanUser(userId) {
  await query(
    'UPDATE users SET banned_until = NULL, ban_reason = NULL WHERE id = $1',
    [userId]
  );
}
