import { type ReactNode, useState } from 'react';
import { Activity, Eye, Gauge as GaugeIcon, Hand, History, ScanFace, Users } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalysisFrame, PersonSummary } from '../types/analysis';
import { MetricBar } from './MetricBar';
import { Gauge } from './Gauge';
import { GESTURE_ICON } from '../engine/HandGestureEngine';

interface Props {
  frame?: AnalysisFrame;
  history: Array<Record<string, number | string>>;
  gestureCounts: Record<string, number>;
  persons: PersonSummary[];
}

const TABS = ['Resumen', 'Métricas', 'Emociones', 'Gestos', 'Personas', 'Eventos'] as const;
type Tab = (typeof TABS)[number];

function timeAgo(ts: number) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `hace ${s}s`;
  return `hace ${Math.floor(s / 60)}m`;
}

export function SidePanel({ frame, history, gestureCounts, persons }: Props) {
  const [tab, setTab] = useState<Tab>('Resumen');
  const metric = (key: string) => frame?.metrics.find((m) => m.key === key);
  const emotions = frame?.emotions ?? [];
  const otherMetrics = (frame?.metrics ?? []).filter((m) => !['engagementIndex', 'stressIndex', 'attention'].includes(m.key));

  return (
    <aside className="panel">
      <div className="tab-bar">
        {TABS.map((t) => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Resumen' && (
        <>
          <div className="panel-section main-state">
            <div className="section-title">Estado dominante</div>
            <div className="dominant">{frame?.dominantEmotion.label ?? 'Sin datos'}</div>
            <div className="dominant-score">{frame?.dominantEmotion.score ?? 0}%</div>
          </div>

          <div className="panel-section gauges-row">
            <Gauge value={metric('engagementIndex')?.value ?? 0} label="Compromiso" />
            <Gauge value={metric('stressIndex')?.value ?? 0} label="Estrés" />
            <Gauge value={metric('attention')?.value ?? 0} label="Atención" />
          </div>

          <div className="panel-grid">
            <Kpi icon={<Eye size={15} />} label="Mirada" value={frame?.eye.gaze ?? 'unknown'} />
            <Kpi icon={<GaugeIcon size={15} />} label="Parp./min" value={String(frame?.eye.blinkRate ?? 0)} />
            <Kpi icon={<ScanFace size={15} />} label="Pose" value={frame?.headPose.label ?? '-'} />
            <Kpi icon={<Activity size={15} />} label="Fuera" value={`${frame?.eye.awaySeconds.toFixed(1) ?? '0.0'}s`} />
            <Kpi icon={<GaugeIcon size={15} />} label="Dur. parpadeo" value={`${frame?.eye.avgBlinkDurationMs ?? 0}ms`} />
            <Kpi icon={<Hand size={15} />} label="Manos" value={String(frame?.hands.handsDetected ?? 0)} />
          </div>

          <div className="panel-section chart-section">
            <div className="section-title"><History size={16} /> Histórico</div>
            <ResponsiveContainer width="100%" height={145}>
              <LineChart data={history}>
                <XAxis dataKey="t" hide />
                <YAxis hide domain={[0, 100]} />
                <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 10 }} />
                <Line type="monotone" dataKey="compromiso" stroke="#f0b429" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="estres" stroke="#ef4444" dot={false} strokeWidth={2} opacity={0.7} />
                <Line type="monotone" dataKey="atencion" stroke="currentColor" dot={false} strokeWidth={1.5} opacity={0.4} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {tab === 'Métricas' && (
        <div className="panel-section">
          <div className="section-title">Métricas de control</div>
          {otherMetrics.map((m) => <MetricBar key={m.key} metric={m} />)}
        </div>
      )}

      {tab === 'Emociones' && (
        <div className="panel-section">
          <div className="section-title">Distribución emocional</div>
          {emotions.map((e) => (
            <div className="emotion-row" key={e.name}><span>{e.label}</span><b>{e.score}%</b></div>
          ))}
        </div>
      )}

      {tab === 'Gestos' && (
        <>
          <div className="panel-section">
            <div className="section-title"><Hand size={16} /> Gestos activos</div>
            {frame?.hands.gestures.filter((g) => g.name !== 'hand_near_face').length ? (
              frame.hands.gestures.filter((g) => g.name !== 'hand_near_face').map((g) => (
                <div className="emotion-row" key={g.id}>
                  <span>{GESTURE_ICON[g.name]} {g.label}</span>
                  <b>{g.hand === 'both' ? 'ambas' : g.hand}</b>
                </div>
              ))
            ) : <div className="empty-hint">Sin gestos detectados</div>}
          </div>
          <div className="panel-section">
            <div className="section-title">Contadores de sesión</div>
            {Object.keys(gestureCounts).length ? (
              Object.entries(gestureCounts).map(([name, count]) => (
                <div className="emotion-row" key={name}>
                  <span>{GESTURE_ICON[name as keyof typeof GESTURE_ICON] ?? '•'} {name}</span>
                  <b>{count}</b>
                </div>
              ))
            ) : <div className="empty-hint">Todavía sin registros</div>}
          </div>
        </>
      )}

      {tab === 'Personas' && (
        <div className="panel-section">
          <div className="section-title"><Users size={16} /> Personas identificadas ({persons.length})</div>
          {persons.length ? (
            <div className="person-grid">
              {persons.map((p) => (
                <div className="person-card" key={p.id}>
                  <img src={p.photo} alt={p.mood} className="person-photo" />
                  <div className="person-info">
                    <div className="person-row"><span>Sexo</span><b>{p.sex} ({p.sexConfidence}%)</b></div>
                    <div className="person-row"><span>Edad est.</span><b>~{p.age} años</b></div>
                    <div className="person-row"><span>Ánimo</span><b>{p.mood} ({p.moodScore}%)</b></div>
                    <div className="person-seen">{timeAgo(p.firstSeenAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="empty-hint">Todavía no se ha completado el análisis breve de ninguna persona. Mantén el rostro en cámara unos segundos.</div>}
        </div>
      )}

      {tab === 'Eventos' && (
        <div className="panel-section events-section">
          <div className="section-title"><History size={16} /> Eventos</div>
          <div className="events-list">
            {(frame?.events ?? []).map((ev) => (
              <div key={ev.id} className={`event ${ev.severity}`}>
                <time>{new Date(ev.time).toLocaleTimeString()}</time>
                <strong>{ev.title}</strong>
                <span>{ev.detail}</span>
              </div>
            ))}
            {!frame?.events.length && <div className="empty-hint">Sin eventos todavía</div>}
          </div>
        </div>
      )}
    </aside>
  );
}

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="kpi">{icon}<span>{label}</span><strong>{value}</strong></div>;
}
