export interface ExerciseSet {
  reps: number;
  weightKg: number;
}

export interface WorkoutExercise {
  name: string;
  sets: ExerciseSet[];
}

export interface WorkoutSession {
  id: string;
  date: number;
  exercises: WorkoutExercise[];
  notes?: string;
}

export interface BodyWeightEntry {
  id: string;
  date: number;
  weightKg: number;
}
