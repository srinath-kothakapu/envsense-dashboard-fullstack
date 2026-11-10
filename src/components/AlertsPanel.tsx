import { METRICS, formatValue } from '../lib/metrics';
import type { AlertEvent } from '../lib/types';

interface Props {
  alerts: AlertEvent[];
  deviceName: (id: string) => string;
  onClear: () => void;
}

export default function AlertsPanel({ alerts, deviceName, onClear }: Props) {
  return (
    <section className="card alerts" aria-label="Alerts">
      <div className="panel-head">
        <h2>
          Alerts <span className="count">{alerts.length}</span>
        </h2>
        <button type="button" className="btn ghost" onClick={onClear} disabled={!alerts.length}>
          Clear
        </button>
      </div>
      {alerts.length === 0 ? (
        <p className="empty">No threshold breaches. All systems nominal.</p>
      ) : (
        <ul>
          {alerts.map((a) => (
            <li key={a.id} className={a.level}>
              <strong>{METRICS[a.metric].label}</strong> {a.level === 'high' ? 'above' : 'below'}{' '}
              {formatValue(a.metric, a.limit)} {METRICS[a.metric].unit}
              <span className="alert-meta">
                {deviceName(a.device)} · {formatValue(a.metric, a.value)} {METRICS[a.metric].unit} ·{' '}
                {new Date(a.timestamp).toLocaleTimeString([], { hour12: false })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
