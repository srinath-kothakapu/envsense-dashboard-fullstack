import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTelemetry } from './useTelemetry';
import { DEFAULT_THRESHOLDS } from '../lib/metrics';
import type { Reading } from '../lib/types';

const reading = (timestamp: number, temperature: number, device = 'api-node'): Reading => ({
  timestamp,
  device,
  temperature,
});

afterEach(() => vi.unstubAllGlobals());

describe('useTelemetry (api mode)', () => {
  it('polls incrementally, groups by device and raises an edge-triggered alert', async () => {
    const now = Date.now();
    const batches = [
      [reading(now - 3000, 22), reading(now - 2000, 40)], // second one breaches (max 30)
      [reading(now - 1000, 41)], // still breaching -> no new alert
    ];
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url);
      const readings = batches.shift() ?? [];
      return { ok: true, json: async () => ({ readings }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useTelemetry({ thresholds: DEFAULT_THRESHOLDS, mode: 'api', apiBase: '/api', intervalMs: 20 })
    );

    await waitFor(() => expect(result.current.series['api-node']).toHaveLength(3));
    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0]).toMatchObject({ metric: 'temperature', level: 'high', value: 40 });
    expect(result.current.error).toBeNull();

    // the 2nd request must only ask for readings newer than the last one received (+1ms)
    expect(urls[1]).toContain(`from=${now - 2000 + 1}`);
  });

  it('exposes an error when the API is unreachable and recovers', async () => {
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (fail) throw new Error('boom');
        return { ok: true, json: async () => ({ readings: [reading(Date.now(), 21)] }) } as Response;
      })
    );

    const { result } = renderHook(() =>
      useTelemetry({ thresholds: DEFAULT_THRESHOLDS, mode: 'api', intervalMs: 20 })
    );
    await waitFor(() => expect(result.current.error).toBe('boom'));

    fail = false;
    await waitFor(() => expect(result.current.error).toBeNull());
    await waitFor(() => expect(result.current.series['api-node']?.length).toBeGreaterThan(0));
  });

  it('does not poll while paused', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ readings: [] }) }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() =>
      useTelemetry({ thresholds: DEFAULT_THRESHOLDS, mode: 'api', intervalMs: 20 })
    );
    act(() => result.current.setPaused(true));
    const calls = fetchMock.mock.calls.length;
    await new Promise((r) => setTimeout(r, 100));
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
