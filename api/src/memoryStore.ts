import {
  METRICS,
  type DeviceInfo,
  type HourlyStat,
  type ListQuery,
  type NewReading,
  type ReadingStore,
  type StoredReading,
} from './types.js';

/** In-memory store used by the HTTP-layer tests (SQL behaviour is covered by the Postgres tests). */
export class MemoryStore implements ReadingStore {
  rows: NewReading[] = [];
  healthy = true;

  async ping(): Promise<void> {
    if (!this.healthy) throw new Error('db down');
  }

  async insert(readings: NewReading[]): Promise<number> {
    this.rows.push(...readings);
    return readings.length;
  }

  async list({ from, to, device, limit }: ListQuery): Promise<StoredReading[]> {
    return this.rows
      .filter((r) => (from === undefined || r.timestamp >= from) && (to === undefined || r.timestamp <= to))
      .filter((r) => device === undefined || r.device === device)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, limit)
      .map((r) => {
        const out: StoredReading = { timestamp: r.timestamp, device: r.device };
        for (const m of METRICS) if (r[m] !== null) out[m] = r[m] as number;
        return out;
      });
  }

  async devices(): Promise<DeviceInfo[]> {
    const map = new Map<string, DeviceInfo>();
    for (const r of this.rows) {
      const d = map.get(r.device) ?? { device: r.device, readings: 0, lastSeen: 0 };
      d.readings++;
      d.lastSeen = Math.max(d.lastSeen, r.timestamp);
      map.set(r.device, d);
    }
    return [...map.values()].sort((a, b) => a.device.localeCompare(b.device));
  }

  async hourly(): Promise<HourlyStat[]> {
    return [];
  }
}
