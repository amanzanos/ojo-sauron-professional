import { useEffect, useRef } from 'react';
import { loadPatrolWindows } from '../utils/patrolSchedule';

/**
 * Checks once a minute whether "now" falls inside a saved patrol window and drives witness mode
 * accordingly — starts it on entering a window (only if nothing is already recording), and stops
 * it on leaving one, but only the recording *this scheduler itself* started; a manual recording
 * that happens to still be running past a window's end is left alone.
 */
export function usePatrolScheduler(recording: boolean, onStart: () => void, onStop: () => void) {
  const startedByScheduler = useRef(false);

  useEffect(() => {
    if (!recording) startedByScheduler.current = false;
  }, [recording]);

  useEffect(() => {
    const tick = () => {
      const windows = loadPatrolWindows().filter((w) => w.active);
      if (!windows.length) return;
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const day = now.getDay();
      const inWindow = windows.some((w) => w.days.includes(day) && minutes >= w.startMinutes && minutes < w.endMinutes);

      if (inWindow && !recording) {
        startedByScheduler.current = true;
        onStart();
      } else if (!inWindow && recording && startedByScheduler.current) {
        startedByScheduler.current = false;
        onStop();
      }
    };
    tick();
    const id = window.setInterval(tick, 60000);
    return () => window.clearInterval(id);
  }, [recording, onStart, onStop]);
}
