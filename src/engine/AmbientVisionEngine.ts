import type { AmbientFrame, AnalysisEvent, FaceBox } from '../types/analysis';
import { arrayStddev, clamp, nowId, pct, RollingValue } from '../utils/math';

export const EMPTY_AMBIENT: AmbientFrame = {
  lux: 0, colorTemp: 0, colorTempLabel: 'neutra', flickerScore: 0, backlightScore: 0, shakeScore: 0, hazeScore: 0
};

const GRID_W = 24;
const GRID_H = 14;
const ACTIVE_CELL_THRESHOLD = 0.05; // per-cell normalized luma delta considered "moved this tick"

/**
 * Ambient visual-quality reader: one grid sample per tick (own canvas, RGB retained — unlike
 * SceneMotionEngine/FaceAnalysisEngine's lighting check, which both collapse to luma
 * immediately) feeds six derived signals, so adding a signal doesn't mean adding a canvas draw.
 * All indices are relative/heuristic, no calibrated sensor — same honesty framing as
 * ambientNoise/vocalTension elsewhere in this app.
 */
export class AmbientVisionEngine {
  private canvas = document.createElement('canvas');
  private prevGray: Float32Array | null = null;
  private prevActiveFraction = 0;
  private lumaHistory = new RollingValue(60); // flicker window (~1-2s at this engine's tick rate)
  private contrastHistory = new RollingValue(150); // haze baseline window (~10-15s)
  private brightnessHistory = new RollingValue(150);
  private frameCounter = 0;
  private lastResult: AmbientFrame = EMPTY_AMBIENT;
  private sustainState: Record<string, number | undefined> = {};
  private lastEventAt: Record<string, number> = {};
  private events: AnalysisEvent[] = [];

  getEvents() { return this.events; }

  sample(video: HTMLVideoElement, faceBox: FaceBox | undefined, ts: number): AmbientFrame {
    if (!video.videoWidth) return this.lastResult;
    this.frameCounter++;
    if (this.frameCounter % 2 !== 0) return this.lastResult;

    this.canvas.width = GRID_W;
    this.canvas.height = GRID_H;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return this.lastResult;
    ctx.drawImage(video, 0, 0, GRID_W, GRID_H);
    const { data } = ctx.getImageData(0, 0, GRID_W, GRID_H);

    const n = GRID_W * GRID_H;
    const gray = new Float32Array(n);
    let rSum = 0, bSum = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      rSum += r; bSum += b;
    }
    const lumaAvg = gray.reduce((a, v) => a + v, 0) / n; // 0-255
    const lux = pct((lumaAvg / 200) * 100);

    const rAvg = rSum / n, bAvg = bSum / n;
    const colorTemp = Math.round(clamp(((rAvg - bAvg) / 255) * 200, -100, 100));
    const colorTempLabel: AmbientFrame['colorTempLabel'] = colorTemp > 12 ? 'cálida' : colorTemp < -12 ? 'fría' : 'neutra';

    // Motion: own state (can't reach into SceneMotionEngine's private prevGray, separate instance).
    let meanDelta = 0;
    let activeCount = 0;
    if (this.prevGray) {
      for (let i = 0; i < n; i++) {
        const delta = Math.abs(gray[i] - this.prevGray[i]) / 255;
        meanDelta += delta;
        if (delta > ACTIVE_CELL_THRESHOLD) activeCount++;
      }
      meanDelta /= n;
    }
    const activeFraction = activeCount / n;

    // Flicker: only meaningful while the scene itself is calm, otherwise a hand waving in front
    // of a bright window reads as luma variance and gets misread as flicker. The calm gate above
    // (meanDelta < 0.02, ~5 raw luma units of whole-frame change per tick) caps how much
    // oscillation amplitude this can ever see without being misread as camera shake instead —
    // ×10 keeps a real but subtle flicker ripple within that ceiling legible as a score, rather
    // than needing an implausibly large amplitude to ever read as more than a sliver.
    this.lumaHistory.push(lumaAvg);
    const flickerScore = meanDelta < 0.02 ? pct(this.lumaHistory.stddev() * 10) : this.lastResult.flickerScore;

