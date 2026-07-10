import { Gender, nets } from 'face-api.js';

// face-api.js's npm package ships no weight files; its own repo hosts them and is the
// canonical CDN reference used across its docs/examples.
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

export interface AgeGenderResult {
  age: number;
  sex: 'masculino' | 'femenino';
  sexConfidence: number;
}

export class AgeGenderEngine {
  private ready = false;

  async init() {
    await nets.ageGenderNet.loadFromUri(MODEL_URL);
    this.ready = true;
  }

  async estimate(input: HTMLCanvasElement): Promise<AgeGenderResult | undefined> {
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
}
