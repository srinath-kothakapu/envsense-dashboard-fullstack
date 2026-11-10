// Data generator: pretends to be a fleet of sensor nodes and POSTs readings to the API once per interval.
// Stands in for real hardware (e.g. STM32 nodes) so the full stack can be demoed with `docker compose up`.
import { setTimeout as sleep } from 'node:timers/promises';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 1000);

type Values = { temperature: number; humidity: number; pressure: number; co2: number };
type Key = keyof Values;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NODES: Record<string, Values> = {
  'node-01': { temperature: 23, humidity: 45, pressure: 1013, co2: 550 },
  'node-02': { temperature: 27, humidity: 35, pressure: 1011, co2: 700 },
  'node-03': { temperature: 21, humidity: 55, pressure: 1009, co2: 850 },
};
const STEP: Values = { temperature: 0.25, humidity: 0.8, pressure: 0.3, co2: 18 };
const SPIKE: Values = { temperature: 7, humidity: 18, pressure: -25, co2: 600 };
const LIMITS: Record<Key, [number, number]> = {
  temperature: [-10, 60],
  humidity: [5, 99],
  pressure: [900, 1100],
  co2: [380, 5000],
};

const nodes = Object.entries(NODES).map(([id, base], i) => ({
  id,
  base,
  state: { ...base },
  rand: mulberry32(1000 + i * 77),
}));

function sample(timestamp: number) {
  return nodes.map(({ id, base, state, rand }) => {
    const reading: Record<string, number | string> = { device: id, timestamp };
    for (const key of Object.keys(base) as Key[]) {
      let v = state[key] + (rand() - 0.5) * 2 * STEP[key] + (base[key] - state[key]) * 0.06;
      if (rand() < 0.015) v += SPIKE[key] * (0.6 + rand() * 0.8);
      const [lo, hi] = LIMITS[key];
      state[key] = Math.min(hi, Math.max(lo, v));
      reading[key] = Number(state[key].toFixed(key === 'co2' ? 0 : 1));
    }
    return reading;
  });
}

async function main() {
  console.log(`simulating ${nodes.length} nodes -> ${API_URL} every ${INTERVAL_MS} ms`);
  let stop = false;
  process.on('SIGTERM', () => (stop = true));
  process.on('SIGINT', () => (stop = true));

  while (!stop) {
    try {
      const res = await fetch(`${API_URL}/api/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sample(Date.now())),
      });
      if (!res.ok) console.error(`API rejected batch: ${res.status} ${await res.text()}`);
    } catch (err) {
      console.error('could not reach API, will retry:', (err as Error).message);
    }
    await sleep(INTERVAL_MS);
  }
}

void main();
