import { useCallback, useEffect, useRef, useState } from 'react';
import { requestHandsFree } from '../utils/handsFreeBus';
import { speak } from '../utils/tts';

const ENGAGE_SPEED_MS = 8; // ~29 km/h, sustained
const DISENGAGE_SPEED_MS = 3; // ~11 km/h — hysteresis so a red light doesn't flip it off and on
const CONFIRM_READINGS = 3;

/**
 * Watches GPS speed (not the accelerometer — coords.speed from watchPosition is the actual
 * ground speed a GPS fix reports, far more reliable than inferring "driving" from raw motion) and
 * switches the voice assistant to hands-free automatically once it's sustained above driving
 * speed, so you're not tapping a mic button while your hands are on the wheel.
 */
export function useDrivingMode() {
  const [enabled, setEnabled] = useState(false);
  const [driving, setDriving] = useState(false);
  const [speedKmh, setSpeedKmh] = useState<number>();
  const watchIdRef = useRef<number>();
  const aboveCountRef = useRef(0);
  const belowCountRef = useRef(0);
  const drivingRef = useRef(false);

  const stop = useCallback(() => {
    if (watchIdRef.current !== undefined) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = undefined;
    setEnabled(false);
    setDriving(false);
    drivingRef.current = false;
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const speed = pos.coords.speed; // m/s, or null if the device can't tell
        if (speed == null) return;
        setSpeedKmh(Math.round(speed * 3.6));
        if (speed > ENGAGE_SPEED_MS) {
          aboveCountRef.current += 1;
          belowCountRef.current = 0;
          if (!drivingRef.current && aboveCountRef.current >= CONFIRM_READINGS) {
            drivingRef.current = true;
            setDriving(true);
            requestHandsFree(true);
            speak('Modo conducción activado. Manos libres puesto en marcha.');
          }
        } else if (speed < DISENGAGE_SPEED_MS) {
          belowCountRef.current += 1;
          aboveCountRef.current = 0;
          if (drivingRef.current && belowCountRef.current >= CONFIRM_READINGS) {
            drivingRef.current = false;
            setDriving(false);
          }
        }
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    setEnabled(true);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { enabled, driving, speedKmh, start, stop };
}