    // Backlight: face box vs rest of frame, reusing this same grid — no extra canvas needed.
    let backlightScore = 0;
    if (faceBox && video.videoWidth && video.videoHeight) {
      const gx0 = Math.floor((faceBox.x / video.videoWidth) * GRID_W);
      const gx1 = Math.ceil(((faceBox.x + faceBox.width) / video.videoWidth) * GRID_W);
      const gy0 = Math.floor((faceBox.y / video.videoHeight) * GRID_H);
      const gy1 = Math.ceil(((faceBox.y + faceBox.height) / video.videoHeight) * GRID_H);
      let faceSum = 0, faceCount = 0, restSum = 0, restCount = 0;
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const idx = y * GRID_W + x;
          if (x >= gx0 && x < gx1 && y >= gy0 && y < gy1) { faceSum += gray[idx]; faceCount++; }
          else { restSum += gray[idx]; restCount++; }
        }
      }
      if (faceCount && restCount) {
        backlightScore = pct(((restSum / restCount - faceSum / faceCount) / 255) * 200);
      }
    }

    // Camera shake: a physical jolt shifts nearly every cell at once, in a single tick, right
    // after a calm one — unlike a person moving locally (a contiguous minority of cells) or
    // walking toward the camera (activeFraction ramps up gradually over many ticks).
    const shakeSpike = activeFraction > 0.80 && meanDelta > 0.04 && this.prevActiveFraction < 0.30;
    const shakeScore = shakeSpike ? 100 : 0;

    // Haze/smoke (experimental, low confidence): spatial contrast across the grid collapses
    // while brightness holds or rises — distinguishes it from "someone dimmed the lights", which
    // drops contrast AND brightness together and is already covered by FaceAnalysisEngine's
    // lighting check.
    const contrastNow = arrayStddev(Array.from(gray));
    const contrastBaseline = this.contrastHistory.avg(contrastNow);
    this.contrastHistory.push(contrastNow);
    this.brightnessHistory.push(lumaAvg);
    const brightnessDelta = this.brightnessHistory.delta();
    const hazeScore = contrastBaseline > 0 ? pct(((contrastBaseline - contrastNow) / contrastBaseline) * 150) : 0;
    const hazeCondition = hazeScore > 55 && brightnessDelta > -5;

    this.prevGray = gray;
    this.prevActiveFraction = activeFraction;

    this.checkEvents(ts, { flickerScore, backlightScore, hazeCondition, shakeSpike });

    this.lastResult = { lux, colorTemp, colorTempLabel, flickerScore, backlightScore, shakeScore, hazeScore };
    return this.lastResult;
  }

  private sustained(ts: number, key: string, condition: boolean, minDuration: number, cooldown: number, severity: AnalysisEvent['severity'], title: string, detail: string) {
    if (!condition) { this.sustainState[key] = undefined; return; }
    this.sustainState[key] ??= ts;
    if (ts - this.sustainState[key]! < minDuration) return;
    if (ts - (this.lastEventAt[key] ?? -Infinity) < cooldown) return;
    this.lastEventAt[key] = ts;
    this.events.unshift({ id: nowId(), time: Date.now(), severity, title, detail });
    this.events = this.events.slice(0, 50);
  }

  private checkEvents(ts: number, f: { flickerScore: number; backlightScore: number; hazeCondition: boolean; shakeSpike: boolean }) {
    this.sustained(ts, 'flicker', f.flickerScore > 60, 3000, 25000, 'info', 'PARPADEO DE LUZ DETECTADO', 'Oscilación periódica de brillo — posible iluminación artificial de baja calidad');
    this.sustained(ts, 'backlight', f.backlightScore > 55, 4000, 25000, 'info', 'CONTRALUZ', 'La persona está más oscura que el fondo — ajustar la fuente de luz mejoraría la detección');
    this.sustained(ts, 'haze', f.hazeCondition, 9000, 60000, 'warning', 'POSIBLE HUMO O NIEBLA (BAJA CONFIANZA)', 'Caída notable de nitidez en la imagen sin oscurecerse — señal experimental, puede ser un falso positivo');
    if (f.shakeSpike && ts - (this.lastEventAt.shake ?? -Infinity) > 5000) {
      this.lastEventAt.shake = ts;
      this.events.unshift({ id: nowId(), time: Date.now(), severity: 'info', title: 'VIBRACIÓN BRUSCA DE CÁMARA', detail: 'Movimiento repentino y uniforme de toda la imagen' });
      this.events = this.events.slice(0, 50);
    }
  }
}
