import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import StatCard from './components/StatCard';
import TelemetryChart from './components/TelemetryChart';
import AlertsPanel from './components/AlertsPanel';
import ThresholdEditor from './components/ThresholdEditor';
import { useTelemetry } from './hooks/useTelemetry';
import { DEFAULT_THRESHOLDS, METRIC_KEYS } from './lib/metrics';
import { DEVICES } from './lib/simulator';
import { parseCsv, toCsv } from './lib/csv';
import { flatten, summarize } from './lib/series';
import type { Device, MetricKey, Thresholds } from './lib/types';

const PALETTE = ['#22d3ee', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#fb923c'];

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [metric, setMetric] = useState<MetricKey>('temperature');
  const [selectedDevice, setSelectedDevice] = useState<string>(DEVICES[0].id);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { series, alerts, paused, setPaused, source, mode, error, importReadings, backToLive, clearAlerts } =
    useTelemetry({ thresholds });

  // Devices come from whatever data we have (simulator, API or CSV); known nodes keep their name/colour.
  const deviceIds = Object.keys(series).join('|');
  const devices: Device[] = useMemo(
    () =>
      deviceIds
        .split('|')
        .filter(Boolean)
        .sort()
        .map((id, i) => DEVICES.find((d) => d.id === id) ?? { id, name: id, color: PALETTE[i % PALETTE.length] }),
    [deviceIds]
  );

  const activeId = devices.some((d) => d.id === selectedDevice) ? selectedDevice : devices[0]?.id;
  const stats = useMemo(() => summarize(series[activeId] ?? []), [series, activeId]);
  const nameOf = (id: string) => devices.find((d) => d.id === id)?.name ?? id;

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { readings, errors } = parseCsv(await file.text());
    setImportErrors(errors.slice(0, 5));
    if (readings.length) {
      importReadings(readings);
      setSelectedDevice(readings[0].device);
    }
  };

  const statusLabel =
    source === 'imported' ? 'Imported data' : paused ? 'Paused' : mode === 'api' ? 'Live · API' : 'Live · simulated';

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>
            <span className="logo" aria-hidden="true">
              ◢
            </span>{' '}
            EnvSense
          </h1>
          <p className="subtitle">
            Environmental sensor monitoring ·{' '}
            <span className={`pill ${source === 'live' && !paused && !error ? 'live' : ''}`}>{statusLabel}</span>
          </p>
        </div>
        <div className="actions">
          {source === 'live' ? (
            <button type="button" className="btn" onClick={() => setPaused(!paused)}>
              {paused ? 'Resume' : 'Pause'}
            </button>
          ) : (
            <button type="button" className="btn" onClick={backToLive}>
              Back to live
            </button>
          )}
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import CSV
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => download('envsense-export.csv', toCsv(flatten(series)))}
          >
            Export CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} data-testid="file-input" />
        </div>
      </header>

      {(importErrors.length > 0 || error) && (
        <div className="notice" role="alert">
          {error && <div>Cannot reach the API: {error}. Retrying…</div>}
          {importErrors.map((err) => (
            <div key={err}>{err}</div>
          ))}
        </div>
      )}

      <nav className="device-tabs" aria-label="Devices">
        {devices.length === 0 && <span className="empty">Waiting for data…</span>}
        {devices.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`tab ${d.id === activeId ? 'active' : ''}`}
            style={{ '--dot': d.color } as React.CSSProperties}
            onClick={() => setSelectedDevice(d.id)}
          >
            <i /> {d.name}
          </button>
        ))}
      </nav>

      <div className="stats">
        {METRIC_KEYS.map((m) => (
          <StatCard
            key={m}
            metric={m}
            stats={stats[m]}
            threshold={thresholds[m]}
            selected={m === metric}
            onSelect={setMetric}
          />
        ))}
      </div>

      <div className="grid">
        <TelemetryChart series={series} metric={metric} threshold={thresholds[metric]} devices={devices} />
        <aside className="side">
          <AlertsPanel alerts={alerts} deviceName={nameOf} onClear={clearAlerts} />
          <ThresholdEditor thresholds={thresholds} onChange={setThresholds} />
        </aside>
      </div>
    </div>
  );
}
