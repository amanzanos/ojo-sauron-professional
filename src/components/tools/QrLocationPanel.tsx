import { useState } from 'react';
import QRCode from 'qrcode';
import { getCurrentPosition, mapsLink } from '../../utils/geo';

export function QrLocationPanel() {
  const [qrUrl, setQrUrl] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const generate = async () => {
    setLoading(true);
    setError(undefined);
    const position = await getCurrentPosition();
    if (!position) {
      setError('No se pudo obtener tu ubicación.');
      setLoading(false);
      return;
    }
    try {
      const dataUrl = await QRCode.toDataURL(mapsLink(position), { width: 260, margin: 1, color: { dark: '#0a0908', light: '#f2ede2' } });
      setQrUrl(dataUrl);
    } catch {
      setError('No se pudo generar el código QR.');
    }
    setLoading(false);
  };

  return (
    <div className="tool-simple tool-centered">
      <p className="tool-hint">Genera un código QR con tu ubicación en vivo para que alguien lo escanee en persona — nada viaja por red, solo se dibuja en tu pantalla.</p>
      {qrUrl ? (
        <img className="qr-image" src={qrUrl} alt="Código QR de tu ubicación" />
      ) : (
        <button className="tool-primary-btn" onClick={generate} disabled={loading}>{loading ? 'Generando…' : 'Generar QR de mi ubicación'}</button>
      )}
      {error && <p className="sos-error">{error}</p>}
      {qrUrl && <button className="tool-toggle-btn" onClick={generate}>Actualizar</button>}
    </div>
  );
}
