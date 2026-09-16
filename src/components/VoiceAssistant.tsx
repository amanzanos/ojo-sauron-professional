import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Bot, Ear, Mic } from 'lucide-react';
import type { CitizenEvent } from '../types/citizen';
import { categoryMeta } from '../types/citizen';
import { loadAlertContact } from '../utils/alertContact';
import { dispatchDistressSound } from '../utils/distressBus';
import { distanceMeters, getCurrentPosition } from '../utils/geo';
import { disableNotifications, enableNotifications, notificationsEnabled, notificationsSupported, notify } from '../utils/notify';
import { APP_LABELS, APP_LINKS, callLink, getBatteryLevel, googleSearchLink, vibrate } from '../utils/phone';
import { pick, speak } from '../utils/tts';
import { parseVoiceCommand, startsWithWakeWord, stripWakeWord } from '../utils/voiceCommands';
import { fetchWeather } from '../utils/weather';

type WerosTab = 'feed' | 'mapa' | 'testigo' | 'camara';

interface VoiceAssistantProps {
  citizenEvents: CitizenEvent[];
  onNavigate: (tab: WerosTab) => void;
  onWitnessCommand: (action: 'start' | 'stop') => void;
  currentTab: WerosTab;
  witnessRecording: boolean;
}

const NEARBY_RADIUS_M = 2000;
const TAB_LABELS: Record<WerosTab, string> = { feed: 'Comunidad', mapa: 'Mapa', testigo: 'Testigo', camara: 'Vigilancia' };
const HANDS_FREE_KEY = 'weros.assistant.handsFree.v1';

function loadHandsFreePref(): boolean {
  try { return localStorage.getItem(HANDS_FREE_KEY) === '1'; } catch { return false; }
}
function saveHandsFreePref(value: boolean) {
  try { localStorage.setItem(HANDS_FREE_KEY, value ? '1' : '0'); } catch { /* ignore */ }
}

function formatDuration(seconds: number): string {
  if (seconds % 3600 === 0) { const h = seconds / 3600; return `${h} ${h === 1 ? 'hora' : 'horas'}`; }
  if (seconds % 60 === 0) { const m = seconds / 60; return `${m} ${m === 1 ? 'minuto' : 'minutos'}`; }
  return `${seconds} segundos`;
}

/**
 * Push-to-talk (tap the mic) or hands-free ("Oye WEROS, ...", always listening once enabled) voice
 * control — the Web Speech API on-device, no server, no API key. Not a conversational LLM: see the
 * README for what a real "phase 2" upgrade to that would need.
 */
