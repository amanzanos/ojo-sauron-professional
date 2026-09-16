import { useState } from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { getCurrentPosition } from '../../utils/geo';
import { type Geofence, loadGeofences, saveGeofences } from '../../utils/geofenceStorage';
import { nowId } from '../../utils/math';
import { setToolEnabled } from '../../utils/toolPrefs';

interface GeofencePanelProps {
  watcherEnabled: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function GeofencePanel({ watcherEnabled, onStart, onStop }: GeofencePanelProps) {
  const [geofences, setGeofences] = useState<Geofence[]>(loadGeofences);
  const [message, setMessage] = useState('');
  const [locating, setLocating] = useState(false);

  const persist = (next: Geofence[]) => {
    setGeofences(next);
    saveGeofences(next);
  };

  const addHere = async () => {
    if (!message.trim()) return;
    setLocating(true);
    const position = await getCurrentPosition();
    setLocating(false);
    if (!position) return;
    const next = [...geofences, { id: nowId(), message: message.trim(), lat: position.lat, lng: position.lng, radiusM: 150, active: true }];
    persist(next);
    setMessage('');
    if (!watcherEnabled) { onStart(); setToolEnabled('geofences', true); }
  };

  const remove = (id: string) => persist(geofences.filter((g) => g.id !== id));
  const toggleActive = (id: string) => persist(geofences.map((g) => (g.id === id ? { ...g, active: !g.active } : g)));

  return (
    <div className="tool-simple">
      <p className="tool-hint">Guarda un aviso ligado a un sitio — se dispara solo cuando te acercas, no a una hora fija.</p>
      <div className="geofence-add">
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ej. Comprar pan" />
        <button className="tool-primary-btn" onClick={addHere} disabled={!message.trim() || locating}>
          <Plus size={14} /> {locating ? 'Ubicando…' : 'Aquí'}
        </button>
      </div>
      <div className="geofence-list">
        {geofences.length === 0 && <p className="tool-empty">Sin recordatorios de lugar todavía.</p>}
        {geofences.map((g) => (
          <div className="geofence-row" key={g.id}>
            <MapPin size={14} />
            <span className={g.active ? '' : 'geofence-inactive'}>{g.message}</span>
            <button className="geofence-toggle" onClick={() => toggleActive(g.id)}>{g.active ? 'Activo' : 'Apagado'}</button>
            <button className="icon-btn" onClick={() => remove(g.id)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      {geofences.some((g) => g.active) && (
        <button
          className={`tool-toggle-btn ${watcherEnabled ? 'active' : ''}`}
          onClick={() => {
            if (watcherEnabled) { onStop(); setToolEnabled('geofences', false); }
            else { onStart(); setToolEnabled('geofences', true); }
          }}
        >
          {watcherEnabled ? 'Vigilando ubicación' : 'Activar vigilancia de ubicación'}
        </button>
      )}
    </div>
  );
}
