import crypto from 'node:crypto';
import { env } from '../config/env.js';

const LOOKUP_KEY = Buffer.from(env.LOOKUP_KEY, 'hex');
const VAULT_KEY = Buffer.from(env.VAULT_KEY, 'hex');

if (LOOKUP_KEY.length !== 32) throw new Error('LOOKUP_KEY 64 hex olmalidir');
if (VAULT_KEY.length !== 32) throw new Error('VAULT_KEY 64 hex olmalidir');

export function hmac(value) {
  return crypto
    .createHmac('sha256', LOOKUP_KEY)
    .update(String(value).toLowerCase().trim())
    .digest('hex');
}

export function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', VAULT_KEY, iv);
  const enc = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
}

export function decrypt(payload) {
  const parts = String(payload).split(':');
  const ivHex = parts[0];
  const tagHex = parts[1];
  const encHex = parts[2];
  if (!ivHex || !tagHex || !encHex) throw new Error('Yanlis ciphertext formati');

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    VAULT_KEY,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

export function makeMask() {
  return 'u_' + crypto.randomBytes(3).toString('hex');
}

export function newDeviceToken() {
  return crypto.randomBytes(48).toString('hex');
}

export function deviceLabel(ua) {
  const s = ua || '';
  const browser = /Edg/.test(s)
    ? 'Edge'
    : /Chrome/.test(s)
    ? 'Chrome'
    : /Firefox/.test(s)
    ? 'Firefox'
    : /Safari/.test(s)
    ? 'Safari'
    : 'Browser';
  const os = /Windows/.test(s)
    ? 'Windows'
    : /Mac/.test(s)
    ? 'macOS'
    : /Android/.test(s)
    ? 'Android'
    : /iPhone|iPad/.test(s)
    ? 'iOS'
    : /Linux/.test(s)
    ? 'Linux'
    : 'Sistem';
  return browser + ' / ' + os;
}
