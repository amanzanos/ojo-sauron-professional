import type { StoreZone } from '../types/analysis';

export const ZONE_STORAGE_KEY = 'ojo-sauron-zone-analytics';
export type ZoneAccumMap = Record<string, { totalVisits: number; totalDwellMs: number }>;
export interface ZoneStorage {
  date: string;
  zones: StoreZone[];
  stats: ZoneAccumMap;
  history: Array<{ date: string; stats: ZoneAccumMap }>;
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Loads persisted store zones/stats, archiving yesterday's totals (capped to 14 days) if the calendar day rolled over since the last save — anonymous aggregate counts only, never per-visitor records. */
export function loadZoneStorage(): ZoneStorage {
  const empty: ZoneStorage = { date: todayStr(), zones: [], stats: {}, history: [] };
  try {
    const raw = localStorage.getItem(ZONE_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as ZoneStorage;
    if (parsed.date === todayStr()) return parsed;
    const history = [{ date: parsed.date, stats: parsed.stats }, ...(parsed.history ?? [])].slice(0, 14);
    return { date: todayStr(), zones: parsed.zones ?? [], stats: {}, history };
  } catch {
    return empty;
  }
}

export function saveZoneStorage(data: ZoneStorage) {
  try {
    localStorage.setItem(ZONE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable/full — analytics simply won't persist this session, not fatal.
  }
}
