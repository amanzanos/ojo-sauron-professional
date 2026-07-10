import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import type { AnalysisEvent, ObjectDetection, ObjectInventoryEntry } from '../types/analysis';
import { clamp, distance2D, nowId } from '../utils/math';

const SPANISH_LABELS: Record<string, string> = {
  'cell phone': 'móvil', cup: 'taza', bottle: 'botella', book: 'libro', laptop: 'portátil',
  keyboard: 'teclado', mouse: 'ratón', remote: 'mando', knife: 'cuchillo', scissors: 'tijeras',
  backpack: 'mochila', handbag: 'bolso', 'wine glass': 'copa', fork: 'tenedor', spoon: 'cuchara',
  bowl: 'bol', clock: 'reloj', vase: 'jarrón', scissor: 'tijeras', 'teddy bear': 'peluche',
  umbrella: 'paraguas', tie: 'corbata', suitcase: 'maleta',
  // Street/urban furniture — same COCO model, just not translated/highlighted before.
  car: 'coche', bicycle: 'bicicleta', motorcycle: 'moto', bus: 'autobús', truck: 'camión',
  'traffic light': 'semáforo', 'stop sign': 'señal de stop', bench: 'banco',
  'fire hydrant': 'boca de incendios', 'parking meter': 'parquímetro',
  // Pets — same COCO-90 set the model already returns, just not translated/highlighted before.
  dog: 'perro', cat: 'gato', bird: 'pájaro', horse: 'caballo',
  tv: 'televisor'
};

// Spanish-label keys (post-translation) that read as "street/urban" rather than personal items.
export const URBAN_LABELS = new Set([
  'coche', 'bicicleta', 'moto', 'autobús', 'camión', 'semáforo', 'señal de stop', 'banco',
  'boca de incendios', 'parquímetro'
]);

export const PET_LABELS = new Set(['perro', 'gato', 'pájaro', 'caballo']);

// Labels whose bounding box is worth sampling for an on/off-screen heuristic.
const SCREEN_LABELS = new Set(['televisor', 'portátil']);

const ROOM_KEYWORDS: Record<string, string[]> = {
  Cocina: ['taza', 'bol', 'cuchara', 'cuchillo', 'tenedor', 'botella', 'copa'],
  Oficina: ['portátil', 'teclado', 'ratón', 'libro', 'reloj'],
  Calle: ['coche', 'bicicleta', 'moto', 'autobús', 'camión', 'semáforo', 'señal de stop', 'boca de incendios', 'parquímetro']
};

/** Keyword-weighted heuristic over the session object inventory — approximate, not a scene classifier model. */
export function classifyRoomType(inventory: ObjectInventoryEntry[]): string {
  const labels = new Set(inventory.map((o) => o.label));
  let bestRoom = 'Indeterminado';
  let bestScore = 0;
  for (const [room, keywords] of Object.entries(ROOM_KEYWORDS)) {
    const score = keywords.filter((k) => labels.has(k)).length;
    if (score > bestScore) { bestScore = score; bestRoom = room; }
  }
  return bestScore >= 2 ? bestRoom : 'Indeterminado';
}

/** Distinct concurrent object types seen this session, normalized 0-100 — a coarse visual-clutter proxy. */
export function computeClutterScore(inventory: ObjectInventoryEntry[]): number {
  return clamp(inventory.length * 10);
}

function label(categoryName: string) {
  return SPANISH_LABELS[categoryName] ?? categoryName;
}

export class ObjectDetectionEngine {
  private detector?: ObjectDetector;
  private frameCounter = 0;
  private lastResult: ObjectDetection[] = [];
  private activeKeys = new Set<string>();
  private lastEventAt: Record<string, number> = {};
  private events: AnalysisEvent[] = [];
  private inventory: Record<string, ObjectInventoryEntry> = {};
  private lastTickTs?: number;
  private screenCanvas = document.createElement('canvas');

  async init() {
    const resolver = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm');
    const modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/latest/efficientdet_lite0.tflite';
    const baseConfig = { runningMode: 'VIDEO' as const, scoreThreshold: 0.45, maxResults: 8 };
    try {
      this.detector = await ObjectDetector.createFromOptions(resolver, { baseOptions: { modelAssetPath, delegate: 'GPU' }, ...baseConfig });
    } catch (gpuError) {
      console.warn('GPU delegate failed for object detection, retrying with CPU delegate', gpuError);
      this.detector = await ObjectDetector.createFromOptions(resolver, { baseOptions: { modelAssetPath, delegate: 'CPU' }, ...baseConfig });
    }
  }

