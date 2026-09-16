export function vibrate(pattern: number | number[] = 200) {
  navigator.vibrate?.(pattern);
}

/** navigator.getBattery() is non-standard and Chromium-only (and increasingly restricted for fingerprinting reasons) — feature-detected, never assumed. */
export async function getBatteryLevel(): Promise<number | undefined> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
  if (!nav.getBattery) return undefined;
  try {
    const battery = await nav.getBattery();
    return Math.round(battery.level * 100);
  } catch {
    return undefined;
  }
}

export function callLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
