interface Props {
  value: number;
  label: string;
  size?: number;
}

function colorFor(value: number) {
  if (value > 80) return '#ef4444';
  if (value > 60) return '#f97316';
  if (value > 40) return '#f0b429';
  if (value > 20) return 'rgba(255,255,255,0.55)';
  return 'rgba(255,255,255,0.3)';
}

export function Gauge({ value, label, size = 104 }: Props) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colorFor(value)}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .2s linear' }}
        />
        <text x="50%" y="47%" textAnchor="middle" className="gauge-value">{Math.round(value)}</text>
        <text x="50%" y="63%" textAnchor="middle" className="gauge-unit">%</text>
      </svg>
      <div className="gauge-label">{label}</div>
    </div>
  );
}
