import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type {
  AnalysisEvent, AnalysisFrame, EmotionName, EmotionScore, FaceBox, FaceObservation, FirewallAlert, HandsFrame,
  MetricValue, OverlayAlert, QualitySignal
} from '../types/analysis';
import { Ema, clamp, distance2D, matrixToEuler, nowId, pct, RollingValue } from '../utils/math';
import { LM } from './landmarkMap';
import { EMPTY_VOICE } from './VoiceAnalysisEngine';

type Landmark = NormalizedLandmark;

export const EMOTION_LABELS: Record<EmotionName, string> = {
  neutral: 'Neutral', happy: 'Feliz', sad: 'Triste', angry: 'Enfado', surprised: 'Sorpresa', fearful: 'Miedo', disgusted: 'Asco'
};
const labels = EMOTION_LABELS;

const EMPTY_HANDS: HandsFrame = { handsDetected: 0, gestures: [] };
const MAX_FACES = 5;

interface EngineState {
  lastTs: number;
  fps: RollingValue;
  lastBlinkTs: number;
  blinkClosed: boolean;
  blinkCloseStartTs: number;
  blinkTimes: number[];
  blinkDurations: RollingValue;
  awayStart?: number;
  jawOpenStart?: number;
  lastNose?: { x: number; y: number };
  motion: RollingValue;
  noseJitter: RollingValue;
  metrics: Record<string, RollingValue>;
  ema: Record<string, Ema>;
  events: AnalysisEvent[];
  alerts: OverlayAlert[];
  lastEventAt: Record<string, number>;
  firewallState: Record<string, number | undefined>;
}

export class FaceAnalysisEngine {
  private landmarker?: FaceLandmarker;
  private lumaCanvas = document.createElement('canvas');
  private readonly state: EngineState = {
    lastTs: performance.now(),
    fps: new RollingValue(30),
    lastBlinkTs: 0,
    blinkClosed: false,
    blinkCloseStartTs: 0,
    blinkTimes: [],
    blinkDurations: new RollingValue(20),
    motion: new RollingValue(20),
    noseJitter: new RollingValue(24),
    metrics: {
      tension: new RollingValue(40),
      happy: new RollingValue(30),
      attention: new RollingValue(40),
      nervousness: new RollingValue(40),
      eyeContact: new RollingValue(40),
      fatigue: new RollingValue(60)
    },
    ema: {
      attention: new Ema(0.22),
      eyeContact: new Ema(0.22),
      tension: new Ema(0.25),
      nervousness: new Ema(0.25)
    },
    events: [],
    alerts: [],
    lastEventAt: {},
    firewallState: {}
  };

