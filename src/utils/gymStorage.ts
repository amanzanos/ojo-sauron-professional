import type { BodyWeightEntry, WorkoutSession } from '../types/gym';

const SESSIONS_KEY = 'weros.gym.sessions.v1';
const BODYWEIGHT_KEY = 'weros.gym.bodyweight.v1';

export function loadSessions(): WorkoutSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const list = raw ? (JSON.parse(raw) as WorkoutSession[]) : [];
    return list.sort((a, b) => b.date - a.date);
  } catch {
    return [];
  }
}

export function saveSessions(list: WorkoutSession[]) {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export function loadBodyWeights(): BodyWeightEntry[] {
  try {
    const raw = localStorage.getItem(BODYWEIGHT_KEY);
    const list = raw ? (JSON.parse(raw) as BodyWeightEntry[]) : [];
    return list.sort((a, b) => a.date - b.date);
  } catch {
    return [];
  }
}

export function saveBodyWeights(list: BodyWeightEntry[]) {
  try { localStorage.setItem(BODYWEIGHT_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
