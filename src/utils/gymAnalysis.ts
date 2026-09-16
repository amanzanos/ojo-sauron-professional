import type { WorkoutSession } from '../types/gym';

/** Epley formula — the standard, simplest estimated-1RM approximation from a working set's weight and reps. */
export function estimatedOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

function sessionVolume(session: WorkoutSession): number {
  return session.exercises.reduce((sum, ex) => sum + ex.sets.reduce((s, set) => s + set.weightKg * set.reps, 0), 0);
}

/** Every distinct exercise name logged, most-used first — the natural default order for a picker. */
export function exerciseNames(sessions: WorkoutSession[]): string[] {
  const counts = new Map<string, number>();
  sessions.forEach((s) => s.exercises.forEach((ex) => counts.set(ex.name, (counts.get(ex.name) ?? 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

export interface ExercisePoint {
  date: number;
  label: string;
  maxWeight: number;
  est1RM: number;
  volume: number;
}

/** One point per session that includes this exercise — the heaviest set that day, its estimated 1RM, and that exercise's total volume that session. */
export function exerciseProgression(sessions: WorkoutSession[], name: string): ExercisePoint[] {
  return sessions
    .filter((s) => s.exercises.some((ex) => ex.name === name))
    .map((s) => {
      const ex = s.exercises.find((e) => e.name === name)!;
      const maxWeight = Math.max(...ex.sets.map((set) => set.weightKg));
      const bestSet = ex.sets.find((set) => set.weightKg === maxWeight)!;
      const volume = ex.sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0);
      return {
        date: s.date,
        label: new Date(s.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
        maxWeight,
        est1RM: estimatedOneRepMax(bestSet.weightKg, bestSet.reps),
        volume
      };
    })
    .sort((a, b) => a.date - b.date);
}

export interface PersonalRecord {
  name: string;
  weightKg: number;
  reps: number;
  est1RM: number;
  date: number;
}

/** Best estimated 1RM ever logged per exercise — the number lifters actually care about tracking. */
export function personalRecords(sessions: WorkoutSession[]): PersonalRecord[] {
  const best = new Map<string, PersonalRecord>();
  sessions.forEach((s) => {
    s.exercises.forEach((ex) => {
      ex.sets.forEach((set) => {
        const est1RM = estimatedOneRepMax(set.weightKg, set.reps);
        const current = best.get(ex.name);
        if (!current || est1RM > current.est1RM) {
          best.set(ex.name, { name: ex.name, weightKg: set.weightKg, reps: set.reps, est1RM, date: s.date });
        }
      });
    });
  });
  return [...best.values()].sort((a, b) => b.date - a.date);
}

export interface WeekVolume {
  weekLabel: string;
  volume: number;
}

/** Total tonnage (Σ weight×reps across every exercise) per ISO week, oldest first — the standard "am I progressively overloading" signal. */
export function weeklyVolume(sessions: WorkoutSession[], weeks = 8): WeekVolume[] {
  const now = new Date();
  const buckets: WeekVolume[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - i * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const volume = sessions
      .filter((s) => s.date >= weekStart.getTime() && s.date < weekEnd.getTime())
      .reduce((sum, s) => sum + sessionVolume(s), 0);
    buckets.push({ weekLabel: weekStart.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }), volume: Math.round(volume) });
  }
  return buckets;
}

/** Consecutive weeks (including this one) with at least one logged session — a streak resets the moment a week goes empty. */
export function currentStreakWeeks(sessions: WorkoutSession[]): number {
  const now = new Date();
  let streak = 0;
  for (let i = 0; ; i++) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() - i * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const hasSession = sessions.some((s) => s.date >= weekStart.getTime() && s.date < weekEnd.getTime());
    if (!hasSession) break;
    streak += 1;
  }
  return streak;
}
