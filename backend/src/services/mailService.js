import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

let transporter = null;

if (env.GMAIL_USER && env.GMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: env.GMAIL_USER, pass: env.GMAIL_PASS },
  });
}

export async function sendOtpEmail(to, code) {
  if (!transporter) {
    logger.warn({ to, code }, 'Gmail konfiq yoxdur - OTP console-a yazildi');
    return { mocked: true };
  }

  const html =
    '<div style="background:#0a0a0a;padding:40px;color:#e5e4e2;font-family:sans-serif;max-width:520px;margin:0 auto">' +
    '<h1 style="color:#c5a059;letter-spacing:-1px">CLASH<span style="color:#fff">AZERI</span></h1>' +
    '<p style="color:#888;font-size:13px;text-transform:uppercase;letter-spacing:2px">Tesdiq Kodu</p>' +
    '<div style="font-size:42px;letter-spacing:12px;background:#1a1a1a;padding:24px;text-align:center;color:#fff;border:2px solid #c5a059;font-weight:900;font-family:monospace">' +
    code +
    '</div>' +
    '<p style="color:#666;font-size:12px;margin-top:20px">Kod 5 deqiqe erzinde etibarlidir. Bu kodu hec kimle paylasmayin.</p>' +
    '</div>';

  await transporter.sendMail({
    from: '"ClashAzeri" <' + env.GMAIL_USER + '>',
    to,
    subject: 'ClashAzeri - Tesdiq Kodunuz',
    html,
  });

  return { mocked: false };
}
