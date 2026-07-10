import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraStage } from './components/CameraStage';
import { SidePanel } from './components/SidePanel';
import { EMOTION_LABELS, FaceAnalysisEngine } from './engine/FaceAnalysisEngine';
import { FaceIdentityEngine } from './engine/FaceIdentityEngine';
import { HandGestureEngine } from './engine/HandGestureEngine';
import { ObjectDetectionEngine } from './engine/ObjectDetectionEngine';
import { PersonTracker } from './engine/PersonTracker';
import { EMPTY_VOICE, VoiceAnalysisEngine } from './engine/VoiceAnalysisEngine';
import type { AnalysisEvent, AnalysisFrame, FaceBox, PersonSummary } from './types/analysis';
import { clamp, nowId } from './utils/math';
import './styles/app.css';

function mergeEvents(a: AnalysisEvent[], b: AnalysisEvent[]) {
  const map = new Map<string, AnalysisEvent>();
  [...a, ...b].forEach((ev) => map.set(ev.id, ev));
  return [...map.values()].sort((x, y) => y.time - x.time).slice(0, 20);
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/** Crops a padded, mirrored (natural-looking) snapshot of a face region straight from the video element. */
function capturePhotoCanvas(video: HTMLVideoElement, box: FaceBox): HTMLCanvasElement {
  const padX = box.width * 0.35;
  const padY = box.height * 0.35;
  const sx = clamp(box.x - padX, 0, video.videoWidth);
  const sy = clamp(box.y - padY, 0, video.videoHeight);
  const sw = Math.min(box.width + padX * 2, video.videoWidth - sx);
  const sh = Math.min(box.height + padY * 2, video.videoHeight - sy);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, sw);
  canvas.height = Math.max(1, sh);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, -sw, 0, sw, sh);
    ctx.restore();
  }
  return canvas;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceEngine = useMemo(() => new FaceAnalysisEngine(), []);
  const handEngine = useMemo(() => new HandGestureEngine(), []);
  const objectEngine = useMemo(() => new ObjectDetectionEngine(), []);
  const personTracker = useMemo(() => new PersonTracker(), []);
  const identityEngine = useMemo(() => new FaceIdentityEngine(), []);
  const voiceEngine = useMemo(() => new VoiceAnalysisEngine(), []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceError, setVoiceError] = useState<string>();
  const [frame, setFrame] = useState<AnalysisFrame>();
  const [elapsed, setElapsed] = useState(0);
  const [gestureCounts, setGestureCounts] = useState<Record<string, number>>({});
  const [persons, setPersons] = useState<PersonSummary[]>([]);
  const [history, setHistory] = useState<Array<Record<string, number | string>>>([]);
  const raf = useRef<number>();
  const lastFaceBox = useRef<FaceBox | undefined>();
  const sessionStart = useRef(0);
  const extraEvents = useRef<AnalysisEvent[]>([]);
  const descriptorArchive = useRef<Array<{ id: string; descriptor: Float32Array }>>([]);
  const crossIncongruenceStart = useRef<number>();
  const lastCrossEventAt = useRef(0);

  const drawOverlay = useCallback((data: AnalysisFrame) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const rect = video.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!video.videoWidth) return;

    const sx = canvas.width / video.videoWidth;
    const sy = canvas.height / video.videoHeight;

    data.allFaces.forEach((face) => {
      const isPrimary = face.box === data.faceBox;
      const b = face.box;
      const w = b.width * sx;
      const h = b.height * sy;
      const x = canvas.width - b.x * sx - w; // mirror horizontally to match the mirrored video
      const y = b.y * sy;

      const color = isPrimary ? (data.dataQuality.ok ? 'rgba(240,180,41,0.9)' : 'rgba(239,68,68,0.85)') : 'rgba(255,255,255,0.3)';
      const len = Math.min(w, h) * (isPrimary ? 0.2 : 0.14);
      ctx.strokeStyle = color;
      ctx.lineWidth = isPrimary ? 2 : 1.3;
      ctx.lineJoin = 'round';

      const corner = (cx: number, cy: number, dx: number, dy: number) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy + dy * len);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + dx * len, cy);
        ctx.stroke();
      };
      corner(x, y, 1, 1);
      corner(x + w, y, -1, 1);
      corner(x, y + h, 1, -1);
      corner(x + w, y + h, -1, -1);

      if (isPrimary) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w / 2, y + h);
        ctx.moveTo(x, y + h / 2);
        ctx.lineTo(x + w, y + h / 2);
        ctx.stroke();
      }
    });

    ctx.strokeStyle = 'rgba(96,165,250,0.75)';
    ctx.lineWidth = 1.4;
    data.objects.forEach((obj) => {
      const w = obj.box.width * sx;
      const h = obj.box.height * sy;
      const x = canvas.width - obj.box.x * sx - w;
      const y = obj.box.y * sy;
      ctx.strokeRect(x, y, w, h);
    });
  }, []);

  /** Before minting a new person card, check whether this face matches someone already profiled this session (by appearance, not position) — fixes the same person getting split into duplicate identities after a brief look-away or occlusion. */
  const profilePerson = useCallback((personId: string, box: FaceBox, mood: string, moodScore: number, seenAgoMs: number) => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = capturePhotoCanvas(video, box);
    const photo = canvas.toDataURL('image/jpeg', 0.85);

    Promise.all([identityEngine.estimateAgeGender(canvas), identityEngine.computeDescriptor(canvas)]).then(([ageGender, descriptor]) => {
      if (descriptor) {
        const match = identityEngine.findMatch(descriptor, descriptorArchive.current);
        if (match) {
          personTracker.reassignId(personId, match.id);
          return; // same person as before — no duplicate card
        }
        descriptorArchive.current = [...descriptorArchive.current, { id: personId, descriptor }].slice(-40);
      }
      const summary: PersonSummary = {
        id: personId,
        photo,
        sex: ageGender?.sex ?? 'masculino',
        sexConfidence: ageGender?.sexConfidence ?? 0,
        age: ageGender?.age ?? 0,
        mood,
        moodScore,
        firstSeenAt: Date.now() - seenAgoMs
      };
      setPersons((prev) => [summary, ...prev].slice(0, 24));
      const ev: AnalysisEvent = { id: nowId(), time: Date.now(), severity: 'info', title: 'NUEVA PERSONA IDENTIFICADA', detail: `${summary.sex}, ~${summary.age} años, ánimo ${summary.mood.toLowerCase()}` };
      extraEvents.current = [ev, ...extraEvents.current].slice(0, 50);
    }).catch((err) => console.error('No se pudo estimar identidad/edad/sexo', err));
  }, [identityEngine, personTracker]);

  const loop = useCallback(() => {
    const video = videoRef.current;
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      try {
        const ts = performance.now();
        const handsFrame = handEngine.recognize(video, ts, lastFaceBox.current, video.videoWidth, video.videoHeight);
        const data = faceEngine.analyze(video, video.videoWidth, video.videoHeight, handsFrame);
        lastFaceBox.current = data.faceBox;

        const objects = objectEngine.detect(video, ts);
        const voice = voiceActive ? voiceEngine.sample(ts) : EMPTY_VOICE;

        const { ready: readyPersons } = personTracker.update(data.allFaces, ts);
        readyPersons.forEach((p) => {
          personTracker.markProfiled(p.id);
          const { mood, score } = personTracker.moodSummary(p);
          profilePerson(p.id, p.bestBox, EMOTION_LABELS[mood], score, ts - p.firstSeenTs);
        });

        // Cross-modal check: a calm/positive face with sustained high vocal tension (or vice versa)
        // reads as an incongruence between what's shown and what's said.
        if (voice.active && voice.speaking) {
          const calmFace = (data.dominantEmotion.name === 'happy' || data.dominantEmotion.name === 'neutral') && data.dominantEmotion.score > 40;
          const tenseVoice = voice.vocalTension > 65;
          if (calmFace && tenseVoice) {
            crossIncongruenceStart.current ??= ts;
            if (ts - crossIncongruenceStart.current > 4000 && ts - lastCrossEventAt.current > 30000) {
              lastCrossEventAt.current = ts;
              const ev: AnalysisEvent = { id: nowId(), time: Date.now(), severity: 'warning', title: 'INCONGRUENCIA EXPRESIÓN-VOZ', detail: 'Expresión facial calmada pero tono de voz tenso de forma sostenida' };
              extraEvents.current = [ev, ...extraEvents.current].slice(0, 50);
            }
          } else {
            crossIncongruenceStart.current = undefined;
          }
        }

        const merged: AnalysisFrame = {
          ...data,
          objects,
          voice,
          events: mergeEvents(mergeEvents(mergeEvents(data.events, handEngine.getEvents()), objectEngine.getEvents()), extraEvents.current)
        };
        setFrame(merged);
        setElapsed((ts - sessionStart.current) / 1000);
        setGestureCounts({ ...handEngine.getCounts() });
        drawOverlay(merged);
        const value = (key: string) => merged.metrics.find((m) => m.key === key)?.value ?? 0;
        setHistory((h) => [...h.slice(-90), {
          t: new Date().toLocaleTimeString(),
          atencion: value('attention'),
          tension: value('tension'),
          nervios: value('nervousness'),
          compromiso: value('engagementIndex'),
          estres: value('stressIndex')
        }]);
      } catch (err) {
        console.error(err);
      }
    }
    raf.current = requestAnimationFrame(loop);
  }, [drawOverlay, faceEngine, handEngine, objectEngine, personTracker, profilePerson, voiceActive, voiceEngine]);

  const start = useCallback(async () => {
    setError(undefined);
    try {
      await Promise.all([faceEngine.init(), handEngine.init(), objectEngine.init(), identityEngine.init()]);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      sessionStart.current = performance.now();
      setReady(true);
      raf.current = requestAnimationFrame(loop);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la cámara');
    }
  }, [faceEngine, handEngine, objectEngine, identityEngine, loop]);

  const toggleVoice = useCallback(async () => {
    setVoiceError(undefined);
    if (voiceActive) {
      voiceEngine.stop();
      setVoiceActive(false);
      return;
    }
    try {
      await voiceEngine.start();
      setVoiceActive(true);
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : 'No se pudo activar el micrófono');
    }
  }, [voiceActive, voiceEngine]);

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    const stream = videoRef.current?.srcObject as MediaStream | undefined;
    stream?.getTracks().forEach((t) => t.stop());
    voiceEngine.stop();
  }, [voiceEngine]);

  return (
    <main className="app-shell">
      <CameraStage
        videoRef={videoRef}
        canvasRef={canvasRef}
        frame={frame}
        ready={ready}
        error={error}
        onStart={start}
        elapsedLabel={formatElapsed(elapsed)}
        voiceActive={voiceActive}
        voiceError={voiceError}
        onToggleVoice={toggleVoice}
      />
      <SidePanel frame={frame} history={history} gestureCounts={gestureCounts} persons={persons} voiceActive={voiceActive} onToggleVoice={toggleVoice} />
    </main>
  );
}
