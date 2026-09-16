export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number;
}

/** Default map center when geolocation is denied/unavailable — Madrid's Puerta del Sol. */
export const FALLBACK_CENTER: GeoPoint = { lat: 40.4168, lng: -3.7038 };

export function getCurrentPosition(timeoutMs = 6000): Promise<GeoPoint | undefined> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(undefined);
      return;
    }
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 }
    );
  });
}

export function mapsLink(point: GeoPoint): string {
  return `https://maps.google.com/?q=${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}
