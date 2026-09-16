import { Download, MonitorUp, Share2 } from 'lucide-react';
import { useScreenRecording } from '../../hooks/useScreenRecording';

export function ScreenRecordPanel() {
  const { recording, error, clipUrl, start, stop } = useScreenRecording();

  const share = async () => {
    if (!clipUrl) return;
    const res = await fetch(clipUrl);
    const blob = await res.blob();
    const file = new File([blob], `weros-pantalla-${Date.now()}.webm`, { type: blob.type || 'video/webm' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Grabación de pantalla — WEROS' }); } catch { /* dismissed */ }
    }
  };

  return (
    <div className="tool-simple tool-centered">
      <p className="tool-hint">Graba lo que pasa en la pantalla del móvil — útil como evidencia de una llamada de estafa, una web sospechosa o una app rara. El propio navegador te pide qué compartir.</p>
      {error && <p className="sos-error">{error}</p>}
      {!recording ? (
        <button className="tool-primary-btn" onClick={start}><MonitorUp size={16} /> Grabar pantalla</button>
      ) : (
        <button className="witness-toggle stop" onClick={stop}>Detener y guardar</button>
      )}
      {clipUrl && !recording && (
        <div className="witness-result-actions">
          <a className="sos-download" href={clipUrl} download={`weros-pantalla-${Date.now()}.webm`}><Download size={14} /> Descargar</a>
          <button className="witness-share" onClick={share}><Share2 size={14} /> Compartir</button>
        </div>
      )}
    </div>
  );
}
