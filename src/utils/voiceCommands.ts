export type VoiceIntent =
  | { type: 'navigate'; tab: 'feed' | 'mapa' | 'testigo' | 'camara' }
  | { type: 'witness'; action: 'start' | 'stop' }
  | { type: 'alert' }
  | { type: 'nearby' }
  | { type: 'status' }
  | { type: 'readReports' }
  | { type: 'time' }
  | { type: 'battery' }
  | { type: 'call' }
  | { type: 'vibrate' }
  | { type: 'unknown' };

const NAV_RULES: Array<{ words: string[]; tab: 'feed' | 'mapa' | 'testigo' | 'camara' }> = [
  { words: ['comunidad', 'feed', 'noticias'], tab: 'feed' },
  { words: ['mapa'], tab: 'mapa' },
  { words: ['vigilancia', 'camara'], tab: 'camara' }
];

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Keyword-based intent matching — no language model, just enough to feel like giving Jarvis an order. */
export function parseVoiceCommand(raw: string): VoiceIntent {
  const text = stripAccents(raw.toLowerCase());

  if (/(detener|para|stop|deten) .*graba|deja de grabar/.test(text)) return { type: 'witness', action: 'stop' };
  if (/(activa|enciende|empieza|inicia|abre).*testigo|modo testigo|empieza a grabar|graba(r)? esto/.test(text)) {
    return { type: 'witness', action: 'start' };
  }

  if (/(envia|manda|lanza|activa).*(alerta|sos|socorro)|pide ayuda|necesito ayuda|auxilio/.test(text)) {
    return { type: 'alert' };
  }

  if (/llama (a )?(mi )?(contacto|emergencia)|llamar a mi contacto/.test(text)) return { type: 'call' };

  if (/(que|qué) hay cerca|algo cerca|cerca de mi|reportes cerca|hay algo por aqui/.test(text)) {
    return { type: 'nearby' };
  }

  if (/lee (los|las) (ultimos|ultimas) reportes|lee el feed|lee (la )?comunidad|que se ha reportado/.test(text)) {
    return { type: 'readReports' };
  }

  if (/como estoy|estado( actual)?|que esta pasando|resumen/.test(text)) return { type: 'status' };

  if (/que hora es|dime la hora|hora actual/.test(text)) return { type: 'time' };

  if (/(cuanta )?bateria|nivel de bateria/.test(text)) return { type: 'battery' };

  if (/^vibra|haz vibrar|vibrar el (movil|telefono)/.test(text)) return { type: 'vibrate' };

  for (const rule of NAV_RULES) {
    if (rule.words.some((w) => text.includes(w))) return { type: 'navigate', tab: rule.tab };
  }

  return { type: 'unknown' };
}

const WAKE_WORDS = ['oye weros', 'oye beros', 'hey weros', 'hey beros', 'weros'];

/** True if the transcript opens with a wake phrase — used only in hands-free/continuous mode, where every ambient utterance is heard and most of them are not meant for the assistant. */
export function startsWithWakeWord(raw: string): boolean {
  const text = stripAccents(raw.toLowerCase()).trim();
  return WAKE_WORDS.some((w) => text.startsWith(w));
}

/** Strips a leading wake phrase, leaving just the command part (may be empty, if someone just said "oye WEROS" and paused). */
export function stripWakeWord(raw: string): string {
  const text = stripAccents(raw.toLowerCase()).trim();
  const match = WAKE_WORDS.find((w) => text.startsWith(w));
  if (!match) return raw.trim();
  return raw.trim().slice(match.length).replace(/^[,.\s]+/, '');
}
