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

// Plain https:// links, not custom URI schemes (whatsapp://, spotify://) — those only work when
// the linked app happens to be installed and often get silently swallowed by the browser
// otherwise. The https equivalents redirect into the app via OS-level universal/app links on a
// phone where it's installed, and degrade to opening the normal web version everywhere else.
export const APP_LINKS: Record<string, string> = {
  whatsapp: 'https://wa.me/',
  spotify: 'https://open.spotify.com/',
  youtube: 'https://www.youtube.com/',
  maps: 'https://maps.google.com/',
  gmail: 'https://mail.google.com/mail/'
};

export const APP_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  spotify: 'Spotify',
  youtube: 'YouTube',
  maps: 'Google Maps',
  gmail: 'Gmail'
};

export function googleSearchLink(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
