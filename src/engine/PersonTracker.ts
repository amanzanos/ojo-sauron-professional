import type { EmotionName, FaceBox, FaceObservation } from '../types/analysis';
import { distance2D, nowId } from '../utils/math';

const LOST_TIMEOUT_MS = 4000;
const ANALYSIS_WINDOW_MS = 2500;
const UPDATE_INTERVAL_MS = 90000; // refresh an established person's card periodically while they stay in frame
const MIN_SAMPLES = 15;
const TRAIL_MIN_INTERVAL_MS = 300; // throttle trail points so standing still doesn't flood the array
const TRAIL_MIN_MOVE = 8; // px, in video space — ignores jitter while roughly stationary
const TRAIL_MAX_AGE_MS = 60000;
const TRAIL_MAX_POINTS = 300; // hard safety cap regardless of age

export interface TrailPoint {
  x: number;
  y: number;
  ts: number;
}

export interface TrackedPerson {
  id: string;
  box: FaceBox;
  firstSeenTs: number;
  lastSeenTs: number;
  emotionSamples: EmotionName[];
  bestFrontality: number;
  bestBox: FaceBox;
  /** 0 = never profiled yet. Otherwise the ts of the last time a PersonSummary card was built. */
  lastProfiledAt: number;
  /** Recent path through the frame while this session-scoped id has stayed in view — cleared along with the person once they're forgotten, not tied to any persistent/recognized identity. */
  trail: TrailPoint[];
  lastTrailTs: number;
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
        lastProfiledAt: 0,
        trail: [],
        lastTrailTs: 0
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

      const c = boxCenter(obs.box);
      const last = target.trail[target.trail.length - 1];
      const movedEnough = !last || distance2D(c, last) > TRAIL_MIN_MOVE;
      if (movedEnough && ts - target.lastTrailTs > TRAIL_MIN_INTERVAL_MS) {
        target.trail.push({ x: c.x, y: c.y, ts });
        target.lastTrailTs = ts;
        target.trail = target.trail.filter((p) => ts - p.ts < TRAIL_MAX_AGE_MS);
        if (target.trail.length > TRAIL_MAX_POINTS) target.trail = target.trail.slice(-TRAIL_MAX_POINTS);
      }

      matchedThisFrame.add(target);
    });

    this.people = this.people.filter((p) => ts - p.lastSeenTs < LOST_TIMEOUT_MS);

    const ready = this.people.filter((p) => {
      if (p.emotionSamples.length < MIN_SAMPLES) return false;
      if (p.lastProfiledAt === 0) return ts - p.firstSeenTs >= ANALYSIS_WINDOW_MS;
      return ts - p.lastProfiledAt >= UPDATE_INTERVAL_MS;
    });

    return { all: this.people, ready };
  }

  /** Call once a card has been built (or refreshed) for this person, so mood/photo sampling starts a fresh window for the next periodic update instead of averaging over their entire time on screen. */
  markProfiled(id: string, ts: number) {
    const p = this.people.find((x) => x.id === id);
    if (!p) return;
    p.lastProfiledAt = ts;
    p.emotionSamples = [];
    p.bestFrontality = 1;
    p.bestBox = p.box;
  }

  /**
   * Collapses a freshly-minted ID back onto a previously known one once face-descriptor
   * matching (done outside the tracker, which has no pixel access) confirms it's the same
   * person reappearing — e.g. after turning away or leaving the frame beyond LOST_TIMEOUT_MS.
   */
  reassignId(tempId: string, canonicalId: string, ts: number) {
    const p = this.people.find((x) => x.id === tempId);
    if (p) { p.id = canonicalId; p.lastProfiledAt = ts; p.emotionSamples = []; }
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
