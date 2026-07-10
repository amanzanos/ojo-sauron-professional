import { euclideanDistance, Gender, nets } from 'face-api.js';

// face-api.js's npm package ships no weight files; its own repo hosts them and is the
// canonical CDN reference used across its docs/examples.
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

// Empirically the standard face-api.js recognition threshold: below this euclidean
// distance between two 128-d descriptors, the faces are considered the same person.
export const SAME_PERSON_DISTANCE = 0.5;

export interface AgeGenderResult {
  age: number;
  sex: 'masculino' | 'femenino';
  sexConfidence: number;
}

/**
 * Wraps face-api.js's ageGenderNet (attributes) and faceRecognitionNet (128-d identity
 * descriptor) — both load once here since they're always invoked together, on the same
 * cropped face canvas, at the moment a person is profiled.
 */
export class FaceIdentityEngine {
  private ready = false;

  async init() {
    await Promise.all([
      nets.ageGenderNet.loadFromUri(MODEL_URL),
      nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    this.ready = true;
  }

  async estimateAgeGender(input: HTMLCanvasElement): Promise<AgeGenderResult | undefined> {
    if (!this.ready) return undefined;
    const prediction = await nets.ageGenderNet.predictAgeAndGender(input);
    const p = Array.isArray(prediction) ? prediction[0] : prediction;
    if (!p) return undefined;
    return {
      age: Math.round(p.age),
      sex: p.gender === Gender.MALE ? 'masculino' : 'femenino',
      sexConfidence: Math.round(p.genderProbability * 100)
    };
  }

  async computeDescriptor(input: HTMLCanvasElement): Promise<Float32Array | undefined> {
    if (!this.ready) return undefined;
    const descriptor = await nets.faceRecognitionNet.computeFaceDescriptor(input);
    return Array.isArray(descriptor) ? descriptor[0] : descriptor;
  }

  /** Finds the closest previously-archived identity, if any is within SAME_PERSON_DISTANCE. */
  findMatch(descriptor: Float32Array, archive: Array<{ id: string; descriptor: Float32Array }>) {
    let best: { id: string; distance: number } | undefined;
    archive.forEach((entry) => {
      const distance = euclideanDistance(descriptor, entry.descriptor);
      if (!best || distance < best.distance) best = { id: entry.id, distance };
    });
    return best && best.distance < SAME_PERSON_DISTANCE ? best : undefined;
  }
}
