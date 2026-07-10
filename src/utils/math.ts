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
