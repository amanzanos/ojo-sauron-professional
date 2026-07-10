import type { VoiceFrame } from '../types/analysis';
import { clamp, pct, RollingValue } from '../utils/math';

export const EMPTY_VOICE: VoiceFrame = {
  active: false, speaking: false, volume: 0, pitchHz: 0, pitchVariability: 0, speakingRatePerMin: 0, vocalTension: 0
};

const SPEECH_VOLUME_THRESHOLD = 12; // 0-100 scale, energy above this counts as voice activity
const PITCH_WINDOW = 1024; // sub-slice of the analyser buffer used for autocorrelation

/** Classic time-domain autocorrelation pitch detector (as used in many browser tuner apps). Returns Hz, or -1 if unvoiced/too quiet. */
function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  const size = buf.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return -1;

  let r1 = 0, r2 = size - 1;
  const thres = 0.2;
  for (let i = 0; i < size / 2; i++) { if (Math.abs(buf[i]) < thres) { r1 = i; break; } }
  for (let i = 1; i < size / 2; i++) { if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; } }
  const trimmed = buf.slice(r1, r2);
  const n = trimmed.length;
  if (n < 8) return -1;

  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n - i; j++) sum += trimmed[j] * trimmed[j + i];
    c[i] = sum;
  }
  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let maxVal = -1, maxPos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }
  if (maxPos <= 0 || maxPos >= n - 1) return -1;
  const x1 = c[maxPos - 1], x2 = c[maxPos], x3 = c[maxPos + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const t0 = a ? maxPos - b / (2 * a) : maxPos;
  const hz = sampleRate / t0;
  return hz > 60 && hz < 500 ? hz : -1; // human voice fundamental range
}

/** Opt-in microphone analysis (volume/VAD/pitch/rhythm) via the Web Audio API — no ML model. */
export class VoiceAnalysisEngine {
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private stream?: MediaStream;
  private buffer = new Float32Array(2048);
  private pitchHistory = new RollingValue(40);
  private volumeHistory = new RollingValue(60);
  private speakingSegments: number[] = [];
  private wasSpeaking = false;
  private frameCounter = 0;

  get active() { return !!this.analyser; }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.buffer = new Float32Array(this.analyser.fftSize);
    source.connect(this.analyser);
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.stream = undefined;
    this.ctx = undefined;
    this.analyser = undefined;
  }

  sample(ts: number): VoiceFrame {
    if (!this.analyser || !this.ctx) return EMPTY_VOICE;
    this.frameCounter++;
    this.analyser.getFloatTimeDomainData(this.buffer);

    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) sum += this.buffer[i] * this.buffer[i];
    const rms = Math.sqrt(sum / this.buffer.length);
    const volume = clamp(rms * 400);
    this.volumeHistory.push(volume);

    const speaking = volume > SPEECH_VOLUME_THRESHOLD;
    if (speaking && !this.wasSpeaking) this.speakingSegments.push(ts);
    this.wasSpeaking = speaking;
    this.speakingSegments = this.speakingSegments.filter((t) => ts - t < 60000);

    if (speaking && this.frameCounter % 3 === 0) {
      const hz = autoCorrelate(this.buffer.subarray(0, PITCH_WINDOW), this.ctx.sampleRate);
      if (hz > 0) this.pitchHistory.push(hz);
    }

    const pitchVariability = clamp(this.pitchHistory.stddev() / 1.4);
    const vocalTension = clamp(pitchVariability * 0.5 + this.volumeHistory.stddev() * 0.9);

    return {
      active: true,
      speaking,
      volume: pct(volume),
      pitchHz: Math.round(this.pitchHistory.avg()),
      pitchVariability: pct(pitchVariability),
      speakingRatePerMin: this.speakingSegments.length,
      vocalTension: pct(vocalTension)
    };
  }
}