  async init() {
    const resolver = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm');
    const modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
    const baseConfig = {
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO' as const,
      numFaces: MAX_FACES,
      minFaceDetectionConfidence: 0.45,
      minFacePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45
    };
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(resolver, {
        baseOptions: { modelAssetPath, delegate: 'GPU' },
        ...baseConfig
      });
    } catch (gpuError) {
      console.warn('GPU delegate failed, retrying with CPU delegate', gpuError);
      this.landmarker = await FaceLandmarker.createFromOptions(resolver, {
        baseOptions: { modelAssetPath, delegate: 'CPU' },
        ...baseConfig
      });
    }
  }

  analyze(video: HTMLVideoElement, width: number, height: number, hands: HandsFrame = EMPTY_HANDS): AnalysisFrame {
    if (!this.landmarker) throw new Error('Engine not initialized');
    const ts = performance.now();
    const dt = Math.max(1, ts - this.state.lastTs);
    this.state.lastTs = ts;
    this.state.fps.push(1000 / dt);

    const result = this.landmarker.detectForVideo(video, ts);
    const facesLm = (result.faceLandmarks ?? []) as Landmark[][];
    const facesBlend = result.faceBlendshapes ?? [];
    const facesMatrix = result.facialTransformationMatrixes ?? [];

    this.state.alerts = this.state.alerts.filter((a) => a.expiresAt > ts);
    const lighting = this.lightingQuality(video);

    if (!facesLm.length) {
      return this.emptyFrame(ts, hands, lighting);
    }

    // Every detected face gets a lightweight box + frontality (for tracking/overlay/photo picking).
    // The "primary" face — the largest, i.e. closest/most prominent — keeps driving the deep
    // single-subject metrics pipeline exactly as before.
    const allFaces: FaceObservation[] = facesLm.map((lm, i) => {
      const box = this.faceBox(lm, width, height);
      const pose = this.headPose(lm, facesMatrix[i]?.data);
      const frontality = clamp(Math.abs(pose.yaw) + Math.abs(pose.pitch), 0, 100) / 100;
      const mood = this.emotionsFromSignals(lm, facesBlend[i]?.categories ?? [], this.earOnly(lm))[0].name;
      return { box, frontality, mood };
    });
    let primaryIndex = 0;
    let bestArea = -1;
    allFaces.forEach((f, i) => {
      const area = f.box.width * f.box.height;
      if (area > bestArea) { bestArea = area; primaryIndex = i; }
    });

    const landmarks = facesLm[primaryIndex];
    const blend = facesBlend[primaryIndex]?.categories ?? [];
    const matrix = facesMatrix[primaryIndex]?.data;
    const box = allFaces[primaryIndex].box;

    const eye = this.eyeState(landmarks, ts);
    const headPose = this.headPose(landmarks, matrix);
    const emotions = this.emotionsFromSignals(landmarks, blend, eye);
    const dominantEmotion = [...emotions].sort((a, b) => b.score - a.score)[0];
    const motion = this.motion(landmarks);
    const metrics = this.metrics(landmarks, blend, eye, headPose, emotions, motion);
    const framing = this.framingQuality(box, width, height);
    const dataQuality = this.dataQuality(landmarks.length, framing);
    const firewall = this.firewallCheck(ts, metrics, emotions);

    this.detectEvents(ts, box, dominantEmotion, metrics, eye, headPose, blend, lighting, framing, hands);

    return {
      timestamp: ts,
      fps: Math.round(this.state.fps.avg()),
      faceDetected: true,
      faceBox: box,
      peopleDetected: facesLm.length,
      allFaces,
      emotions,
      dominantEmotion,
      metrics,
      eye,
      headPose,
      hands,
      objects: [],
      voice: EMPTY_VOICE,
      firewall,
      dataQuality,
      lighting,
      framing,
      events: this.state.events.slice(0, 15),
      alerts: this.state.alerts,
      raw: { landmarksCount: landmarks.length, facePresence: 100, motion }
    };
  }

  private emptyFrame(ts: number, hands: HandsFrame, lighting: QualitySignal): AnalysisFrame {
    const emotions = this.defaultEmotions();
    this.state.firewallState = {};
    return {
      timestamp: ts,
      fps: Math.round(this.state.fps.avg()),
      faceDetected: false,
      peopleDetected: 0,
      allFaces: [],
      emotions,
      dominantEmotion: emotions[0],
      metrics: [],
      eye: { leftEAR: 0, rightEAR: 0, blink: false, blinkRate: this.currentBlinkRate(ts), avgBlinkDurationMs: Math.round(this.state.blinkDurations.avg()), gaze: 'unknown', awaySeconds: 0 },
      headPose: { yaw: 0, pitch: 0, roll: 0, label: 'Sin rostro' },
      hands,
      objects: [],
      voice: EMPTY_VOICE,
      firewall: [],
      dataQuality: { score: 0, label: 'Sin rostro', ok: false },
      lighting,
      framing: { score: 0, label: 'Sin rostro', ok: false },
      events: this.state.events.slice(0, 15),
      alerts: this.state.alerts,
      raw: { landmarksCount: 0, facePresence: 0, motion: 0 }
    };
  }

  private faceBox(lm: Landmark[], w: number, h: number): FaceBox {
    const xs = lm.map((p) => p.x * w);
    const ys = lm.map((p) => p.y * h);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  private eyeState(lm: Landmark[], ts: number) {
    const lEAR = distance2D(lm[LM.leftEyeTop], lm[LM.leftEyeBottom]) / distance2D(lm[LM.leftEyeOuter], lm[LM.leftEyeInner]);
    const rEAR = distance2D(lm[LM.rightEyeTop], lm[LM.rightEyeBottom]) / distance2D(lm[LM.rightEyeOuter], lm[LM.rightEyeInner]);
    const ear = (lEAR + rEAR) / 2;
    const closed = ear < 0.19;
    let blink = false;
    if (closed && !this.state.blinkClosed) {
      this.state.blinkClosed = true;
      this.state.blinkCloseStartTs = ts;
    }
    if (!closed && this.state.blinkClosed) {
      blink = true;
      this.state.blinkClosed = false;
      this.state.lastBlinkTs = ts;
      this.state.blinkTimes.push(ts);
      this.state.blinkDurations.push(ts - this.state.blinkCloseStartTs);
    }
    this.state.blinkTimes = this.state.blinkTimes.filter((t) => ts - t < 60000);

    const nose = lm[LM.nose];
    const eyeCenterX = (lm[LM.leftEyeInner].x + lm[LM.rightEyeInner].x) / 2;
    const eyeCenterY = (lm[LM.leftEyeInner].y + lm[LM.rightEyeInner].y) / 2;
    const dx = nose.x - eyeCenterX;
    const dy = nose.y - eyeCenterY;
    let gaze: 'center' | 'left' | 'right' | 'up' | 'down' | 'unknown' = 'center';
    if (dx > 0.038) gaze = 'left';
    else if (dx < -0.038) gaze = 'right';
    else if (dy > 0.105) gaze = 'down';
    else if (dy < 0.072) gaze = 'up';

    if (gaze !== 'center') this.state.awayStart ??= ts;
    else this.state.awayStart = undefined;

    return {
      leftEAR: lEAR,
      rightEAR: rEAR,
      blink,
      blinkRate: this.currentBlinkRate(ts),
      avgBlinkDurationMs: Math.round(this.state.blinkDurations.avg()),
      gaze,
      awaySeconds: this.state.awayStart ? (ts - this.state.awayStart) / 1000 : 0
    };
  }

  /** Stateless EAR-only computation, safe to run per-face without touching shared blink-tracking state. */
  private earOnly(lm: Landmark[]) {
    const leftEAR = distance2D(lm[LM.leftEyeTop], lm[LM.leftEyeBottom]) / distance2D(lm[LM.leftEyeOuter], lm[LM.leftEyeInner]);
    const rightEAR = distance2D(lm[LM.rightEyeTop], lm[LM.rightEyeBottom]) / distance2D(lm[LM.rightEyeOuter], lm[LM.rightEyeInner]);
    return { leftEAR, rightEAR };
  }

  private currentBlinkRate(ts: number) {
    this.state.blinkTimes = this.state.blinkTimes.filter((t) => ts - t < 60000);
    return this.state.blinkTimes.length;
  }

  /** Prefers the model's real 3D facial transformation matrix; falls back to 2D heuristics if unavailable. */
  private headPose(lm: Landmark[], matrix?: Float32Array | number[]) {
    if (matrix) {
      const { yaw, pitch, roll } = matrixToEuler(matrix);
      const y = clamp(yaw, -60, 60);
      const p = clamp(pitch, -50, 50);
      const r = clamp(roll, -45, 45);
      let label = 'Frontal';
      if (y > 12) label = 'Giro izquierda';
      if (y < -12) label = 'Giro derecha';
      if (p > 10) label = 'Mirada baja';
      if (p < -10) label = 'Mirada alta';
      return { yaw: y, pitch: p, roll: r, label };
    }
    const left = lm[LM.leftCheek], right = lm[LM.rightCheek], nose = lm[LM.nose], chin = lm[LM.chin], forehead = lm[LM.forehead];
    const centerX = (left.x + right.x) / 2;
    const yaw = clamp((nose.x - centerX) * 420, -45, 45);
    const faceH = distance2D(forehead, chin);
    const pitch = clamp(((nose.y - forehead.y) / faceH - 0.42) * 120, -35, 35);
    const roll = clamp((right.y - left.y) * 160, -35, 35);
    let label = 'Frontal';
    if (yaw > 12) label = 'Giro izquierda';
    if (yaw < -12) label = 'Giro derecha';
    if (pitch > 10) label = 'Mirada baja';
    if (pitch < -10) label = 'Mirada alta';
    return { yaw, pitch, roll, label };
  }

  private blendScore(blend: Array<{ categoryName: string; score: number }>, name: string) {
    return blend.find((b) => b.categoryName === name)?.score ?? 0;
  }

  private emotionsFromSignals(lm: Landmark[], blend: Array<{ categoryName: string; score: number }>, eye: { leftEAR: number; rightEAR: number }): EmotionScore[] {
    const smile = Math.max(this.blendScore(blend, 'mouthSmileLeft'), this.blendScore(blend, 'mouthSmileRight')) * 100;
    const frown = Math.max(this.blendScore(blend, 'browDownLeft'), this.blendScore(blend, 'browDownRight')) * 100;
    const browUp = Math.max(this.blendScore(blend, 'browOuterUpLeft'), this.blendScore(blend, 'browOuterUpRight'), this.blendScore(blend, 'browInnerUp')) * 100;
    const jawOpen = this.blendScore(blend, 'jawOpen') * 100;
    const mouthFunnel = this.blendScore(blend, 'mouthFunnel') * 100;
    const mouthPucker = this.blendScore(blend, 'mouthPucker') * 100;
    const mouthDown = Math.max(this.blendScore(blend, 'mouthFrownLeft'), this.blendScore(blend, 'mouthFrownRight')) * 100;
    const eyeWide = clamp(((eye.leftEAR + eye.rightEAR) / 2 - 0.22) * 420);
    const mouthOpenGeom = clamp(distance2D(lm[LM.upperLip], lm[LM.lowerLip]) / distance2D(lm[LM.mouthLeft], lm[LM.mouthRight]) * 260);

    const happy = clamp(smile * 1.25 + browUp * 0.12 - frown * 0.3);
    const surprised = clamp(browUp * 0.75 + jawOpen * 0.55 + eyeWide * 0.45 + mouthOpenGeom * 0.25 - smile * 0.15);
    const angry = clamp(frown * 1.15 + mouthPucker * 0.35 + mouthFunnel * 0.25 - smile * 0.35);
    const sad = clamp(mouthDown * 0.85 + this.blendScore(blend, 'browInnerUp') * 65 - smile * 0.25);
    const fearful = clamp(browUp * 0.4 + eyeWide * 0.45 + jawOpen * 0.25 + frown * 0.15 - smile * 0.2);
    const disgusted = clamp(this.blendScore(blend, 'noseSneerLeft') * 80 + this.blendScore(blend, 'noseSneerRight') * 80 + mouthFunnel * 0.25);
    const maxNonNeutral = Math.max(happy, surprised, angry, sad, fearful, disgusted);
    const neutral = clamp(100 - maxNonNeutral * 1.08);

    const emotionList: EmotionScore[] = [
      { name: 'neutral', label: labels.neutral, score: pct(neutral) },
      { name: 'happy', label: labels.happy, score: pct(happy) },
      { name: 'sad', label: labels.sad, score: pct(sad) },
      { name: 'angry', label: labels.angry, score: pct(angry) },
      { name: 'surprised', label: labels.surprised, score: pct(surprised) },
      { name: 'fearful', label: labels.fearful, score: pct(fearful) },
      { name: 'disgusted', label: labels.disgusted, score: pct(disgusted) }
    ];
    return emotionList.sort((a, b) => b.score - a.score);
  }

  private defaultEmotions(): EmotionScore[] {
    return [
      { name: 'neutral', label: labels.neutral, score: 100 },
      { name: 'happy', label: labels.happy, score: 0 },
      { name: 'sad', label: labels.sad, score: 0 },
      { name: 'angry', label: labels.angry, score: 0 },
      { name: 'surprised', label: labels.surprised, score: 0 },
      { name: 'fearful', label: labels.fearful, score: 0 },
      { name: 'disgusted', label: labels.disgusted, score: 0 }
    ];
  }

  private metrics(
    lm: Landmark[],
    blend: Array<{ categoryName: string; score: number }>,
    eye: ReturnType<FaceAnalysisEngine['eyeState']>,
    headPose: ReturnType<FaceAnalysisEngine['headPose']>,
    emotions: EmotionScore[],
    motion: number
  ): MetricValue[] {
    const get = (name: EmotionName) => emotions.find((e) => e.name === name)?.score ?? 0;

    const rawEyeContact = clamp(100 - Math.abs(headPose.yaw) * 2.2 - Math.abs(headPose.pitch) * 1.7 - (eye.gaze === 'center' ? 0 : 28));
    const rawAttention = clamp(rawEyeContact * 0.7 + (100 - Math.min(eye.awaySeconds * 20, 60)) * 0.3);
    const eyeContact = pct(this.state.ema.eyeContact.push(rawEyeContact));
    const attention = pct(this.state.ema.attention.push(rawAttention));

    const smile = get('happy');
    const browDist = distance2D(lm[LM.leftBrowInner], lm[LM.rightBrowInner]);
    const eyeDist = distance2D(lm[LM.leftEyeInner], lm[LM.rightEyeInner]);
    const browFurrow = clamp((0.95 - browDist / eyeDist) * 160 + get('angry') * 0.45);
    const browRaise = clamp(Math.max(this.blendScore(blend, 'browOuterUpLeft'), this.blendScore(blend, 'browOuterUpRight'), this.blendScore(blend, 'browInnerUp')) * 130);
    const mouthOpen = distance2D(lm[LM.upperLip], lm[LM.lowerLip]) / distance2D(lm[LM.mouthLeft], lm[LM.mouthRight]);
    const mouthTension = clamp((0.105 - mouthOpen) * 480 + get('angry') * 0.2 + get('sad') * 0.25);
    const eyeOpen = clamp(((eye.leftEAR + eye.rightEAR) / 2 - 0.16) * 330);
    const fatigue = clamp((eye.blinkRate > 24 ? (eye.blinkRate - 24) * 3 : 0) + (eyeOpen < 30 ? 35 : 0) + Math.max(0, eye.awaySeconds - 4) * 4);

    const rawTension = clamp(get('angry') * 0.35 + browFurrow * 0.35 + mouthTension * 0.2 + motion * 0.1);
    const tension = pct(this.state.ema.tension.push(rawTension));
    const rawNervousness = clamp(tension * 0.38 + Math.max(0, eye.blinkRate - 18) * 2.1 + motion * 0.45 + (eye.awaySeconds > 2 ? 16 : 0));
    const nervousness = pct(this.state.ema.nervousness.push(rawNervousness));

    const expressiveness = clamp(Math.max(...emotions.filter((e) => e.name !== 'neutral').map((e) => e.score)) + motion * 0.15);
    const headStability = clamp(100 - Math.abs(headPose.yaw) * 1.4 - Math.abs(headPose.pitch) * 1.3 - motion * 0.35);

    const smileAsymmetry = Math.abs(this.blendScore(blend, 'mouthSmileLeft') - this.blendScore(blend, 'mouthSmileRight')) * 100;
    const browAsymmetry = Math.abs(this.blendScore(blend, 'browDownLeft') - this.blendScore(blend, 'browDownRight')) * 100;
    const asymmetry = clamp(smileAsymmetry * 0.6 + browAsymmetry * 0.4);

    // Duchenne marker: a genuine smile engages the cheek/eye muscles, not just the mouth.
    // Smiling wide with little cheek-squint reads as a social/forced smile.
    const cheekRaise = clamp(Math.max(this.blendScore(blend, 'cheekSquintLeft'), this.blendScore(blend, 'cheekSquintRight')) * 130);
    const expressionCongruence = clamp(100 - Math.max(0, smile - cheekRaise * 1.4) * 1.1);

    const engagementIndex = clamp(attention * 0.4 + eyeContact * 0.3 + expressiveness * 0.3);
    const stressIndex = clamp(tension * 0.4 + nervousness * 0.35 + fatigue * 0.25);

    this.state.metrics.tension.push(tension);
    this.state.metrics.happy.push(smile);
    this.state.metrics.attention.push(attention);
    this.state.metrics.nervousness.push(nervousness);
    this.state.metrics.eyeContact.push(eyeContact);
    this.state.metrics.fatigue.push(fatigue);

    const metric = (key: MetricValue['key'], label: string, value: number, unit?: string): MetricValue => ({
      key, label, value: pct(value), unit, status: value > 80 ? 'critical' : value > 60 ? 'high' : value > 40 ? 'medium' : value > 20 ? 'normal' : 'low'
    });
    // Higher is better here (more genuine/congruent), so the usual "high value = alarming" status scale is inverted.
    const inverseMetric = (key: MetricValue['key'], label: string, value: number, unit?: string): MetricValue => ({
      key, label, value: pct(value), unit, status: value > 80 ? 'normal' : value > 60 ? 'medium' : value > 40 ? 'high' : 'critical'
    });

    return [
      metric('engagementIndex', 'Índice de compromiso', engagementIndex, '%'),
      metric('stressIndex', 'Índice de estrés', stressIndex, '%'),
      metric('attention', 'Atención', attention, '%'),
      metric('eyeContact', 'Contacto visual', eyeContact, '%'),
      metric('tension', 'Tensión facial', tension, '%'),
      metric('nervousness', 'Nerviosismo estimado', nervousness, '%'),
      metric('fatigue', 'Fatiga', fatigue, '%'),
      metric('expressiveness', 'Expresividad', expressiveness, '%'),
      metric('bodyMotion', 'Inquietud motora', motion, '%'),
      metric('smile', 'Sonrisa', smile, '%'),
      metric('browFurrow', 'Ceño fruncido', browFurrow, '%'),
      metric('browRaise', 'Cejas levantadas', browRaise, '%'),
      metric('mouthTension', 'Boca tensa', mouthTension, '%'),
      metric('eyeOpenness', 'Apertura ocular', eyeOpen, '%'),
      metric('headStability', 'Estabilidad cabeza', headStability, '%'),
      metric('asymmetry', 'Asimetría gestual', asymmetry, '%'),
      inverseMetric('expressionCongruence', 'Congruencia expresión-emoción', expressionCongruence, '%')
    ];
  }

  private motion(lm: Landmark[]) {
    const nose = { x: lm[LM.nose].x, y: lm[LM.nose].y };
    if (!this.state.lastNose) {
      this.state.lastNose = nose;
      return 0;
    }
    const m = clamp(distance2D(nose, this.state.lastNose) * 5000);
    this.state.lastNose = nose;
    this.state.motion.push(m);
    this.state.noseJitter.push(m);
    return pct(this.state.motion.avg());
  }

  private dataQuality(landmarksCount: number, framing: QualitySignal): QualitySignal {
    const jitter = this.state.noseJitter.stddev();
    const jitterPenalty = clamp(jitter * 1.4);
    const presencePenalty = landmarksCount >= 468 ? 0 : 40;
    const score = clamp(100 - jitterPenalty - presencePenalty - (framing.ok ? 0 : 15));
    const label = score > 75 ? 'Óptima' : score > 45 ? 'Aceptable' : 'Baja';
    return { score: pct(score), label, ok: score > 45 };
  }

  private framingQuality(box: FaceBox, w: number, h: number): QualitySignal {
    const ratio = box.width / w;
    const centerX = (box.x + box.width / 2) / w;
    const offCenter = Math.abs(centerX - 0.5);
    let label = 'Encuadre correcto';
    let ok = true;
    if (ratio < 0.16) { label = 'Demasiado lejos'; ok = false; }
    else if (ratio > 0.78) { label = 'Demasiado cerca'; ok = false; }
    else if (offCenter > 0.22) { label = 'Descentrado'; ok = false; }
    const score = clamp(100 - Math.abs(ratio - 0.42) * 160 - offCenter * 120);
    return { score: pct(score), label, ok };
  }

  private lightingQuality(video: HTMLVideoElement): QualitySignal {
    if (!video.videoWidth) return { score: 0, label: 'Sin datos', ok: false };
    const w = 32, h = 18;
    this.lumaCanvas.width = w;
    this.lumaCanvas.height = h;
    const ctx = this.lumaCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { score: 50, label: 'Sin datos', ok: true };
    ctx.drawImage(video, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const avg = sum / (data.length / 4); // 0-255
    const score = clamp((avg / 200) * 100);
    const label = avg < 55 ? 'Poca luz' : avg > 235 ? 'Sobreexpuesto' : 'Buena';
    return { score: pct(score), label, ok: avg >= 55 && avg <= 235 };
  }

  /**
   * "Firewall emocional": unlike the transient spike-based alerts in detectEvents(), this
   * watches for critical emotion/stress levels held continuously for several seconds — a
   * protective signal for sustained extreme reactions, not just a momentary blip.
   */
  private firewallCheck(ts: number, metrics: MetricValue[], emotions: EmotionScore[]): FirewallAlert[] {
    const value = (key: string) => metrics.find((m) => m.key === key)?.value ?? 0;
    const emo = (name: EmotionName) => emotions.find((e) => e.name === name)?.score ?? 0;

    const watch: Array<[string, boolean, string, number]> = [
      ['angry_sustained', emo('angry') > 70, 'ENFADO SOSTENIDO', 4000],
      ['fearful_sustained', emo('fearful') > 70, 'MIEDO SOSTENIDO', 4000],
      ['stress_critical', value('stressIndex') > 80, 'ESTRÉS CRÍTICO SOSTENIDO', 5000],
      ['nervous_critical', value('nervousness') > 85, 'NERVIOSISMO CRÍTICO SOSTENIDO', 5000]
    ];

    const active: FirewallAlert[] = [];
    watch.forEach(([key, condition, label, minDuration]) => {
      if (!condition) {
        this.state.firewallState[key] = undefined;
        return;
      }
      this.state.firewallState[key] ??= ts;
      const since = this.state.firewallState[key]!;
      if (ts - since < minDuration) return;

      active.push({ key, label, since, severity: 'critical' });
      const eventKey = `firewall_${key}`;
      if ((this.state.lastEventAt[eventKey] ?? 0) + 30000 > ts) return;
      this.state.lastEventAt[eventKey] = ts;
      const ev = { id: nowId(), time: Date.now(), severity: 'critical' as const, title: `FIREWALL EMOCIONAL: ${label}`, detail: 'Nivel crítico mantenido de forma sostenida durante varios segundos' };
      this.state.events.unshift(ev);
      this.state.events = this.state.events.slice(0, 50);
    });
    return active;
  }

  private detectEvents(
    ts: number,
    box: FaceBox,
    emotion: EmotionScore,
    metrics: MetricValue[],
    eye: ReturnType<FaceAnalysisEngine['eyeState']>,
    head: ReturnType<FaceAnalysisEngine['headPose']>,
    blend: Array<{ categoryName: string; score: number }>,
    lighting: QualitySignal,
    framing: QualitySignal,
    hands: HandsFrame
  ) {
    const value = (key: string) => metrics.find((m) => m.key === key)?.value ?? 0;

    const jawOpen = this.blendScore(blend, 'jawOpen') * 100;
    const isJawWide = jawOpen > 55;
    if (isJawWide) this.state.jawOpenStart ??= ts;
    else this.state.jawOpenStart = undefined;
    const yawnDuration = this.state.jawOpenStart ? ts - this.state.jawOpenStart : 0;

    const handNearFace = hands.gestures.some((g) => g.name === 'hand_near_face');

    const checks: Array<[string, boolean, AnalysisEvent['severity'], string, string, number?]> = [
      ['happy_spike', this.state.metrics.happy.delta() > 28 && emotion.name === 'happy', 'positive', 'SE HA ALEGRADO', 'Incremento significativo de sonrisa/alegría'],
      ['tension_high', value('tension') > 72 && this.state.metrics.tension.delta() > 18, 'warning', 'AUMENTO DE TENSIÓN FACIAL', 'Ceño, boca o expresión muestran aumento de tensión'],
      ['nervous_high', value('nervousness') > 78 && this.state.metrics.nervousness.delta() > 16, 'critical', 'NERVIOSISMO VISUAL ELEVADO', 'Aumentan parpadeo, tensión o inquietud motora'],
      ['attention_drop', this.state.metrics.attention.delta() < -25, 'warning', 'BAJA LA ATENCIÓN', 'Disminuye el contacto visual o la orientación a cámara'],
      ['eye_away', eye.awaySeconds > 4, 'warning', 'MIRADA DESVIADA', `Mirada fuera de cámara ${eye.awaySeconds.toFixed(1)} s`],
      ['blink_high', eye.blinkRate > 30, 'warning', 'PARPADEO ELEVADO', `${eye.blinkRate} parpadeos/min`],
      ['surprise', emotion.name === 'surprised' && emotion.score > 55, 'info', 'SORPRESA DETECTADA', 'Apertura ocular y/o boca elevada'],
      ['head_turn', Math.abs(head.yaw) > 24, 'info', 'CABEZA GIRADA', head.label],
      ['yawn', yawnDuration > 1200, 'warning', 'BOSTEZO DETECTADO', 'Apertura mandibular sostenida', 8000],
      ['asymmetry_high', value('asymmetry') > 55, 'info', 'GESTO ASIMÉTRICO', 'Expresión notablemente distinta entre ambos lados', 9000],
      ['fake_smile', value('smile') > 50 && value('expressionCongruence') < 55, 'info', 'SONRISA POCO GENUINA', 'Sonrisa sin compromiso ocular — posible sonrisa social o forzada', 9000],
      ['self_touch', handNearFace, 'info', 'AUTOCONTACTO MANO-ROSTRO', 'Posible gesto de auto-calma o duda', 9000],
      ['low_light', !lighting.ok && lighting.label === 'Poca luz', 'warning', 'POCA ILUMINACIÓN', 'Mejora la luz ambiente para una detección más precisa', 20000],
      ['bad_framing', !framing.ok, 'info', 'ENCUADRE MEJORABLE', framing.label, 20000]
    ];
    checks.forEach(([key, condition, severity, title, detail, cooldown]) => {
      if (!condition) return;
      if ((this.state.lastEventAt[key] ?? 0) + (cooldown ?? 4500) > ts) return;
      this.state.lastEventAt[key] = ts;
      const ev = { id: nowId(), time: Date.now(), severity, title, detail };
      this.state.events.unshift(ev);
      this.state.events = this.state.events.slice(0, 50);
      this.state.alerts.unshift({ id: ev.id, text: title, severity, createdAt: ts, expiresAt: ts + 2800, x: box.x + box.width / 2, y: Math.max(32, box.y - 28) });
    });
  }
}
