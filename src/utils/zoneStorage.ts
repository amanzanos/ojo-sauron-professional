import type { StoreZone } from '../types/analysis';

// Backend for store-zone analytics only (anonymous, aggregate — see server/schema.sql). If no
// backend is configured (VITE_API_URL unset, e.g. running the app without the optional server),
// every call here becomes a harmless no-op instead of throwing, so the rest of the app still works.
const API_URL = import.meta.env.VITE_API_URL as string | undefined;
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

function apiConfigured() {
  return !!API_URL;
}

function headers(): HeadersInit {
  return { 'Content-Type': 'application/json', ...(API_KEY ? { 'X-API-Key': API_KEY } : {}) };
}

export async function fetchZones(): Promise<StoreZone[]> {
  if (!apiConfigured()) return [];
  const res = await fetch(`${API_URL}/api/zones`, { headers: headers() });
  if (!res.ok) throw new Error(`fetchZones failed: ${res.status}`);
  return res.json();
}

export async function saveZones(zones: StoreZone[]): Promise<StoreZone[]> {
  if (!apiConfigured()) return zones;
  const res = await fetch(`${API_URL}/api/zones`, { method: 'PUT', headers: headers(), body: JSON.stringify(zones) });
  if (!res.ok) throw new Error(`saveZones failed: ${res.status}`);
  return res.json();
}

/** Fire-and-forget: reporting a closed visit should never block or break the analysis loop. */
export function reportVisit(zoneId: string, dwellMs: number): void {
  if (!apiConfigured()) return;
  fetch(`${API_URL}/api/visits`, { method: 'POST', headers: headers(), body: JSON.stringify({ zoneId, dwellMs }) })
    .catch((err) => console.error('No se pudo registrar la visita de zona', err));
}

export interface ZoneServerStats {
  zoneId: string;
  name: string;
  totalVisits: number;
  totalDwellMs: number;
  avgDwellMs: number;
}

export async function fetchTodayStats(): Promise<ZoneServerStats[]> {
  if (!apiConfigured()) return [];
  const res = await fetch(`${API_URL}/api/stats/today`, { headers: headers() });
  if (!res.ok) throw new Error(`fetchTodayStats failed: ${res.status}`);
  return res.json();
}

export async function fetchHistory(days = 14): Promise<Array<{ date: string; stats: Record<string, { totalVisits: number; totalDwellMs: number }> }>> {
  if (!apiConfigured()) return [];
  const res = await fetch(`${API_URL}/api/stats/history?days=${days}`, { headers: headers() });
  if (!res.ok) throw new Error(`fetchHistory failed: ${res.status}`);
  return res.json();
}
