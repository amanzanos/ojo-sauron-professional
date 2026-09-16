import { useState } from 'react';
import { loadBatteryThreshold, saveBatteryThreshold } from '../../hooks/useBatteryAlert';
import { setToolEnabled } from '../../utils/toolPrefs';

interface BatteryAlertPanelProps {
  supported: boolean;
  enabled: boolean;
  level?: number;
  onStart: () => void;
  onStop: () => void;
}

export function BatteryAlertPanel({ supported, enabled, level, onStart, onStop }: BatteryAlertPanelProps) {
  const [threshold, setThreshold] = useState(loadBatteryThreshold);

  if (!supported) return <p className="tool-empty">Tu navegador no expone el nivel de batería.</p>;

  const applyThreshold = (value: number) => {
    setThreshold(value);
    saveBatteryThreshold(value);
  };

  return (
    <div className="tool-simple">
      <p className="tool-hint">Avisa por voz, notificación y vibración en cuanto la batería baje del umbral que marques.</p>
      <div className="battery-threshold-row">
        <label>Avisar por debajo de</label>
        <input type="number" min={5} max={80} value={threshold} onChange={(e) => applyThreshold(Number(e.target.value))} /> %
      </div>
      {level != null && <p className="tool-hint">Nivel actual: {level}%</p>}
      <button
        className={`tool-toggle-btn ${enabled ? 'active' : ''}`}
        onClick={() => {
          if (enabled) { onStop(); setToolEnabled('batteryAlert', false); }
          else { onStart(); setToolEnabled('batteryAlert', true); }
        }}
      >
        {enabled ? 'Desactivar aviso' : 'Activar aviso'}
      </button>
    </div>
  );
}
