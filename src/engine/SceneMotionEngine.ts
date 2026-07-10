import type { SceneMotionFrame } from '../types/analysis';
import { clamp } from '../utils/math';

export const EMPTY_SCENE_MOTION: SceneMotionFrame = { overallMotion: 0, heatmap: [], gridW: 0, gridH: 0 };

const GRID_W = 24;
const GRID_H = 14;
const HEATMAP_DECAY = 0.995; // recent activity stands out, but old activity doesn't dominate forever

/**
 * Whole-frame activity detection — independent of face/person detection, so it reads the room
 * itself: something moving in the background, a door opening, traffic passing by a window.
 * Classic grid-based frame differencing on downscaled luminance, same offscreen-canvas
 * technique already used for lighting/heart-rate sampling, just applied to the full frame
 * instead of a face ROI. Accumulates a session-long heatmap of which regions see the most
 * activity, not just the instantaneous reading.
 */
export class SceneMotionEngine {
  private canvas = document.createElement('canvas');
  private prevGray: Float32Array | null = null;
  private heatmap = new Float32Array(GRID_W * GRID_H);
  private frameCounter = 0;
  private lastResult: SceneMotionFrame = EMPTY_SCENE_MOTION;

  sample(video: HTMLVideoElement): SceneMotionFrame {
    if (!video.videoWidth) return this.lastResult;
    this.frameCounter++;
    if (this.frameCounter % 2 !== 0) return this.lastResult;

    this.canvas.width = GRID_W;
    this.canvas.height = GRID_H;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return this.lastResult;
    ctx.drawImage(video, 0, 0, GRID_W, GRID_H);
    const { data } = ctx.getImageData(0, 0, GRID_W, GRID_H);

    const gray = new Float32Array(GRID_W * GRID_H);
    for (let i = 0; i < gray.length; i++) {
      const o = i * 4;
      gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    }

    if (!this.prevGray) {
      this.prevGray = gray;
      this.lastResult = { overallMotion: 0, heatmap: Array.from(this.heatmap), gridW: GRID_W, gridH: GRID_H };
      return this.lastResult;
    }

    let sum = 0;
    for (let i = 0; i < gray.length; i++) {
      const delta = Math.abs(gray[i] - this.prevGray[i]) / 255;
      this.heatmap[i] = this.heatmap[i] * HEATMAP_DECAY + delta;
      sum += delta;
    }
    this.prevGray = gray;

    const overallMotion = clamp((sum / gray.length) * 800);
    this.lastResult = { overallMotion, heatmap: Array.from(this.heatmap), gridW: GRID_W, gridH: GRID_H };
    return this.lastResult;
  }
}
