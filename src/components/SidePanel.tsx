import { type ReactNode, useState } from 'react';
import { Activity, Box, Ear, Eye, FileBarChart, Gauge as GaugeIcon, Hand, Heart, History, Mic, MicOff, ScanFace, Store, TreePine, Users, Users2 } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalysisFrame, EmotionName, EnvironmentReport, ObjectInventoryEntry, PersonSummary, SessionReport, SoundCategoryStat, SoundLogEntry, VoiceProfile, ZoneStats } from '../types/analysis';
import { MetricBar } from './MetricBar';
import { Gauge } from './Gauge';
import { GESTURE_ICON } from '../engine/HandGestureEngine';
import { EMOTION_LABELS } from '../engine/FaceAnalysisEngine';
import { PET_LABELS, URBAN_LABELS } from '../engine/ObjectDetectionEngine';
import { CRITICAL_SOUND_LABELS } from '../engine/SoundClassificationEngine';

interface Props {
  frame?: AnalysisFrame;
  history: Array<Record<string, number | string>>;
  gestureCounts: Record<string, number>;
  persons: PersonSummary[];
  voiceActive: boolean;
  voiceError?: string;
  onToggleVoice: () => void;
  objectInventory: ObjectInventoryEntry[];
  soundLog: SoundLogEntry[];
  soundStats: SoundCategoryStat[];
  sessionReport: SessionReport;
  environmentReport: EnvironmentReport;
  voiceProfiles: VoiceProfile[];
  zoneStats: ZoneStats[];
}

const TABS = ['Resumen', 'Métricas', 'Emociones', 'Interacción', 'Audio', 'Personas', 'Informe', 'Entorno', 'Tienda', 'Eventos'] as const;
type Tab = (typeof TABS)[number];

