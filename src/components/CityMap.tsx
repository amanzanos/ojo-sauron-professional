import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CitizenEvent } from '../types/citizen';
import { categoryMeta } from '../types/citizen';
import { FALLBACK_CENTER, getCurrentPosition, type GeoPoint } from '../utils/geo';

function markerIcon(color: string, icon: string) {
  return L.divIcon({
    className: 'weros-marker',
    html: `<span style="background:${color}">${icon}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function relativeTime(ts: number) {
  const diffMin = Math.round((Date.now() - ts) / 60000);
  if (diffMin < 1) return 'ahora mismo';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  return `hace ${Math.round(diffH / 24)} d`;
}

/** Recenters the map once, the first time a real user location resolves — doesn't fight the user's own panning afterwards. */
function RecenterOnce({ center }: { center: GeoPoint }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng]);
  return null;
}

export function CityMap({ events }: { events: CitizenEvent[] }) {
  const [center, setCenter] = useState<GeoPoint>(FALLBACK_CENTER);
  const [located, setLocated] = useState(false);

  useEffect(() => {
    getCurrentPosition().then((pos) => {
      if (pos) { setCenter(pos); setLocated(true); }
    });
  }, []);

  const markers = useMemo(() => events.filter((e) => e.lat && e.lng), [events]);

  return (
    <div className="map-wrap">
      <MapContainer center={[center.lat, center.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {located && <RecenterOnce center={center} />}
        {markers.map((ev) => {
          const meta = categoryMeta(ev.category);
          return (
            <Marker key={ev.id} position={[ev.lat, ev.lng]} icon={markerIcon(meta.color, meta.icon)}>
              <Popup>
                <strong>{meta.icon} {ev.title}</strong>
                <p style={{ margin: '4px 0' }}>{ev.description}</p>
                <small>{relativeTime(ev.createdAt)} · {ev.authorLabel}</small>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      <div className="map-legend">
        {[...new Set(markers.map((m) => m.category))].map((cat) => {
          const meta = categoryMeta(cat);
          return <span key={cat} style={{ borderColor: meta.color }}>{meta.icon} {meta.label}</span>;
        })}
        {!markers.length && <span>Sin eventos reportados todavía</span>}
      </div>
    </div>
  );
}
