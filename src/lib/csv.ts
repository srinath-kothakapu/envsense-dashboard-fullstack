import { METRIC_KEYS } from './metrics';
import type { Reading } from './types';

const HEADER = ['timestamp', 'device', ...METRIC_KEYS];

export interface ParseResult {
  readings: Reading[];
  errors: string[];
}

/**
 * Parse sensor CSV. Required column: timestamp (ISO string or epoch ms).
 * Optional: device, temperature, humidity, pressure, co2 (any subset).
 * Simple comma splitting (no quoted fields). Bad rows are skipped and reported.
 */
export function parseCsv(text: string): ParseResult {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return { readings: [], errors: ['File has no data rows.'] };

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const col: Record<string, number> = Object.fromEntries(header.map((h, i) => [h, i]));
  if (!('timestamp' in col)) return { readings: [], errors: ['Missing required "timestamp" column.'] };
  if (!METRIC_KEYS.some((k) => k in col)) {
    return { readings: [], errors: [`No metric columns found. Expected any of: ${METRIC_KEYS.join(', ')}.`] };
  }

  const readings: Reading[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim());
    const raw = cells[col.timestamp];
    const ts = /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : Date.parse(raw);
    if (Number.isNaN(ts)) {
      errors.push(`Line ${i + 1}: invalid timestamp "${raw}".`);
      continue;
    }
    const device = (col.device !== undefined ? cells[col.device] : '') || 'imported';
    const reading: Reading = { timestamp: ts, device };
    let bad = false;
    for (const key of METRIC_KEYS) {
      if (!(key in col)) continue;
      const cell = cells[col[key]];
      if (cell === '' || cell === undefined) continue;
      const n = Number(cell);
      if (Number.isNaN(n)) {
        errors.push(`Line ${i + 1}: invalid ${key} value "${cell}".`);
        bad = true;
        break;
      }
      reading[key] = n;
    }
    if (!bad) readings.push(reading);
  }

  readings.sort((a, b) => a.timestamp - b.timestamp);
  return { readings, errors };
}

export function toCsv(readings: Reading[]): string {
  const rows = readings.map((r) =>
    [new Date(r.timestamp).toISOString(), r.device, ...METRIC_KEYS.map((k) => r[k] ?? '')].join(',')
  );
  return [HEADER.join(','), ...rows].join('\n') + '\n';
}
