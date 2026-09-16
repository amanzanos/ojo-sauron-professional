import { useEffect, useRef } from 'react';
import { Download, Eye, Share2, Video } from 'lucide-react';
import { useWitnessRecording } from '../hooks/useWitnessRecording';
import { notify } from '../utils/notify';
import { speak } from '../utils/tts';

const CHECK_IN_MS = 5 * 60 * 1000;

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

interface WitnessModeProps {
  command?: { action: 'start' | 'stop'; id: number };
  onCommandConsumed?: () => void;
  onRecordingChange?: (recording: boolean) => void;
}

export function WitnessMode({ command, onCommandConsumed, onRecordingChange }: WitnessModeProps) {
  const { recording, elapsedMs, error, stream, clipUrl, start, stop } = useWitnessRecording();
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastCheckInRef = useRef(0);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream ?? null;
  }, [stream]);

  useEffect(() => {
    onRecordingChange?.(recording);
    if (!recording) lastCheckInRef.current = 0;
  }, [recording, onRecordingChange]);

  // Proactive check-ins every 5 minutes while recording, so it feels like WEROS is keeping watch
  // with you rather than a silent recorder you have to remember is even running.
  useEffect(() => {
    if (!recording) return;
    const elapsedCheckIns = Math.floor(elapsedMs / CHECK_IN_MS);
    if (elapsedCheckIns > 0 && elapsedCheckIns !== lastCheckInRef.current) {
      lastCheckInRef.current = elapsedCheckIns;
      const minutes = elapsedCheckIns * 5;
      speak(`Sigo grabando en modo testigo. Llevas ${minutes} minutos.`);
      notify('Modo testigo activo', `Llevas ${minutes} minutos grabando.`);
    }
  }, [elapsedMs, recording]);

  // Voice-assistant-driven start/stop (see VoiceAssistant) — "id" makes the same action twice in a
  // row (e.g. saying "activa modo testigo" again) still register as a fresh command.
  useEffect(() => {
    if (!command) return;
    if (command.action === 'start') start();
    else stop();
    onCommandConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command]);

  const shareClip = async () => {
    if (!clipUrl) return;
    const res = await fetch(clipUrl);
    const blob = await res.blob();
    const file = new File([blob], `weros-testigo-${Date.now()}.webm`, { type: blob.type || 'video/webm' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Grabación modo testigo — WEROS' });
      } catch {
        // user dismissed the native share sheet — the clip stays downloadable
      }
    }
  };

  return (
    <div className="witness">
      <div className="witness-head">
        <h2><Eye size={18} /> Modo testigo</h2>
        <p>Graba con la cámara trasera y el micrófono mientras caminas por una zona que te preocupa. La grabación se guarda en tu dispositivo — WEROS no la envía a nadie salvo que tú la compartas.</p>
      </div>

      <div className="witness-stage">
        {stream ? (
          <video ref={videoRef} autoPlay playsInline muted className="witness-video" />
        ) : (
          <div className="witness-placeholder"><Video size={32} /></div>
        )}
        {recording && (
          <div className="witness-rec-badge">
            <span className="rec-dot" /> GRABANDO <span className="mono">{formatElapsed(elapsedMs)}</span>
          </div>
        )}
      </div>

      {error && <p className="sos-error">{error}</p>}

      {!recording ? (
        <button className="witness-toggle start" onClick={start}>
          <Video size={16} /> Activar modo testigo
        </button>
      ) : (
        <button className="witness-toggle stop" onClick={stop}>
          Detener y guardar
        </button>
      )}

      {clipUrl && !recording && (
        <div className="witness-result">
          <p>Grabación de {formatElapsed(elapsedMs)} lista.</p>
          <div className="witness-result-actions">
            <a className="sos-download" href={clipUrl} download={`weros-testigo-${Date.now()}.webm`}>
              <Download size={14} /> Descargar
            </a>
            <button className="witness-share" onClick={shareClip}><Share2 size={14} /> Compartir</button>
          </div>
        </div>
      )}
    </div>
  );
}
