import { useState } from 'react';
import { ScanFace } from 'lucide-react';
import { captureOwnerDescriptor, clearOwnerDescriptor, hasOwnerDescriptor } from '../../utils/faceIdentity';

export function FaceGreetingPanel() {
  const [configured, setConfigured] = useState(hasOwnerDescriptor);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string>();

  const capture = async () => {
    setCapturing(true);
    setError(undefined);
    try {
      const ok = await captureOwnerDescriptor();
      if (ok) setConfigured(true);
      else setError('No se detectó ninguna cara a tiempo. Inténtalo mirando de frente a la cámara.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo acceder a la cámara.');
    }
    setCapturing(false);
  };

  const forget = () => {
    clearOwnerDescriptor();
    setConfigured(false);
  };

  return (
    <div className="tool-simple tool-centered">
      <p className="tool-hint">
        El saludo diario solo hablará cuando reconozca tu cara — si abre la cámara y ve a otra persona (o a nadie), no dice nada.
        La comparación se hace en tu dispositivo; no se sube a ningún sitio.
      </p>
      {error && <p className="sos-error">{error}</p>}
      {configured ? (
        <>
          <p className="tool-hint"><ScanFace size={14} /> Tu cara ya está configurada.</p>
          <button className="tool-toggle-btn" onClick={forget}>Olvidar mi cara</button>
        </>
      ) : (
        <button className="tool-primary-btn" onClick={capture} disabled={capturing}>
          {capturing ? 'Mirando a la cámara…' : 'Configurar mi cara'}
        </button>
      )}
    </div>
  );
}
