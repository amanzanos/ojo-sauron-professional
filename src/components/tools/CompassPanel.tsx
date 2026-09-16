import { useEffect } from 'react';
import { Compass } from 'lucide-react';
import { useCompass } from '../../hooks/useCompass';

export function CompassPanel() {
  const { heading, supported, needsPermission, start } = useCompass();

  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supported) return <p className="tool-empty">Tu dispositivo no expone sensor de orientación.</p>;

  return (
    <div className="tool-compass">
      {needsPermission ? (
        <button className="tool-primary-btn" onClick={start}>Permitir acceso al sensor</button>
      ) : (
        <>
          <div className="compass-dial" style={{ transform: `rotate(${-(heading ?? 0)}deg)` }}>
            <Compass size={64} />
          </div>
          <p className="compass-heading">{heading != null ? `${Math.round(heading)}°` : 'Buscando señal…'}</p>
        </>
      )}
    </div>
  );
}
