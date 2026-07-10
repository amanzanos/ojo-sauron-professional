import { FilesetResolver, GestureRecognizer, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { AnalysisEvent, FaceBox, GestureName, GestureResult, HandsFrame } from '../types/analysis';
import { distance2D, nowId } from '../utils/math';
import { HAND_LM } from './landmarkMap';

type Landmark = NormalizedLandmark;

const EMPTY_FRAME: HandsFrame = { handsDetected: 0, gestures: [], handPositions: [] };

const BUILTIN_LABELS: Record<string, { name: GestureName; label: string }> = {
  Thumb_Up: { name: 'thumb_up', label: 'Pulgar arriba' },
  Thumb_Down: { name: 'thumb_down', label: 'Pulgar abajo' },
  Victory: { name: 'victory', label: 'Victoria / Paz' },
  Open_Palm: { name: 'open_palm', label: 'Palma abierta' },
  Closed_Fist: { name: 'closed_fist', label: 'Puño cerrado' },
  Pointing_Up: { name: 'pointing_up', label: 'Señalando' },
  ILoveYou: { name: 'love_sign', label: 'Seña "te quiero"' }
};

export const GESTURE_ICON: Record<GestureName, string> = {
  thumb_up: '👍', thumb_down: '👎', victory: '✌️', open_palm: '✋', closed_fist: '✊',
  pointing_up: '☝️', love_sign: '🤟', ok_sign: '👌', heart_hands: '🫶', hand_near_face: '🖐️'
};

function fingerExtended(lm: Landmark[], tip: number, pip: number, wrist: number) {
  return distance2D(lm[tip], lm[wrist]) > distance2D(lm[pip], lm[wrist]) * 1.06;
}

export class HandGestureEngine {
  private recognizer?: GestureRecognizer;
  private frameCounter = 0;
  private lastResult: HandsFrame = EMPTY_FRAME;
  private activeKeys = new Set<string>();
  private counts: Record<string, number> = {};
  private events: AnalysisEvent[] = [];
  private lastEventAt: Record<string, number> = {};

  async init() {
    const resolver = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm');
    const modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task';
    const baseConfig = { runningMode: 'VIDEO' as const, numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 };
    try {
      this.recognizer = await GestureRecognizer.createFromOptions(resolver, { baseOptions: { modelAssetPath, delegate: 'GPU' }, ...baseConfig });
    } catch (gpuError) {
      console.warn('GPU delegate failed for gestures, retrying with CPU delegate', gpuError);
      this.recognizer = await GestureRecognizer.createFromOptions(resolver, { baseOptions: { modelAssetPath, delegate: 'CPU' }, ...baseConfig });
    }
  }

  getEvents() { return this.events; }
  getCounts() { return this.counts; }

  recognize(video: HTMLVideoElement, ts: number, faceBox: FaceBox | undefined, w: number, h: number): HandsFrame {
    if (!this.recognizer) return this.lastResult;
    this.frameCounter++;
    if (this.frameCounter % 2 !== 0) return this.lastResult;

    const result = this.recognizer.recognizeForVideo(video, ts);
    const handsLm = (result.landmarks ?? []) as Landmark[][];
    const handedness = result.handednesses ?? [];
    const gestureCats = result.gestures ?? [];
    const gestures: GestureResult[] = [];
    const handPositions: Array<{ x: number; y: number }> = [];

    handsLm.forEach((lm, i) => {
      const hand: 'left' | 'right' = handedness[i]?.[0]?.categoryName === 'Left' ? 'left' : 'right';
      const tip = lm[HAND_LM.indexTip];
      const x = tip.x * w, y = tip.y * h;
      const wrist = HAND_LM.wrist;

      const centroid = lm.reduce((acc, p) => ({ x: acc.x + p.x / lm.length, y: acc.y + p.y / lm.length }), { x: 0, y: 0 });
      handPositions.push({ x: centroid.x * w, y: centroid.y * h });

      const built = gestureCats[i]?.[0];
      if (built && built.categoryName !== 'None' && built.score > 0.6 && BUILTIN_LABELS[built.categoryName]) {
        const meta = BUILTIN_LABELS[built.categoryName];
        gestures.push({ id: `${meta.name}-${hand}`, name: meta.name, label: meta.label, hand, score: built.score, x, y });
      }

      const okDist = distance2D(lm[HAND_LM.thumbTip], lm[HAND_LM.indexTip]);
      const handSpan = distance2D(lm[wrist], lm[HAND_LM.middleMcp]) || 0.001;
      const middleExt = fingerExtended(lm, HAND_LM.middleTip, HAND_LM.middlePip, wrist);
      const ringExt = fingerExtended(lm, HAND_LM.ringTip, HAND_LM.ringPip, wrist);
      const pinkyExt = fingerExtended(lm, HAND_LM.pinkyTip, HAND_LM.pinkyPip, wrist);
      if (okDist / handSpan < 0.38 && middleExt && ringExt && pinkyExt) {
        gestures.push({ id: `ok_sign-${hand}`, name: 'ok_sign', label: 'Seña de OK', hand, score: 0.82, x, y });
      }

      if (faceBox) {
        const { x: cx, y: cy } = handPositions[i];
        const faceCx = faceBox.x + faceBox.width / 2, faceCy = faceBox.y + faceBox.height / 2;
        const threshold = Math.max(faceBox.width, faceBox.height) * 0.85;
        if (distance2D({ x: cx, y: cy }, { x: faceCx, y: faceCy }) < threshold) {
          gestures.push({ id: `hand_near_face-${hand}`, name: 'hand_near_face', label: 'Mano cerca del rostro', hand, score: 0.7, x: cx, y: cy });
        }
      }
    });

    if (handsLm.length === 2) {
      const [a, b] = handsLm;
      const thumbDist = distance2D(a[HAND_LM.thumbTip], b[HAND_LM.thumbTip]);
      const indexDist = distance2D(a[HAND_LM.indexTip], b[HAND_LM.indexTip]);
      const spanA = distance2D(a[HAND_LM.wrist], a[HAND_LM.middleMcp]) || 0.001;
      const spanB = distance2D(b[HAND_LM.wrist], b[HAND_LM.middleMcp]) || 0.001;
      const spanAvg = (spanA + spanB) / 2;
      const wristSpread = distance2D(a[HAND_LM.wrist], b[HAND_LM.wrist]);
      if (thumbDist / spanAvg < 0.7 && indexDist / spanAvg < 0.7 && wristSpread / spanAvg > 0.9) {
        const midX = ((a[HAND_LM.thumbTip].x + b[HAND_LM.thumbTip].x) / 2) * w;
        const midY = ((a[HAND_LM.thumbTip].y + b[HAND_LM.thumbTip].y) / 2) * h;
        gestures.push({ id: 'heart_hands-both', name: 'heart_hands', label: 'Corazón con manos', hand: 'both', score: 0.85, x: midX, y: midY });
      }
    }

    this.lastResult = { handsDetected: handsLm.length, gestures, handPositions };
    this.trackEvents(gestures, ts);
    return this.lastResult;
  }

  private trackEvents(gestures: GestureResult[], ts: number) {
    const currentKeys = new Set(gestures.map((g) => `${g.name}-${g.hand}`));
    currentKeys.forEach((key) => {
      if (this.activeKeys.has(key)) return;
      const cooldownOk = ts - (this.lastEventAt[key] ?? -Infinity) >= 2500;
      if (!cooldownOk) return;
      this.lastEventAt[key] = ts;
      const g = gestures.find((x) => `${x.name}-${x.hand}` === key)!;
      this.counts[g.name] = (this.counts[g.name] ?? 0) + 1;
      if (g.name === 'hand_near_face') return; // logged via face engine event, avoid duplicate noise
      const ev: AnalysisEvent = {
        id: nowId(),
        time: Date.now(),
        severity: g.name === 'heart_hands' || g.name === 'ok_sign' || g.name === 'thumb_up' || g.name === 'love_sign' ? 'positive' : 'info',
        title: `GESTO: ${g.label.toUpperCase()}`,
        detail: `Detectado con mano ${g.hand === 'both' ? 'ambas' : g.hand === 'left' ? 'izquierda' : 'derecha'}`
      };
      this.events.unshift(ev);
      this.events = this.events.slice(0, 50);
    });
    this.activeKeys = currentKeys;
  }
}
