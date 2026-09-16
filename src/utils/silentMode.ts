const KEY = 'weros.silentMode.v1';

/** One switch that mutes voice, notifications and vibration at once — for a meeting, a class, or anywhere WEROS talking or buzzing would be unwelcome. Safety features (SOS, distress-sound auto-alert) still work; they just do it quietly. */
export function isSilentMode(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setSilentMode(enabled: boolean) {
  try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
}
