import { useCallback, useEffect, useRef, useState } from 'react';
import { notify } from '../utils/notify';
import { speak } from '../utils/tts';
import { vibrate } from '../utils/phone';

const THRESHOLD_KEY = 'weros.batteryThreshold.v1';

export function loadBatteryThreshold(): number {
  try {
    const raw = localStorage.getItem(THRESHOLD_KEY);
    return raw ? Number(raw) : 20;
  } catch {
    return 20;
  }
}

export function saveBatteryThreshold(value: number) {
  try { localStorage.setItem(THRESHOLD_KEY, String(value)); } catch { /* ignore */ }
}

interface BatteryLike extends EventTarget {
  level: number;
  addEventListener(type: 'levelchange', listener: () => void): void;
  removeEventListener(type: 'levelchange', listener: () => void): void;
}

/** Fires once per discharge cycle when the battery crosses below the saved threshold — not every tick, so it doesn't nag repeatedly while sitting at 15%. */
export function useBatteryAlert() {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [level, setLevel] = useState<number>();
  const batteryRef = useRef<BatteryLike>();
  const listenerRef = useRef<() => void>();
  const alreadyFiredRef = useRef(false);

  const stop = useCallback(() => {
    if (batteryRef.current && listenerRef.current) batteryRef.current.removeEventListener('levelchange', listenerRef.current);
    batteryRef.current = undefined;
    listenerRef.current = undefined;
    setEnabled(false);
  }, []);

  const start = useCallback(async () => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (!nav.getBattery) { setSupported(false); return; }
    const battery = await nav.getBattery();
    batteryRef.current = battery;
    const check = () => {
      const pct = Math.round(battery.level * 100);
      setLevel(pct);
      const threshold = loadBatteryThreshold();
      if (pct <= threshold) {
        if (!alreadyFiredRef.current) {
          alreadyFiredRef.current = true;
          vibrate([200, 100, 200]);
          notify('Batería baja', `Te queda un ${pct}% de batería.`);
          speak(`Aviso: te queda un ${pct} por ciento de batería.`);
        }
      } else {
        alreadyFiredRef.current = false;
      }
    };
    check();
    listenerRef.current = check;
    battery.addEventListener('levelchange', check);
    setEnabled(true);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { supported, enabled, level, start, stop };
}
