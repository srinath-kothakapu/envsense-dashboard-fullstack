// Deterministic sensor simulator: mean-reverting random walks with occasional spikes.
// Used for offline/demo mode. (The API ships its own copy for the data-generator service.)
import type { Device, MetricKey, Reading } from './types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEVICES: Device[] = [
  { id: 'node-01', name: 'Lab Bench', color: '#22d3ee' },
  { id: 'node-02', name: 'Server Room', color: '#f472b6' },
  { id: 'node-03', name: 'Vehicle Cabin', color: '#a3e635' },
];

type Values = Record<MetricKey, number>;

const BASE: Record<string, Values> = {
  'node-01': { temperature: 23, humidity: 45, pressure: 1013, co2: 550 },
  'node-02': { temperature: 27, humidity: 35, pressure: 1011, co2: 700 },
  'node-03': { temperature: 21, humidity: 55, pressure: 1009, co2: 850 },
};

const STEP: Values = { temperature: 0.25, humidity: 0.8, pressure: 0.3, co2: 18 };
const LIMITS: Record<MetricKey, [number, number]> = {
  temperature: [-10, 60],
  humidity: [5, 99],
  pressure: [900, 1100],
  co2: [380, 5000],
};
const SPIKE: Values = { temperature: 7, humidity: 18, pressure: -25, co2: 600 };

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

export interface SimDevice {
  id: string;
  next(timestamp: number): Reading;
}

export function createDevice(id: string, seed = 1, spikeChance = 0.015): SimDevice {
  const rand = mulberry32(seed);
  const base = BASE[id] ?? BASE['node-01'];
  const state: Values = { ...base };
  const keys = Object.keys(base) as MetricKey[];

  return {
    id,
    next(timestamp) {
      const reading: Reading = { timestamp, device: id };
      for (const key of keys) {
        const noise = (rand() - 0.5) * 2 * STEP[key];
        const pull = (base[key] - state[key]) * 0.06;
        let v = state[key] + noise + pull;
        if (rand() < spikeChance) v += SPIKE[key] * (0.6 + rand() * 0.8);
        state[key] = clamp(v, LIMITS[key]);
        reading[key] = Number(state[key].toFixed(key === 'co2' ? 0 : 1));
      }
      return reading;
    },
  };
}
