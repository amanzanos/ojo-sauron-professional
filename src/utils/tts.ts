import { isSilentMode } from './silentMode';

// Best-effort voice-gender heuristic — SpeechSynthesisVoice exposes no gender field, so this
// matches on common male/female Spanish voice names across platforms (macOS/iOS, Windows, Chrome's
// network voices). Android's built-in voices often use opaque codenames with no name signal at
// all, so this can't guarantee a male voice everywhere — it's the best the Web Speech API allows.
const MALE_VOICE_HINTS = ['jorge', 'diego', 'pablo', 'raul', 'raúl', 'carlos', 'miguel', 'juan', 'alex', 'antonio', 'fernando', 'male', 'hombre'];
const FEMALE_VOICE_HINTS = ['monica', 'mónica', 'paulina', 'helena', 'sabina', 'lucia', 'lucía', 'elvira', 'laura', 'conchita', 'female', 'mujer'];

function pickSpanishVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
  const esVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
  if (!esVoices.length) return undefined;
  const male = esVoices.find((v) => MALE_VOICE_HINTS.some((h) => v.name.toLowerCase().includes(h)));
  if (male) return male;
  const notKnownFemale = esVoices.find((v) => !FEMALE_VOICE_HINTS.some((h) => v.name.toLowerCase().includes(h)));
  return notKnownFemale ?? esVoices[0];
}

export interface SpeakOptions {
  lang?: string;
  /** 0-2, default 1. Slightly below 1 reads as a deeper, more measured "Jarvis" tone. */
  pitch?: number;
  /** 0.1-10, default 1. */
  rate?: number;
}

// Tuned for a measured, "butler" cadence — noticeably deeper and slightly slower than a
// default TTS voice, without pushing the pitch shift far enough to sound distorted or robotic.
// This is a system-voice tuning, not a clone of any actor's voice — see the README for why.
const DEFAULT_PITCH = 0.78;
const DEFAULT_RATE = 0.92;

/**
 * Speaks a short confirmation aloud (browser TTS, no network/API needed) — e.g. right after an SOS
 * alert fires, so it's audible without having to look at the screen. Returns a promise that
 * resolves once speech finishes, so callers doing continuous mic listening (VoiceAssistant's
 * hands-free mode) can await it before re-arming SpeechRecognition — otherwise the mic would pick
 * up WEROS's own voice as if it were a new command.
 */
export function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  const { lang = 'es-ES', pitch = DEFAULT_PITCH, rate = DEFAULT_RATE } = options;
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return; }
    if (isSilentMode()) { resolve(); return; } // muted, not broken — callers still get their reply text/UI
    try {
      window.speechSynthesis.cancel(); // don't queue behind a stale previous utterance
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      utterance.pitch = pitch;
      const voice = pickSpanishVoice(window.speechSynthesis.getVoices(), lang);
      if (voice) utterance.voice = voice;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('No se pudo reproducir el aviso por voz', err);
      resolve();
    }
  });
}

/** Picks one phrasing at random — keeps the assistant from repeating the exact same sentence every time, closer to a personality than a script. */
export function pick(variants: string[]): string {
  return variants[Math.floor(Math.random() * variants.length)];
}
