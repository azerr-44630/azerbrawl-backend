import { query } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';

export async function suggestDraft({ enemyBrawlers, mapSlug, mode }) {
  if (!enemyBrawlers || enemyBrawlers.length === 0) {
    throw new AppError('Dusmen komandasi bosdur', 400);
  }

  const enemyIds = await query(
    'SELECT id, slug, name, role FROM brawlers WHERE slug = ANY($1)',
    [enemyBrawlers]
  );
  if (enemyIds.rows.length === 0) {
    throw new AppError('Brawler-ler tapilmadi', 404);
  }

  const ids = enemyIds.rows.map((r) => r.id);

  const counters = await query(
    `SELECT cm.attacker_id, b.slug AS attacker_slug, b.name AS attacker_name,
            b.role AS attacker_role, cm.winrate, cm.sample_size, cm.defender_id
     FROM counter_matrix cm
     JOIN brawlers b ON b.id = cm.attacker_id
     WHERE cm.defender_id = ANY($1) AND cm.sample_size >= 50
     ORDER BY cm.winrate DESC`,
    [ids]
  );

  const scoreMap = new Map();
  for (const row of counters.rows) {
    const current = scoreMap.get(row.attacker_slug) || {
      slug: row.attacker_slug,
      name: row.attacker_name,
      role: row.attacker_role,
      totalScore: 0,
      counters: [],
    };
    const weight = Math.min(row.sample_size / 100, 1);
    const score = (Number(row.winrate) - 50) * 2 * weight;
    current.totalScore += score;
    current.counters.push({
      defender_id: row.defender_id,
      winrate: Number(row.winrate),
    });
    scoreMap.set(row.attacker_slug, current);
  }

  const metaRows = await query(
    `SELECT b.slug, mt.pickrate, mt.winrate, mt.trend
     FROM meta_trends mt JOIN brawlers b ON b.id = mt.brawler_id
     WHERE mt.recorded_at > NOW() - INTERVAL '7 days'`
  );
  const metaMap = new Map();
  for (const row of metaRows.rows) metaMap.set(row.slug, row);

  const mapBonus = new Map();
  if (mapSlug) {
    const mapRow = await query('SELECT id FROM maps WHERE slug = $1', [mapSlug]);
    if (mapRow.rows[0]) {
      const mc = await query(
        `SELECT b.slug, mc.tier, mc.winrate
         FROM map_counters mc JOIN brawlers b ON b.id = mc.attacker_id
         WHERE mc.map_id = $1`,
        [mapRow.rows[0].id]
      );
      for (const row of mc.rows) mapBonus.set(row.slug, row);
    }
  }

  const suggestions = Array.from(scoreMap.values())
    .map((s) => {
      let finalScore = s.totalScore;

      const meta = metaMap.get(s.slug);
      if (meta) {
        if (meta.trend === 'up') finalScore *= 1.15;
        if (meta.trend === 'down') finalScore *= 0.85;
        finalScore += (Number(meta.winrate) - 50) * 1.5;
      }

      const map = mapBonus.get(s.slug);
      if (map && map.tier) {
        const tierBonus = { S: 30, A: 20, B: 10, C: 0, D: -10 };
        finalScore += tierBonus[map.tier] || 0;
      }

      return {
        slug: s.slug,
        name: s.name,
        role: s.role,
        score: Math.round(finalScore),
        counters: s.counters,
        meta: meta || null,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return { enemy: enemyIds.rows, map: mapSlug, mode, suggestions };
}
