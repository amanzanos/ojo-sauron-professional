import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { dayLabel, dayRangeInZone, ensureSchema, pool } from './db.js';

const PORT = Number(process.env.PORT ?? 8787);
const API_KEY = process.env.API_KEY;
const TIMEZONE = process.env.STORE_TIMEZONE ?? 'Europe/Madrid';

if (!API_KEY) {
  console.error('API_KEY is not set — refusing to start with an unprotected write API. Set it in .env.');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', (req, res, next) => {
  if (req.header('X-API-Key') !== API_KEY) {
    res.status(401).json({ error: 'invalid or missing X-API-Key' });
    return;
  }
  next();
});

interface StoreZoneBody {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

app.get('/api/zones', async (_req, res) => {
  const { rows } = await pool.query('SELECT id, name, x, y, width, height FROM zones WHERE active = true ORDER BY name');
  res.json(rows);
});

app.put('/api/zones', async (req, res) => {
  const zones = req.body as StoreZoneBody[];
  if (!Array.isArray(zones)) {
    res.status(400).json({ error: 'body must be an array of zones' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const z of zones) {
      await client.query(
        `INSERT INTO zones (id, name, x, y, width, height, active) VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (id) DO UPDATE SET name = $2, x = $3, y = $4, width = $5, height = $6, active = true`,
        [z.id, z.name, z.x, z.y, z.width, z.height]
      );
    }
    const ids = zones.map((z) => z.id);
    // Zones removed from the live list are soft-deleted, not dropped — their past zone_visits stay intact.
    await client.query(
      `UPDATE zones SET active = false WHERE active = true AND NOT (id = ANY($1::text[]))`,
      [ids]
    );
    await client.query('COMMIT');
    const { rows } = await client.query('SELECT id, name, x, y, width, height FROM zones WHERE active = true ORDER BY name');
    res.json(rows);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'failed to save zones' });
  } finally {
    client.release();
  }
});

app.post('/api/visits', async (req, res) => {
  const { zoneId, dwellMs } = req.body as { zoneId?: string; dwellMs?: number };
  if (!zoneId || typeof dwellMs !== 'number' || dwellMs < 0) {
    res.status(400).json({ error: 'zoneId and non-negative dwellMs are required' });
    return;
  }
  try {
    await pool.query('INSERT INTO zone_visits (zone_id, dwell_ms) VALUES ($1, $2)', [zoneId, Math.round(dwellMs)]);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'unknown zoneId or insert failed' });
  }
});

app.get('/api/stats/today', async (_req, res) => {
  const { start, end } = dayRangeInZone(TIMEZONE, 0);
  const { rows } = await pool.query(
    `SELECT z.id AS zone_id, z.name,
            COALESCE(COUNT(v.id), 0)::int AS total_visits,
            COALESCE(SUM(v.dwell_ms), 0)::bigint AS total_dwell_ms
     FROM zones z
     LEFT JOIN zone_visits v ON v.zone_id = z.id AND v.ended_at >= $1 AND v.ended_at < $2
     WHERE z.active = true
     GROUP BY z.id, z.name
     ORDER BY z.name`,
    [start, end]
  );
  res.json(rows.map((r) => ({
    zoneId: r.zone_id,
    name: r.name,
    totalVisits: r.total_visits,
    totalDwellMs: Number(r.total_dwell_ms),
    avgDwellMs: r.total_visits ? Math.round(Number(r.total_dwell_ms) / r.total_visits) : 0
  })));
});

app.get('/api/stats/history', async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
  const results: Array<{ date: string; stats: Record<string, { totalVisits: number; totalDwellMs: number }> }> = [];
  for (let daysAgo = 1; daysAgo <= days; daysAgo++) {
    const { start, end } = dayRangeInZone(TIMEZONE, daysAgo);
    const { rows } = await pool.query(
      `SELECT zone_id, COUNT(*)::int AS total_visits, COALESCE(SUM(dwell_ms), 0)::bigint AS total_dwell_ms
       FROM zone_visits WHERE ended_at >= $1 AND ended_at < $2 GROUP BY zone_id`,
      [start, end]
    );
    if (!rows.length) continue; // skip empty days rather than padding the response
    const stats: Record<string, { totalVisits: number; totalDwellMs: number }> = {};
    rows.forEach((r) => { stats[r.zone_id] = { totalVisits: r.total_visits, totalDwellMs: Number(r.total_dwell_ms) }; });
    results.push({ date: dayLabel(start, TIMEZONE), stats });
  }
  res.json(results);
});

interface CitizenEventBody {
  category?: string;
  title?: string;
  description?: string;
  lat?: number;
  lng?: number;
  authorLabel?: string;
}

// Citizen feed/map reports — deliberately public (no X-API-Key), unlike the store-zone API above,
// since any WEROS user should be able to read or post one.
app.get('/public/events', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, category, title, description, lat, lng, author_label, created_at FROM citizen_events ORDER BY created_at DESC LIMIT 500'
  );
  res.json(rows.map((r) => ({
    id: r.id,
    category: r.category,
    title: r.title,
    description: r.description,
    lat: Number(r.lat),
    lng: Number(r.lng),
    authorLabel: r.author_label,
    createdAt: new Date(r.created_at).getTime()
  })));
});

app.post('/public/events', async (req, res) => {
  const body = req.body as CitizenEventBody;
  const title = (body.title ?? '').trim().slice(0, 200);
  const category = (body.category ?? 'otro').trim().slice(0, 40);
  if (!title || !category) {
    res.status(400).json({ error: 'category and title are required' });
    return;
  }
  const description = (body.description ?? '').slice(0, 1000);
  const authorLabel = (body.authorLabel ?? 'Vecino/a').slice(0, 80);
  const lat = typeof body.lat === 'number' ? body.lat : 0;
  const lng = typeof body.lng === 'number' ? body.lng : 0;
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const createdAt = new Date();
  await pool.query(
    `INSERT INTO citizen_events (id, category, title, description, lat, lng, author_label, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, category, title, description, lat, lng, authorLabel, createdAt]
  );
  res.status(201).json({ id, category, title, description, lat, lng, authorLabel, createdAt: createdAt.getTime() });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Zone analytics API listening on :${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database schema', err);
    process.exit(1);
  });
