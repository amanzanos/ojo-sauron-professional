import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Map as MapIcon, Radar, Rss, Wrench } from 'lucide-react';
import { AlertButton } from './components/AlertButton';
import { CameraStage } from './components/CameraStage';
import { CityMap } from './components/CityMap';
import { DailyGreeting } from './components/DailyGreeting';
import { Feed } from './components/Feed';
import { SidePanel } from './components/SidePanel';
import { ToolsHub } from './components/ToolsHub';
import { VoiceAssistant } from './components/VoiceAssistant';
import { WitnessMode } from './components/WitnessMode';
import { AmbientVisionEngine } from './engine/AmbientVisionEngine';
import { EMOTION_LABELS, FaceAnalysisEngine } from './engine/FaceAnalysisEngine';
import { FaceIdentityEngine } from './engine/FaceIdentityEngine';
import { HandGestureEngine } from './engine/HandGestureEngine';
import { HeartRateEngine } from './engine/HeartRateEngine';
import { classifyRoomType, computeClutterScore, ObjectDetectionEngine } from './engine/ObjectDetectionEngine';
import { PersonTracker, type TrackedPerson } from './engine/PersonTracker';
import { EMPTY_SCENE_MOTION, SceneMotionEngine } from './engine/SceneMotionEngine';
import { EMPTY_SOUND, SoundClassificationEngine } from './engine/SoundClassificationEngine';
import { EMPTY_VOICE, VoiceAnalysisEngine } from './engine/VoiceAnalysisEngine';
import { VoiceIdentityEngine } from './engine/VoiceIdentityEngine';
import { ZoneAnalyticsEngine } from './engine/ZoneAnalyticsEngine';
import type { AnalysisEvent, AnalysisFrame, EmotionName, EnvironmentReport, FaceBox, ObjectInventoryEntry, PersonSummary, SessionReport, SocialFrame, SoundCategoryStat, SoundLogEntry, StoreZone, VoiceProfile, ZoneStats } from './types/analysis';
import type { CitizenCategory, CitizenEvent } from './types/citizen';
import { categoryMeta } from './types/citizen';
import { useBatteryAlert } from './hooks/useBatteryAlert';
import { useDrivingMode } from './hooks/useDrivingMode';
import { useGeofenceWatcher } from './hooks/useGeofenceWatcher';
import { usePatrolScheduler } from './hooks/usePatrolScheduler';
import { getRearCameraStream } from './utils/camera';
import { dispatchDistressSound } from './utils/distressBus';
import { createEvent, fetchEvents } from './utils/eventStorage';
import { distanceMeters, getCurrentPosition, type GeoPoint } from './utils/geo';
import { clamp, nowId } from './utils/math';
import { notify } from './utils/notify';
import { speak } from './utils/tts';
import { isToolEnabled } from './utils/toolPrefs';
import { loadGeofences } from './utils/geofenceStorage';
import { fetchTodayStats, fetchZones, reportVisit, saveZones, type ZoneServerStats } from './utils/zoneStorage';
import './styles/app.css';

type WerosTab = 'feed' | 'mapa' | 'testigo' | 'camara' | 'tools';

function mergeEvents(a: AnalysisEvent[], b: AnalysisEvent[]) {
  const map = new Map<string, AnalysisEvent>();
  [...a, ...b].forEach((ev) => map.set(ev.id, ev));
  return [...map.values()].sort((x, y) => y.time - x.time).slice(0, 20);
}

function describeMicError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : undefined;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'NotReadableError' || name === 'SecurityError') {
    return 'El sistema está bloqueando el micrófono. En Mac: 1) revisa el icono de permisos junto a la URL del navegador y permite el micrófono para este sitio; 2) abre Ajustes del Sistema → Privacidad y seguridad → Micrófono y activa la casilla de tu navegador; 3) cierra y vuelve a abrir el navegador y recarga esta página.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No se detectó ningún micrófono conectado.';
  }
  return e instanceof Error ? e.message : 'No se pudo activar el micrófono';
}

function emptySessionReport(): SessionReport {
  return {
    durationMs: 0, avgAttention: 0, avgStress: 0, avgEngagement: 0,
    emotionTimeMs: { neutral: 0, happy: 0, sad: 0, angry: 0, surprised: 0, fearful: 0, disgusted: 0 },
    totalSpeakingMs: 0, hesitations: 0,
    alertCounts: { info: 0, positive: 0, warning: 0, critical: 0 }
  };
}

