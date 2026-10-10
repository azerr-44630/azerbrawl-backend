import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { query, withTransaction } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { hmac, encrypt, makeMask } from '../utils/crypto.js';
import { upsertOtpPair, verifyOtpPair, deleteOtps } from './otpService.js';
import { sendOtpEmail } from './mailService.js';
import { sendOtpSms } from './smsService.js';
import { createDevice, findDeviceByToken, touchDevice } from './deviceService.js';
import { logActivity, unlockAchievement } from './activityService.js';
import { notifyAdmin } from './telegramService.js';

const BCRYPT_ROUNDS = 12;

function newReferralCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

export async function requestRegistration({ email, phone, ip }) {
  const eHmac = hmac(email);
  const pHmac = hmac(phone);

  const existing = await query(
    'SELECT id FROM users WHERE email_hmac = $1 OR phone_hmac = $2 LIMIT 1',
    [eHmac, pHmac]
  );
  if (existing.rows.length) {
    throw new AppError('Bu email ve ya telefon artiq qeydiyyatdadir', 409, 'ALREADY_EXISTS');
  }

  const codes = await upsertOtpPair({ email, phone, ip });

  await Promise.all([
    sendOtpEmail(email, codes.emailCode),
    sendOtpSms(phone, codes.phoneCode),
  ]);

  return { success: true, message: 'Kodlar gonderildi' };
}

export async function completeRegistration({
  email, phone, emailCode, phoneCode, password, refCode,
  ip, userAgent, fingerprint,
}) {
  await verifyOtpPair({ email, phone, emailCode, phoneCode });

  const emailHmac = hmac(email);
  const phoneHmac = hmac(phone);
  const emailEnc = encrypt(email);
  const phoneEnc = encrypt(phone);
  const passHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const passEnc = encrypt(password);
  const mask = makeMask();

  const user = await withTransaction(async (client) => {
    let inviterId = null;

    if (refCode) {
      const inv = await client.query(
        'SELECT id FROM users WHERE referral_code = $1',
        [refCode.toUpperCase()]
      );
      if (inv.rows[0]) {
        inviterId = inv.rows[0].id;
        await client.query(
          'UPDATE users SET tickets = tickets + 1 WHERE id = $1',
          [inviterId]
        );
      }
    }

    const myRef = newReferralCode();
    const ins = await client.query(
      'INSERT INTO users (mask, email_hmac, phone_hmac, email_enc, phone_enc, password_hash, password_enc, referral_code, referred_by, tickets, email_verified, phone_verified) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,TRUE) RETURNING id, mask, role, tickets, xp, level, referral_code, player_tag',
      [
        mask, emailHmac, phoneHmac, emailEnc, phoneEnc,
        passHash, passEnc, myRef, inviterId, refCode ? 1 : 0,
      ]
    );

    return ins.rows[0];
  });

  await deleteOtps(email, phone);
  await unlockAchievement(user.id, 'first_login');

  await logActivity({
    userId: user.id,
    mask: user.mask,
    action: 'register',
    metadata: { ref: refCode || null },
    ip,
    userAgent,
  });

  notifyAdmin(
    'Yeni Qeydiyyat\nID: ' + user.mask + '\nIP: ' + ip + '\nUA: ' + (userAgent || '-').slice(0, 80)
  ).catch(function () {});

  const device = await createDevice({
    userId: user.id,
    ip,
    userAgent,
    fingerprint,
  });

  return {
    user: sanitizeUser(user),
    accessToken: signAccess(user),
    deviceToken: device.token,
    deviceId: device.deviceId,
  };
}

export async function login({ email, password, ip, userAgent, fingerprint }) {
  const emailHmac = hmac(email);
  const { rows } = await query(
    'SELECT id, mask, role, tickets, xp, level, referral_code, password_hash, banned_until FROM users WHERE email_hmac = $1',
    [emailHmac]
  );
  const user = rows[0];

  const hash = user && user.password_hash
    ? user.password_hash
    : '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = await bcrypt.compare(password, hash);

  await logActivity({
    userId: user ? user.id : null,
    mask: user ? user.mask : null,
    action: ok ? 'login_success' : 'login_fail',
    metadata: { email_prefix: emailHmac.slice(0, 8) },
    ip,
    userAgent,
  });

  if (!user || !ok) {
    throw new AppError('Email ve ya sifre yanlisdir', 401, 'BAD_CREDS');
  }
  if (user.banned_until && new Date(user.banned_until) > new Date()) {
    throw new AppError('Hesab banlidir', 403, 'BANNED');
  }

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const device = await createDevice({
    userId: user.id,
    ip,
    userAgent,
    fingerprint,
  });

  return {
    user: sanitizeUser(user),
    accessToken: signAccess(user),
    deviceToken: device.token,
    deviceId: device.deviceId,
  };
}

export async function loginWithDevice({ deviceToken, ip, userAgent }) {
  const device = await findDeviceByToken(deviceToken);
  if (!device) throw new AppError('Cihaz taninmadi', 401, 'UNKNOWN_DEVICE');

  const { rows } = await query(
    'SELECT id, mask, role, tickets, xp, level, referral_code, player_tag, banned_until FROM users WHERE id = $1',
    [device.user_id]
  );
  const user = rows[0];
  if (!user) throw new AppError('Istifadeci tapilmadi', 401, 'NO_USER');
  if (user.banned_until && new Date(user.banned_until) > new Date()) {
    throw new AppError('Hesab banlidir', 403, 'BANNED');
  }

  await touchDevice(device.id);
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  await logActivity({
    userId: user.id,
    mask: user.mask,
    action: 'login_device',
    metadata: { deviceId: device.id },
    ip,
    userAgent,
  });

  return {
    user: sanitizeUser(user),
    accessToken: signAccess(user),
  };
}

function signAccess(user) {
  return jwt.sign(
    { sub: user.id, mask: user.mask, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL }
  );
}

function sanitizeUser(u) {
  return {
    id: u.id,
    mask: u.mask,
    role: u.role,
    tickets: u.tickets,
    xp: u.xp,
    level: u.level,
    referralCode: u.referral_code,
    playerTag: u.player_tag || null,
  };
}
