import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { query } from '../config/db.js';
import { hmac } from '../utils/crypto.js';

const OTP_TTL_MS = 5 * 60 * 1000;

export function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

export async function upsertOtpPair({ email, phone, ip }) {
  const emailCode = generateOtp();
  const phoneCode = generateOtp();

  const emailHash = await bcrypt.hash(emailCode, 10);
  const phoneHash = await bcrypt.hash(phoneCode, 10);

  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const eHmac = hmac(email);
  const pHmac = hmac(phone);

  await query(
    'DELETE FROM otp_codes WHERE email_hmac = $1 OR phone_hmac = $2',
    [eHmac, pHmac]
  );

  await query(
    'INSERT INTO otp_codes (email_hmac, phone_hmac, email_code_hash, phone_code_hash, expires_at, ip) VALUES ($1, $2, $3, $4, $5, $6)',
    [eHmac, pHmac, emailHash, phoneHash, expiresAt, ip]
  );

  return { emailCode, phoneCode };
}

export async function verifyOtpPair({ email, phone, emailCode, phoneCode }) {
  const eHmac = hmac(email);
  const pHmac = hmac(phone);

  const { rows } = await query(
    'SELECT * FROM otp_codes WHERE email_hmac = $1 AND phone_hmac = $2 ORDER BY id DESC LIMIT 1',
    [eHmac, pHmac]
  );
  const rec = rows[0];

  if (!rec) {
    const e = new Error('OTP tapilmadi');
    e.code = 'NO_OTP';
    throw e;
  }
  if (new Date(rec.expires_at) < new Date()) {
    const e = new Error('OTP vaxti bitib');
    e.code = 'OTP_EXPIRED';
    throw e;
  }

  const emailOk = await bcrypt.compare(emailCode, rec.email_code_hash);
  const phoneOk = await bcrypt.compare(phoneCode, rec.phone_code_hash);

  if (!emailOk || !phoneOk) {
    await query(
      'UPDATE otp_codes SET email_attempts = email_attempts + $1, phone_attempts = phone_attempts + $2 WHERE id = $3',
      [emailOk ? 0 : 1, phoneOk ? 0 : 1, rec.id]
    );
    const totalBad = rec.email_attempts + rec.phone_attempts + 1;
    const e = new Error('OTP yanlisdir');
    e.code = 'OTP_BAD';
    e.attemptsLeft = Math.max(0, 5 - totalBad);
    throw e;
  }

  return true;
}

export async function deleteOtps(email, phone) {
  const eHmac = hmac(email);
  const pHmac = hmac(phone);
  await query(
    'DELETE FROM otp_codes WHERE email_hmac = $1 OR phone_hmac = $2',
    [eHmac, pHmac]
  );
}
