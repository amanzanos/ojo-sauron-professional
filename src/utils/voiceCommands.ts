export type VoiceIntent =
  | { type: 'navigate'; tab: 'feed' | 'mapa' | 'testigo' | 'camara' }
  | { type: 'witness'; action: 'start' | 'stop' }
  | { type: 'alert' }
  | { type: 'nearby' }
  | { type: 'unknown' };

const NAV_RULES: Array<{ words: string[]; tab: 'feed' | 'mapa' | 'testigo' | 'camara' }> = [
  { words: ['comunidad', 'feed', 'noticias', 'reportes'], tab: 'feed' },
  { words: ['mapa'], tab: 'mapa' },
  { words: ['vigilancia', 'cámara', 'camara'], tab: 'camara' }
];

/** Keyword-based intent matching — no language model, just enough to feel like giving Jarvis an order. */
export function parseVoiceCommand(raw: string): VoiceIntent {
  const text = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); // strip accents

  if (/(detener|para|stop|deten) .*graba|deja de grabar/.test(text)) return { type: 'witness', action: 'stop' };
  if (/(activa|enciende|empieza|inicia|abre).*testigo|modo testigo|empieza a grabar|graba(r)? esto/.test(text)) {
    return { type: 'witness', action: 'start' };
  }

  if (/(envia|manda|lanza|activa).*(alerta|sos|socorro)|pide ayuda|necesito ayuda|auxilio/.test(text)) {
    return { type: 'alert' };
  }

  if (/(que|qué) hay cerca|algo cerca|cerca de mi|reportes cerca|hay algo por aqui/.test(text)) {
    return { type: 'nearby' };
  }

  for (const rule of NAV_RULES) {
    if (rule.words.some((w) => text.includes(w))) return { type: 'navigate', tab: rule.tab };
  }

  return { type: 'unknown' };
}
