import type { Reading } from './types';

/** Fetch readings with timestamp >= `from` (epoch ms), oldest first. */
export async function fetchReadings(base: string, from: number, signal?: AbortSignal): Promise<Reading[]> {
  const res = await fetch(`${base}/readings?from=${from}&limit=5000`, { signal });
  if (!res.ok) throw new Error(`API responded with ${res.status}`);
  const body = (await res.json()) as { readings: Reading[] };
  return body.readings;
}
