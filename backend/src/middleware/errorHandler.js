import { logger } from '../config/logger.js';
import { isProd } from '../config/env.js';

export class AppError extends Error {
  constructor(message, status = 400, code = 'APP_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorHandler(err, req, res, _next) {
  logger.error(
    {
      err: { message: err.message, stack: err.stack, code: err.code },
      path: req.path,
      method: req.method,
    },
    'Request xetasi'
  );

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Yanlis JSON formati' });
  }
  res.status(500).json({
    error: isProd ? 'Daxili server xetasi' : err.message,
  });
}
