import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import type { AnalysisEvent, ObjectDetection } from '../types/analysis';
import { nowId } from '../utils/math';

const SPANISH_LABELS: Record<string, string> = {
  'cell phone': 'móvil', cup: 'taza', bottle: 'botella', book: 'libro', laptop: 'portátil',
  keyboard: 'teclado', mouse: 'ratón', remote: 'mando', knife: 'cuchillo', scissors: 'tijeras',
  backpack: 'mochila', handbag: 'bolso', 'wine glass': 'copa', fork: 'tenedor', spoon: 'cuchara',
  bowl: 'bol', clock: 'reloj', vase: 'jarrón', scissor: 'tijeras', 'teddy bear': 'peluche',
  umbrella: 'paraguas', tie: 'corbata', suitcase: 'maleta'
};

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

  detect(video: HTMLVideoElement, ts: number): ObjectDetection[] {
    if (!this.detector) return this.lastResult;
    this.frameCounter++;
    if (this.frameCounter % 3 !== 0) return this.lastResult;

    const result = this.detector.detectForVideo(video, ts);
    const objects: ObjectDetection[] = result.detections
      .filter((d) => d.categories[0]?.categoryName && d.categories[0].categoryName !== 'person' && d.boundingBox)
      .map((d) => {
        const cat = d.categories[0];
        const b = d.boundingBox!;
        return {
          id: `${cat.categoryName}-${Math.round(b.originX / 40)}-${Math.round(b.originY / 40)}`,
          label: label(cat.categoryName),
          score: Math.round(cat.score * 100) / 100,
          box: { x: b.originX, y: b.originY, width: b.width, height: b.height }
        };
      });

    this.lastResult = objects;
    this.trackEvents(objects, ts);
    return objects;
  }

  private trackEvents(objects: ObjectDetection[], ts: number) {
    const currentKeys = new Set(objects.map((o) => o.label));
    currentKeys.forEach((key) => {
      if (this.activeKeys.has(key)) return;
      if ((this.lastEventAt[key] ?? 0) + 6000 > ts) return;
      this.lastEventAt[key] = ts;
      this.events.unshift({ id: nowId(), time: Date.now(), severity: 'info', title: `OBJETO DETECTADO: ${key.toUpperCase()}`, detail: 'Objeto identificado en el encuadre' });
      this.events = this.events.slice(0, 50);
    });
    this.activeKeys = currentKeys;
  }
}
