export type VoiceIntent =
  | { type: 'navigate'; tab: 'feed' | 'mapa' | 'testigo' | 'camara' | 'tools' }
  | { type: 'witness'; action: 'start' | 'stop' }
  | { type: 'alert' }
  | { type: 'nearby' }
  | { type: 'status' }
  | { type: 'readReports' }
  | { type: 'time' }
  | { type: 'battery' }
  | { type: 'weather' }
  | { type: 'call' }
  | { type: 'vibrate' }
  | { type: 'timer'; seconds: number }
  | { type: 'reminder'; message: string; seconds: number }
  | { type: 'cancelReminders' }
  | { type: 'openApp'; app: string }
  | { type: 'googleSearch'; query: string }
  | { type: 'unknown' };

const NAV_RULES: Array<{ words: string[]; tab: 'feed' | 'mapa' | 'testigo' | 'camara' | 'tools' }> = [
  { words: ['comunidad', 'feed', 'noticias'], tab: 'feed' },
  { words: ['mapa'], tab: 'mapa' },
  { words: ['vigilancia', 'camara'], tab: 'camara' },
  { words: ['herramientas'], tab: 'tools' }
];

// "abre el mapa" (no app name) keeps meaning "the WEROS map tab" — NAV_RULES already owns that
// phrasing, so these external-app triggers use more specific phrasing ("google maps") to avoid
// stealing it.
const APP_TRIGGERS: Array<{ words: string[]; app: string }> = [
  { words: ['whatsapp'], app: 'whatsapp' },
  { words: ['spotify'], app: 'spotify' },
  { words: ['youtube'], app: 'youtube' },
  { words: ['google maps', 'mapas de google'], app: 'maps' },
  { words: ['gmail', 'mi correo', 'el correo'], app: 'gmail' }
];

const DURATION_UNIT_SECONDS: Record<string, number> = {
  segundo: 1, segundos: 1,
  minuto: 60, minutos: 60,
  hora: 3600, horas: 3600
};

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function parseDuration(amount: string, unit: string): number {
  return Number(amount) * (DURATION_UNIT_SECONDS[unit] ?? 60);
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

  if (/que tiempo hace|va a llover|tiempo de hoy|previsión del tiempo|prevision del tiempo/.test(text)) return { type: 'weather' };

  if (/^vibra|haz vibrar|vibrar el (movil|telefono)/.test(text)) return { type: 'vibrate' };

  const reminderMatch = text.match(/recuerdame\s+(.+?)\s+en\s+(\d+)\s*(segundos?|minutos?|horas?)/);
  if (reminderMatch) return { type: 'reminder', message: reminderMatch[1].trim(), seconds: parseDuration(reminderMatch[2], reminderMatch[3]) };

  const avisaMatch = text.match(/avisame en\s*(\d+)\s*(segundos?|minutos?|horas?)/);
  if (avisaMatch) return { type: 'reminder', message: 'Es la hora', seconds: parseDuration(avisaMatch[1], avisaMatch[2]) };

  const timerMatch = text.match(/(?:pon(?:me)? (?:un |una )?(?:temporizador|alarma|cronometro)|temporizador) de\s*(\d+)\s*(segundos?|minutos?|horas?)/);
  if (timerMatch) return { type: 'timer', seconds: parseDuration(timerMatch[1], timerMatch[2]) };

  if (/cancela (el |los |la |las )?(temporizador|temporizadores|recordatorio|recordatorios|alarma|alarmas|avisos)/.test(text)) {
    return { type: 'cancelReminders' };
  }

  const searchMatch = text.match(/busca en google\s+(.+)/);
  if (searchMatch) return { type: 'googleSearch', query: searchMatch[1].trim() };

  for (const rule of APP_TRIGGERS) {
    if (/^abre|^abrir/.test(text) && rule.words.some((w) => text.includes(w))) return { type: 'openApp', app: rule.app };
  }

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
