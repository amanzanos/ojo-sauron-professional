import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Dumbbell, Flame, Plus, Scale, Trash2, TrendingUp, Trophy } from 'lucide-react';
import type { BodyWeightEntry, ExerciseSet, WorkoutExercise, WorkoutSession } from '../types/gym';
import {
  currentStreakWeeks, estimatedOneRepMax, exerciseNames, exerciseProgression, personalRecords, weeklyVolume
} from '../utils/gymAnalysis';
import { loadBodyWeights, loadSessions, saveBodyWeights, saveSessions } from '../utils/gymStorage';
import { nowId } from '../utils/math';

type GymTab = 'log' | 'weight' | 'analysis';

const CHART_TOOLTIP_STYLE = { background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 10 };

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function SessionLogger({ sessions, onSave }: { sessions: WorkoutSession[]; onSave: (next: WorkoutSession[]) => void }) {
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [exerciseName, setExerciseName] = useState('');
  const [notes, setNotes] = useState('');
  const known = useMemo(() => exerciseNames(sessions), [sessions]);

  const addExercise = () => {
    if (!exerciseName.trim()) return;
    setExercises((prev) => [...prev, { name: exerciseName.trim(), sets: [{ reps: 8, weightKg: 20 }] }]);
    setExerciseName('');
  };

  const updateSet = (exIdx: number, setIdx: number, patch: Partial<ExerciseSet>) => {
    setExercises((prev) => prev.map((ex, i) => (i !== exIdx ? ex : { ...ex, sets: ex.sets.map((s, j) => (j !== setIdx ? s : { ...s, ...patch })) })));
  };

  const addSet = (exIdx: number) => {
    setExercises((prev) => prev.map((ex, i) => (i !== exIdx ? ex : { ...ex, sets: [...ex.sets, { ...ex.sets[ex.sets.length - 1] }] })));
  };

  const removeExercise = (exIdx: number) => setExercises((prev) => prev.filter((_, i) => i !== exIdx));

  const saveSession = () => {
    if (!exercises.length) return;
    const session: WorkoutSession = { id: nowId(), date: Date.now(), exercises, notes: notes.trim() || undefined };
    const next = [session, ...sessions];
    saveSessions(next);
    onSave(next);
    setExercises([]);
    setNotes('');
  };

  const deleteSession = (id: string) => {
    const next = sessions.filter((s) => s.id !== id);
    saveSessions(next);
    onSave(next);
  };

  return (
    <div className="gym-log">
      <div className="gym-card">
        <div className="gym-exercise-add">
          <input
            list="known-exercises"
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            placeholder="Ej. Press banca"
            onKeyDown={(e) => e.key === 'Enter' && addExercise()}
          />
          <datalist id="known-exercises">
            {known.map((n) => <option key={n} value={n} />)}
          </datalist>
          <button className="tool-primary-btn" onClick={addExercise}><Plus size={14} /> Añadir</button>
        </div>

        {exercises.map((ex, exIdx) => (
          <div className="gym-exercise-block" key={exIdx}>
            <div className="gym-exercise-head">
              <strong>{ex.name}</strong>
              <button className="icon-btn" onClick={() => removeExercise(exIdx)}><Trash2 size={14} /></button>
            </div>
            {ex.sets.map((set, setIdx) => (
              <div className="gym-set-row" key={setIdx}>
                <span>Serie {setIdx + 1}</span>
                <input type="number" value={set.reps} onChange={(e) => updateSet(exIdx, setIdx, { reps: Number(e.target.value) })} /> reps ×
                <input type="number" value={set.weightKg} onChange={(e) => updateSet(exIdx, setIdx, { weightKg: Number(e.target.value) })} /> kg
              </div>
            ))}
            <button className="gym-add-set" onClick={() => addSet(exIdx)}>+ serie</button>
          </div>
        ))}

        {exercises.length > 0 && (
          <>
            <textarea className="gym-notes" placeholder="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            <button className="tool-primary-btn" onClick={saveSession}>Guardar sesión</button>
          </>
        )}
      </div>

      <div className="gym-history">
        {sessions.length === 0 && <p className="tool-empty">Todavía no has registrado ninguna sesión.</p>}
        {sessions.slice(0, 15).map((s) => (
          <div className="gym-session-card" key={s.id}>
            <div className="gym-session-head">
              <span className="mono">{formatDate(s.date)}</span>
              <button className="icon-btn" onClick={() => deleteSession(s.id)}><Trash2 size={13} /></button>
            </div>
            <div className="gym-session-exercises">
              {s.exercises.map((ex, i) => (
                <span key={i}>{ex.name}: {ex.sets.map((set) => `${set.weightKg}kg×${set.reps}`).join(', ')}</span>
              ))}
            </div>
            {s.notes && <p className="gym-session-notes">{s.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function BodyWeightLogger({ entries, onSave }: { entries: BodyWeightEntry[]; onSave: (next: BodyWeightEntry[]) => void }) {
  const [weight, setWeight] = useState('');

  const add = () => {
    const w = Number(weight);
    if (!w || w <= 0) return;
    const next = [...entries, { id: nowId(), date: Date.now(), weightKg: w }];
    saveBodyWeights(next);
    onSave(next);
    setWeight('');
  };

  const remove = (id: string) => {
    const next = entries.filter((e) => e.id !== id);
    saveBodyWeights(next);
    onSave(next);
  };

  const chartData = entries.map((e) => ({ label: formatDate(e.date), peso: e.weightKg }));
  const last = entries[entries.length - 1];

  return (
    <div className="gym-log">
      <div className="gym-card gym-centered">
        <Scale size={22} />
        <div className="gym-weight-add">
          <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Ej. 78.5" />
          <button className="tool-primary-btn" onClick={add}>Registrar peso</button>
        </div>
        {last && <p className="tool-hint">Último registro: {last.weightKg} kg — {formatDate(last.date)}</p>}
      </div>

      {entries.length > 1 && (
        <div className="gym-card">
          <div className="gym-chart-title"><TrendingUp size={14} /> Evolución del peso</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData}>
              <XAxis dataKey="label" hide />
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="peso" stroke="#f0b429" dot={{ r: 2 }} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="gym-history">
        {entries.slice().reverse().slice(0, 10).map((e) => (
          <div className="gym-session-card" key={e.id}>
            <span className="mono">{formatDate(e.date)}</span>
            <span>{e.weightKg} kg</span>
            <button className="icon-btn" onClick={() => remove(e.id)}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Analysis({ sessions }: { sessions: WorkoutSession[] }) {
  const names = useMemo(() => exerciseNames(sessions), [sessions]);
  const [selected, setSelected] = useState(names[0] ?? '');
  const progression = useMemo(() => (selected ? exerciseProgression(sessions, selected) : []), [sessions, selected]);
  const records = useMemo(() => personalRecords(sessions), [sessions]);
  const volume = useMemo(() => weeklyVolume(sessions), [sessions]);
  const streak = useMemo(() => currentStreakWeeks(sessions), [sessions]);

  if (!sessions.length) return <p className="tool-empty">Registra al menos una sesión para ver el análisis.</p>;

  return (
    <div className="gym-analysis">
      <div className="gym-stats-row">
        <div className="gym-stat"><Flame size={16} /><strong>{streak}</strong><span>{streak === 1 ? 'semana seguida' : 'semanas seguidas'}</span></div>
        <div className="gym-stat"><Dumbbell size={16} /><strong>{sessions.length}</strong><span>{sessions.length === 1 ? 'sesión total' : 'sesiones totales'}</span></div>
      </div>

      {names.length > 0 && (
        <div className="gym-card">
          <div className="gym-chart-title"><TrendingUp size={14} /> Progresión por ejercicio</div>
          <select className="gym-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={progression}>
              <XAxis dataKey="label" hide />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number, key: string) => [`${v} kg`, key === 'est1RM' ? '1RM estimado' : 'Peso máximo']} />
              <Line type="monotone" dataKey="maxWeight" stroke="currentColor" opacity={0.4} dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="est1RM" stroke="#f0b429" dot={{ r: 2 }} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          <p className="tool-hint">1RM estimado (Epley) a partir de tu mejor serie de cada sesión.</p>
        </div>
      )}

      <div className="gym-card">
        <div className="gym-chart-title"><TrendingUp size={14} /> Volumen semanal (kg totales)</div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={volume}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
            <XAxis dataKey="weekLabel" hide />
            <YAxis hide />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => [`${v} kg`, 'Volumen']} />
            <Bar dataKey="volume" fill="#f0b429" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="gym-card">
        <div className="gym-chart-title"><Trophy size={14} /> Récords personales (1RM estimado)</div>
        <div className="gym-pr-list">
          {records.map((r) => (
            <div className="gym-pr-row" key={r.name}>
              <span>{r.name}</span>
              <span className="mono">{r.est1RM} kg <small>({r.weightKg}kg×{r.reps})</small></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GymTracker() {
  const [tab, setTab] = useState<GymTab>('log');
  const [sessions, setSessions] = useState<WorkoutSession[]>(loadSessions);
  const [bodyWeights, setBodyWeights] = useState<BodyWeightEntry[]>(loadBodyWeights);

  return (
    <div className="gym">
      <div className="gym-subtabs">
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}><Dumbbell size={14} /> Registrar</button>
        <button className={tab === 'weight' ? 'active' : ''} onClick={() => setTab('weight')}><Scale size={14} /> Peso</button>
        <button className={tab === 'analysis' ? 'active' : ''} onClick={() => setTab('analysis')}><TrendingUp size={14} /> Análisis</button>
      </div>
      {tab === 'log' && <SessionLogger sessions={sessions} onSave={setSessions} />}
      {tab === 'weight' && <BodyWeightLogger entries={bodyWeights} onSave={setBodyWeights} />}
      {tab === 'analysis' && <Analysis sessions={sessions} />}
    </div>
  );
}