function timeAgo(ts: number) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `hace ${s}s`;
  return `hace ${Math.floor(s / 60)}m`;
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function SidePanel({ frame, history, gestureCounts, persons, voiceActive, voiceError, onToggleVoice, objectInventory, soundLog, soundStats, sessionReport, environmentReport, voiceProfiles, zoneStats }: Props) {
  const [tab, setTab] = useState<Tab>('Resumen');
  const metric = (key: string) => frame?.metrics.find((m) => m.key === key);
  const emotions = frame?.emotions ?? [];
  const otherMetrics = (frame?.metrics ?? []).filter((m) => !['engagementIndex', 'stressIndex', 'attention'].includes(m.key));
  const urbanObjects = objectInventory.filter((o) => URBAN_LABELS.has(o.label));
  const petObjects = objectInventory.filter((o) => PET_LABELS.has(o.label));
  const criticalSounds = soundLog.filter((s) => CRITICAL_SOUND_LABELS.has(s.label));
  const heatmap = frame?.sceneMotion.heatmap ?? [];
  const heatmapMax = heatmap.length ? Math.max(...heatmap, 0.001) : 1;

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
            <Kpi icon={<Heart size={15} />} label="Pulso est." value={frame?.heartRate.active ? `${frame.heartRate.bpm} bpm` : 'calibrando…'} />
            <Kpi icon={<Users2 size={15} />} label="Interacción" value={frame?.social.label ?? 'Sin datos'} />
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

      {tab === 'Interacción' && (
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
            <div className="section-title"><Box size={16} /> Objetos en escena</div>
            {frame?.objects.length ? (
              frame.objects.map((o) => (
                <div className="emotion-row" key={o.id}>
                  <span>{o.label} <span className={`held-badge ${o.held ? 'held' : ''}`}>{o.held ? 'en mano' : 'en fondo'}</span></span>
                  <b>{Math.round(o.score * 100)}%</b>
                </div>
              ))
            ) : <div className="empty-hint">Sin objetos detectados</div>}
          </div>
          <div className="panel-section">
            <div className="section-title">Registro de objetos (sesión)</div>
            {objectInventory.length ? (
              objectInventory.map((o) => (
                <div className="emotion-row" key={o.label}>
                  <span>{o.label} · {o.timesSeen}x · {timeAgo(o.lastSeenAt)}</span>
                  <b className="mono">{formatDuration(o.totalMs)}</b>
                </div>
              ))
            ) : <div className="empty-hint">Todavía sin registros</div>}
          </div>
          <div className="panel-section">
            <div className="section-title">Contadores de gestos (sesión)</div>
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

      {tab === 'Audio' && (
        <>
          <div className="panel-section">
            <div className="section-title">{voiceActive ? <Mic size={16} /> : <MicOff size={16} />} Análisis de voz</div>
            {voiceActive && frame ? (
              <>
                <div className="emotion-row"><span>Estado</span><b>{frame.voice.speaking ? 'Hablando' : 'Silencio'}</b></div>
                <MiniBar label="Volumen" value={frame.voice.volume} status={frame.voice.volume > 70 ? 'high' : 'normal'} />
                <MiniBar label="Variabilidad tonal" value={frame.voice.pitchVariability} status="normal" />
                <MiniBar label="Tensión vocal estimada" value={frame.voice.vocalTension} status={frame.voice.vocalTension > 70 ? 'critical' : frame.voice.vocalTension > 45 ? 'medium' : 'normal'} />
                <div className="emotion-row"><span>Tono estimado</span><b>{frame.voice.pitchHz > 0 ? `${frame.voice.pitchHz} Hz` : '—'}</b></div>
                <div className="emotion-row"><span>Ritmo de habla</span><b>{frame.voice.speakingRatePerMin}/min</b></div>
              </>
            ) : (
              <div className="empty-hint">
                {voiceError ?? 'El análisis de audio está desactivado (requiere permiso de micrófono aparte del de cámara).'}
                <button className="voice-enable-btn" onClick={onToggleVoice}>{voiceError ? 'Reintentar' : 'Activar análisis de audio'}</button>
              </div>
            )}
          </div>

          {voiceActive && frame && (
            <div className="panel-section">
              <div className="section-title">Biomarcadores vocales</div>
              <MiniBar label="Jitter (inestabilidad de tono)" value={frame.voice.jitter} status={frame.voice.jitter > 60 ? 'critical' : frame.voice.jitter > 35 ? 'medium' : 'normal'} />
              <MiniBar label="Shimmer (inestabilidad de volumen)" value={frame.voice.shimmer} status={frame.voice.shimmer > 60 ? 'critical' : frame.voice.shimmer > 35 ? 'medium' : 'normal'} />
              <MiniBar label="Desviación del tono habitual" value={frame.voice.pitchBaselineDeviation} status={frame.voice.pitchBaselineDeviation > 60 ? 'high' : 'normal'} />
              <div className="emotion-row"><span>Vacilaciones/pausas</span><b>{frame.voice.hesitationsPerMin}/min · {frame.voice.totalHesitations} en sesión</b></div>
            </div>
          )}

          <div className="panel-section">
            <div className="section-title"><Ear size={16} /> Sonido ambiente</div>
            {voiceActive && frame?.sound.active ? (
              <>
                <div className="dominant" style={{ fontSize: 22 }}>{frame.sound.topLabel}</div>
                <div className="dominant-score">{Math.round(frame.sound.topScore * 100)}% confianza</div>
                <div style={{ marginTop: 12 }}>
                  {frame.sound.categories.slice(1).map((c) => (
                    <div className="emotion-row" key={c.label}>
                      <span>{c.label}</span>
                      <b>{Math.round(c.score * 100)}%</b>
                    </div>
                  ))}
                </div>
              </>
            ) : <div className="empty-hint">Clasifica timbres, alarmas, cristales rotos, ladridos, gritos y otros ~50 tipos de sonido relevantes en tiempo real.</div>}
          </div>

          {voiceActive && (
            <div className="panel-section">
              <div className="section-title"><Users2 size={16} /> Voces reconocidas</div>
              {voiceProfiles.length ? (
                voiceProfiles.map((v) => (
                  <div className="emotion-row" key={v.id}>
                    <span>{v.label}{v.label === frame?.voice.activeSpeakerLabel ? ' · hablando' : ''} · ~{Math.round(v.avgPitchHz)}Hz · {v.utterances} turnos</span>
                    <b className="mono">{formatDuration(v.totalMs)}</b>
                  </div>
                ))
              ) : <div className="empty-hint">Todavía sin voces distintas identificadas.</div>}
              <div className="empty-hint" style={{ marginTop: 8 }}>Identificación aproximada por timbre y tono — no es verificación biométrica.</div>
            </div>
          )}

          {voiceActive && criticalSounds.length > 0 && (
            <div className="panel-section">
              <div className="section-title">Alertas de sonido</div>
              <div className="events-list" style={{ maxHeight: 160 }}>
                {criticalSounds.slice(0, 10).map((s, i) => (
                  <div className="event warning" key={`${s.time}-${i}`}>
                    <time>{new Date(s.time).toLocaleTimeString()}</time>
                    <strong>{s.label}</strong>
                    <span>{Math.round(s.score * 100)}% confianza</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {voiceActive && (
            <>
              <div className="panel-section">
                <div className="section-title">Registro de sonidos (sesión)</div>
                <div className="events-list" style={{ maxHeight: 220 }}>
                  {soundLog.slice(0, 20).map((s, i) => (
                    <div className="event info" key={`${s.time}-${i}`}>
                      <time>{new Date(s.time).toLocaleTimeString()}</time>
                      <strong>{s.label}</strong>
                      <span>{Math.round(s.score * 100)}% confianza</span>
                    </div>
                  ))}
                  {!soundLog.length && <div className="empty-hint">Todavía sin registros</div>}
                </div>
              </div>
              <div className="panel-section">
                <div className="section-title">Categorías más frecuentes</div>
                {soundStats.slice(0, 8).map((s) => (
                  <div className="emotion-row" key={s.label}>
                    <span>{s.label} · {s.count}x</span>
                    <b className="mono">{formatDuration(s.totalMs)}</b>
                  </div>
                ))}
                {!soundStats.length && <div className="empty-hint">Todavía sin registros</div>}
              </div>
            </>
          )}
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

      {tab === 'Informe' && (
        <>
          <div className="panel-section">
            <div className="section-title"><FileBarChart size={16} /> Informe de sesión</div>
            <div className="emotion-row"><span>Duración</span><b className="mono">{formatDuration(sessionReport.durationMs)}</b></div>
            <div className="emotion-row"><span>Atención media</span><b>{sessionReport.avgAttention}%</b></div>
            <div className="emotion-row"><span>Estrés medio</span><b>{sessionReport.avgStress}%</b></div>
            <div className="emotion-row"><span>Compromiso medio</span><b>{sessionReport.avgEngagement}%</b></div>
            <div className="emotion-row"><span>Tiempo hablado</span><b className="mono">{formatDuration(sessionReport.totalSpeakingMs)}</b></div>
            <div className="emotion-row"><span>Vacilaciones totales</span><b>{sessionReport.hesitations}</b></div>
            {sessionReport.heartRateAvg !== undefined && (
              <div className="emotion-row"><span>Pulso medio / rango</span><b>{sessionReport.heartRateAvg} bpm ({sessionReport.heartRateRange?.[0]}-{sessionReport.heartRateRange?.[1]})</b></div>
            )}
          </div>

          <div className="panel-section">
            <div className="section-title">Tiempo por emoción dominante</div>
            {(Object.entries(sessionReport.emotionTimeMs) as Array<[EmotionName, number]>)
              .sort((a, b) => b[1] - a[1])
              .filter(([, ms]) => ms > 0)
              .map(([name, ms]) => (
                <div className="emotion-row" key={name}>
                  <span>{EMOTION_LABELS[name]}</span>
                  <b className="mono">{formatDuration(ms)}</b>
                </div>
              ))}
          </div>

          <div className="panel-section">
            <div className="section-title">Alertas por severidad</div>
            <div className="emotion-row"><span>Críticas</span><b>{sessionReport.alertCounts.critical}</b></div>
            <div className="emotion-row"><span>Avisos</span><b>{sessionReport.alertCounts.warning}</b></div>
            <div className="emotion-row"><span>Positivas</span><b>{sessionReport.alertCounts.positive}</b></div>
            <div className="emotion-row"><span>Informativas</span><b>{sessionReport.alertCounts.info}</b></div>
          </div>

          <div className="panel-section">
            <div className="section-title">Objetos más frecuentes</div>
            {objectInventory.slice(0, 6).map((o) => (
              <div className="emotion-row" key={o.label}>
                <span>{o.label} · {o.timesSeen}x</span>
                <b className="mono">{formatDuration(o.totalMs)}</b>
              </div>
            ))}
            {!objectInventory.length && <div className="empty-hint">Todavía sin registros</div>}
          </div>
        </>
      )}

      {tab === 'Entorno' && (
        <>
          <div className="panel-section">
            <div className="section-title"><TreePine size={16} /> Actividad en la escena</div>
            <div className="emotion-row"><span>Actividad actual</span><b>{Math.round(frame?.sceneMotion.overallMotion ?? 0)}%</b></div>
            {heatmap.length > 0 && (
              <div className="heatmap-grid" style={{ gridTemplateColumns: `repeat(${frame?.sceneMotion.gridW ?? 1}, 1fr)` }}>
                {heatmap.map((v, i) => (
                  <div key={i} className="heatmap-cell" style={{ opacity: Math.min(1, v / heatmapMax) }} />
                ))}
              </div>
            )}
            <div className="empty-hint" style={{ marginTop: 8 }}>Mapa de calor acumulado de qué zonas de la escena concentran más movimiento en la sesión (no depende de detectar caras).</div>
          </div>

          <div className="panel-section">
            <div className="section-title">Calidad ambiental</div>
            <MiniBar label="Luz relativa" value={frame?.ambient.lux ?? 0} status={(frame?.ambient.lux ?? 0) < 30 || (frame?.ambient.lux ?? 0) > 90 ? 'medium' : 'normal'} />
            <div className="emotion-row"><span>Temperatura de color</span><b>{frame?.ambient.colorTempLabel ?? 'neutra'}</b></div>
            <MiniBar label="Parpadeo de luz" value={frame?.ambient.flickerScore ?? 0} status={(frame?.ambient.flickerScore ?? 0) > 60 ? 'medium' : 'normal'} />
            <MiniBar label="Contraluz" value={frame?.ambient.backlightScore ?? 0} status={(frame?.ambient.backlightScore ?? 0) > 55 ? 'medium' : 'normal'} />
            <MiniBar label="Vibración de cámara" value={frame?.ambient.shakeScore ?? 0} status={(frame?.ambient.shakeScore ?? 0) > 0 ? 'high' : 'normal'} />
            <MiniBar label="Posible humo/niebla" value={frame?.ambient.hazeScore ?? 0} status={(frame?.ambient.hazeScore ?? 0) > 55 ? 'critical' : 'normal'} />
            <div className="empty-hint" style={{ marginTop: 8 }}>Índices relativos, no calibrados (sin sensor de referencia). Temperatura de color y humo/niebla son estimaciones de baja confianza, afectadas por el balance de blancos automático de la cámara.</div>
          </div>

          <div className="panel-section">
            <div className="section-title">Tráfico y ruido de fondo</div>
            <MiniBar label="Índice de tráfico (sonido)" value={environmentReport.trafficIndex} status={environmentReport.trafficIndex > 50 ? 'high' : 'normal'} />
            <MiniBar label="Ruido ambiente" value={environmentReport.ambientNoise} status={environmentReport.ambientNoise > 60 ? 'high' : 'normal'} />
            {!voiceActive && <div className="empty-hint">Activa "Audio" para medir tráfico y ruido de fondo.</div>}
          </div>

          <div className="panel-section">
            <div className="section-title">Objetos de calle</div>
            {urbanObjects.length ? (
              urbanObjects.map((o) => (
                <div className="emotion-row" key={o.label}>
                  <span>{o.label} · {o.timesSeen}x</span>
                  <b className="mono">{formatDuration(o.totalMs)}</b>
                </div>
              ))
            ) : <div className="empty-hint">Todavía sin objetos de calle detectados (coche, bici, semáforo, banco...)</div>}
          </div>

          <div className="panel-section">
            <div className="section-title">Tipo de espacio y objetos</div>
            <div className="emotion-row"><span>Tipo de espacio estimado</span><b>{environmentReport.roomType === 'sin_datos' ? 'Sin datos' : environmentReport.roomType}</b></div>
            <MiniBar label="Desorden visual" value={environmentReport.clutterScore} status={environmentReport.clutterScore > 60 ? 'medium' : 'normal'} />
            <div className="emotion-row" style={{ marginTop: 6 }}><span>Mascotas</span></div>
            {petObjects.length ? (
              petObjects.map((o) => (
                <div className="emotion-row" key={o.label}>
                  <span>{o.label} · {o.timesSeen}x</span>
                  <b className="mono">{formatDuration(o.totalMs)}</b>
                </div>
              ))
            ) : <div className="empty-hint">Todavía sin mascotas detectadas</div>}
            {frame?.objects.some((o) => o.screenState) && (
              <div style={{ marginTop: 6 }}>
                {frame.objects.filter((o) => o.screenState).map((o) => (
                  <div className="emotion-row" key={o.id}>
                    <span>{o.label}</span>
                    <b>{o.screenState}</b>
                  </div>
                ))}
              </div>
            )}
            <div className="empty-hint" style={{ marginTop: 8 }}>Tipo de espacio y desorden son heurísticas aproximadas por palabras clave sobre los objetos vistos, no un clasificador de escena entrenado.</div>
          </div>

          <div className="panel-section">
            <div className="section-title">Aforo / ocupación</div>
            <div className="emotion-row"><span>Ocupación media</span><b>{environmentReport.avgOccupancy} personas</b></div>
            <div className="emotion-row"><span>Pico de ocupación</span><b>{environmentReport.peakOccupancy} personas</b></div>
            <div className="emotion-row"><span>Tiempo con escena vacía</span><b className="mono">{formatDuration(environmentReport.emptyTimeMs)}</b></div>
          </div>

          <div className="panel-section">
            <div className="section-title">Ritmo de trabajo</div>
            <div className="emotion-row"><span>Estado actual</span><b>{environmentReport.currentState === 'trabajando' ? 'Trabajando' : environmentReport.currentState === 'descanso' ? 'Descanso' : 'Sin datos'}</b></div>
            <div className="emotion-row"><span>Sesiones de presencia</span><b>{environmentReport.workSessions}</b></div>
            <div className="emotion-row"><span>Descansos (≥1 min)</span><b>{environmentReport.breaksCount}</b></div>
            <div className="emotion-row"><span>Sesión media</span><b className="mono">{formatDuration(environmentReport.avgWorkSessionMs)}</b></div>
            <div className="emotion-row"><span>Descanso medio</span><b className="mono">{formatDuration(environmentReport.avgBreakMs)}</b></div>
          </div>
        </>
      )}

      {tab === 'Tienda' && (
        <div className="panel-section">
          <div className="section-title"><Store size={16} /> Analítica de zonas</div>
          {zoneStats.length ? (
            zoneStats.map((z) => (
              <div key={z.zoneId} className="emotion-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <div className="emotion-row"><span><b>{z.name}</b></span><b>{z.currentOccupancy} ahora</b></div>
                <div className="emotion-row"><span>Visitas hoy</span><b>{z.totalVisits}</b></div>
                <div className="emotion-row"><span>Permanencia media</span><b className="mono">{formatDuration(z.avgDwellMs)}</b></div>
                <div className="emotion-row"><span>Permanencia total</span><b className="mono">{formatDuration(z.totalDwellMs)}</b></div>
              </div>
            ))
          ) : (
            <div className="empty-hint">Todavía no definiste zonas. Usá el botón "ZONAS" sobre la imagen de cámara para dibujar rectángulos sobre las secciones de la tienda (arrastrando con el mouse) y ponerles nombre.</div>
          )}
          <div className="empty-hint" style={{ marginTop: 8 }}>
            Analítica anónima y agregada — no identifica personas ni guarda fotos ni fichas individuales. Recordá informar a tus clientes con cartelería visible sobre el uso de análisis de vídeo en el local.
          </div>
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

function MiniBar({ label, value, status }: { label: string; value: number; status: 'low' | 'normal' | 'medium' | 'high' | 'critical' }) {
  return (
    <div className="metric-row">
      <div className="metric-head">
        <span>{label}</span>
        <strong className="mono">{value}%</strong>
      </div>
      <div className="bar"><div className={`bar-fill ${status}`} style={{ width: `${value}%` }} /></div>
    </div>
  );
}
