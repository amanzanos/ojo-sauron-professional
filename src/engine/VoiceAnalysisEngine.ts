import type { AnalysisEvent, VoiceFrame } from '../types/analysis';
import { clamp, nowId, pct, relativeConsecutiveVariation, RollingValue } from '../utils/math';

export const EMPTY_VOICE: VoiceFrame = {
  active: false, speaking: false, volume: 0, pitchHz: 0, pitchVariability: 0, speakingRatePerMin: 0, vocalTension: 0,
  jitter: 0, shimmer: 0, hesitationsPerMin: 0, totalHesitations: 0, pitchBaselineDeviation: 0, ambientNoise: 0,
  fingerprint: [], utterancePitchHz: 0, justStoppedSpeaking: false, activeSpeakerLabel: ''
};

const SPEECH_VOLUME_THRESHOLD = 12; // 0-100 scale, energy above this counts as voice activity
const PITCH_WINDOW = 1024; // sub-slice of the analyser buffer used for autocorrelation
const HESITATION_MIN_MS = 150;
const HESITATION_MAX_MS = 1500;
const FINGERPRINT_BANDS = 20;
const FINGERPRINT_MIN_HZ = 80;
const FINGERPRINT_MAX_HZ = 4000;

/** Buckets a frequency-domain spectrum into log-spaced bands and normalizes away loudness — a coarse "timbre shape" usable as a speaker fingerprint. */
function spectralBands(freqData: Uint8Array, sampleRate: number, fftSize: number): number[] {
  const bands = new Array(FINGERPRINT_BANDS).fill(0);
  const counts = new Array(FINGERPRINT_BANDS).fill(0);
  const binHz = sampleRate / fftSize;
  const logMin = Math.log(FINGERPRINT_MIN_HZ);
  const logMax = Math.log(FINGERPRINT_MAX_HZ);
  for (let i = 0; i < freqData.length; i++) {
    const hz = i * binHz;
    if (hz < FINGERPRINT_MIN_HZ || hz > FINGERPRINT_MAX_HZ) continue;
    const t = (Math.log(hz) - logMin) / (logMax - logMin);
    const band = Math.min(FINGERPRINT_BANDS - 1, Math.max(0, Math.floor(t * FINGERPRINT_BANDS)));
    bands[band] += freqData[i];
    counts[band] += 1;
  }
  for (let b = 0; b < FINGERPRINT_BANDS; b++) bands[b] = counts[b] ? bands[b] / counts[b] : 0;
  const total = bands.reduce((a, b) => a + b, 0) || 1;
  return bands.map((v) => v / total);
}

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

/** Opt-in microphone analysis (volume/VAD/pitch/rhythm + voice-quality biomarkers) via the Web Audio API — no ML model. */
export class VoiceAnalysisEngine {
  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private source?: MediaStreamAudioSourceNode;
  private stream?: MediaStream;
  private buffer = new Float32Array(2048);
  private freqBuffer = new Uint8Array(1024);
  private fingerprintSum = new Array(FINGERPRINT_BANDS).fill(0);
  private fingerprintCount = 0;
  private utterancePitchSum = 0;
  private utterancePitchCount = 0;
  private pitchHistory = new RollingValue(40);
  private pitchBaseline = new RollingValue(200);
  private volumeHistory = new RollingValue(60);
  private ambientHistory = new RollingValue(300);
  private shimmerHistory = new RollingValue(30);
  private speakingSegments: number[] = [];
  private hesitationTimes: number[] = [];
  private totalHesitations = 0;
  private wasSpeaking = false;
  private lastSpeechEndTs?: number;
  private frameCounter = 0;
  private eventState: Record<string, number | undefined> = {};
  private lastEventAt: Record<string, number> = {};
  private events: AnalysisEvent[] = [];

