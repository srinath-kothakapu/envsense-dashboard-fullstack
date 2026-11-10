export type MetricKey = 'temperature' | 'humidity' | 'pressure' | 'co2';

export interface Reading {
  timestamp: number; // epoch milliseconds
  device: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  co2?: number;
}

export interface Threshold {
  min: number;
  max: number;
}

export type Thresholds = Record<MetricKey, Threshold>;
export type Status = 'ok' | 'high' | 'low';

export interface Device {
  id: string;
  name: string;
  color: string;
}

export interface AlertEvent {
  id: string;
  timestamp: number;
  device: string;
  metric: MetricKey;
  value: number;
  level: 'high' | 'low';
  limit: number;
}

export type Series = Record<string, Reading[]>;

export interface MetricStats {
  latest: number;
  min: number;
  max: number;
  avg: number;
}
