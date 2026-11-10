import type { Pool } from 'pg';
import {
  METRICS,
  type DeviceInfo,
  type HourlyStat,
  type ListQuery,
  type MetricAggregate,
  type NewReading,
  type ReadingStore,
  type StoredReading,
} from './types.js';

// Timestamps are stored as TIMESTAMPTZ and exchanged with clients as epoch milliseconds.
// Bounds use a half-millisecond tolerance so float rounding in to_timestamp() can never
// drop a row that sits exactly on the boundary.
const MS = "round(extract(epoch FROM ts) * 1000)::float8";

export class PgStore implements ReadingStore {
  constructor(private readonly pool: Pool) {}

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  /** Bulk insert in one statement (single round trip, atomic). */
  async insert(readings: NewReading[]): Promise<number> {
    const res = await this.pool.query(
      `INSERT INTO readings (ts, device, temperature, humidity, pressure, co2)
       SELECT to_timestamp(t / 1000.0), d, temp, hum, pres, co2
       FROM unnest($1::float8[], $2::text[], $3::float8[], $4::float8[], $5::float8[], $6::float8[])
            AS u(t, d, temp, hum, pres, co2)`,
      [
        readings.map((r) => r.timestamp),
        readings.map((r) => r.device),
        readings.map((r) => r.temperature),
        readings.map((r) => r.humidity),
        readings.map((r) => r.pressure),
        readings.map((r) => r.co2),
      ]
    );
    return res.rowCount ?? 0;
  }

  async list({ from, to, device, limit }: ListQuery): Promise<StoredReading[]> {
    const res = await this.pool.query(
      `SELECT ${MS} AS timestamp, device, temperature, humidity, pressure, co2
       FROM readings
       WHERE ($1::float8 IS NULL OR ts >= to_timestamp(($1::float8 - 0.5) / 1000.0))
         AND ($2::float8 IS NULL OR ts <= to_timestamp(($2::float8 + 0.5) / 1000.0))
         AND ($3::text   IS NULL OR device = $3)
       ORDER BY ts ASC, id ASC
       LIMIT $4`,
      [from ?? null, to ?? null, device ?? null, limit]
    );
    return res.rows.map((row) => {
      const out: StoredReading = { timestamp: row.timestamp, device: row.device };
      for (const m of METRICS) if (row[m] !== null) out[m] = row[m];
      return out;
    });
  }

  async devices(): Promise<DeviceInfo[]> {
    const res = await this.pool.query(
      `SELECT device,
              count(*)::int AS readings,
              round(extract(epoch FROM max(ts)) * 1000)::float8 AS last_seen
       FROM readings
       GROUP BY device
       ORDER BY device`
    );
    return res.rows.map((r) => ({ device: r.device, readings: r.readings, lastSeen: r.last_seen }));
  }

  async hourly({ hours, device }: { hours: number; device?: string }): Promise<HourlyStat[]> {
    const res = await this.pool.query(
      `SELECT round(extract(epoch FROM date_trunc('hour', ts)) * 1000)::float8 AS hour,
              device,
              count(*)::int AS samples,
              avg(temperature) AS temperature_avg, min(temperature) AS temperature_min, max(temperature) AS temperature_max,
              avg(humidity)    AS humidity_avg,    min(humidity)    AS humidity_min,    max(humidity)    AS humidity_max,
              avg(pressure)    AS pressure_avg,    min(pressure)    AS pressure_min,    max(pressure)    AS pressure_max,
              avg(co2)         AS co2_avg,         min(co2)         AS co2_min,         max(co2)         AS co2_max
       FROM readings
       WHERE ts >= now() - make_interval(hours => $1::int)
         AND ($2::text IS NULL OR device = $2)
       GROUP BY date_trunc('hour', ts), device
       ORDER BY date_trunc('hour', ts), device`,
      [hours, device ?? null]
    );

    const agg = (row: Record<string, number | null>, m: string): MetricAggregate | null =>
      row[`${m}_avg`] === null
        ? null
        : { avg: row[`${m}_avg`] as number, min: row[`${m}_min`] as number, max: row[`${m}_max`] as number };

    return res.rows.map((row) => ({
      hour: row.hour,
      device: row.device,
      samples: row.samples,
      temperature: agg(row, 'temperature'),
      humidity: agg(row, 'humidity'),
      pressure: agg(row, 'pressure'),
      co2: agg(row, 'co2'),
    }));
  }
}