  get active() { return !!this.analyser; }
  getEvents() { return this.events; }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.ctx = new AudioContext();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.freqBuffer = new Uint8Array(this.analyser.frequencyBinCount);
    this.source.connect(this.analyser);
  }

  /** Lets other audio engines (e.g. sound classification) tap the same mic stream without a second getUserMedia prompt. */
  getAudioGraph(): { ctx: AudioContext; source: MediaStreamAudioSourceNode } | undefined {
    if (!this.ctx || !this.source) return undefined;
    return { ctx: this.ctx, source: this.source };
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.stream = undefined;
    this.ctx = undefined;
    this.analyser = undefined;
    this.source = undefined;
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
    if (speaking) this.shimmerHistory.push(volume);
    else this.ambientHistory.push(volume); // background noise floor, excluding the person's own voice
    if (speaking && !this.wasSpeaking) {
      if (this.lastSpeechEndTs !== undefined) {
        const gap = ts - this.lastSpeechEndTs;
        if (gap >= HESITATION_MIN_MS && gap <= HESITATION_MAX_MS) {
          this.hesitationTimes.push(ts);
          this.totalHesitations++;
        }
      }
      this.speakingSegments.push(ts);
      this.fingerprintSum = new Array(FINGERPRINT_BANDS).fill(0);
      this.fingerprintCount = 0;
      this.utterancePitchSum = 0;
      this.utterancePitchCount = 0;
    }
    const justStoppedSpeaking = !speaking && this.wasSpeaking;
    if (justStoppedSpeaking) this.lastSpeechEndTs = ts;
    this.wasSpeaking = speaking;

    if (speaking) {
      this.analyser.getByteFrequencyData(this.freqBuffer);
      const bands = spectralBands(this.freqBuffer, this.ctx.sampleRate, this.analyser.fftSize);
      for (let i = 0; i < FINGERPRINT_BANDS; i++) this.fingerprintSum[i] += bands[i];
      this.fingerprintCount++;
    }
    this.speakingSegments = this.speakingSegments.filter((t) => ts - t < 60000);
    this.hesitationTimes = this.hesitationTimes.filter((t) => ts - t < 60000);

    if (speaking && this.frameCounter % 3 === 0) {
      const hz = autoCorrelate(this.buffer.subarray(0, PITCH_WINDOW), this.ctx.sampleRate);
      if (hz > 0) {
        this.pitchHistory.push(hz);
        this.pitchBaseline.push(hz);
        this.utterancePitchSum += hz;
        this.utterancePitchCount++;
      }
    }

    const pitchVariability = clamp(this.pitchHistory.stddev() / 1.4);
    const vocalTension = clamp(pitchVariability * 0.5 + this.volumeHistory.stddev() * 0.9);

    // Jitter/shimmer are classically measured cycle-by-cycle on the glottal waveform; this is a
    // frame-level proxy (relative consecutive perturbation of detected pitch period / amplitude)
    // — the same shape of signal, coarser resolution, no dedicated glottal-cycle detector needed.
    const periods = this.pitchHistory.raw().map((hz) => 1000 / hz);
    const jitter = relativeConsecutiveVariation(periods);
    const shimmer = relativeConsecutiveVariation(this.shimmerHistory.raw());

    const baselineAvg = this.pitchBaseline.avg();
    const pitchBaselineDeviation = this.pitchBaseline.raw().length >= 20 && baselineAvg > 0
      ? clamp((Math.abs(this.pitchHistory.avg() - baselineAvg) / baselineAvg) * 200)
      : 0;

    const frame: VoiceFrame = {
      active: true,
      speaking,
      volume: pct(volume),
      pitchHz: Math.round(this.pitchHistory.avg()),
      pitchVariability: pct(pitchVariability),
      speakingRatePerMin: this.speakingSegments.length,
      vocalTension: pct(vocalTension),
      jitter: pct(jitter),
      shimmer: pct(shimmer),
      hesitationsPerMin: this.hesitationTimes.length,
      totalHesitations: this.totalHesitations,
      pitchBaselineDeviation: pct(pitchBaselineDeviation),
      ambientNoise: pct(this.ambientHistory.avg()),
      fingerprint: this.fingerprintCount ? this.fingerprintSum.map((v) => v / this.fingerprintCount) : [],
      // pitchHz above is a continuous rolling smoothing window kept across utterance boundaries (by
      // design, so the live readout doesn't jump to 0 the instant someone starts talking) — it isn't
      // representative of a single utterance and smears together whoever spoke just before. Speaker
      // identification needs a pitch reset at each utterance start, hence this separate value.
      utterancePitchHz: this.utterancePitchCount ? Math.round(this.utterancePitchSum / this.utterancePitchCount) : 0,
      justStoppedSpeaking,
      activeSpeakerLabel: ''
    };
    this.checkEvents(ts, frame);
    return frame;
  }

  /**
   * Sustained-threshold voice events (same "held for several seconds, not just a blip" shape as
   * FaceAnalysisEngine's emotional firewall) — surfaced in the shared Events feed, not just the
   * live Audio tab readout, so a genuinely notable vocal pattern doesn't just flash by unnoticed.
   */
  private checkEvents(ts: number, f: VoiceFrame) {
    const push = (severity: AnalysisEvent['severity'], title: string, detail: string, cooldown: number, key: string) => {
      if (ts - (this.lastEventAt[key] ?? -Infinity) < cooldown) return;
      this.lastEventAt[key] = ts;
      this.events.unshift({ id: nowId(), time: Date.now(), severity, title, detail });
      this.events = this.events.slice(0, 50);
    };
    const sustained = (key: string, condition: boolean, minMs: number) => {
      if (!condition) { this.eventState[key] = undefined; return false; }
      this.eventState[key] ??= ts;
      return ts - this.eventState[key]! >= minMs;
    };

    if (sustained('tension', f.speaking && f.vocalTension > 70, 4000)) {
      push('warning', 'TENSIÓN VOCAL SOSTENIDA', 'Tono y volumen de voz muestran tensión mantenida durante varios segundos', 20000, 'tension');
    }
    if (sustained('jitter', f.speaking && f.jitter > 55, 4000)) {
      push('warning', 'INESTABILIDAD VOCAL ELEVADA', 'Jitter alto sostenido — posible indicador de tensión o fatiga vocal', 20000, 'jitter');
    }
    if (sustained('loud', f.speaking && f.volume > 85, 3000)) {
      push('warning', 'VOZ MUY ELEVADA', 'Volumen de voz inusualmente alto de forma sostenida', 20000, 'loud');
    }
    if (sustained('baseline', f.pitchBaselineDeviation > 60, 5000)) {
      push('info', 'TONO DE VOZ INUSUAL', 'La voz se desvía de forma notable respecto al tono habitual de la persona', 25000, 'baseline');
    }
    if (sustained('hesitation', f.hesitationsPerMin > 12, 3000)) {
      push('info', 'HABLA ENTRECORTADA', 'Aumentan las vacilaciones/pausas dentro del discurso', 25000, 'hesitation');
    }
  }
}
