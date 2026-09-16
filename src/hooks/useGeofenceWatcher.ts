import { useCallback, useEffect, useRef, useState } from 'react';
import { distanceMeters } from '../utils/geo';
import { loadGeofences, saveGeofences } from '../utils/geofenceStorage';
import { notify } from '../utils/notify';
import { speak } from '../utils/tts';
import { vibrate } from '../utils/phone';

const CHECK_INTERVAL_MS = 15000; // geofences don't need GPS-frame precision — a coffee-walk's worth of lag is fine

/** Fires a reminder once you get within range of a saved place, then deactivates that geofence (one-shot, re-enable manually from the list to reuse it for a recurring place). */
export function useGeofenceWatcher() {
  const [enabled, setEnabled] = useState(false);
  const watchIdRef = useRef<number>();
  const intervalRef = useRef<number>();
  const lastPositionRef = useRef<{ lat: number; lng: number }>();

  const checkNow = useCallback(() => {
    const position = lastPositionRef.current;
    if (!position) return;
    const geofences = loadGeofences();
    let changed = false;
    geofences.forEach((g) => {
      if (!g.active) return;
      if (distanceMeters(position, g) <= g.radiusM) {
        g.active = false;
        changed = true;
        vibrate([150, 80, 150]);
        notify('WEROS — recordatorio de lugar', g.message);
        speak(`Has llegado. Recordatorio: ${g.message}`);
      }
    });
    if (changed) saveGeofences(geofences);
  }, []);

  const stop = useCallback(() => {
    if (watchIdRef.current !== undefined) navigator.geolocation.clearWatch(watchIdRef.current);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    watchIdRef.current = undefined;
    intervalRef.current = undefined;
    setEnabled(false);
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => { lastPositionRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 20000 }
    );
    intervalRef.current = window.setInterval(checkNow, CHECK_INTERVAL_MS);
    setEnabled(true);
  }, [checkNow]);

  useEffect(() => () => stop(), [stop]);

  return { enabled, start, stop };
}
