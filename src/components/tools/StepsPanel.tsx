import { useEffect } from 'react';
import { useSteps } from '../../hooks/useSteps';

export function StepsPanel() {
  const { count, supported, needsPermission, start } = useSteps();

  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supported) return <p className="tool-empty">Tu dispositivo no expone sensores de movimiento.</p>;

  return (
    <div className="tool-steps">
      {needsPermission ? (
        <button className="tool-primary-btn" onClick={start}>Permitir acceso al sensor</button>
      ) : (
        <>
          <div className="steps-count">{count}</div>
          <p className="tool-hint">pasos hoy — estimación aproximada, no un podómetro clínico.</p>
        </>
      )}
    </div>
  );
}
