import { useEffect, useRef, useState } from 'react';
import { Sun, X } from 'lucide-react';
import type { CitizenEvent } from '../types/citizen';
import { markGreetedToday, shouldGreetToday } from '../utils/dailyGreeting';
import { hasOwnerDescriptor, matchesOwner } from '../utils/faceIdentity';
import { getCurrentPosition } from '../utils/geo';
import { isToolEnabled } from '../utils/toolPrefs';
import { speak } from '../utils/tts';
import { fetchWeather } from '../utils/weather';

interface DailyGreetingProps {
  citizenEvents: CitizenEvent[];
}

function timeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Buenas noches';
  if (hour < 13) return 'Buenos días';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * First-open-of-the-day ritual: voice greeting + today's weather + a one-line summary of recent
 * community reports. Browsers block audio/autoplay without a user gesture, so this can't just
 * fire itself on load — it shows a dismissible card and only speaks once the person taps it.
 * The optional local jingle (public/audio/back-in-black.mp3) is gitignored and never published —
 * see public/audio/README.md — so it plays in local dev only and is silently skipped in production.
 */
export function DailyGreeting({ citizenEvents }: DailyGreetingProps) {
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>();

  useEffect(() => {
    setVisible(shouldGreetToday());
  }, []);

  const dismiss = () => setVisible(false);

  const start = async () => {
    setPlaying(true);
    markGreetedToday();

    // Saludo con reconocimiento facial (Herramientas → "Saludo con cara"): si está configurado,
    // abre la cámara delantera un instante y solo continúa si reconoce tu cara — o si no ve
    // ninguna (falla abierto, no bloquea el saludo por un fallo de cámara).
    if (isToolEnabled('faceGreeting') && hasOwnerDescriptor()) {
      const recognized = await matchesOwner().catch(() => true);
      if (!recognized) {
        setPlaying(false);
        setVisible(false);
        return;
      }
    }

    // Best-effort local jingle — a 404 in production (where the gitignored file doesn't exist)
    // is expected, not an error.
    try {
      const audio = new Audio('/audio/back-in-black.mp3');
      audio.volume = 0.35;
      audioRef.current = audio;
      await audio.play().catch(() => undefined);
    } catch {
      // no local jingle available — continue with voice only
    }

    const reportsToday = citizenEvents.filter((ev) => Date.now() - ev.createdAt < 24 * 60 * 60 * 1000).length;

    await speak(`${timeGreeting()}. Soy WEROS.`);

    const position = await getCurrentPosition();
    if (position) {
      const weather = await fetchWeather(position);
      if (weather) {
        await speak(`Hoy hace ${weather.description}, con una máxima de ${weather.tempMax} grados y una mínima de ${weather.tempMin}.`);
      }
    }

    await speak(reportsToday > 0
      ? `Resumen rápido: hoy se han reportado ${reportsToday} ${reportsToday === 1 ? 'incidencia' : 'incidencias'} en la comunidad. Que tengas un buen día.`
      : 'Resumen rápido: no hay incidencias nuevas reportadas hoy. Que tengas un buen día.');

    // Fade the jingle out instead of cutting it abruptly once the voice summary is done.
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      const fade = window.setInterval(() => {
        if (audio.volume > 0.05) audio.volume -= 0.05;
        else { audio.pause(); window.clearInterval(fade); }
      }, 150);
    }

    setPlaying(false);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="greeting-banner">
      <Sun size={16} />
      <span>{timeGreeting()} — toca para tu saludo con el resumen y el tiempo de hoy.</span>
      <button className="greeting-play" onClick={start} disabled={playing}>{playing ? 'Reproduciendo…' : 'Empezar mi día'}</button>
      <button className="icon-btn" onClick={dismiss} aria-label="Cerrar"><X size={16} /></button>
    </div>
  );
}
