import type { GeoPoint } from './geo';

export interface WeatherSummary {
  tempNow: number;
  tempMax: number;
  tempMin: number;
  description: string;
}

// WMO weather codes (used by Open-Meteo, and most other providers) — condensed to short
// Spanish phrases, not the full official wording.
const WMO_DESCRIPTIONS: Record<number, string> = {
  0: 'cielo despejado', 1: 'mayormente despejado', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'niebla', 48: 'niebla helada',
  51: 'llovizna ligera', 53: 'llovizna', 55: 'llovizna intensa',
  56: 'llovizna helada', 57: 'llovizna helada intensa',
  61: 'lluvia ligera', 63: 'lluvia', 65: 'lluvia intensa',
  66: 'lluvia helada', 67: 'lluvia helada intensa',
  71: 'nieve ligera', 73: 'nieve', 75: 'nieve intensa', 77: 'granos de nieve',
  80: 'chubascos ligeros', 81: 'chubascos', 82: 'chubascos intensos',
  85: 'chubascos de nieve ligeros', 86: 'chubascos de nieve intensos',
  95: 'tormenta', 96: 'tormenta con granizo ligero', 99: 'tormenta con granizo intenso'
};

function describeCode(code: number): string {
  return WMO_DESCRIPTIONS[code] ?? 'condiciones variables';
}

/** Open-Meteo — free, no API key, generous rate limits. Good enough for "what's today's weather", not a forecasting product. */
export async function fetchWeather(point: GeoPoint): Promise<WeatherSummary | undefined> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lng}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const data = await res.json();
    const code = data?.current?.weather_code;
    return {
      tempNow: Math.round(data?.current?.temperature_2m),
      tempMax: Math.round(data?.daily?.temperature_2m_max?.[0]),
      tempMin: Math.round(data?.daily?.temperature_2m_min?.[0]),
      description: typeof code === 'number' ? describeCode(code) : 'condiciones variables'
    };
  } catch (err) {
    console.error('No se pudo obtener el tiempo', err);
    return undefined;
  }
}
