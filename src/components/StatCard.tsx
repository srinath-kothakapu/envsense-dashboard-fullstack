import { METRICS, formatValue, statusOf } from '../lib/metrics';
import type { MetricKey, MetricStats, Threshold } from '../lib/types';

interface Props {
  metric: MetricKey;
  stats: MetricStats | null | undefined;
  threshold: Threshold;
  selected?: boolean;
  onSelect: (metric: MetricKey) => void;
}

export default function StatCard({ metric, stats, threshold, selected = false, onSelect }: Props) {
  const { label, unit } = METRICS[metric];
  const status = statusOf(stats?.latest, threshold);

  return (
    <button
      type="button"
      className={`card stat ${status} ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(metric)}
      aria-pressed={selected}
    >
      <span className="stat-label">{label}</span>
      <span className="stat-value" data-testid={`value-${metric}`}>
        {formatValue(metric, stats?.latest)}
        <small>{unit}</small>
      </span>
      <span className={`badge ${status}`}>
        {status === 'ok' ? 'In range' : status === 'high' ? 'Too high' : 'Too low'}
      </span>
      {stats && (
        <span className="stat-meta">
          min {formatValue(metric, stats.min)} · avg {formatValue(metric, stats.avg)} · max{' '}
          {formatValue(metric, stats.max)}
        </span>
      )}
    </button>
  );
}
