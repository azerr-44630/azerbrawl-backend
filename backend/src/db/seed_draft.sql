-- Brawlers
INSERT INTO brawlers (slug, name, rarity, role, attack_range) VALUES
  ('shelly',   'Shelly',   'Common',    'Damage',   'Short'),
  ('el_primo', 'El Primo', 'Rare',      'Tank',     'Short'),
  ('rosa',     'Rosa',     'Epic',      'Tank',     'Medium'),
  ('colt',     'Colt',     'Rare',      'Damage',   'Long'),
  ('bull',     'Bull',     'Rare',      'Tank',     'Short'),
  ('darryl',   'Darryl',   'Super Rare','Tank',     'Medium'),
  ('nita',     'Nita',     'Rare',      'Damage',   'Short'),
  ('mortis',   'Mortis',   'Mythic',    'Assassin', 'Short'),
  ('leon',     'Leon',     'Legendary', 'Assassin', 'Long'),
  ('crow',     'Crow',     'Legendary', 'Assassin', 'Long'),
  ('piper',    'Piper',    'Epic',      'Sniper',   'Long'),
  ('barley',   'Barley',   'Epic',      'Thrower',  'Long'),
  ('emz',      'Emz',      'Epic',      'Damage',   'Medium'),
  ('poco',     'Poco',     'Rare',      'Support',  'Medium'),
  ('gene',     'Gene',     'Mythic',    'Support',  'Medium'),
  ('tara',     'Tara',     'Mythic',    'Damage',   'Medium'),
  ('pam',      'Pam',      'Epic',      'Support',  'Medium'),
  ('jessie',   'Jessie',   'Super Rare','Damage',   'Long'),
  ('penny',    'Penny',    'Super Rare','Damage',   'Long'),
  ('stu',      'Stu',      'Epic',      'Assassin', 'Medium')
ON CONFLICT (slug) DO NOTHING;

-- Counter Matrix
INSERT INTO counter_matrix (attacker_id, defender_id, winrate, sample_size, source)
SELECT a.id, d.id, v.winrate, v.samples, 'community'
FROM (VALUES
  ('shelly','el_primo',65,200),('shelly','rosa',58,180),('shelly','colt',55,150),
  ('bull','el_primo',68,220),('bull','rosa',52,140),
  ('darryl','colt',62,190),('darryl','el_primo',55,130),
  ('mortis','colt',65,180),('mortis','piper',60,120),
  ('leon','colt',60,160),('crow','colt',58,140),
  ('emz','rosa',62,170),('emz','el_primo',55,130),
  ('tara','el_primo',60,150),('tara','rosa',58,140),
  ('gene','piper',62,130),('gene','colt',58,120),
  ('stu','colt',60,110)
) AS v(attacker_slug, defender_slug, winrate, samples)
JOIN brawlers a ON a.slug = v.attacker_slug
JOIN brawlers d ON d.slug = v.defender_slug
ON CONFLICT (attacker_id, defender_id) DO NOTHING;

-- Maps
INSERT INTO maps (slug, name, mode) VALUES
  ('undermine','Undermine','Gem Grab'),
  ('hard-rock-mine','Hard Rock Mine','Gem Grab'),
  ('double-swoosh','Double Swoosh','Gem Grab'),
  ('center-stage','Center Stage','Brawl Ball'),
  ('super-beach','Super Beach','Brawl Ball')
ON CONFLICT (slug) DO NOTHING;

-- Meta Trends
INSERT INTO meta_trends (brawler_id, patch_version, pickrate, winrate, trend)
SELECT b.id, '14.2', v.pickrate, v.winrate, v.trend
FROM (VALUES
  ('shelly',12.5,58.3,'up'),('bull',6.2,52.1,'down'),('darryl',8.5,55.4,'stable'),
  ('mortis',10.3,57.2,'up'),('emz',9.1,56.8,'up'),('tara',7.4,54.5,'stable')
) AS v(slug, pickrate, winrate, trend)
JOIN brawlers b ON b.slug = v.slug;
