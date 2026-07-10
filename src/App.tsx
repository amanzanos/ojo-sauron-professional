import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraStage } from './components/CameraStage';
import { SidePanel } from './components/SidePanel';
import { AgeGenderEngine } from './engine/AgeGenderEngine';
import { EMOTION_LABELS, FaceAnalysisEngine } from './engine/FaceAnalysisEngine';
import { HandGestureEngine } from './engine/HandGestureEngine';
import { PersonTracker } from './engine/PersonTracker';
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
  const personTracker = useMemo(() => new PersonTracker(), []);
  const ageGenderEngine = useMemo(() => new AgeGenderEngine(), []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [frame, setFrame] = useState<AnalysisFrame>();
  const [elapsed, setElapsed] = useState(0);
  const [gestureCounts, setGestureCounts] = useState<Record<string, number>>({});
  const [persons, setPersons] = useState<PersonSummary[]>([]);
  const [history, setHistory] = useState<Array<Record<string, number | string>>>([]);
  const raf = useRef<number>();
  const lastFaceBox = useRef<FaceBox | undefined>();
  const sessionStart = useRef(0);
  const extraEvents = useRef<AnalysisEvent[]>([]);

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
  }, []);

  const profilePerson = useCallback((personId: string, box: FaceBox, mood: string, moodScore: number, seenAgoMs: number) => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = capturePhotoCanvas(video, box);
    const photo = canvas.toDataURL('image/jpeg', 0.85);
    ageGenderEngine.estimate(canvas).then((res) => {
      const summary: PersonSummary = {
        id: personId,
        photo,
        sex: res?.sex ?? 'masculino',
        sexConfidence: res?.sexConfidence ?? 0,
        age: res?.age ?? 0,
        mood,
        moodScore,
        firstSeenAt: Date.now() - seenAgoMs
      };
      setPersons((prev) => [summary, ...prev].slice(0, 24));
      const ev: AnalysisEvent = { id: nowId(), time: Date.now(), severity: 'info', title: 'NUEVA PERSONA IDENTIFICADA', detail: `${summary.sex}, ~${summary.age} años, ánimo ${summary.mood.toLowerCase()}` };
      extraEvents.current = [ev, ...extraEvents.current].slice(0, 50);
    }).catch((err) => console.error('No se pudo estimar edad/sexo', err));
  }, [ageGenderEngine]);

  const loop = useCallback(() => {
    const video = videoRef.current;
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      try {
        const ts = performance.now();
        const handsFrame = handEngine.recognize(video, ts, lastFaceBox.current, video.videoWidth, video.videoHeight);
        const data = faceEngine.analyze(video, video.videoWidth, video.videoHeight, handsFrame);
        lastFaceBox.current = data.faceBox;

        const { ready: readyPersons } = personTracker.update(data.allFaces, ts);
        readyPersons.forEach((p) => {
          personTracker.markProfiled(p.id);
          const { mood, score } = personTracker.moodSummary(p);
          profilePerson(p.id, p.bestBox, EMOTION_LABELS[mood], score, ts - p.firstSeenTs);
        });

        const merged: AnalysisFrame = { ...data, events: mergeEvents(mergeEvents(data.events, handEngine.getEvents()), extraEvents.current) };
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
  }, [drawOverlay, faceEngine, handEngine, personTracker, profilePerson]);

  const start = useCallback(async () => {
    setError(undefined);
    try {
      await Promise.all([faceEngine.init(), handEngine.init(), ageGenderEngine.init()]);
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
  }, [ageGenderEngine, faceEngine, handEngine, loop]);

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    const stream = videoRef.current?.srcObject as MediaStream | undefined;
    stream?.getTracks().forEach((t) => t.stop());
  }, []);

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
      />
      <SidePanel frame={frame} history={history} gestureCounts={gestureCounts} persons={persons} />
    </main>
  );
}