  getEvents() { return this.events; }
  getInventory(): ObjectInventoryEntry[] {
    return Object.values(this.inventory).sort((a, b) => b.totalMs - a.totalMs);
  }

  detect(video: HTMLVideoElement, ts: number, handPositions: Array<{ x: number; y: number }> = []): ObjectDetection[] {
    if (!this.detector) return this.lastResult;
    this.frameCounter++;
    if (this.frameCounter % 3 !== 0) return this.lastResult;

    const result = this.detector.detectForVideo(video, ts);
    const objects: ObjectDetection[] = result.detections
      .filter((d) => d.categories[0]?.categoryName && d.categories[0].categoryName !== 'person' && d.boundingBox)
      .map((d) => {
        const cat = d.categories[0];
        const b = d.boundingBox!;
        const box = { x: b.originX, y: b.originY, width: b.width, height: b.height };
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const holdThreshold = Math.max(box.width, box.height) * 0.7;
        const held = handPositions.some((h) => distance2D(h, center) < holdThreshold);
        const lbl = label(cat.categoryName);
        const screenState = SCREEN_LABELS.has(lbl) ? this.sampleScreenState(video, box) : undefined;
        return {
          id: `${cat.categoryName}-${Math.round(b.originX / 40)}-${Math.round(b.originY / 40)}`,
          label: lbl,
          score: Math.round(cat.score * 100) / 100,
          box,
          held,
          screenState
        };
      });

    this.lastResult = objects;
    const currentKeys = new Set(objects.map((o) => o.label));
    const previousKeys = this.activeKeys;
    this.trackEvents(currentKeys, previousKeys, ts);
    this.trackInventory(currentKeys, previousKeys, ts);
    this.activeKeys = currentKeys;
    return objects;
  }

  private trackEvents(currentKeys: Set<string>, previousKeys: Set<string>, ts: number) {
    currentKeys.forEach((key) => {
      if (previousKeys.has(key)) return;
      if (ts - (this.lastEventAt[key] ?? -Infinity) < 6000) return;
      this.lastEventAt[key] = ts;
      this.events.unshift({ id: nowId(), time: Date.now(), severity: 'info', title: `OBJETO DETECTADO: ${key.toUpperCase()}`, detail: 'Objeto identificado en el encuadre' });
      this.events = this.events.slice(0, 50);
    });
    previousKeys.forEach((key) => {
      if (currentKeys.has(key)) return;
      const goneKey = `${key}_gone`;
      if (ts - (this.lastEventAt[goneKey] ?? -Infinity) < 6000) return;
      this.lastEventAt[goneKey] = ts;
      this.events.unshift({ id: nowId(), time: Date.now(), severity: 'info', title: `OBJETO RETIRADO: ${key.toUpperCase()}`, detail: 'Objeto que ya no está en el encuadre' });
      this.events = this.events.slice(0, 50);
    });
  }

  /** Crude on/off heuristic for a tv/laptop bounding box: an off screen is uniformly dark, a screen showing content is brighter and/or has varied colors across it. */
  private sampleScreenState(video: HTMLVideoElement, box: { x: number; y: number; width: number; height: number }): 'encendida' | 'apagada' | undefined {
    if (box.width < 4 || box.height < 4) return undefined;
    const w = 12, h = 8;
    this.screenCanvas.width = w;
    this.screenCanvas.height = h;
    const ctx = this.screenCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const lumas: number[] = [];
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      lumas.push(l);
      sum += l;
    }
    const avg = sum / lumas.length;
    const variance = lumas.reduce((a, v) => a + (v - avg) ** 2, 0) / lumas.length;
    return avg > 25 || Math.sqrt(variance) > 12 ? 'encendida' : 'apagada';
  }

  /** Session-long register of how long each object type has actually been on screen — not something a person tracks reliably by eye. */
  private trackInventory(currentKeys: Set<string>, previousKeys: Set<string>, ts: number) {
    const dt = this.lastTickTs ? ts - this.lastTickTs : 0;
    this.lastTickTs = ts;
    const now = Date.now();

    currentKeys.forEach((lbl) => {
      const entry = this.inventory[lbl];
      if (entry) {
        entry.totalMs += dt;
        entry.lastSeenAt = now;
        if (!previousKeys.has(lbl)) entry.timesSeen += 1;
      } else {
        this.inventory[lbl] = { label: lbl, firstSeenAt: now, lastSeenAt: now, totalMs: 0, timesSeen: 1 };
      }
    });
  }
}
