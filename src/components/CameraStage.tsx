import { type MouseEventHandler, type RefObject, useState } from 'react';
import { AlertTriangle, Heart, MapPin, Mic, MicOff, Radio, ShieldAlert, Sun, Timer, Trash2, Users } from 'lucide-react';
import type { AnalysisFrame, StoreZone } from '../types/analysis';
import { GESTURE_ICON } from '../engine/HandGestureEngine';
import { nowId } from '../utils/math';

interface Props {
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  frame?: AnalysisFrame;
  ready: boolean;
  error?: string;
  onStart: () => void;
  elapsedLabel: string;
  voiceActive: boolean;
  voiceError?: string;
  onToggleVoice: () => void;
  zones: StoreZone[];
  zoneOccupancy: Record<string, number>;
  editingZones: boolean;
  onToggleEditZones: () => void;
  onAddZone: (zone: StoreZone) => void;
  onDeleteZone: (id: string) => void;
}

const MIN_ZONE_SIZE = 0.03; // fraction of the video's shorter dimension — filters out accidental clicks

export function CameraStage({ videoRef, canvasRef, frame, ready, error, onStart, elapsedLabel, voiceActive, voiceError, onToggleVoice, zones, zoneOccupancy, editingZones, onToggleEditZones, onAddZone, onDeleteZone }: Props) {
  const vw = videoRef.current?.videoWidth || 1;
  const vh = videoRef.current?.videoHeight || 1;
  const gestures = (frame?.hands.gestures ?? []).filter((g) => g.name !== 'hand_near_face');
  const firewall = frame?.firewall ?? [];
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  // Zones are stored normalized 0-1 against raw (unmirrored) video space, same convention as
  // PersonTracker/FaceBox — the video itself is CSS-mirrored (scaleX(-1)), so a point the user
  // clicks on screen is in "displayed" space and needs un-mirroring on the X axis before saving,
  // and existing zones need the inverse transform to render back in the right spot on screen.
  const fractionFromEvent = (e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    };
  };

  const handlePointerDown: MouseEventHandler<HTMLDivElement> = (e) => {
    if (!editingZones) return;
    const p = fractionFromEvent(e);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const handlePointerMove: MouseEventHandler<HTMLDivElement> = (e) => {
    if (!drag) return;
    const p = fractionFromEvent(e);
    setDrag({ ...drag, x1: p.x, y1: p.y });
  };
  const handlePointerUp = () => {
    if (!drag) return;
    const dx0 = Math.min(drag.x0, drag.x1), dx1 = Math.max(drag.x0, drag.x1);
    const dy0 = Math.min(drag.y0, drag.y1), dy1 = Math.max(drag.y0, drag.y1);
    const width = dx1 - dx0, height = dy1 - dy0;
    setDrag(null);
    if (width < MIN_ZONE_SIZE || height < MIN_ZONE_SIZE) return;
    const name = window.prompt('Nombre de la zona (ej. "Sección sofás"):')?.trim();
    if (!name) return;
    onAddZone({ id: nowId(), name, x: 1 - dx1, y: dy0, width, height });
  };

  const dragPreviewStyle = drag ? {
    left: `${Math.min(drag.x0, drag.x1) * 100}%`,
    top: `${Math.min(drag.y0, drag.y1) * 100}%`,
    width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
    height: `${Math.abs(drag.y1 - drag.y0) * 100}%`
  } : undefined;

  return (
    <section className="stage">
      <video ref={videoRef} className="video" autoPlay muted playsInline />
      <canvas ref={canvasRef} className="overlay" />
      {ready && (
        <div
          className={`zone-layer ${editingZones ? 'editing' : ''}`}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={() => setDrag(null)}
        >
          {zones.map((z) => (
            <div key={z.id} className="store-zone" style={{ left: `${(1 - z.x - z.width) * 100}%`, top: `${z.y * 100}%`, width: `${z.width * 100}%`, height: `${z.height * 100}%` }}>
              <span className="store-zone-label">
                <MapPin size={11} /> {z.name} · {zoneOccupancy[z.id] ?? 0}
                {editingZones && (
                  <button
                    className="store-zone-delete"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onDeleteZone(z.id); }}
                    title="Borrar zona"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </span>
            </div>
          ))}
          {dragPreviewStyle && <div className="store-zone store-zone-draft" style={dragPreviewStyle} />}
        </div>
      )}
      {frame && frame.sceneMotion.heatmap.length > 0 && (
        <div className="scene-heatmap-overlay" style={{ gridTemplateColumns: `repeat(${frame.sceneMotion.gridW}, 1fr)` }} aria-hidden="true">
          {frame.sceneMotion.heatmap.map((v, i) => (
            <div key={i} className="heatmap-cell" style={{ opacity: Math.min(0.7, v / 4) }} />
          ))}
        </div>
      )}
      <div className="scan-line" aria-hidden="true" />

      {firewall.length > 0 && (
        <div className="firewall-banner">
          <ShieldAlert size={15} />
          FIREWALL EMOCIONAL — {firewall.map((f) => f.label).join(' · ')}
        </div>
      )}

      <div className="topbar">
        <div>
          <div className="brand">OJO DE SAURON</div>
          <div className="subtitle">Centro de análisis conductual en tiempo real</div>
        </div>
        <div className="topbar-right">
          {ready && (
            <button className={`voice-toggle ${editingZones ? 'active' : ''}`} onClick={onToggleEditZones} title={editingZones ? 'Terminar de editar zonas' : 'Dibujar zonas de la tienda (arrastrar sobre el video)'}>
              <MapPin size={13} /> {editingZones ? 'EDITANDO ZONAS' : 'ZONAS'}
            </button>
          )}
          {ready && (
            <button className={`voice-toggle ${voiceActive ? 'active' : ''}`} onClick={onToggleVoice} title={voiceActive ? 'Desactivar análisis de audio' : 'Activar análisis de audio (voz + sonido ambiente)'}>
              {voiceActive ? <Mic size={13} /> : <MicOff size={13} />} AUDIO
            </button>
          )}
          {ready && (
            <div className="rec-indicator">
              <span className="rec-dot" /> REC <span className="mono">{elapsedLabel}</span>
            </div>
          )}
          <div className="status-pill">
            {frame?.faceDetected
              ? `${frame.peopleDetected} ${frame.peopleDetected === 1 ? 'ROSTRO' : 'ROSTROS'} ACTIVO${frame.peopleDetected === 1 ? '' : 'S'}`
              : ready ? 'SIN ROSTRO' : 'INICIANDO'}
          </div>
        </div>
      </div>

      {ready && frame && (
        <div className="quality-badges">
          <span className={`quality-badge ${frame.dataQuality.ok ? 'ok' : 'warn'}`}>
            <Radio size={12} /> Señal {frame.dataQuality.label}
          </span>
          <span className={`quality-badge ${frame.lighting.ok ? 'ok' : 'warn'}`}>
            <Sun size={12} /> Luz {frame.lighting.label}
          </span>
          {frame.peopleDetected > 1 && (
            <span className="quality-badge ok">
              <Users size={12} /> {frame.peopleDetected} personas en cámara
            </span>
          )}
          {frame.heartRate.active && (
            <span className="quality-badge ok">
              <Heart size={12} /> {frame.heartRate.bpm} bpm
            </span>
          )}
          {!frame.framing.ok && (
            <span className="quality-badge warn">
              <AlertTriangle size={12} /> {frame.framing.label}
            </span>
          )}
          {voiceError && (
            <span className="quality-badge warn" title={voiceError}>
              <MicOff size={12} /> Micrófono bloqueado — ver pestaña Audio
            </span>
          )}
        </div>
      )}

      {!ready && !error && (
        <div className="center-card">
          <h1>Analysis Center</h1>
          <p>Activa la cámara para iniciar el análisis facial, gestual y conductual en tiempo real.</p>
          <button onClick={onStart}>Iniciar cámara</button>
        </div>
      )}
      {error && (
        <div className="center-card error-card">
          <h1>Error de cámara</h1>
          <p>{error}</p>
          <button onClick={onStart}>Reintentar</button>
        </div>
      )}

      <div className="gesture-layer">
        {gestures.map((g) => {
          const leftPct = 100 - (g.x / vw) * 100;
          const topPct = (g.y / vh) * 100;
          return (
            <div key={g.id} className="gesture-badge" style={{ left: `${leftPct}%`, top: `${topPct}%` }}>
              <span className="gesture-icon">{GESTURE_ICON[g.name]}</span>
              <span>{g.label}</span>
            </div>
          );
        })}
        {(frame?.objects ?? []).map((o) => {
          const cx = o.box.x + o.box.width / 2;
          const leftPct = 100 - (cx / vw) * 100;
          const topPct = (o.box.y / vh) * 100;
          return (
            <div key={o.id} className={`object-badge ${o.held ? 'held' : ''}`} style={{ left: `${leftPct}%`, top: `${topPct}%` }}>
              {o.held && '✋ '}{o.label}
            </div>
          );
        })}
      </div>

      <div className="alert-stack">
        {(frame?.alerts ?? []).slice(0, 3).map((a) => {
          const remaining = frame ? a.expiresAt - frame.timestamp : 1000;
          const opacity = Math.max(0, Math.min(1, remaining / 400));
          return (
            <div key={a.id} className={`alert-chip ${a.severity}`} style={{ opacity }}>
              <Timer size={13} />
              <strong>{a.text}</strong>
            </div>
          );
        })}
      </div>

      <div className="bottom-hud">
        <span>FPS {frame?.fps ?? 0}</span>
        <span>Landmarks {frame?.raw.landmarksCount ?? 0}</span>
        <span>{frame?.headPose.label ?? 'Sin datos'}</span>
        <span>Manos {frame?.hands.handsDetected ?? 0}</span>
        {voiceActive && frame && <span>Voz {frame.voice.speaking ? 'hablando' : 'silencio'}</span>}
        {voiceActive && frame?.sound.active && <span>Sonido: {frame.sound.topLabel}</span>}
      </div>
    </section>
  );
}
