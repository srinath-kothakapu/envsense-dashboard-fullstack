import { METRIC_KEYS } from './metrics';
import type { MetricKey, MetricStats, Reading, Series } from './types';

/** Chart row: a timestamp plus one numeric column per device id. */
export type ChartRow = Record<string, number>;

/** Flatten {deviceId: reading[]} into one time-sorted list. */
export function flatten(series: Series): Reading[] {
  return Object.values(series)
    .flat()
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Pivot one metric into chart rows: [{timestamp, 'node-01': v, 'node-02': v}]. */
export function mergeSeries(series: Series, metric: MetricKey): ChartRow[] {
  const rows = new Map<number, ChartRow>();
  for (const [device, readings] of Object.entries(series)) {
    for (const r of readings) {
      const value = r[metric];
      if (value === undefined) continue;
      let row = rows.get(r.timestamp);
      if (!row) {
        row = { timestamp: r.timestamp };
        rows.set(r.timestamp, row);
      }
      row[device] = value;
    }
  }
  return [...rows.values()].sort((a, b) => a.timestamp - b.timestamp);
}

/** min / max / avg / latest for each metric of one device's readings. */
export function summarize(readings: Reading[]): Record<MetricKey, MetricStats | null> {
  const out = {} as Record<MetricKey, MetricStats | null>;
  for (const metric of METRIC_KEYS) {
    const values = readings.map((r) => r[metric]).filter((v): v is number => typeof v === 'number');
    if (!values.length) {
      out[metric] = null;
      continue;
    }
    const sum = values.reduce((a, b) => a + b, 0);
    out[metric] = {
      latest: values[values.length - 1],
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
    };
  }
  return out;
}
