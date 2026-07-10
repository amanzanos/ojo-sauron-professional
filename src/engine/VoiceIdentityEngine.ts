import type { VoiceProfile } from '../types/analysis';
import { nowId } from '../utils/math';

// Cosine-distance threshold for "same voice". Verified against synthetic timbre vectors during
// design (same-voice noise ~0.001-0.02, cross-voice ~0.9) — real speech has more intra-voice
// variance frame-to-frame (different phonemes), which is why callers average a whole utterance
// before calling identify() rather than comparing per-frame.
const MATCH_DISTANCE = 0.35;
const PITCH_TOLERANCE_HZ = 45;
const ADAPT_RATE = 0.15; // how fast a profile's fingerprint drifts toward new samples

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return 1 - dot / denom;
}

/**
 * Session-scoped voice clustering by spectral "timbre" fingerprint + average pitch — the audio
 * analogue of PersonTracker/FaceIdentityEngine, but heuristic (no trained embedding model): a
 * reasonable approximation of "is this the same voice as before", not forensic-grade speaker
 * verification. Distinguishes speakers even without a matching visible face.
 */
export class VoiceIdentityEngine {
  private profiles: VoiceProfile[] = [];
  private fingerprints = new Map<string, number[]>();
  private activeId?: string;

  getProfiles(): VoiceProfile[] { return this.profiles; }
  getActiveLabel(): string { return this.profiles.find((p) => p.id === this.activeId)?.label ?? ''; }

  identify(fingerprint: number[], pitchHz: number, durationMs: number, ts: number): string {
    if (!fingerprint.length || durationMs < 300) return this.getActiveLabel();

    let best: { profile: VoiceProfile; dist: number } | undefined;
    this.profiles.forEach((p) => {
      const fp = this.fingerprints.get(p.id);
      if (!fp) return;
      const pitchOk = pitchHz === 0 || p.avgPitchHz === 0 || Math.abs(p.avgPitchHz - pitchHz) < PITCH_TOLERANCE_HZ;
      if (!pitchOk) return;
      const dist = cosineDistance(fingerprint, fp);
      if (!best || dist < best.dist) best = { profile: p, dist };
    });

    if (best && best.dist < MATCH_DISTANCE) {
      const p = best.profile;
      const fp = this.fingerprints.get(p.id)!;
      this.fingerprints.set(p.id, fp.map((v, i) => v * (1 - ADAPT_RATE) + fingerprint[i] * ADAPT_RATE));
      // avgPitchHz starts at 0 when a profile's first utterance failed to lock a pitch — treat that
      // as "uninitialized" and snap to the first real reading instead of slow-blending from zero,
      // otherwise a profile can stay wrongly anchored near 0Hz for many turns.
      p.avgPitchHz = pitchHz > 0 ? (p.avgPitchHz > 0 ? p.avgPitchHz * (1 - ADAPT_RATE) + pitchHz * ADAPT_RATE : pitchHz) : p.avgPitchHz;
      p.lastHeardAt = ts;
      p.totalMs += durationMs;
      p.utterances += 1;
      this.activeId = p.id;
      return p.label;
    }

    const id = nowId();
    const profile: VoiceProfile = {
      id, label: `Voz ${this.profiles.length + 1}`, avgPitchHz: pitchHz,
      firstHeardAt: ts, lastHeardAt: ts, totalMs: durationMs, utterances: 1
    };
    this.profiles.push(profile);
    this.fingerprints.set(id, [...fingerprint]);
    this.activeId = id;
    return profile.label;
  }
}
