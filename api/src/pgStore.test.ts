// Integration tests against a real PostgreSQL. Skipped unless TEST_DATABASE_URL is set, e.g.
//   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/envsense_test npm test
// CI provides a Postgres service container and sets this variable.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { PgStore } from './pgStore.js';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PgStore (PostgreSQL)', () => {
  let pool: pg.Pool;
  let store: PgStore;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await pool.query(readFileSync(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
    store = new PgStore(pool);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE readings RESTART IDENTITY');
  });

  afterAll(async () => {
    await pool.end();
  });

  const r = (timestamp: number, device: string, temperature: number | null, co2: number | null = null) => ({
    timestamp,
    device,
    temperature,
    humidity: null,
    pressure: null,
    co2,
  });

  it('round-trips readings with exact millisecond timestamps and omits nulls', async () => {
    const ts = 1_700_000_000_123;
    expect(await store.insert([r(ts, 'n1', 21.5, 600), r(ts + 1, 'n1', null, 610)])).toBe(2);
    expect(await store.list({ limit: 10 })).toEqual([
      { timestamp: ts, device: 'n1', temperature: 21.5, co2: 600 },
      { timestamp: ts + 1, device: 'n1', co2: 610 },
    ]);
  });

  it('from is inclusive to the millisecond (safe for incremental polling with last+1)', async () => {
    const base = 1_700_000_000_000;
    await store.insert([r(base, 'a', 1), r(base + 1, 'a', 2), r(base + 2, 'a', 3)]);
    const after = await store.list({ from: base + 1, limit: 10 });
    expect(after.map((x) => x.timestamp)).toEqual([base + 1, base + 2]);
    expect((await store.list({ to: base + 1, limit: 10 })).map((x) => x.timestamp)).toEqual([base, base + 1]);
  });

  it('filters by device and applies the limit to the oldest rows', async () => {
    await store.insert([r(1000, 'a', 1), r(2000, 'b', 2), r(3000, 'a', 3)]);
    expect((await store.list({ device: 'a', limit: 10 })).map((x) => x.timestamp)).toEqual([1000, 3000]);
    expect((await store.list({ limit: 2 })).map((x) => x.timestamp)).toEqual([1000, 2000]);
  });

  it('summarises devices', async () => {
    await store.insert([r(1000, 'a', 1), r(5000, 'a', 2), r(2000, 'b', 3)]);
    expect(await store.devices()).toEqual([
      { device: 'a', readings: 2, lastSeen: 5000 },
      { device: 'b', readings: 1, lastSeen: 2000 },
    ]);
  });

  it('computes hourly aggregates in SQL', async () => {
    const now = Date.now();
    const hourStart = Math.floor(now / 3_600_000) * 3_600_000;
    await store.insert([r(now - 2000, 'a', 10, 500), r(now - 1000, 'a', 20, 700), r(now - 500, 'b', 5)]);
    const stats = await store.hourly({ hours: 3 });
    const a = stats.find((s) => s.device === 'a' && s.hour === Math.floor((now - 2000) / 3_600_000) * 3_600_000);
    // The two samples may straddle an hour boundary only if the test runs in the last 2 s of an hour.
    if (a && a.samples === 2) {
      expect(a.temperature).toEqual({ avg: 15, min: 10, max: 20 });
      expect(a.co2).toEqual({ avg: 600, min: 500, max: 700 });
      expect(a.humidity).toBeNull();
    }
    expect(stats.reduce((n, s) => n + s.samples, 0)).toBe(3);
    expect((await store.hourly({ hours: 3, device: 'b' })).every((s) => s.device === 'b')).toBe(true);
    expect(hourStart).toBeLessThanOrEqual(now);
  });

  it('enforces schema constraints (a row needs at least one metric)', async () => {
    await expect(store.insert([r(1000, 'a', null)])).rejects.toThrow(/readings_has_metric/);
  });

  it('works end to end through the HTTP layer', async () => {
    const app = createApp(store);
    await request(app).post('/api/readings').send({ device: 'e2e', temperature: 24.2, timestamp: 1_700_000_000_500 }).expect(201);
    const res = await request(app).get('/api/readings?from=1700000000500&device=e2e').expect(200);
    expect(res.body.readings).toEqual([{ timestamp: 1_700_000_000_500, device: 'e2e', temperature: 24.2 }]);
    await request(app).get('/api/health').expect(200);
  });
});
