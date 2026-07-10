export const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const pct = (v: number) => Math.round(clamp(v));
export const distance2D = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
export const distance3D = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const nowId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export class RollingValue {
  private values: number[] = [];
  constructor(private readonly size: number) {}
  push(value: number) {
    this.values.push(value);
    if (this.values.length > this.size) this.values.shift();
  }
  avg(fallback = 0) {
    if (!this.values.length) return fallback;
    return this.values.reduce((a, b) => a + b, 0) / this.values.length;
  }
  delta() {
    if (this.values.length < 2) return 0;
    return this.values[this.values.length - 1] - this.values[0];
  }
  stddev() {
    if (this.values.length < 2) return 0;
    const m = this.avg();
    const variance = this.values.reduce((a, v) => a + (v - m) ** 2, 0) / this.values.length;
    return Math.sqrt(variance);
  }
  /** Read-only snapshot of the current samples, oldest first — for callers that need consecutive-pair differences (e.g. jitter/shimmer). */
  raw(): readonly number[] {
    return this.values;
  }
}

/** Exponential moving average smoother for noisy per-frame signals. */
export class Ema {
  private value?: number;
  constructor(private readonly alpha: number) {}
  push(value: number) {
    this.value = this.value === undefined ? value : this.value + this.alpha * (value - this.value);
    return this.value;
  }
  get(fallback = 0) {
    return this.value ?? fallback;
  }
}

/**
 * Relative average consecutive-sample perturbation, 0-100 — the shared shape behind classic
 * jitter (period-to-period) and shimmer (amplitude-to-amplitude) voice-quality measures.
 */
export function relativeConsecutiveVariation(values: readonly number[]): number {
  if (values.length < 3) return 0;
  let diffSum = 0;
  for (let i = 1; i < values.length; i++) diffSum += Math.abs(values[i] - values[i - 1]);
  const meanDiff = diffSum / (values.length - 1);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (!mean) return 0;
  return clamp((meanDiff / mean) * 100);
}

/** Spatial spread of a single set of values (e.g. luma across a grid in one tick) — distinct from
 * RollingValue.stddev(), which is a temporal spread of values pushed over successive ticks. */
export function arrayStddev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Estimates the dominant frequency of an irregularly-sampled signal within [minHz, maxHz]
 * via a Goertzel-style scan (correlate against sin/cos at each candidate frequency, no FFT
 * library needed for such a narrow band). Used for both heart-rate rPPG and could serve any
 * other periodic-signal estimation. Samples are linearly resampled onto a uniform grid first
 * since frame timestamps aren't evenly spaced.
 */
export function dominantFrequency(samples: Array<{ t: number; v: number }>, minHz: number, maxHz: number, stepHz: number): { hz: number; confidence: number } {
  if (samples.length < 8) return { hz: 0, confidence: 0 };
  const t0 = samples[0].t;
  const duration = (samples[samples.length - 1].t - t0) / 1000;
  if (duration < 2) return { hz: 0, confidence: 0 };

  const resampleHz = 20;
  const n = Math.floor(duration * resampleHz);
  if (n < 8) return { hz: 0, confidence: 0 };
  const grid: number[] = new Array(n);
  let si = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + (i / resampleHz) * 1000;
    while (si < samples.length - 2 && samples[si + 1].t < t) si++;
    const a = samples[si], b = samples[Math.min(si + 1, samples.length - 1)];
    const span = b.t - a.t || 1;
    const frac = clamp((t - a.t) / span, 0, 1);
    grid[i] = lerp(a.v, b.v, frac);
  }

  const mean = grid.reduce((a, b) => a + b, 0) / grid.length;
  const detrended = grid.map((v) => v - mean);

  let bestHz = 0, bestPower = -1;
  const powers: number[] = [];
  for (let f = minHz; f <= maxHz; f += stepHz) {
    let re = 0, im = 0;
    for (let i = 0; i < detrended.length; i++) {
      const angle = 2 * Math.PI * f * (i / resampleHz);
      re += detrended[i] * Math.cos(angle);
      im += detrended[i] * Math.sin(angle);
    }
    const power = re * re + im * im;
    powers.push(power);
    if (power > bestPower) { bestPower = power; bestHz = f; }
  }
  const avgPower = powers.reduce((a, b) => a + b, 0) / powers.length || 1;
  const confidence = clamp((bestPower / avgPower - 1) * 12);
  return { hz: bestHz, confidence };
}

/**
 * Decompose a MediaPipe 4x4 column-major facial transformation matrix into
 * yaw/pitch/roll (degrees). Far more stable than 2D landmark-distance heuristics
 * because it comes from the model's actual 3D head pose estimate.
 */
export function matrixToEuler(m: Float32Array | number[]): { yaw: number; pitch: number; roll: number } {
  // m is column-major 4x4: m[col*4+row]
  const r00 = m[0], r10 = m[1], r20 = m[2];
  const r11 = m[5], r21 = m[6];
  const r12 = m[9], r22 = m[10];

  const sy = Math.hypot(r00, r10);
  const singular = sy < 1e-6;

  let x: number, y: number, z: number;
  if (!singular) {
    x = Math.atan2(r21, r22);
    y = Math.atan2(-r20, sy);
    z = Math.atan2(r10, r00);
  } else {
    x = Math.atan2(-r12, r11);
    y = Math.atan2(-r20, sy);
    z = 0;
  }
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  return { pitch: toDeg(x), yaw: toDeg(y), roll: toDeg(z) };
}
