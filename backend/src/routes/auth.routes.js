import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { otpLimiter, loginLimiter } from '../middleware/rateLimit.js';
import { authenticate } from '../middleware/auth.js';
import * as auth from '../services/authService.js';
import * as deviceSvc from '../services/deviceService.js';
import { normalizePhone } from '../utils/sanitize.js';
import { isProd } from '../config/env.js';

const router = Router();

const emailZ = z.string().email().toLowerCase();
const phoneZ = z.string().min(7).transform(normalizePhone);
const otpZ = z.string().regex(/^\d{6}$/);
const passZ = z.string().min(8).max(72);

const ACCESS_COOKIE = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'strict' : 'lax',
  maxAge: 15 * 60 * 1000,
  path: '/',
};

const DEVICE_COOKIE = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'strict' : 'lax',
  maxAge: 365 * 86400 * 1000,
  path: '/',
};

router.post(
  '/register/request',
  otpLimiter,
  validate(z.object({ email: emailZ, phone: phoneZ })),
  async (req, res, next) => {
    try {
      const result = await auth.requestRegistration({
        email: req.body.email,
        phone: req.body.phone,
        ip: req.ip,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/register/verify',
  otpLimiter,
  validate(
    z.object({
      email: emailZ,
      phone: phoneZ,
      emailCode: otpZ,
      phoneCode: otpZ,
      password: passZ,
      refCode: z.string().max(20).optional(),
      fingerprint: z.string().max(64).optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const result = await auth.completeRegistration({
        email: req.body.email,
        phone: req.body.phone,
        emailCode: req.body.emailCode,
        phoneCode: req.body.phoneCode,
        password: req.body.password,
        refCode: req.body.refCode,
        fingerprint: req.body.fingerprint,
        ip: req.ip,
        userAgent: req.headers['user-agent'] || '',
      });

      res.cookie('access_token', result.accessToken, ACCESS_COOKIE);
      res.cookie('device_token', result.deviceToken, DEVICE_COOKIE);

      res.json({
        success: true,
        user: result.user,
        accessToken: result.accessToken,
      });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/login',
  loginLimiter,
  validate(
    z.object({
      email: emailZ,
      password: z.string().min(1),
      fingerprint: z.string().max(64).optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const result = await auth.login({
        email: req.body.email,
        password: req.body.password,
        fingerprint: req.body.fingerprint,
        ip: req.ip,
        userAgent: req.headers['user-agent'] || '',
      });

      res.cookie('access_token', result.accessToken, ACCESS_COOKIE);
      res.cookie('device_token', result.deviceToken, DEVICE_COOKIE);

      res.json({
        success: true,
        user: result.user,
        accessToken: result.accessToken,
      });
    } catch (e) {
      next(e);
    }
  }
);

router.post('/device-login', async (req, res, next) => {
  try {
    const deviceToken = req.cookies && req.cookies.device_token;
    if (!deviceToken) {
      return res.status(401).json({ error: 'Cihaz tokeni yoxdur' });
    }

    const result = await auth.loginWithDevice({
      deviceToken,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
    });

    res.cookie('access_token', result.accessToken, ACCESS_COOKIE);
    res.json({
      success: true,
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/devices', authenticate, async (req, res, next) => {
  try {
    const devices = await deviceSvc.listUserDevices(req.user.id);
    res.json({ devices });
  } catch (e) {
    next(e);
  }
});

router.delete('/devices/:id', authenticate, async (req, res, next) => {
  try {
    await deviceSvc.revokeDevice(Number(req.params.id), req.user.id);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('access_token', { path: '/' });
  res.json({ success: true });
});

router.post('/logout-all', authenticate, async (req, res, next) => {
  try {
    await deviceSvc.revokeAllDevices(req.user.id);
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('device_token', { path: '/' });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
