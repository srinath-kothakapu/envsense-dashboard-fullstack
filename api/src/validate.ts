import { METRICS, type Metric, type NewReading } from './types.js';

export const MAX_BATCH = 1000;

// Plausibility bounds: reject obviously broken sensor values instead of storing them.
const RANGES: Record<Metric, [number, number]> = {
  temperature: [-90, 150],
  humidity: [0, 100],
  pressure: [300, 1100],
  co2: [0, 100_000],
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function parseTimestamp(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = /^\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw) : Date.parse(raw);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export function parseReading(input: unknown, now = Date.now()): Parsed<NewReading> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'reading must be an object' };
  }
  const o = input as Record<string, unknown>;

  if (typeof o.device !== 'string' || o.device.trim() === '' || o.device.length > 64) {
    return { ok: false, error: '"device" must be a non-empty string up to 64 characters' };
  }

  const timestamp = o.timestamp === undefined ? now : parseTimestamp(o.timestamp);
  if (timestamp === null) return { ok: false, error: '"timestamp" must be epoch milliseconds or an ISO date string' };

  const reading: NewReading = {
    timestamp: Math.round(timestamp),
    device: o.device.trim(),
    temperature: null,
    humidity: null,
    pressure: null,
    co2: null,
  };

  for (const metric of METRICS) {
    const v = o[metric];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, error: `"${metric}" must be a finite number` };
    const [lo, hi] = RANGES[metric];
    if (v < lo || v > hi) return { ok: false, error: `"${metric}" must be between ${lo} and ${hi}` };
    reading[metric] = v;
  }

  if (METRICS.every((m) => reading[m] === null)) {
    return { ok: false, error: `reading needs at least one of: ${METRICS.join(', ')}` };
  }
  return { ok: true, value: reading };
}

/** Accepts one reading or an array of up to MAX_BATCH readings. All-or-nothing. */
export function parseBody(body: unknown): Parsed<NewReading[]> {
  const items = Array.isArray(body) ? body : [body];
  if (items.length === 0) return { ok: false, error: 'body must contain at least one reading' };
  if (items.length > MAX_BATCH) return { ok: false, error: `at most ${MAX_BATCH} readings per request` };

  const out: NewReading[] = [];
  for (let i = 0; i < items.length; i++) {
    const r = parseReading(items[i]);
    if (!r.ok) return { ok: false, error: items.length > 1 ? `reading ${i}: ${r.error}` : r.error };
    out.push(r.value);
  }
  return { ok: true, value: out };
}
