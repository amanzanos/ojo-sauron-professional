/** Speaks a short confirmation aloud (browser TTS, no network/API needed) — e.g. right after an SOS alert fires, so it's audible without having to look at the screen. */
export function speak(text: string, lang = 'es-ES') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel(); // don't queue behind a stale previous utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find((v) => v.lang?.startsWith('es'));
    if (esVoice) utterance.voice = esVoice;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error('No se pudo reproducir el aviso por voz', err);
  }
}
