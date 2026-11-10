export const METRICS = ['temperature', 'humidity', 'pressure', 'co2'] as const;
export type Metric = (typeof METRICS)[number];

/** A validated reading ready to be stored. Missing metrics are null. */
export interface NewReading {
  timestamp: number; // epoch ms
  device: string;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  co2: number | null;
}

/** A reading as served to clients (matches the dashboard's `Reading` type; absent metrics are omitted). */
export interface StoredReading {
  timestamp: number;
  device: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  co2?: number;
}

export interface DeviceInfo {
  device: string;
  readings: number;
  lastSeen: number;
}

export interface MetricAggregate {
  avg: number;
  min: number;
  max: number;
}

export interface HourlyStat {
  hour: number; // epoch ms, start of the hour
  device: string;
  samples: number;
  temperature: MetricAggregate | null;
  humidity: MetricAggregate | null;
  pressure: MetricAggregate | null;
  co2: MetricAggregate | null;
}

export interface ListQuery {
  from?: number;
  to?: number;
  device?: string;
  limit: number;
}

export interface ReadingStore {
  insert(readings: NewReading[]): Promise<number>;
  list(query: ListQuery): Promise<StoredReading[]>;
  devices(): Promise<DeviceInfo[]>;
  hourly(query: { hours: number; device?: string }): Promise<HourlyStat[]>;
  ping(): Promise<void>;
}
