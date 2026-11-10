import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { parseBody } from './validate.js';
import type { ReadingStore } from './types.js';

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 10_000;
const MAX_HOURS = 24 * 90;

/** Parse an epoch-ms number or ISO date from a query string. undefined = absent, null = invalid. */
function parseTime(raw: unknown): number | undefined | null {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string') return null;
  const n = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : Date.parse(raw);
  return Number.isFinite(n) ? n : null;
}

function parseIntParam(raw: unknown, def: number, min: number, max: number): number | null {
  if (raw === undefined || raw === '') return def;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

export function createApp(store: ReadingStore): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Permissive CORS so the dev server / other dashboards can call the API directly.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return void res.sendStatus(204);
    next();
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await store.ping();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.post('/api/readings', async (req, res) => {
    const parsed = parseBody(req.body);
    if (!parsed.ok) return void res.status(400).json({ error: parsed.error });
    const inserted = await store.insert(parsed.value);
    res.status(201).json({ inserted });
  });

  app.get('/api/readings', async (req, res) => {
    const from = parseTime(req.query.from);
    const to = parseTime(req.query.to);
    const limit = parseIntParam(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    if (from === null) return void res.status(400).json({ error: '"from" must be epoch ms or an ISO date' });
    if (to === null) return void res.status(400).json({ error: '"to" must be epoch ms or an ISO date' });
    if (limit === null) return void res.status(400).json({ error: `"limit" must be an integer between 1 and ${MAX_LIMIT}` });
    const device = typeof req.query.device === 'string' && req.query.device !== '' ? req.query.device : undefined;

    const readings = await store.list({ from, to, device, limit });
    res.json({ readings });
  });

  app.get('/api/devices', async (_req, res) => {
    res.json({ devices: await store.devices() });
  });

  app.get('/api/stats/hourly', async (req, res) => {
    const hours = parseIntParam(req.query.hours, 24, 1, MAX_HOURS);
    if (hours === null) return void res.status(400).json({ error: `"hours" must be an integer between 1 and ${MAX_HOURS}` });
    const device = typeof req.query.device === 'string' && req.query.device !== '' ? req.query.device : undefined;
    res.json({ hours, stats: await store.hourly({ hours, device }) });
  });

  app.use((_req, res) => void res.status(404).json({ error: 'not found' }));

  // Malformed JSON -> 400; anything else -> 500 without leaking internals.
  app.use((err: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.parse.failed') return void res.status(400).json({ error: 'invalid JSON body' });
    if (err.type === 'entity.too.large') return void res.status(413).json({ error: 'body too large' });
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}
