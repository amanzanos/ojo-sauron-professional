import { setToolEnabled } from '../../utils/toolPrefs';

interface DrivingModePanelProps {
  enabled: boolean;
  driving: boolean;
  speedKmh?: number;
  onStart: () => void;
  onStop: () => void;
}

export function DrivingModePanel({ enabled, driving, speedKmh, onStart, onStop }: DrivingModePanelProps) {
  const toggle = () => {
    if (enabled) { onStop(); setToolEnabled('drivingMode', false); }
    else { onStart(); setToolEnabled('drivingMode', true); }
  };

  return (
    <div className="tool-simple">
      <p className="tool-hint">Detecta cuando vas a más de ~29 km/h sostenidos (por GPS) y activa el manos libres automáticamente, para no tocar el móvil mientras conduces.</p>
      <button className={`tool-toggle-btn ${enabled ? 'active' : ''}`} onClick={toggle}>
        {enabled ? 'Desactivar' : 'Activar'} detección de conducción
      </button>
      {enabled && (
        <div className={`driving-status ${driving ? 'active' : ''}`}>
          {driving ? 'Conduciendo — manos libres activo' : 'Vigilando velocidad…'}
          {speedKmh != null && <span className="mono"> {speedKmh} km/h</span>}
        </div>
      )}
    </div>
  );
}
