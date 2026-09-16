export interface PatrolWindow {
  id: string;
  label: string;
  startMinutes: number; // minutes since midnight
  endMinutes: number;
  days: number[]; // 0 = Sunday .. 6 = Saturday
  active: boolean;
}

const KEY = 'weros.patrolSchedule.v1';

export function loadPatrolWindows(): PatrolWindow[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PatrolWindow[]) : [];
  } catch {
    return [];
  }
}

export function savePatrolWindows(list: PatrolWindow[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}
