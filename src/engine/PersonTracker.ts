import type { EmotionName, FaceBox, FaceObservation } from '../types/analysis';
import { distance2D, nowId } from '../utils/math';

const LOST_TIMEOUT_MS = 1500;
const ANALYSIS_WINDOW_MS = 2500;
const MIN_SAMPLES = 15;

export interface TrackedPerson {
  id: string;
  box: FaceBox;
  firstSeenTs: number;
  lastSeenTs: number;
  emotionSamples: EmotionName[];
  bestFrontality: number;
  bestBox: FaceBox;
  profiled: boolean;
}

function boxCenter(box: FaceBox) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * MediaPipe re-detects faces every frame with no persistent identity, so this assigns
 * stable IDs by matching each frame's face boxes to the nearest previously-tracked person
 * (within a distance proportional to face size). A face that stops matching for
 * LOST_TIMEOUT_MS is forgotten — if someone new appears in that spot later, they get a
 * fresh ID, which is exactly what "cambia de persona" should mean.
 */
export class PersonTracker {
  private people: TrackedPerson[] = [];

  update(observations: FaceObservation[], ts: number): { all: TrackedPerson[]; ready: TrackedPerson[] } {
    const matchedThisFrame = new Set<TrackedPerson>();

    observations.forEach((obs) => {
      const center = boxCenter(obs.box);
      let best: TrackedPerson | undefined;
      let bestDist = Infinity;
      this.people.forEach((p) => {
        if (matchedThisFrame.has(p)) return;
        const d = distance2D(center, boxCenter(p.box));
        const threshold = Math.max(obs.box.width, p.box.width) * 0.65;
        if (d < threshold && d < bestDist) { bestDist = d; best = p; }
      });

      const target: TrackedPerson = best ?? {
        id: nowId(),
        box: obs.box,
        firstSeenTs: ts,
        lastSeenTs: ts,
        emotionSamples: [],
        bestFrontality: obs.frontality,
        bestBox: obs.box,
        profiled: false
      };
      if (!best) this.people.push(target);

      target.box = obs.box;
      target.lastSeenTs = ts;
      target.emotionSamples.push(obs.mood);
      if (target.emotionSamples.length > 120) target.emotionSamples.shift();
      if (obs.frontality <= target.bestFrontality) {
        target.bestFrontality = obs.frontality;
        target.bestBox = obs.box;
      }
      matchedThisFrame.add(target);
    });

    this.people = this.people.filter((p) => ts - p.lastSeenTs < LOST_TIMEOUT_MS);

    const ready = this.people.filter((p) =>
      !p.profiled &&
      ts - p.firstSeenTs >= ANALYSIS_WINDOW_MS &&
      p.emotionSamples.length >= MIN_SAMPLES
    );

    return { all: this.people, ready };
  }

  markProfiled(id: string) {
    const p = this.people.find((x) => x.id === id);
    if (p) p.profiled = true;
  }

  moodSummary(person: TrackedPerson): { mood: EmotionName; score: number } {
    const counts: Partial<Record<EmotionName, number>> = {};
    person.emotionSamples.forEach((m) => { counts[m] = (counts[m] ?? 0) + 1; });
    let best: EmotionName = 'neutral';
    let bestCount = -1;
    (Object.keys(counts) as EmotionName[]).forEach((k) => {
      const c = counts[k] ?? 0;
      if (c > bestCount) { bestCount = c; best = k; }
    });
    const total = person.emotionSamples.length || 1;
    return { mood: best, score: Math.round((bestCount / total) * 100) };
  }
}