function emptyEnvironmentReport(): EnvironmentReport {
  return {
    trafficIndex: 0, ambientNoise: 0, avgOccupancy: 0, peakOccupancy: 0, emptyTimeMs: 0, overallMotion: 0,
    workSessions: 0, breaksCount: 0, avgWorkSessionMs: 0, avgBreakMs: 0, currentState: 'sin_datos',
    roomType: 'sin_datos', clutterScore: 0
  };
}

const MOOD_MIRROR_PHRASES: Partial<Record<EmotionName, { text: string; query: string }>> = {
  happy: { text: 'Te veo animado. Te dejo un poco de música alegre.', query: 'pop feliz' },
  sad: { text: 'Pareces un poco decaído. Te pongo algo relajante.', query: 'musica relajante' },
  angry: { text: 'Te noto tenso. Aquí tienes algo para bajar el ritmo.', query: 'musica calmada' }
};

const SOCIAL_LABELS: Record<SocialFrame['mode'], string> = {
  conversacion: 'Conversación activa',
  coexistencia: 'Coexistencia sin interacción',
  monologo: 'Monólogo / dictado',
  silencio: 'Silencio',
  sin_datos: 'Sin datos'
};

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
  const soundEngine = useMemo(() => new SoundClassificationEngine(), []);
  const heartRateEngine = useMemo(() => new HeartRateEngine(), []);
  const sceneMotionEngine = useMemo(() => new SceneMotionEngine(), []);
  const voiceIdentityEngine = useMemo(() => new VoiceIdentityEngine(), []);
  const ambientEngine = useMemo(() => new AmbientVisionEngine(), []);
  const zoneEngine = useMemo(() => new ZoneAnalyticsEngine(), []);
  const [tab, setTab] = useState<WerosTab>('feed');
  const [citizenEvents, setCitizenEvents] = useState<CitizenEvent[]>([]);
  const [witnessCommand, setWitnessCommand] = useState<{ action: 'start' | 'stop'; id: number }>();
  const handleWitnessCommand = useCallback((action: 'start' | 'stop') => setWitnessCommand({ action, id: Date.now() }), []);
  const [witnessRecording, setWitnessRecording] = useState(false);
  const driving = useDrivingMode();
  const geofenceWatcher = useGeofenceWatcher();
  const batteryAlert = useBatteryAlert();
  const lastMoodSpeakAt = useRef(0);

  useEffect(() => {
    if (isToolEnabled('drivingMode')) driving.start();
    if (isToolEnabled('geofences') && loadGeofences().some((g) => g.active)) geofenceWatcher.start();
    if (isToolEnabled('batteryAlert')) batteryAlert.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  usePatrolScheduler(witnessRecording, () => { setTab('testigo'); handleWitnessCommand('start'); }, () => handleWitnessCommand('stop'));

  const knownEventIds = useRef<Set<string>>(new Set());
  const hasLoadedEventsOnce = useRef(false);
  const cachedPosition = useRef<{ point: GeoPoint; at: number }>();
  const [zones, setZones] = useState<StoreZone[]>([]);
  const [editingZones, setEditingZones] = useState(false);
  const [zoneOccupancy, setZoneOccupancy] = useState<Record<string, number>>({});
  const [zoneServerStats, setZoneServerStats] = useState<ZoneServerStats[]>([]);
  const zoneStats = useMemo<ZoneStats[]>(
    () => zoneServerStats.map((s) => ({ ...s, currentOccupancy: zoneOccupancy[s.zoneId] ?? 0 })),
    [zoneServerStats, zoneOccupancy]
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceError, setVoiceError] = useState<string>();
  const [frame, setFrame] = useState<AnalysisFrame>();
  const [elapsed, setElapsed] = useState(0);
  const [gestureCounts, setGestureCounts] = useState<Record<string, number>>({});
  const [persons, setPersons] = useState<PersonSummary[]>([]);
  const [objectInventory, setObjectInventory] = useState<ObjectInventoryEntry[]>([]);
  const [soundLog, setSoundLog] = useState<SoundLogEntry[]>([]);
  const [soundStats, setSoundStats] = useState<SoundCategoryStat[]>([]);
  const [sessionReport, setSessionReport] = useState<SessionReport>(emptySessionReport());
  const [environmentReport, setEnvironmentReport] = useState<EnvironmentReport>(emptyEnvironmentReport());
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [history, setHistory] = useState<Array<Record<string, number | string>>>([]);
  const raf = useRef<number>();
  const lastFaceBox = useRef<FaceBox | undefined>();
  const sessionStart = useRef(0);
  const extraEvents = useRef<AnalysisEvent[]>([]);
  const descriptorArchive = useRef<Array<{ id: string; descriptor: Float32Array }>>([]);
  const crossIncongruenceStart = useRef<number>();
  const lastCrossEventAt = useRef(0);
  const seenEventIds = useRef(new Set<string>());
  const wasSpeakingRef = useRef(false);
  const utteranceStartRef = useRef<number>();
  const activeSpeakerLabelRef = useRef('');
  const recentVoiceActivity = useRef<Array<{ id: string; ts: number }>>([]);
  const prevPersonIds = useRef(new Set<string>());
  const seenDoorEventIds = useRef(new Set<string>());
  const seenDistressEventIds = useRef(new Set<string>());
  const lastDistressDispatchAt = useRef(0);
  const doorOpenAt = useRef(0);
  const lastPersonEnteredEventAt = useRef(0);
  const voiceNoPersonStart = useRef<number>();
  const lastVoiceNoPersonEventAt = useRef(0);
  const soundNoPersonStart = useRef<number>();
  const lastSoundNoPersonEventAt = useRef(0);
  const lastZoneStatsFetchRef = useRef(0);
  const sessionAccum = useRef({
    lastTs: 0,
    attentionSum: 0, stressSum: 0, engagementSum: 0, sampleCount: 0,
    emotionTimeMs: { neutral: 0, happy: 0, sad: 0, angry: 0, surprised: 0, fearful: 0, disgusted: 0 } as Record<EmotionName, number>,
    totalSpeakingMs: 0,
    alertCounts: { info: 0, positive: 0, warning: 0, critical: 0 } as SessionReport['alertCounts'],
    hrSum: 0, hrCount: 0, hrMin: Infinity, hrMax: -Infinity,
    peopleSum: 0, peopleSamples: 0, peoplePeak: 0, emptyMs: 0,
    lastPresent: undefined as boolean | undefined, presenceSince: 0,
    workSessions: 0, workSessionMsSum: 0, breaksCount: 0, breakMsSum: 0,
    lastFlush: 0
  });

  const drawOverlay = useCallback((data: AnalysisFrame, persons: TrackedPerson[]) => {
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

    // Recent movement path per person (session-scoped id, cleared once they leave frame) — a
    // faint mirrored polyline, same coordinate convention as the face/object boxes below.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    persons.forEach((p) => {
      if (p.trail.length < 2) return;
      let hash = 0;
      for (let i = 0; i < p.id.length; i++) hash = (hash * 31 + p.id.charCodeAt(i)) >>> 0;
      const hue = hash % 360;
      ctx.strokeStyle = `hsla(${hue}, 80%, 65%, 0.55)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      p.trail.forEach((pt, i) => {
        const x = canvas.width - pt.x * sx;
        const y = pt.y * sy;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

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

    ctx.lineWidth = 1.4;
    data.objects.forEach((obj) => {
      const w = obj.box.width * sx;
      const h = obj.box.height * sy;
      const x = canvas.width - obj.box.x * sx - w;
      const y = obj.box.y * sy;
      ctx.strokeStyle = obj.held ? 'rgba(34,197,94,0.85)' : 'rgba(96,165,250,0.6)';
      ctx.strokeRect(x, y, w, h);
    });
  }, []);

  /**
   * Before minting a new person card, check whether this face matches someone already profiled
   * this session (by appearance, not position) — fixes the same person getting split into
   * duplicate identities after a brief look-away or occlusion. If a card for this id already
   * exists (a long-staying person being periodically re-profiled), it's refreshed in place
   * instead of adding a duplicate.
   */
  const profilePerson = useCallback((personId: string, box: FaceBox, mood: string, moodScore: number, seenAgoMs: number) => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = capturePhotoCanvas(video, box);
    const photo = canvas.toDataURL('image/jpeg', 0.85);

    Promise.all([identityEngine.estimateAgeGender(canvas), identityEngine.computeDescriptor(canvas)]).then(([ageGender, descriptor]) => {
      if (descriptor) {
        const match = identityEngine.findMatch(descriptor, descriptorArchive.current);
        if (match && match.id !== personId) {
          personTracker.reassignId(personId, match.id, performance.now());
          return; // same person as before — no duplicate card
        }
        if (!match) descriptorArchive.current = [...descriptorArchive.current, { id: personId, descriptor }].slice(-40);
      }
      let wasUpdate = false;
      setPersons((prev) => {
        const existing = prev.find((p) => p.id === personId);
        wasUpdate = !!existing;
        const summary: PersonSummary = {
          id: personId,
          photo,
          sex: ageGender?.sex ?? existing?.sex ?? 'masculino',
          sexConfidence: ageGender?.sexConfidence ?? existing?.sexConfidence ?? 0,
          age: ageGender?.age ?? existing?.age ?? 0,
          mood,
          moodScore,
          firstSeenAt: existing?.firstSeenAt ?? Date.now() - seenAgoMs
        };
        if (existing) return prev.map((p) => (p.id === personId ? summary : p));
        return [summary, ...prev].slice(0, 24);
      });
      const ev: AnalysisEvent = {
        id: nowId(), time: Date.now(),
        severity: 'info',
        title: wasUpdate ? 'FICHA DE PERSONA ACTUALIZADA' : 'NUEVA PERSONA IDENTIFICADA',
        detail: `${ageGender?.sex ?? ''}, ~${ageGender?.age ?? '?'} años, ánimo ${mood.toLowerCase()}`
      };
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

        const objects = objectEngine.detect(video, ts, handsFrame.handPositions);
        const voice = voiceActive ? voiceEngine.sample(ts) : EMPTY_VOICE;
        const sound = voiceActive ? soundEngine.classifyTick(ts) : EMPTY_SOUND;
        const heartRate = heartRateEngine.sample(video, data.faceBox, ts, data.raw.motion);
        const sceneMotion = sceneMotionEngine.sample(video);
        const ambient = ambientEngine.sample(video, data.faceBox, ts);

        // Speaker recognition: identify the voice once an utterance ends (not per-frame — the
        // fingerprint is only meaningful averaged over a whole turn of speech).
        if (voice.speaking && !wasSpeakingRef.current) utteranceStartRef.current = ts;
        if (voice.justStoppedSpeaking) {
          const durationMs = utteranceStartRef.current ? ts - utteranceStartRef.current : 0;
          const speakerLabel = voiceIdentityEngine.identify(voice.fingerprint, voice.utterancePitchHz, durationMs, ts);
          if (speakerLabel) {
            activeSpeakerLabelRef.current = speakerLabel;
            recentVoiceActivity.current = [...recentVoiceActivity.current, { id: speakerLabel, ts }].filter((v) => ts - v.ts < 30000);
            setVoiceProfiles(voiceIdentityEngine.getProfiles());
          }
        }
        wasSpeakingRef.current = voice.speaking;
        voice.activeSpeakerLabel = activeSpeakerLabelRef.current;

        const activeVoiceCount = new Set(recentVoiceActivity.current.filter((v) => ts - v.ts < 30000).map((v) => v.id)).size;
        const socialMode: SocialFrame['mode'] = data.peopleDetected >= 2 && activeVoiceCount >= 2
          ? 'conversacion'
          : data.peopleDetected >= 2
            ? 'coexistencia'
            : data.peopleDetected === 1 && voice.speaking
              ? 'monologo'
              : voiceActive
                ? 'silencio'
                : 'sin_datos';
        const social: SocialFrame = { mode: socialMode, label: SOCIAL_LABELS[socialMode], activeVoices: activeVoiceCount };

        const { all: allPersons, ready: readyPersons } = personTracker.update(data.allFaces, ts);
        readyPersons.forEach((p) => {
          personTracker.markProfiled(p.id, ts);
          const { mood, score } = personTracker.moodSummary(p);
          profilePerson(p.id, p.bestBox, EMOTION_LABELS[mood], score, ts - p.firstSeenTs);
        });

        // Anonymous zone occupancy — never records which person visited which zone, only counts/durations.
        const { occupancy, closedVisits } = zoneEngine.update(allPersons, ts, video.videoWidth, video.videoHeight);
        setZoneOccupancy(occupancy);
        closedVisits.forEach((v) => reportVisit(v.zoneId, v.dwellMs));
        if (ts - lastZoneStatsFetchRef.current > 5000) {
          lastZoneStatsFetchRef.current = ts;
          fetchTodayStats().then(setZoneServerStats).catch((err) => console.error('No se pudieron cargar las estadísticas de zona', err));
        }

        // Fusión: sonido de puerta/timbre reciente + persona nueva en escena = "alguien entró".
        soundEngine.getEvents().forEach((ev) => {
          if (seenDoorEventIds.current.has(ev.id)) return;
          seenDoorEventIds.current.add(ev.id);
          if (ev.title.includes('PUERTA') || ev.title.includes('TIMBRE')) doorOpenAt.current = ts;
        });

        // Sonido de auxilio (grito, disparo, explosión) sostenido en el ambiente: dispara el flujo
        // de alerta SOS automático (con cuenta atrás cancelable, ver AlertButton) en vez de esperar
        // a que alguien pueda tocar el botón.
        const DISTRESS_LABELS = ['GRITO', 'DISPARO', 'EXPLOSIÓN'];
        soundEngine.getEvents().forEach((ev) => {
          if (seenDistressEventIds.current.has(ev.id)) return;
          seenDistressEventIds.current.add(ev.id);
          const match = DISTRESS_LABELS.find((l) => ev.title.includes(l));
          if (match && ts - lastDistressDispatchAt.current > 20000) {
            lastDistressDispatchAt.current = ts;
            dispatchDistressSound(match === 'GRITO' ? 'grito' : match === 'DISPARO' ? 'disparo' : 'explosión');
          }
        });
        const currentPersonIds = new Set(allPersons.map((p) => p.id));
        const hasNewPerson = [...currentPersonIds].some((id) => !prevPersonIds.current.has(id));
        if (hasNewPerson && doorOpenAt.current && ts - doorOpenAt.current < 8000 && ts - lastPersonEnteredEventAt.current > 15000) {
          lastPersonEnteredEventAt.current = ts;
          const ev: AnalysisEvent = { id: nowId(), time: Date.now(), severity: 'info', title: 'ALGUIEN ENTRÓ', detail: 'Sonido de puerta/timbre seguido de la aparición de una persona nueva' };
          extraEvents.current = [ev, ...extraEvents.current].slice(0, 50);
        }
        prevPersonIds.current = currentPersonIds;

        // Fusión: voz detectada pero nadie visible en cámara, sostenido.
        if (voice.active && voice.speaking && data.peopleDetected === 0) {
          voiceNoPersonStart.current ??= ts;
          if (ts - voiceNoPersonStart.current > 4000 && ts - lastVoiceNoPersonEventAt.current > 30000) {
            lastVoiceNoPersonEventAt.current = ts;
            const ev: AnalysisEvent = { id: nowId(), time: Date.now(), severity: 'info', title: 'VOZ SIN PERSONA VISIBLE', detail: 'Se detecta voz pero no hay ninguna persona en el encuadre' };
            extraEvents.current = [ev, ...extraEvents.current].slice(0, 50);
          }
        } else {
          voiceNoPersonStart.current = undefined;
        }

        // Fusión: sonido no-silencio sostenido sin nadie presente = posible aparato sin supervisión.
        if (sound.active && sound.topLabel && sound.topLabel !== 'Silencio' && data.peopleDetected === 0) {
          soundNoPersonStart.current ??= ts;
          if (ts - soundNoPersonStart.current > 60000 && ts - lastSoundNoPersonEventAt.current > 90000) {
            lastSoundNoPersonEventAt.current = ts;
            const ev: AnalysisEvent = { id: nowId(), time: Date.now(), severity: 'info', title: 'SONIDO CONTINUO SIN NADIE PRESENTE', detail: `"${sound.topLabel}" sostenido durante más de un minuto sin ninguna persona en cámara` };
            extraEvents.current = [ev, ...extraEvents.current].slice(0, 50);
          }
        } else {
          soundNoPersonStart.current = undefined;
        }

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

        const combinedEvents = [data.events, handEngine.getEvents(), objectEngine.getEvents(), soundEngine.getEvents(), voiceEngine.getEvents(), ambientEngine.getEvents(), extraEvents.current]
          .reduce((acc, evs) => mergeEvents(acc, evs), [] as AnalysisEvent[]);
        const merged: AnalysisFrame = { ...data, objects, voice, sound, heartRate, sceneMotion, ambient, social, events: combinedEvents };
        setFrame(merged);

        // Espejo de ánimo: an occasional, opt-in spoken observation + a mood-matched Spotify
        // search — only for moods worth commenting on, throttled hard so it reads as a check-in,
        // not a running commentary track.
        if (isToolEnabled('moodMirror') && data.peopleDetected === 1) {
          const mood = MOOD_MIRROR_PHRASES[merged.dominantEmotion.name];
          if (mood && merged.dominantEmotion.score > 55 && ts - lastMoodSpeakAt.current > 180000) {
            lastMoodSpeakAt.current = ts;
            speak(mood.text);
            window.open(`https://open.spotify.com/search/${encodeURIComponent(mood.query)}`, '_blank', 'noopener,noreferrer');
          }
        }

        // Luz ambiente -> brillo automático: nudges the camera preview's brightness with the
        // room's actual light level (from AmbientVisionEngine's luma reading), instead of a fixed
        // filter value — subtle, and only while this tab/tool is actually on.
        if (isToolEnabled('autoBrightness')) {
          document.documentElement.style.setProperty('--auto-brightness', (0.85 + (merged.ambient.lux / 100) * 0.3).toFixed(2));
        }
        setElapsed((ts - sessionStart.current) / 1000);
        setGestureCounts({ ...handEngine.getCounts() });
        const inventory = objectEngine.getInventory();
        setObjectInventory(inventory);
        if (voiceActive) {
          setSoundLog(soundEngine.getLog());
          setSoundStats(soundEngine.getStats());
        }
        drawOverlay(merged, allPersons);
        const value = (key: string) => merged.metrics.find((m) => m.key === key)?.value ?? 0;
        setHistory((h) => [...h.slice(-90), {
          t: new Date().toLocaleTimeString(),
          atencion: value('attention'),
          tension: value('tension'),
          nervios: value('nervousness'),
          compromiso: value('engagementIndex'),
          estres: value('stressIndex')
        }]);

        // Session-long analytics: accumulated incrementally each tick (cheap arithmetic on the
        // frame delta) and flushed to React state roughly once a second, not every frame.
        const acc = sessionAccum.current;
        const dt = acc.lastTs ? ts - acc.lastTs : 0;
        acc.lastTs = ts;
        if (dt > 0 && dt < 1000) {
          acc.emotionTimeMs[merged.dominantEmotion.name] += dt;
          if (voice.speaking) acc.totalSpeakingMs += dt;
          if (data.peopleDetected === 0) acc.emptyMs += dt;
        }
        acc.peopleSum += data.peopleDetected;
        acc.peopleSamples += 1;
        acc.peoplePeak = Math.max(acc.peoplePeak, data.peopleDetected);

        // Work/rest rhythm: a session-worthy break only counts once absence has held for a while
        // (≥60s) so a momentary look-away isn't mistaken for stepping out; a work session is
        // logged once presence ends, so long as it lasted a few seconds.
        const present = data.peopleDetected > 0;
        if (acc.lastPresent === undefined) { acc.lastPresent = present; acc.presenceSince = ts; }
        if (present !== acc.lastPresent) {
          const durationMs = ts - acc.presenceSince;
          if (acc.lastPresent && durationMs > 5000) { acc.workSessions += 1; acc.workSessionMsSum += durationMs; }
          if (!acc.lastPresent && durationMs > 60000) { acc.breaksCount += 1; acc.breakMsSum += durationMs; }
          acc.lastPresent = present;
          acc.presenceSince = ts;
        }
        acc.attentionSum += value('attention');
        acc.stressSum += value('stressIndex');
        acc.engagementSum += value('engagementIndex');
        acc.sampleCount += 1;
        if (heartRate.active) {
          acc.hrSum += heartRate.bpm;
          acc.hrCount += 1;
          acc.hrMin = Math.min(acc.hrMin, heartRate.bpm);
          acc.hrMax = Math.max(acc.hrMax, heartRate.bpm);
        }
        combinedEvents.forEach((ev) => {
          if (seenEventIds.current.has(ev.id)) return;
          seenEventIds.current.add(ev.id);
          acc.alertCounts[ev.severity] += 1;
        });
        if (ts - acc.lastFlush > 1000) {
          acc.lastFlush = ts;
          setSessionReport({
            durationMs: ts - sessionStart.current,
            avgAttention: acc.sampleCount ? Math.round(acc.attentionSum / acc.sampleCount) : 0,
            avgStress: acc.sampleCount ? Math.round(acc.stressSum / acc.sampleCount) : 0,
            avgEngagement: acc.sampleCount ? Math.round(acc.engagementSum / acc.sampleCount) : 0,
            emotionTimeMs: { ...acc.emotionTimeMs },
            totalSpeakingMs: acc.totalSpeakingMs,
            hesitations: voice.totalHesitations,
            alertCounts: { ...acc.alertCounts },
            heartRateAvg: acc.hrCount ? Math.round(acc.hrSum / acc.hrCount) : undefined,
            heartRateRange: acc.hrCount ? [acc.hrMin, acc.hrMax] : undefined
          });
          setEnvironmentReport({
            trafficIndex: soundEngine.getTrafficIndex(),
            ambientNoise: voice.ambientNoise,
            avgOccupancy: acc.peopleSamples ? Math.round((acc.peopleSum / acc.peopleSamples) * 10) / 10 : 0,
            peakOccupancy: acc.peoplePeak,
            emptyTimeMs: acc.emptyMs,
            overallMotion: sceneMotion.overallMotion,
            workSessions: acc.workSessions,
            breaksCount: acc.breaksCount,
            avgWorkSessionMs: acc.workSessions ? Math.round(acc.workSessionMsSum / acc.workSessions) : 0,
            avgBreakMs: acc.breaksCount ? Math.round(acc.breakMsSum / acc.breaksCount) : 0,
            currentState: acc.lastPresent === undefined ? 'sin_datos' : acc.lastPresent ? 'trabajando' : 'descanso',
            roomType: classifyRoomType(inventory),
            clutterScore: computeClutterScore(inventory)
          });
        }
      } catch (err) {
        console.error(err);
      }
    }
  }, [ambientEngine, drawOverlay, faceEngine, handEngine, heartRateEngine, objectEngine, personTracker, profilePerson, sceneMotionEngine, soundEngine, voiceActive, voiceEngine, voiceIdentityEngine, zoneEngine]);

  // requestAnimationFrame recursion closes over whatever `loop` looked like the instant it was
  // first scheduled — reactive state read inside it (like voiceActive) would otherwise be frozen
  // at its initial value forever. Routing the recursion through a ref keeps every tick reading
  // the latest render's closure.
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const tick = useCallback(() => {
    loopRef.current();
    raf.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    setError(undefined);
    try {
      await Promise.all([faceEngine.init(), handEngine.init(), objectEngine.init(), identityEngine.init(), soundEngine.init()]);
      const stream = await getRearCameraStream({ width: { ideal: 1280 }, height: { ideal: 720 } });
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      sessionStart.current = performance.now();
      setReady(true);
      raf.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la cámara');
    }
  }, [faceEngine, handEngine, objectEngine, identityEngine, soundEngine, tick]);

  const toggleVoice = useCallback(async () => {
    setVoiceError(undefined);
    if (voiceActive) {
      voiceEngine.stop();
      soundEngine.detach();
      setVoiceActive(false);
      return;
    }
    try {
      await voiceEngine.start();
      const graph = voiceEngine.getAudioGraph();
      if (graph) soundEngine.attach(graph.ctx, graph.source);
      setVoiceActive(true);
    } catch (e) {
      setVoiceError(describeMicError(e));
    }
  }, [voiceActive, voiceEngine, soundEngine]);

  useEffect(() => {
    fetchZones()
      .then((z) => { setZones(z); zoneEngine.setZones(z); })
      .catch((err) => console.error('No se pudieron cargar las zonas', err));
  }, [zoneEngine]);

  // Notification permission is opt-in (see VoiceAssistant's settings) — when it's off, notify()
  // below is a harmless no-op, so this always runs the same way regardless.
  const refreshEvents = useCallback(async () => {
    let events: CitizenEvent[];
    try {
      events = await fetchEvents();
    } catch (err) {
      console.error('No se pudieron cargar los eventos ciudadanos', err);
      return;
    }
    setCitizenEvents(events);

    const isFirstLoad = !hasLoadedEventsOnce.current;
    hasLoadedEventsOnce.current = true;
    const newOnes = events.filter((ev) => !knownEventIds.current.has(ev.id) && ev.authorLabel !== 'Tú');
    events.forEach((ev) => knownEventIds.current.add(ev.id));
    if (isFirstLoad || !newOnes.length) return;

    const now = Date.now();
    if (!cachedPosition.current || now - cachedPosition.current.at > 5 * 60 * 1000) {
      const point = await getCurrentPosition();
      if (point) cachedPosition.current = { point, at: now };
    }
    const position = cachedPosition.current?.point;
    if (!position) return;
    newOnes.forEach((ev) => {
      if (ev.lat && ev.lng && distanceMeters(position, ev) < 2000) {
        notify('Reporte cerca de ti', `${categoryMeta(ev.category).label}: ${ev.title}`);
      }
    });
  }, []);

  useEffect(() => {
    refreshEvents();
    const interval = window.setInterval(refreshEvents, 30000);
    return () => window.clearInterval(interval);
  }, [refreshEvents]);

  const createCitizenEvent = useCallback(async (input: { category: CitizenCategory; title: string; description: string; lat: number; lng: number }) => {
    const created = await createEvent({ ...input, authorLabel: 'Vecino/a' });
    setCitizenEvents((prev) => [created, ...prev]);
  }, []);

  const toggleEditZones = useCallback(() => setEditingZones((v) => !v), []);

  // Zone definitions are a deliberate, infrequent action (drawing/deleting a zone) — the UI
  // updates optimistically (instant feedback) while the save to the backend happens in the
  // background; PUT /api/zones is a full-replace so this always converges even if a request
  // arrives out of order.
  const addZone = useCallback((zone: StoreZone) => {
    setZones((prev) => {
      const next = [...prev, zone];
      zoneEngine.setZones(next);
      saveZones(next).catch((err) => console.error('No se pudo guardar la zona', err));
      return next;
    });
  }, [zoneEngine]);

  const deleteZone = useCallback((id: string) => {
    setZones((prev) => {
      const next = prev.filter((z) => z.id !== id);
      zoneEngine.setZones(next);
      saveZones(next).catch((err) => console.error('No se pudo borrar la zona', err));
      return next;
    });
  }, [zoneEngine]);

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    const stream = videoRef.current?.srcObject as MediaStream | undefined;
    stream?.getTracks().forEach((t) => t.stop());
    voiceEngine.stop();
    soundEngine.detach();
  }, [voiceEngine, soundEngine]);

  return (
    <div className="weros-shell">
      <header className="weros-topnav">
        <span className="weros-logo">WEROS</span>
        <nav className="weros-tabs">
          <button className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}><Rss size={15} /> Comunidad</button>
          <button className={tab === 'mapa' ? 'active' : ''} onClick={() => setTab('mapa')}><MapIcon size={15} /> Mapa</button>
          <button className={tab === 'testigo' ? 'active' : ''} onClick={() => setTab('testigo')}><Eye size={15} /> Testigo</button>
          <button className={tab === 'camara' ? 'active' : ''} onClick={() => setTab('camara')}><Radar size={15} /> Vigilancia</button>
          <button className={tab === 'tools' ? 'active' : ''} onClick={() => setTab('tools')}><Wrench size={15} /> Herramientas</button>
        </nav>
      </header>

      <DailyGreeting citizenEvents={citizenEvents} />

      <main className="weros-content">
        {tab === 'feed' && <Feed events={citizenEvents} onCreate={createCitizenEvent} />}
        {tab === 'mapa' && <CityMap events={citizenEvents} />}
        {tab === 'tools' && (
          <ToolsHub
            driving={{ enabled: driving.enabled, driving: driving.driving, speedKmh: driving.speedKmh, start: driving.start, stop: driving.stop }}
            geofenceWatcher={{ enabled: geofenceWatcher.enabled, start: geofenceWatcher.start, stop: geofenceWatcher.stop }}
            battery={{ supported: batteryAlert.supported, enabled: batteryAlert.enabled, level: batteryAlert.level, start: batteryAlert.start, stop: batteryAlert.stop }}
          />
        )}
        {tab === 'testigo' && (
          <WitnessMode
            command={witnessCommand}
            onCommandConsumed={() => setWitnessCommand(undefined)}
            onRecordingChange={setWitnessRecording}
          />
        )}
        {tab === 'camara' && (
          <div className="app-shell">
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
              zones={zones}
              zoneOccupancy={zoneOccupancy}
              editingZones={editingZones}
              onToggleEditZones={toggleEditZones}
              onAddZone={addZone}
              onDeleteZone={deleteZone}
            />
            <SidePanel
              frame={frame}
              history={history}
              gestureCounts={gestureCounts}
              persons={persons}
              voiceActive={voiceActive}
              voiceError={voiceError}
              onToggleVoice={toggleVoice}
              objectInventory={objectInventory}
              soundLog={soundLog}
              soundStats={soundStats}
              sessionReport={sessionReport}
              environmentReport={environmentReport}
              voiceProfiles={voiceProfiles}
              zoneStats={zoneStats}
            />
          </div>
        )}
      </main>

      <VoiceAssistant
        citizenEvents={citizenEvents}
        onNavigate={setTab}
        onWitnessCommand={handleWitnessCommand}
        currentTab={tab}
        witnessRecording={witnessRecording}
      />
      <AlertButton onSent={refreshEvents} />
    </div>
  );
}
