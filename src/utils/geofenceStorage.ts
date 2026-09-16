export interface Geofence {
  id: string;
  message: string;
  lat: number;
  lng: number;
  radiusM: number;
  active: boolean;
}

const KEY = 'weros.geofences.v1';

export function loadGeofences(): Geofence[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Geofence[]) : [];
  } catch {
    return [];
  }
}

export function saveGeofences(list: Geofence[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}
