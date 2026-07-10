import { AudioClassifier, FilesetResolver } from '@mediapipe/tasks-audio';
import type { AnalysisEvent, SoundCategoryStat, SoundFrame, SoundLogEntry } from '../types/analysis';
import { nowId } from '../utils/math';

export const EMPTY_SOUND: SoundFrame = { active: false, topLabel: '', topScore: 0, categories: [] };

const TICK_MS = 1000;

// Spanish labels for the AudioSet/YAMNet classes most relevant to a monitoring context.
// The other ~470 of the 521 classes fall back to their English name — not worth translating.
const SPANISH_LABELS: Record<string, string> = {
  Speech: 'Voz humana', Music: 'Música', Silence: 'Silencio',
  Laughter: 'Risa', 'Baby laughter': 'Risa de bebé', Giggle: 'Risita',
  'Crying, sobbing': 'Llanto', 'Baby cry, infant cry': 'Llanto de bebé',
  Screaming: 'Grito', Shout: 'Grito/voz alzada', Yell: 'Voz alzada',
  Alarm: 'Alarma', 'Smoke detector, smoke alarm': 'Detector de humo', 'Fire alarm': 'Alarma de incendios',
  Siren: 'Sirena', 'Civil defense siren': 'Sirena de emergencia',
  'Police car (siren)': 'Sirena de policía', 'Ambulance (siren)': 'Sirena de ambulancia', 'Fire engine, fire truck (siren)': 'Sirena de bomberos',
  Doorbell: 'Timbre', 'Ding-dong': 'Timbre', Knock: 'Golpe/llamada a la puerta',
  Glass: 'Cristal', Shatter: 'Cristal roto',
  Dog: 'Perro', Bark: 'Ladrido', Cat: 'Gato', Meow: 'Maullido',
  Cough: 'Tos', Sneeze: 'Estornudo',
  Clapping: 'Aplausos', Applause: 'Aplausos',
  Typing: 'Tecleo', 'Computer keyboard': 'Teclado',
  Telephone: 'Teléfono', 'Telephone bell ringing': 'Teléfono sonando', Ringtone: 'Tono de llamada',
  Vehicle: 'Vehículo', Car: 'Coche', Engine: 'Motor', Truck: 'Camión', Bus: 'Autobús', Motorcycle: 'Moto',
  'Traffic noise, roadway noise': 'Ruido de tráfico',
  'Gunshot, gunfire': 'Disparo', Explosion: 'Explosión',
  'Walk, footsteps': 'Pasos', Water: 'Agua', Rain: 'Lluvia', Wind: 'Viento',
  Thunder: 'Trueno', Thunderstorm: 'Tormenta',
  Door: 'Puerta', Slam: 'Portazo',
  // AudioSet splits music confidence across many sibling classes (instrument/genre/production) —
  // none of which individually beats "Speech" or noise very often. These feed MUSIC_GROUP below.
  'Musical instrument': 'Instrumento musical', Song: 'Canción', Singing: 'Canto',
  Guitar: 'Guitarra', 'Acoustic guitar': 'Guitarra acústica', 'Electric guitar': 'Guitarra eléctrica', 'Bass guitar': 'Bajo',
  Piano: 'Piano', 'Keyboard (musical)': 'Teclado musical', Synthesizer: 'Sintetizador',
  'Drum kit': 'Batería', Drum: 'Tambor', Percussion: 'Percusión', Orchestra: 'Orquesta', Choir: 'Coro',
  'Pop music': 'Música pop', 'Rock music': 'Música rock', Jazz: 'Jazz', 'Classical music': 'Música clásica',
  'Electronic music': 'Música electrónica', 'Background music': 'Música de fondo', 'Theme music': 'Música de tema'
};

// AudioSet fragments "there is music playing" across many sibling classes (instrument, genre,
// production) that rarely individually outscore Speech/Silence — summing them gives a much more
// reliable "is this music" signal than looking at the single top category.
const MUSIC_GROUP = new Set([
  'Music', 'Musical instrument', 'Song', 'Singing', 'Guitar', 'Acoustic guitar', 'Electric guitar', 'Bass guitar',
  'Piano', 'Keyboard (musical)', 'Synthesizer', 'Drum kit', 'Drum', 'Percussion', 'Orchestra', 'Choir',
  'Pop music', 'Rock music', 'Jazz', 'Classical music', 'Electronic music', 'Background music', 'Theme music'
]);

/**
 * Every category here becomes a real logged event (surfaced in the shared Events tab, not just
 * the Audio tab's own diary) — safety-relevant ones as warnings/critical with a short cooldown,
 * "interesting but not alarming" ones (laughter, music, animals, a knock, a phone ringing...) as
 * lower-priority info/positive entries with a longer cooldown so they don't spam.
 */
