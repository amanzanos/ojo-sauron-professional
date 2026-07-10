import type { FaceBox, HeartRateFrame } from '../types/analysis';
import { dominantFrequency, pct, RollingValue } from '../utils/math';

export const EMPTY_HEART_RATE: HeartRateFrame = { active: false, bpm: 0, confidence: 0 };

const BUFFER_MS = 10000;
const UPDATE_INTERVAL_MS = 2000;
const MIN_HZ = 0.75; // 45 bpm
const MAX_HZ = 3.5; // 210 bpm
const STEP_HZ = 0.02;
const CONFIDENCE_THRESHOLD = 35;
const MOTION_LIMIT = 40; // rPPG needs a mostly-still face; motion artifacts drown the pulse signal

/**
 * Remote photoplethysmography (rPPG): the skin's green-channel reflectance subtly pulses with
 * each heartbeat. No ML model — sample a forehead region every frame, then every couple of
 * seconds scan for the dominant frequency in the plausible heart-rate band. Same family of
 * hand-rolled DSP as the voice pitch detector, applied to a pixel signal instead of audio.
 */
export class HeartRateEngine {
  private canvas = document.createElement('canvas');
  private samples: Array<{ t: number; v: number }> = [];
  private lastUpdate = 0;
  private lastResult: HeartRateFrame = EMPTY_HEART_RATE;
  private bpmHistory = new RollingValue(6);

  sample(video: HTMLVideoElement, faceBox: FaceBox | undefined, ts: number, motion: number): HeartRateFrame {
    if (!faceBox || !video.videoWidth) return this.lastResult;

    const roiX = faceBox.x + faceBox.width * 0.32;
    const roiY = faceBox.y + faceBox.height * 0.06;
    const roiW = faceBox.width * 0.36;
    const roiH = faceBox.height * 0.14;
    if (roiW < 4 || roiH < 4) return this.lastResult;

    const w = 16, h = 8;
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return this.lastResult;
    ctx.drawImage(video, roiX, roiY, roiW, roiH, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let sumGreen = 0;
    for (let i = 0; i < data.length; i += 4) sumGreen += data[i + 1];
    const meanGreen = sumGreen / (data.length / 4);

    this.samples.push({ t: ts, v: meanGreen });
    this.samples = this.samples.filter((s) => ts - s.t < BUFFER_MS);

    if (ts - this.lastUpdate < UPDATE_INTERVAL_MS) return this.lastResult;
    this.lastUpdate = ts;

    if (motion > MOTION_LIMIT || this.samples.length < 40) {
      this.lastResult = { active: false, bpm: Math.round(this.bpmHistory.avg()), confidence: 0 };
      return this.lastResult;
    }

    const { hz, confidence } = dominantFrequency(this.samples, MIN_HZ, MAX_HZ, STEP_HZ);
    if (hz > 0 && confidence > CONFIDENCE_THRESHOLD) this.bpmHistory.push(hz * 60);

    const smoothedBpm = Math.round(this.bpmHistory.avg());
    this.lastResult = {
      active: smoothedBpm > 0 && confidence > CONFIDENCE_THRESHOLD,
      bpm: smoothedBpm,
      confidence: pct(confidence)
    };
    return this.lastResult;
  }
}
