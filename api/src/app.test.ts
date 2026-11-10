import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { MemoryStore } from './memoryStore.js';
import { parseBody, parseReading } from './validate.js';

let store: MemoryStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = new MemoryStore();
  app = createApp(store);
});

describe('POST /api/readings', () => {
  it('stores a single reading', async () => {
    const res = await request(app)
      .post('/api/readings')
      .send({ device: 'n1', timestamp: 1700000000000, temperature: 21.5, co2: 600 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ inserted: 1 });
    expect(store.rows[0]).toMatchObject({ device: 'n1', temperature: 21.5, humidity: null, co2: 600 });
  });

  it('stores a batch and accepts ISO timestamps', async () => {
    const res = await request(app)
      .post('/api/readings')
      .send([
        { device: 'a', timestamp: '2026-11-09T10:00:00Z', humidity: 40 },
        { device: 'b', timestamp: 1700000000000, pressure: 1010 },
      ]);
    expect(res.status).toBe(201);
    expect(res.body.inserted).toBe(2);
    expect(store.rows[0].timestamp).toBe(Date.parse('2026-11-09T10:00:00Z'));
  });

  it.each([
    ['missing device', { temperature: 20 }],
    ['no metrics', { device: 'n1' }],
    ['non-numeric metric', { device: 'n1', temperature: 'hot' }],
    ['out-of-range humidity', { device: 'n1', humidity: 150 }],
    ['bad timestamp', { device: 'n1', timestamp: 'yesterday-ish', temperature: 20 }],
  ])('rejects %s with 400 and stores nothing', async (_name, body) => {
    const res = await request(app).post('/api/readings').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTypeOf('string');
    expect(store.rows).toHaveLength(0);
  });

  it('is all-or-nothing for batches', async () => {
    const res = await request(app)
      .post('/api/readings')
      .send([{ device: 'ok', temperature: 20 }, { device: 'bad', temperature: 9999 }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reading 1/);
    expect(store.rows).toHaveLength(0);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app).post('/api/readings').set('Content-Type', 'application/json').send('{nope');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JSON/);
  });
});

describe('GET /api/readings', () => {
  beforeEach(async () => {
    await store.insert([
      { timestamp: 1000, device: 'a', temperature: 20, humidity: null, pressure: null, co2: null },
      { timestamp: 2000, device: 'b', temperature: 21, humidity: 50, pressure: null, co2: null },
      { timestamp: 3000, device: 'a', temperature: 22, humidity: null, pressure: null, co2: null },
    ]);
  });

  it('returns readings oldest first, omitting null metrics', async () => {
    const res = await request(app).get('/api/readings');
    expect(res.status).toBe(200);
    expect(res.body.readings).toEqual([
      { timestamp: 1000, device: 'a', temperature: 20 },
      { timestamp: 2000, device: 'b', temperature: 21, humidity: 50 },
      { timestamp: 3000, device: 'a', temperature: 22 },
    ]);
  });

  it('filters by from/to/device and honours limit', async () => {
    expect((await request(app).get('/api/readings?from=2000')).body.readings).toHaveLength(2);
    expect((await request(app).get('/api/readings?to=2000')).body.readings).toHaveLength(2);
    expect((await request(app).get('/api/readings?device=a')).body.readings).toHaveLength(2);
    expect((await request(app).get('/api/readings?limit=1')).body.readings).toHaveLength(1);
  });

  it.each(['from=abc', 'to=abc', 'limit=0', 'limit=99999', 'limit=x'])('rejects bad query %s', async (q) => {
    expect((await request(app).get(`/api/readings?${q}`)).status).toBe(400);
  });
});

describe('other routes', () => {
  it('GET /api/devices summarises devices', async () => {
    await store.insert([
      { timestamp: 5, device: 'a', temperature: 1, humidity: null, pressure: null, co2: null },
      { timestamp: 9, device: 'a', temperature: 2, humidity: null, pressure: null, co2: null },
    ]);
    const res = await request(app).get('/api/devices');
    expect(res.body.devices).toEqual([{ device: 'a', readings: 2, lastSeen: 9 }]);
  });

  it('GET /api/stats/hourly validates hours', async () => {
    expect((await request(app).get('/api/stats/hourly?hours=0')).status).toBe(400);
    expect((await request(app).get('/api/stats/hourly?hours=6')).status).toBe(200);
  });

  it('health reflects database availability', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
    store.healthy = false;
    expect((await request(app).get('/api/health')).status).toBe(503);
  });

  it('unknown route -> 404 JSON', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });
});

describe('validate', () => {
  it('defaults the timestamp to now', () => {
    const r = parseReading({ device: 'x', co2: 500 }, 12345);
    expect(r.ok && r.value.timestamp).toBe(12345);
  });

  it('rejects empty and oversized batches', () => {
    expect(parseBody([]).ok).toBe(false);
    expect(parseBody(Array.from({ length: 1001 }, () => ({ device: 'x', co2: 1 }))).ok).toBe(false);
  });
});
