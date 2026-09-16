import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { nowId } from '../../utils/math';
import { formatMinutes, loadPatrolWindows, type PatrolWindow, savePatrolWindows } from '../../utils/patrolSchedule';

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function PatrolSchedulePanel() {
  const [windows, setWindows] = useState<PatrolWindow[]>(loadPatrolWindows);
  const [start, setStart] = useState('22:00');
  const [end, setEnd] = useState('23:00');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const persist = (next: PatrolWindow[]) => {
    setWindows(next);
    savePatrolWindows(next);
  };

  const toggleDay = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const add = () => {
    if (!days.length) return;
    const next: PatrolWindow = { id: nowId(), label: '', startMinutes: toMinutes(start), endMinutes: toMinutes(end), days, active: true };
    persist([...windows, next]);
  };

  const remove = (id: string) => persist(windows.filter((w) => w.id !== id));
  const toggleActive = (id: string) => persist(windows.map((w) => (w.id === id ? { ...w, active: !w.active } : w)));

  return (
    <div className="tool-simple">
      <p className="tool-hint">Activa el modo testigo solo en las franjas que marques (mientras WEROS esté abierto) — no interrumpe una grabación manual que ya esté en marcha.</p>
      <div className="patrol-form">
        <div className="patrol-times">
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          <span>–</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="patrol-days">
          {DAY_LABELS.map((label, i) => (
            <button key={i} className={`patrol-day ${days.includes(i) ? 'active' : ''}`} onClick={() => toggleDay(i)}>{label}</button>
          ))}
        </div>
        <button className="tool-primary-btn" onClick={add}><Plus size={14} /> Añadir franja</button>
      </div>
      <div className="patrol-list">
        {windows.length === 0 && <p className="tool-empty">Sin franjas programadas.</p>}
        {windows.map((w) => (
          <div className="patrol-row" key={w.id}>
            <span className="mono">{formatMinutes(w.startMinutes)}–{formatMinutes(w.endMinutes)}</span>
            <span>{w.days.map((d) => DAY_LABELS[d]).join(' ')}</span>
            <button className="geofence-toggle" onClick={() => toggleActive(w.id)}>{w.active ? 'Activo' : 'Apagado'}</button>
            <button className="icon-btn" onClick={() => remove(w.id)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
