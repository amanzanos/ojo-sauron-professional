import type { RefObject } from 'react';
import { AlertTriangle, Heart, Mic, MicOff, Radio, ShieldAlert, Sun, Timer, Users } from 'lucide-react';
import type { AnalysisFrame } from '../types/analysis';
import { GESTURE_ICON } from '../engine/HandGestureEngine';

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
}

export function CameraStage({ videoRef, canvasRef, frame, ready, error, onStart, elapsedLabel, voiceActive, voiceError, onToggleVoice }: Props) {
  const vw = videoRef.current?.videoWidth || 1;
  const vh = videoRef.current?.videoHeight || 1;
  const gestures = (frame?.hands.gestures ?? []).filter((g) => g.name !== 'hand_near_face');
  const firewall = frame?.firewall ?? [];

  return (
    <section className="stage">
      <video ref={videoRef} className="video" autoPlay muted playsInline />
      <canvas ref={canvasRef} className="overlay" />
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
