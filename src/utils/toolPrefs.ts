// Simple on/off flags for the Herramientas grid — each tool remembers whether it's enabled across
// reloads, same localStorage-flag pattern as the alert contact / hands-free voice preference.
export type ToolFlag =
  | 'compass'
  | 'steps'
  | 'drivingMode'
  | 'moodMirror'
  | 'faceGreeting'
  | 'autoBrightness'
  | 'batteryAlert'
  | 'geofences';

function key(flag: ToolFlag) {
  return `weros.tool.${flag}.v1`;
}

export function isToolEnabled(flag: ToolFlag): boolean {
  try { return localStorage.getItem(key(flag)) === '1'; } catch { return false; }
}

export function setToolEnabled(flag: ToolFlag, enabled: boolean) {
  try { localStorage.setItem(key(flag), enabled ? '1' : '0'); } catch { /* ignore */ }
}
