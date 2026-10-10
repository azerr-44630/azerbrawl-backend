import { Router } from 'express';
import { getJson } from 'serpapi';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const router = Router();

let cache = { at: 0, data: [] };
const TTL = 30 * 60 * 1000;

router.get('/', async (req, res) => {
  if (Date.now() - cache.at < TTL) {
    return res.json({ news: cache.data });
  }
  if (!env.SERPAPI_KEY) {
    return res.json({ news: [] });
  }

  try {
    const json = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SerpAPI timeout')), 8000);
      getJson(
        {
          engine: 'google_news',
          q: req.query.q || 'Brawl Stars Azerbaijan',
          api_key: env.SERPAPI_KEY,
        },
        (data) => {
          clearTimeout(timer);
          resolve(data);
        }
      );
    });

    const news = (json.news_results || []).slice(0, 15).map((n) => ({
      title: n.title,
      link: n.link,
      source: n.source && n.source.name ? n.source.name : '',
      date: n.date,
    }));

    cache = { at: Date.now(), data: news };
    res.json({ news });
  } catch (err) {
    logger.warn({ err: err.message }, 'SerpAPI xetasi');
    res.json({ news: cache.data || [] });
  }
});

export default router;
