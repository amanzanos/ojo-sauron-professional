/**
 * Speaks a short confirmation aloud (browser TTS, no network/API needed) — e.g. right after an SOS
 * alert fires, so it's audible without having to look at the screen. Returns a promise that
 * resolves once speech finishes, so callers doing continuous mic listening (VoiceAssistant's
 * hands-free mode) can await it before re-arming SpeechRecognition — otherwise the mic would pick
 * up WEROS's own voice as if it were a new command.
 */
export function speak(text: string, lang = 'es-ES'): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return; }
    try {
      window.speechSynthesis.cancel(); // don't queue behind a stale previous utterance
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 1;
      utterance.pitch = 1;
      const voices = window.speechSynthesis.getVoices();
      const esVoice = voices.find((v) => v.lang?.startsWith('es'));
      if (esVoice) utterance.voice = esVoice;
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
