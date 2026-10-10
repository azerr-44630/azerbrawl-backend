import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { newDeviceToken, deviceLabel } from '../utils/crypto.js';

const DEVICE_TTL_DAYS = 365;

export async function createDevice({ userId, ip, userAgent, fingerprint }) {
  const token = newDeviceToken();
  const hash = await bcrypt.hash(token, 10);
  const expiresAt = new Date(Date.now() + DEVICE_TTL_DAYS * 86400 * 1000);

  const { rows } = await query(
    'INSERT INTO device_sessions (user_id, device_hash, device_label, ip, user_agent, fingerprint, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [
      userId,
      hash,
      deviceLabel(userAgent),
      ip,
      userAgent,
      fingerprint || null,
      expiresAt,
    ]
  );

  return { deviceId: rows[0].id, token };
}

export async function findDeviceByToken(token, userHint) {
  const sql = userHint
    ? 'SELECT * FROM device_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW() ORDER BY last_seen_at DESC LIMIT 20'
    : 'SELECT * FROM device_sessions WHERE revoked_at IS NULL AND expires_at > NOW() ORDER BY last_seen_at DESC LIMIT 200';

  const { rows } = await query(sql, userHint ? [userHint] : []);

  for (let i = 0; i < rows.length; i++) {
    const match = await bcrypt.compare(token, rows[i].device_hash);
    if (match) return rows[i];
  }
  return null;
}

export async function touchDevice(deviceId) {
  await query(
    'UPDATE device_sessions SET last_seen_at = NOW() WHERE id = $1',
    [deviceId]
  );
}

export async function revokeDevice(deviceId, userId) {
  await query(
    'UPDATE device_sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2',
    [deviceId, userId]
  );
}

export async function listUserDevices(userId) {
  const { rows } = await query(
    'SELECT id, device_label, ip, last_seen_at, created_at, expires_at FROM device_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW() ORDER BY last_seen_at DESC',
    [userId]
  );
  return rows;
}

export async function revokeAllDevices(userId) {
  await query(
    'UPDATE device_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}
