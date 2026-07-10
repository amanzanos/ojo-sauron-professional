import type { MetricValue } from '../types/analysis';

export function MetricBar({ metric }: { metric: MetricValue }) {
  return (
    <div className="metric-row">
      <div className="metric-head">
        <span>{metric.label}</span>
        <strong className="mono">{metric.value}{metric.unit ?? ''}</strong>
      </div>
      <div className="bar">
        <div className={`bar-fill ${metric.status}`} style={{ width: `${metric.value}%` }} />
        <div className="bar-ticks" />
      </div>
    </div>
  );
}
