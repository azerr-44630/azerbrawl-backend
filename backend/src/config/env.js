import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().url(),
  DATABASE_SSL: z.string().default('false').transform((v) => v === 'true'),

  LOOKUP_KEY: z.string().length(64, 'LOOKUP_KEY 64 hex simvol olmalidir'),
  VAULT_KEY: z.string().length(64, 'VAULT_KEY 64 hex simvol olmalidir'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET en azi 32 simvol'),
  JWT_ACCESS_TTL: z.string().default('15m'),

  GMAIL_USER: z.string().optional(),
  GMAIL_PASS: z.string().optional(),

  TWILIO_ENABLED: z.string().default('false').transform((v) => v === 'true'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE: z.string().optional(),

  TELEGRAM_ENABLED: z.string().default('false').transform((v) => v === 'true'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_CHAT_ID: z.string().optional(),

  SERPAPI_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('ENV xetasi:');
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
