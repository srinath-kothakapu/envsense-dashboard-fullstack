import { describe, expect, it } from 'vitest';
import { createDevice, mulberry32 } from './simulator';
import { DEFAULT_THRESHOLDS, statusOf } from './metrics';
import { detectAlerts, evaluate, scanAlerts } from './alerts';
import { parseCsv, toCsv } from './csv';
import { mergeSeries, summarize } from './series';
import type { Reading, Series } from './types';

describe('simulator', () => {
  it('is deterministic for a given seed', () => {
    const a = createDevice('node-01', 7);
    const b = createDevice('node-01', 7);
    for (let i = 0; i < 20; i++) expect(a.next(i)).toEqual(b.next(i));
  });

  it('stays inside physical limits', () => {
    const d = createDevice('node-02', 3, 0.5);
    for (let i = 0; i < 500; i++) {
      const r = d.next(i);
      expect(r.humidity).toBeLessThanOrEqual(99);
      expect(r.co2).toBeGreaterThanOrEqual(380);
    }
  });

  it('PRNG returns values in [0,1)', () => {
    const r = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('alerts', () => {
  const ok: Reading = { timestamp: 1, device: 'a', temperature: 22, humidity: 40, pressure: 1010, co2: 500 };

  it('flags high and low breaches', () => {
    const out = evaluate({ ...ok, temperature: 45, humidity: 10 }, DEFAULT_THRESHOLDS);
    expect(out.map((o) => [o.metric, o.level])).toEqual([
      ['temperature', 'high'],
      ['humidity', 'low'],
    ]);
  });

  it('only alerts on entering a breach, and re-arms after recovery', () => {
    const active = new Set<string>();
    const hot = (t: number) => ({ ...ok, timestamp: t, temperature: 40 });
    expect(detectAlerts(hot(1), DEFAULT_THRESHOLDS, active)).toHaveLength(1);
    expect(detectAlerts(hot(2), DEFAULT_THRESHOLDS, active)).toHaveLength(0);
    expect(detectAlerts({ ...ok, timestamp: 3 }, DEFAULT_THRESHOLDS, active)).toHaveLength(0);
    expect(detectAlerts(hot(4), DEFAULT_THRESHOLDS, active)).toHaveLength(1);
  });

  it('tracks breaches per device independently', () => {
    const events = scanAlerts(
      [
        { ...ok, device: 'a', temperature: 40 },
        { ...ok, timestamp: 2, device: 'b', temperature: 40 },
      ],
      DEFAULT_THRESHOLDS
    );
    expect(events).toHaveLength(2);
  });

  it('statusOf handles missing values', () => {
    expect(statusOf(undefined, { min: 0, max: 1 })).toBe('ok');
    expect(statusOf(5, { min: 0, max: 1 })).toBe('high');
  });
});

describe('csv', () => {
  it('round-trips readings', () => {
    const readings: Reading[] = [{ timestamp: 1700000000000, device: 'n1', temperature: 21.5, humidity: 40, pressure: 1012, co2: 600 }];
    const parsed = parseCsv(toCsv(readings));
    expect(parsed.errors).toEqual([]);
    expect(parsed.readings).toEqual(readings);
  });

  it('accepts epoch timestamps, partial columns and defaults the device', () => {
    const { readings } = parseCsv('timestamp,temperature\n1700000000000,20\n');
    expect(readings).toEqual([{ timestamp: 1700000000000, device: 'imported', temperature: 20 }]);
  });

  it('reports bad rows and keeps good ones', () => {
    const { readings, errors } = parseCsv('timestamp,temperature\nnope,20\n1700000000000,abc\n1700000001000,21\n');
    expect(readings).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });

  it('rejects files without a timestamp or metric column', () => {
    expect(parseCsv('a,b\n1,2\n').errors[0]).toMatch(/timestamp/);
    expect(parseCsv('timestamp,foo\n1,2\n').errors[0]).toMatch(/metric/);
  });
});

describe('series', () => {
  const series: Series = {
    a: [{ timestamp: 1, device: 'a', temperature: 10 }, { timestamp: 2, device: 'a', temperature: 20 }],
    b: [{ timestamp: 2, device: 'b', temperature: 30 }],
  };

  it('merges devices by timestamp', () => {
    expect(mergeSeries(series, 'temperature')).toEqual([
      { timestamp: 1, a: 10 },
      { timestamp: 2, a: 20, b: 30 },
    ]);
  });

  it('summarizes min/max/avg/latest', () => {
    expect(summarize(series.a).temperature).toEqual({ latest: 20, min: 10, max: 20, avg: 15 });
    expect(summarize(series.a).co2).toBeNull();
  });
});
