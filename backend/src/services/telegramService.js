import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export async function notifyAdmin(text) {
  if (
    !env.TELEGRAM_ENABLED ||
    !env.TELEGRAM_BOT_TOKEN ||
    !env.TELEGRAM_ADMIN_CHAT_ID
  ) {
    logger.debug('Telegram konfiq yoxdur, bildiris gonderilmedi');
    return;
  }

  try {
    const url =
      'https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage';

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_ADMIN_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'Telegram bildirisi alinmadi');
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Telegram xetasi');
  }
}
