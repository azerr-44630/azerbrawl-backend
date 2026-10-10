import twilio from 'twilio';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

let client = null;

if (env.TWILIO_ENABLED && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
  client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
}

export async function sendOtpSms(phone, code) {
  if (!client) {
    logger.warn({ phone, code }, 'Twilio konfiq yoxdur - OTP console-a yazildi');
    return { mocked: true };
  }

  try {
    await client.messages.create({
      from: env.TWILIO_PHONE,
      to: phone,
      body: 'ClashAzeri tesdiq kodunuz: ' + code,
    });
    return { mocked: false };
  } catch (err) {
    logger.error({ err: err.message, phone }, 'SMS gonderilmedi');
    throw new Error('SMS gonderile bilmedi');
  }
}
