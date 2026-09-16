import { useState } from 'react';
import { MapPin, Plus, Send, X } from 'lucide-react';
import type { CitizenCategory, CitizenEvent } from '../types/citizen';
import { categoryMeta, CITIZEN_CATEGORIES } from '../types/citizen';
import { getCurrentPosition } from '../utils/geo';

function relativeTime(ts: number) {
  const diffMin = Math.round((Date.now() - ts) / 60000);
  if (diffMin < 1) return 'ahora mismo';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  return `hace ${Math.round(diffH / 24)} d`;
}

interface FeedProps {
  events: CitizenEvent[];
  onCreate: (input: { category: CitizenCategory; title: string; description: string; lat: number; lng: number }) => Promise<void>;
}

export function Feed({ events, onCreate }: FeedProps) {
  const [composing, setComposing] = useState(false);
  const [category, setCategory] = useState<CitizenCategory>('sospechoso');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    setLocating(true);
    const position = await getCurrentPosition().finally(() => setLocating(false));
    await onCreate({ category, title: title.trim(), description: description.trim(), lat: position?.lat ?? 0, lng: position?.lng ?? 0 });
    setTitle('');
    setDescription('');
    setSubmitting(false);
    setComposing(false);
  };

  return (
    <div className="feed">
      <div className="feed-composer-toggle">
        <button className="feed-new-btn" onClick={() => setComposing((v) => !v)}>
          {composing ? <X size={16} /> : <Plus size={16} />}
          {composing ? 'Cancelar' : 'Reportar algo en tu zona'}
        </button>
      </div>

      {composing && (
        <div className="feed-composer">
          <div className="feed-category-row">
            {CITIZEN_CATEGORIES.filter((c) => c.value !== 'alerta').map((c) => (
              <button
                key={c.value}
                className={`feed-category-chip ${category === c.value ? 'active' : ''}`}
                style={category === c.value ? { borderColor: c.color, color: c.color } : undefined}
                onClick={() => setCategory(c.value)}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>
          <input
            className="feed-input"
            placeholder="¿Qué está pasando?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
          <textarea
            className="feed-textarea"
            placeholder="Detalles (opcional): dirección aproximada, descripción..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
          />
          <div className="feed-composer-foot">
            <span className="feed-geo-hint"><MapPin size={12} /> {locating ? 'Obteniendo tu ubicación…' : 'Se adjuntará tu ubicación aproximada'}</span>
            <button className="feed-submit" disabled={!title.trim() || submitting} onClick={submit}>
              <Send size={14} /> Publicar
            </button>
          </div>
        </div>
      )}

      <div className="feed-list">
        {events.length === 0 && <p className="empty-hint">Todavía no hay reportes cerca de ti. Sé el primero en avisar a la comunidad.</p>}
        {events.map((ev) => {
          const meta = categoryMeta(ev.category);
          return (
            <div className="feed-card" key={ev.id}>
              <div className="feed-card-head">
                <span className="feed-card-icon" style={{ background: meta.color }}>{meta.icon}</span>
                <div className="feed-card-headtext">
                  <strong>{ev.title}</strong>
                  <span>{meta.label} · {relativeTime(ev.createdAt)}</span>
                </div>
              </div>
              {ev.description && <p className="feed-card-desc">{ev.description}</p>}
              <div className="feed-card-foot">
                <span><MapPin size={11} /> {ev.lat ? `${ev.lat.toFixed(3)}, ${ev.lng.toFixed(3)}` : 'ubicación no disponible'}</span>
                <span>{ev.authorLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