export function VoiceAssistant({ citizenEvents, onNavigate, onWitnessCommand, currentTab, witnessRecording }: VoiceAssistantProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [handsFree, setHandsFree] = useState(loadHandsFreePref);
  const [notifOn, setNotifOn] = useState(notificationsEnabled);
  const [lastHeard, setLastHeard] = useState<string>();
  const [reply, setReply] = useState<string>();
  const recognitionRef = useRef<SpeechRecognitionLike>();
  const handsFreeRef = useRef(handsFree);
  const speakingRef = useRef(false);
  const shouldListenRef = useRef(false);
  const remindersRef = useRef<Array<{ id: number; timeoutId: number }>>([]);

  useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);

  // Cleared on unmount for hygiene — in practice VoiceAssistant is mounted for the app's whole
  // lifetime (rendered once at the App root), so pending reminders normally do fire.
  useEffect(() => () => {
    remindersRef.current.forEach((r) => window.clearTimeout(r.timeoutId));
  }, []);

  const scheduleReminder = useCallback((seconds: number, message: string) => {
    const id = Date.now();
    const timeoutId = window.setTimeout(() => {
      remindersRef.current = remindersRef.current.filter((r) => r.id !== id);
      vibrate([150, 80, 150]);
      notify('WEROS', message);
      speak(message);
    }, seconds * 1000);
    remindersRef.current.push({ id, timeoutId });
  }, []);

  const respond = useCallback(async (transcript: string) => {
    const intent = parseVoiceCommand(transcript);
    const say = async (text: string) => { setReply(text); await speak(text); };

    switch (intent.type) {
      case 'navigate': {
        onNavigate(intent.tab);
        await say(pick(['Abriendo.', 'Vale, ya está.', 'Hecho.']));
        break;
      }
      case 'witness': {
        if (intent.action === 'start') onNavigate('testigo');
        onWitnessCommand(intent.action);
        await say(intent.action === 'start'
          ? pick(['Modo testigo activado. Te avisaré cada cinco minutos.', 'Grabando. Aquí estoy contigo.'])
          : pick(['Grabación detenida y guardada.', 'Listo, dejo de grabar.']));
        break;
      }
      case 'alert': {
        await say(pick(['Activando alerta.', 'Voy a pedir ayuda ahora mismo.']));
        dispatchDistressSound('comando de voz');
        break;
      }
      case 'call': {
        const contact = loadAlertContact();
        if (!contact?.phone) { await say('No tienes un contacto de emergencia guardado todavía.'); break; }
        await say(`Llamando a ${contact.name || 'tu contacto'}.`);
        window.open(callLink(contact.phone), '_self');
        break;
      }
      case 'nearby': {
        const position = await getCurrentPosition();
        if (!position) { await say('No pude obtener tu ubicación.'); break; }
        const nearby = citizenEvents.filter((ev) => ev.lat && ev.lng && distanceMeters(position, ev) < NEARBY_RADIUS_M);
        await say(nearby.length
          ? `Hay ${nearby.length} ${nearby.length === 1 ? 'reporte' : 'reportes'} cerca de ti. El más reciente: ${categoryMeta(nearby[0].category).label}, ${nearby[0].title}.`
          : 'No hay reportes cerca de ti en los últimos dos kilómetros.');
        break;
      }
      case 'readReports': {
        const top = citizenEvents.slice(0, 3);
        await say(top.length
          ? `Los últimos reportes son: ${top.map((ev) => `${categoryMeta(ev.category).label}, ${ev.title}`).join('. ')}.`
          : 'Todavía no hay reportes en la comunidad.');
        break;
      }
      case 'status': {
        await say(`Estás en la pestaña ${TAB_LABELS[currentTab]}. ${witnessRecording ? 'El modo testigo está grabando ahora mismo.' : 'El modo testigo está apagado.'}`);
        break;
      }
      case 'time': {
        await say(`Son las ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`);
        break;
      }
      case 'battery': {
        const level = await getBatteryLevel();
        await say(level === undefined ? 'Tu navegador no me deja consultar la batería.' : `Te queda un ${level} por ciento de batería.`);
        break;
      }
      case 'weather': {
        const position = await getCurrentPosition();
        if (!position) { await say('No pude obtener tu ubicación para consultar el tiempo.'); break; }
        const weather = await fetchWeather(position);
        await say(weather
          ? `Hoy hace ${weather.description}, con una máxima de ${weather.tempMax} grados y una mínima de ${weather.tempMin}.`
          : 'No pude consultar el tiempo ahora mismo.');
        break;
      }
      case 'vibrate': {
        vibrate([120, 60, 120]);
        await say('Hecho.');
        break;
      }
      case 'timer': {
        scheduleReminder(intent.seconds, 'Temporizador terminado.');
        await say(`Temporizador puesto a ${formatDuration(intent.seconds)}.`);
        break;
      }
      case 'reminder': {
        scheduleReminder(intent.seconds, `Recordatorio: ${intent.message}.`);
        await say(`Vale, te aviso en ${formatDuration(intent.seconds)}.`);
        break;
      }
      case 'cancelReminders': {
        const count = remindersRef.current.length;
        remindersRef.current.forEach((r) => window.clearTimeout(r.timeoutId));
        remindersRef.current = [];
        await say(count ? `Cancelados ${count} ${count === 1 ? 'aviso' : 'avisos'}.` : 'No tenías avisos programados.');
        break;
      }
      case 'openApp': {
        const url = APP_LINKS[intent.app];
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        await say(`Abriendo ${APP_LABELS[intent.app] ?? intent.app}.`);
        break;
      }
      case 'googleSearch': {
        window.open(googleSearchLink(intent.query), '_blank', 'noopener,noreferrer');
        await say(`Buscando ${intent.query} en Google.`);
        break;
      }
      default: {
        await say(pick([
          'No te he entendido. Puedes decir: activa el modo testigo, envía alerta, pon un temporizador, o abre WhatsApp.',
          'No he pillado eso. Prueba con "recuérdame algo en 10 minutos" o "busca en Google..."'
        ]));
      }
    }
  }, [citizenEvents, currentTab, onNavigate, onWitnessCommand, witnessRecording, scheduleReminder]);

  const startListening = useCallback((continuous: boolean) => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.continuous = continuous;
    recognition.interimResults = false;
    try { recognition.start(); } catch { /* already running */ }
  }, []);

  const handleTranscript = useCallback(async (transcript: string) => {
    if (handsFreeRef.current) {
      if (!startsWithWakeWord(transcript)) return; // ambient speech, not addressed to WEROS — ignore
      const command = stripWakeWord(transcript);
      setLastHeard(transcript);
      vibrate(60);
      recognitionRef.current?.stop(); // pause the mic while thinking/speaking so it can't hear itself
      speakingRef.current = true;
      if (!command) {
        const say = pick(['Dime.', 'Te escucho.', 'Adelante.']);
        setReply(say);
        await speak(say);
      } else {
        await respond(command);
      }
      speakingRef.current = false;
      if (handsFreeRef.current) startListening(true);
    } else {
      setLastHeard(transcript);
      await respond(transcript);
    }
  }, [respond, startListening]);

  const handleTranscriptRef = useRef(handleTranscript);
  handleTranscriptRef.current = handleTranscript;

  useEffect(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) { setSupported(false); return; }
    const recognition = new Ctor();
    recognition.lang = 'es-ES';
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (!result?.isFinal) continue;
        const transcript = result[0]?.transcript ?? '';
        if (transcript) handleTranscriptRef.current(transcript);
      }
    };
    recognition.onstart = () => setListening(true);
    recognition.onerror = () => setListening(false);
    recognition.onend = () => {
      setListening(false);
      if (shouldListenRef.current && handsFreeRef.current && !speakingRef.current) {
        window.setTimeout(() => startListening(true), 300);
      }
    };
    if (handsFreeRef.current) {
      shouldListenRef.current = true;
      startListening(true);
    }
    return () => recognition.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleListening = useCallback(() => {
    if (handsFree) return; // hands-free mode owns the mic lifecycle; nothing to toggle manually
    if (listening) { recognitionRef.current?.stop(); return; }
    setReply(undefined);
    setLastHeard(undefined);
    shouldListenRef.current = false;
    startListening(false);
  }, [listening, handsFree, startListening]);

  const toggleHandsFree = useCallback(() => {
    setHandsFree((prev) => {
      const next = !prev;
      handsFreeRef.current = next;
      saveHandsFreePref(next);
      if (next) {
        shouldListenRef.current = true;
        setReply('Modo manos libres activado. Di "Oye WEROS" seguido de lo que necesites.');
        startListening(true);
      } else {
        shouldListenRef.current = false;
        recognitionRef.current?.stop();
      }
      return next;
    });
  }, [startListening]);

  const toggleNotifications = useCallback(async () => {
    if (notifOn) { disableNotifications(); setNotifOn(false); return; }
    const granted = await enableNotifications();
    setNotifOn(granted);
  }, [notifOn]);

  if (!supported) return null;

  return (
    <div className="assistant-wrap">
      {(lastHeard || reply) && (
        <div className="assistant-bubble">
          {lastHeard && <p className="assistant-heard">"{lastHeard}"</p>}
          {reply && <p className="assistant-reply"><Bot size={13} /> {reply}</p>}
        </div>
      )}
      <div className="assistant-settings">
        <button className={`assistant-chip ${handsFree ? 'active' : ''}`} onClick={toggleHandsFree} title='Manos libres: di "Oye WEROS"'>
          <Ear size={12} /> Manos libres
        </button>
        {notificationsSupported() && (
          <button className={`assistant-chip ${notifOn ? 'active' : ''}`} onClick={toggleNotifications} title="Notificaciones">
            {notifOn ? <Bell size={12} /> : <BellOff size={12} />} Notificaciones
          </button>
        )}
      </div>
      <button className={`assistant-fab ${listening ? 'listening' : ''}`} onClick={toggleListening} aria-label="Asistente de voz WEROS">
        <Mic size={20} />
      </button>
    </div>
  );
}
