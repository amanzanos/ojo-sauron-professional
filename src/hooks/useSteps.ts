import { useCallback, useEffect, useRef, useState } from 'react';

type IOSPermissionEvent = { requestPermission?: () => Promise<'granted' | 'denied'> };

const STORAGE_KEY = 'weros.steps.v1'; // { date: 'YYYY-MM-DD', count: number }
const STEP_THRESHOLD = 1.2; // m/s² above baseline gravity magnitude — tuned loosely, not clinically
const MIN_STEP_INTERVAL_MS = 250; // ~240 spm cap, filters out sensor jitter double-counting one step

function todayLabel() {
  return new Date().toLocaleDateString('en-CA');
}

function loadTodayCount(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date: string; count: number };
    return parsed.date === todayLabel() ? parsed.count : 0;
  } catch {
    return 0;
  }
}

function saveTodayCount(count: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: todayLabel(), count }));
  } catch {
    // ignore
  }
}

/**
 * A basic peak-detection pedometer over DeviceMotion's acceleration magnitude — not a clinically
 * accurate step counter, but good enough for "roughly how much have I walked today" alongside the
 * daily summary, without any native app or wearable.
 */
export function useSteps() {
  const [count, setCount] = useState(loadTodayCount);
  const [supported, setSupported] = useState(true);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [active, setActive] = useState(false);
  const aboveThresholdRef = useRef(false);
  const lastStepAtRef = useRef(0);
  const handlerRef = useRef<(e: DeviceMotionEvent) => void>();

  const stop = useCallback(() => {
    if (handlerRef.current) window.removeEventListener('devicemotion', handlerRef.current);
    handlerRef.current = undefined;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    const Ctor = window.DeviceMotionEvent as unknown as IOSPermissionEvent | undefined;
    if (!Ctor) { setSupported(false); return; }
    if (typeof Ctor.requestPermission === 'function') {
      try {
        const result = await Ctor.requestPermission();
        if (result !== 'granted') { setNeedsPermission(true); return; }
      } catch {
        setNeedsPermission(true);
        return;
      }
    }
    setNeedsPermission(false);
    const handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const magnitude = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      const deviation = Math.abs(magnitude - 9.81);
      const now = Date.now();
      if (deviation > STEP_THRESHOLD && !aboveThresholdRef.current && now - lastStepAtRef.current > MIN_STEP_INTERVAL_MS) {
        aboveThresholdRef.current = true;
        lastStepAtRef.current = now;
        setCount((c) => {
          const next = c + 1;
          saveTodayCount(next);
          return next;
        });
      } else if (deviation < STEP_THRESHOLD * 0.6) {
        aboveThresholdRef.current = false;
      }
    };
    handlerRef.current = handler;
    window.addEventListener('devicemotion', handler);
    setActive(true);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { count, supported, needsPermission, active, start, stop };
}
