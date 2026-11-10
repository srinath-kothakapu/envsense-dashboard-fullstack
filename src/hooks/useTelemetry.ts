import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, USE_API } from '../config';
import { fetchReadings } from '../lib/api';
import { detectAlerts, scanAlerts } from '../lib/alerts';
import { DEVICES, createDevice, type SimDevice } from '../lib/simulator';
import type { AlertEvent, Reading, Series, Thresholds } from '../lib/types';

const MAX_POINTS = 120;
const MAX_ALERTS = 100;
const INITIAL_WINDOW_MS = 2 * 60 * 1000;

export type DataMode = 'sim' | 'api';
export type Source = 'live' | 'imported';

export interface UseTelemetryOptions {
  thresholds: Thresholds;
  intervalMs?: number;
  /** 'sim' = in-browser simulator, 'api' = poll the REST API. Defaults to the VITE_USE_API build flag. */
  mode?: DataMode;
  apiBase?: string;
}

function makeSimulators(): SimDevice[] {
  return DEVICES.map((d, i) => createDevice(d.id, 1000 + i * 77));
}

function prefill(sims: SimDevice[], intervalMs: number, points = 60): Series {
  const now = Date.now();
  const series: Series = Object.fromEntries(sims.map((s) => [s.id, [] as Reading[]]));
  for (let i = points; i > 0; i--) {
    const ts = now - i * intervalMs;
    for (const s of sims) series[s.id].push(s.next(ts));
  }
  return series;
}

/**
 * Streams telemetry (simulated or from the API), keeps a rolling window per device and
 * raises edge-triggered alerts. Can switch to an imported (CSV) dataset and back.
 */
export function useTelemetry({
  thresholds,
  intervalMs = 1000,
  mode = USE_API ? 'api' : 'sim',
  apiBase = API_BASE,
}: UseTelemetryOptions) {
  const simsRef = useRef<SimDevice[] | null>(null);
  if (mode === 'sim' && simsRef.current === null) simsRef.current = makeSimulators();

  const [series, setSeries] = useState<Series>(() =>
    mode === 'sim' && simsRef.current ? prefill(simsRef.current, intervalMs) : {}
  );
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [source, setSource] = useState<Source>('live');
  const [error, setError] = useState<string | null>(null);

  const thresholdsRef = useRef(thresholds);
  thresholdsRef.current = thresholds;
  const activeRef = useRef<Set<string>>(new Set());
  const lastTsRef = useRef(Date.now() - INITIAL_WINDOW_MS);

  /** Append new readings to the rolling window and raise alerts. */
  const ingest = useCallback((readings: Reading[]) => {
    if (!readings.length) return;
    const events = readings.flatMap((r) => detectAlerts(r, thresholdsRef.current, activeRef.current));
    setSeries((prev) => {
      const next: Series = { ...prev };
      for (const r of readings) next[r.device] = [...(next[r.device] ?? []), r].slice(-MAX_POINTS);
      return next;
    });
    if (events.length) setAlerts((prev) => [...events.reverse(), ...prev].slice(0, MAX_ALERTS));
  }, []);

  // Simulated stream
  useEffect(() => {
    if (mode !== 'sim' || paused || source !== 'live') return undefined;
    const id = setInterval(() => {
      const ts = Date.now();
      ingest((simsRef.current ?? []).map((s) => s.next(ts)));
    }, intervalMs);
    return () => clearInterval(id);
  }, [mode, paused, source, intervalMs, ingest]);

  // API polling (incremental: only readings newer than the last one we have)
  useEffect(() => {
    if (mode !== 'api' || paused || source !== 'live') return undefined;
    const controller = new AbortController();
    let inFlight = false;

    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const readings = await fetchReadings(apiBase, lastTsRef.current + 1, controller.signal);
        setError(null);
        if (readings.length) {
          lastTsRef.current = readings[readings.length - 1].timestamp;
          ingest(readings);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Failed to reach API');
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [mode, paused, source, intervalMs, apiBase, ingest]);

  const importReadings = useCallback((readings: Reading[]) => {
    const grouped: Series = {};
    for (const r of readings) (grouped[r.device] ??= []).push(r);
    activeRef.current = new Set();
    setSeries(grouped);
    setAlerts(scanAlerts(readings, thresholdsRef.current).reverse().slice(0, MAX_ALERTS));
    setSource('imported');
  }, []);

  const backToLive = useCallback(() => {
    activeRef.current = new Set();
    setAlerts([]);
    setError(null);
    if (mode === 'sim') {
      simsRef.current = makeSimulators();
      setSeries(prefill(simsRef.current, intervalMs));
    } else {
      lastTsRef.current = Date.now() - INITIAL_WINDOW_MS;
      setSeries({});
    }
    setSource('live');
  }, [mode, intervalMs]);

  const clearAlerts = useCallback(() => setAlerts([]), []);

  return { series, alerts, paused, setPaused, source, mode, error, importReadings, backToLive, clearAlerts };
}