const EVENT_CATEGORIES: Record<string, { severity: AnalysisEvent['severity']; cooldown: number }> = {
  Alarm: { severity: 'warning', cooldown: 8000 },
  'Smoke detector, smoke alarm': { severity: 'critical', cooldown: 8000 },
  'Fire alarm': { severity: 'critical', cooldown: 8000 },
  Siren: { severity: 'warning', cooldown: 8000 },
  'Civil defense siren': { severity: 'warning', cooldown: 8000 },
  'Police car (siren)': { severity: 'warning', cooldown: 8000 },
  'Ambulance (siren)': { severity: 'warning', cooldown: 8000 },
  'Fire engine, fire truck (siren)': { severity: 'warning', cooldown: 8000 },
  Glass: { severity: 'warning', cooldown: 8000 },
  Shatter: { severity: 'warning', cooldown: 8000 },
  Screaming: { severity: 'critical', cooldown: 8000 },
  Shout: { severity: 'warning', cooldown: 8000 },
  'Gunshot, gunfire': { severity: 'critical', cooldown: 8000 },
  Explosion: { severity: 'critical', cooldown: 8000 },
  'Baby cry, infant cry': { severity: 'warning', cooldown: 8000 },
  'Crying, sobbing': { severity: 'warning', cooldown: 10000 },
  Doorbell: { severity: 'info', cooldown: 8000 },
  'Ding-dong': { severity: 'info', cooldown: 8000 },
  Knock: { severity: 'info', cooldown: 8000 },
  Door: { severity: 'info', cooldown: 10000 },
  Slam: { severity: 'info', cooldown: 10000 },
  Laughter: { severity: 'positive', cooldown: 12000 },
  'Baby laughter': { severity: 'positive', cooldown: 12000 },
  Giggle: { severity: 'positive', cooldown: 12000 },
  Applause: { severity: 'positive', cooldown: 12000 },
  Clapping: { severity: 'positive', cooldown: 12000 },
  Music: { severity: 'info', cooldown: 25000 },
  Dog: { severity: 'info', cooldown: 15000 },
  Bark: { severity: 'info', cooldown: 15000 },
  Cat: { severity: 'info', cooldown: 15000 },
  Meow: { severity: 'info', cooldown: 15000 },
  'Telephone bell ringing': { severity: 'info', cooldown: 10000 },
  Ringtone: { severity: 'info', cooldown: 10000 },
  Vehicle: { severity: 'info', cooldown: 25000 },
  Cough: { severity: 'info', cooldown: 15000 },
  Sneeze: { severity: 'info', cooldown: 15000 },
  Thunder: { severity: 'info', cooldown: 20000 },
  Thunderstorm: { severity: 'info', cooldown: 20000 }
};

function label(name: string) {
  return SPANISH_LABELS[name] ?? name;
}

// Spanish labels (post-translation) of the warning/critical EVENT_CATEGORIES entries — hand-maintained
// alongside EVENT_CATEGORIES (same relationship as URBAN_LABELS/PET_LABELS to SPANISH_LABELS), for
// filtering the session sound log into a "critical alerts" view without any new detection logic.
export const CRITICAL_SOUND_LABELS = new Set([
  'Alarma', 'Detector de humo', 'Alarma de incendios', 'Sirena', 'Sirena de emergencia',
  'Sirena de policía', 'Sirena de ambulancia', 'Sirena de bomberos', 'Cristal', 'Cristal roto',
  'Grito', 'Disparo', 'Explosión', 'Llanto de bebé'
]);

// Spanish-label keys (post-translation) counted toward the ambient traffic index.
const TRAFFIC_LABELS = new Set(['Vehículo', 'Motor', 'Coche', 'Camión', 'Autobús', 'Moto', 'Ruido de tráfico']);

/** Ambient sound-event classification (YAMNet/AudioSet, 521 classes) — what kind of noise, not just how loud. */
export class SoundClassificationEngine {
  private classifier?: AudioClassifier;
  private analyser?: AnalyserNode;
  private buffer = new Float32Array(32768);
  private sampleRate = 48000;
  private lastTick = 0;
  private lastResult: SoundFrame = EMPTY_SOUND;
  private activeKeys = new Set<string>();
  private lastEventAt: Record<string, number> = {};
  private events: AnalysisEvent[] = [];
  private log: SoundLogEntry[] = [];
  private stats: Record<string, SoundCategoryStat> = {};
  private lastTopLabel = '';

  async init() {
    const resolver = await FilesetResolver.forAudioTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.18/wasm');
    const modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite';
    const baseConfig = { scoreThreshold: 0.3, maxResults: 5 };
    try {
      this.classifier = await AudioClassifier.createFromOptions(resolver, { baseOptions: { modelAssetPath, delegate: 'GPU' }, ...baseConfig });
    } catch (gpuError) {
      console.warn('GPU delegate failed for sound classification, retrying with CPU delegate', gpuError);
      this.classifier = await AudioClassifier.createFromOptions(resolver, { baseOptions: { modelAssetPath, delegate: 'CPU' }, ...baseConfig });
    }
  }

