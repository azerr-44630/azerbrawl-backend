import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { AppError } from './errorHandler.js';

export async function authenticate(req, _res, next) {
  try {
    const token =
      req.cookies?.access_token ||
      req.headers.authorization?.replace(/^Bearer /, '');
    if (!token) throw new AppError('Token yoxdur', 401, 'NO_TOKEN');

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch {
      throw new AppError('Etibarsiz token', 401, 'BAD_TOKEN');
    }

    const { rows } = await query(
      `SELECT id, mask, role, tickets, xp, level, referral_code,
              player_tag, banned_until
       FROM users WHERE id = $1`,
      [payload.sub]
    );
    const user = rows[0];
    if (!user) throw new AppError('Istifadeci tapilmadi', 401, 'NO_USER');

    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      throw new AppError(
        'Hesab banlidir. Bitme: ' + user.banned_until,
        403,
        'BANNED'
      );
    }

    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') {
    return next(new AppError('Icaze yoxdur', 403, 'NOT_ADMIN'));
  }
  next();
}
