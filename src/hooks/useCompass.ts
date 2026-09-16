import { useCallback, useEffect, useRef, useState } from 'react';

type IOSPermissionEvent = { requestPermission?: () => Promise<'granted' | 'denied'> };

/** Device compass heading (0-360, 0=north) via DeviceOrientationEvent. iOS Safari gates this
 * behind an explicit permission prompt that must be triggered by a user gesture — everywhere
 * else it "just works" once the listener is attached. */
export function useCompass() {
  const [heading, setHeading] = useState<number>();
  const [supported, setSupported] = useState(true);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [active, setActive] = useState(false);
  const handlerRef = useRef<(e: DeviceOrientationEvent) => void>();

  const stop = useCallback(() => {
    if (handlerRef.current) window.removeEventListener('deviceorientation', handlerRef.current);
    handlerRef.current = undefined;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    const Ctor = window.DeviceOrientationEvent as unknown as IOSPermissionEvent | undefined;
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
    const handler = (e: DeviceOrientationEvent) => {
      const webkitHeading = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      const h = webkitHeading ?? (e.alpha != null ? (360 - e.alpha) % 360 : undefined);
      if (h != null) setHeading(h);
    };
    handlerRef.current = handler;
    window.addEventListener('deviceorientation', handler);
    setActive(true);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { heading, supported, needsPermission, active, start, stop };
}