  /** Taps an existing mic graph (shared with VoiceAnalysisEngine) instead of requesting the microphone again. */
  attach(ctx: AudioContext, source: MediaStreamAudioSourceNode) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 32768; // ~0.68s of context at 48kHz, enough for a YAMNet patch
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.sampleRate = ctx.sampleRate;
    source.connect(this.analyser);
  }

  detach() {
    this.analyser = undefined;
    this.lastResult = EMPTY_SOUND;
  }

  getEvents() { return this.events; }
  getLog(): SoundLogEntry[] { return this.log; }
  getStats(): SoundCategoryStat[] { return Object.values(this.stats).sort((a, b) => b.totalMs - a.totalMs); }

  /** Share of classified session time attributed to vehicle/traffic-related sound — an ambient street-noise proxy, not tied to any one moment. */
  getTrafficIndex(): number {
    const all = Object.values(this.stats);
    const totalMs = all.reduce((a, s) => a + s.totalMs, 0);
    if (!totalMs) return 0;
    const trafficMs = all.filter((s) => TRAFFIC_LABELS.has(s.label)).reduce((a, s) => a + s.totalMs, 0);
    return Math.round((trafficMs / totalMs) * 100);
  }

  classifyTick(ts: number): SoundFrame {
    if (!this.classifier || !this.analyser) return EMPTY_SOUND;
    if (ts - this.lastTick < TICK_MS) return this.lastResult;
    const dt = this.lastTick ? ts - this.lastTick : 0;
    this.lastTick = ts;

    this.analyser.getFloatTimeDomainData(this.buffer);
    const results = this.classifier.classify(this.buffer, this.sampleRate);
    const categories = results[0]?.classifications[0]?.categories ?? [];
    const mapped = categories.slice(0, 5).map((c) => ({ label: label(c.categoryName), score: Math.round(c.score * 100) / 100 }));

    // Fold the fragmented music-related classes into a single "Music" candidate and let it
    // compete for the top spot on its combined confidence, not any one sub-class's score alone.
    const musicScore = categories.filter((c) => MUSIC_GROUP.has(c.categoryName)).reduce((a, c) => a + c.score, 0);
    const rawMusicScore = categories.find((c) => c.categoryName === 'Music')?.score ?? 0;
    const effective = musicScore > 0.35 && musicScore > rawMusicScore
      ? [{ categoryName: 'Music', score: Math.min(1, musicScore) }, ...categories.filter((c) => c.categoryName !== 'Music')].sort((a, b) => b.score - a.score)
      : categories;

    const top = effective[0];
    const topLabel = top ? label(top.categoryName) : 'Silencio';
    const topScore = top?.score ?? 0;

    this.lastResult = { active: true, topLabel, topScore, categories: mapped };
    this.trackEvents(effective, ts);
    this.trackLogAndStats(topLabel, topScore, dt);
    return this.lastResult;
  }

  /** Session-long sound diary: one log line per change of dominant category (not one per tick), plus accumulated time-on-category — a proper record of what's been audible, not just the current reading. */
  private trackLogAndStats(topLabel: string, topScore: number, dt: number) {
    const changed = topLabel !== this.lastTopLabel;
    if (changed) {
      this.log.unshift({ label: topLabel, score: topScore, time: Date.now() });
      this.log = this.log.slice(0, 100);
      this.lastTopLabel = topLabel;
    }
    const stat = this.stats[topLabel] ?? { label: topLabel, totalMs: 0, count: 0 };
    if (dt > 0) stat.totalMs += dt;
    if (changed) stat.count += 1;
    this.stats[topLabel] = stat;
  }

  private trackEvents(categories: Array<{ categoryName: string; score: number }>, ts: number) {
    const currentKeys = new Set(categories.filter((c) => EVENT_CATEGORIES[c.categoryName] && c.score > 0.4).map((c) => c.categoryName));
    currentKeys.forEach((key) => {
      if (this.activeKeys.has(key)) return;
      const meta = EVENT_CATEGORIES[key];
      if (ts - (this.lastEventAt[key] ?? -Infinity) < meta.cooldown) return;
      this.lastEventAt[key] = ts;
      const prefix = meta.severity === 'warning' || meta.severity === 'critical' ? 'SONIDO DETECTADO' : 'SONIDO DE INTERÉS';
      this.events.unshift({ id: nowId(), time: Date.now(), severity: meta.severity, title: `${prefix}: ${label(key).toUpperCase()}`, detail: 'Identificado en el audio ambiente' });
      this.events = this.events.slice(0, 50);
    });
    this.activeKeys = currentKeys;
  }
}
