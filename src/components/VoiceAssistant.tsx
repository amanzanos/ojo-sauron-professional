import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Mic } from 'lucide-react';
import type { CitizenEvent } from '../types/citizen';
import { categoryMeta } from '../types/citizen';
import { dispatchDistressSound } from '../utils/distressBus';
import { getCurrentPosition, distanceMeters } from '../utils/geo';
import { speak } from '../utils/tts';
import { parseVoiceCommand } from '../utils/voiceCommands';

type WerosTab = 'feed' | 'mapa' | 'testigo' | 'camara';

interface VoiceAssistantProps {
  citizenEvents: CitizenEvent[];
  onNavigate: (tab: WerosTab) => void;
  onWitnessCommand: (action: 'start' | 'stop') => void;
}

const NEARBY_RADIUS_M = 2000;

/** Push-to-talk voice control (Web Speech API, on-device — no server, no API key) for the handful
 * of things worth saying out loud instead of tapping: navigate, arm witness mode, raise the alarm,
 * or ask what's nearby. Not a conversational LLM — see the AlertButton/App distress-sound trigger
 * for the "phase 2" hook this could later plug an LLM behind. */
export function VoiceAssistant({ citizenEvents, onNavigate, onWitnessCommand }: VoiceAssistantProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [lastHeard, setLastHeard] = useState<string>();
  const [reply, setReply] = useState<string>();
  const recognitionRef = useRef<SpeechRecognitionLike>();

  useEffect(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) { setSupported(false); return; }
    const recognition = new Ctor();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    return () => recognition.abort();
  }, []);

  const respond = useCallback(async (transcript: string) => {
    setLastHeard(transcript);
    const intent = parseVoiceCommand(transcript);
    switch (intent.type) {
      case 'navigate': {
        onNavigate(intent.tab);
        const say = 'Abriendo.';
        setReply(say);
        speak(say);
        break;
      }
      case 'witness': {
        if (intent.action === 'start') onNavigate('testigo');
        onWitnessCommand(intent.action);
        const say = intent.action === 'start' ? 'Modo testigo activado.' : 'Deteniendo la grabación.';
        setReply(say);
        speak(say);
        break;
      }
      case 'alert': {
        const say = 'Activando alerta.';
        setReply(say);
        speak(say);
        dispatchDistressSound('comando de voz');
        break;
      }
      case 'nearby': {
        const position = await getCurrentPosition();
        if (!position) {
          const say = 'No pude obtener tu ubicación.';
          setReply(say);
          speak(say);
          break;
        }
        const nearby = citizenEvents.filter((ev) => ev.lat && ev.lng && distanceMeters(position, ev) < NEARBY_RADIUS_M);
        const say = nearby.length
          ? `Hay ${nearby.length} ${nearby.length === 1 ? 'reporte' : 'reportes'} cerca de ti, el más reciente: ${categoryMeta(nearby[0].category).label}, ${nearby[0].title}.`
          : 'No hay reportes cerca de ti en los últimos dos kilómetros.';
        setReply(say);
        speak(say);
        break;
      }
      default: {
        const say = 'No entendí eso. Puedes decir: activa el modo testigo, envía alerta, abre el mapa, o qué hay cerca de mí.';
        setReply(say);
        speak(say);
      }
    }
  }, [citizenEvents, onNavigate, onWitnessCommand]);

  const toggleListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (listening) {
      recognition.stop();
      return;
    }
    setReply(undefined);
    setLastHeard(undefined);
    recognition.onresult = (ev) => {
      const transcript = ev.results[0]?.[0]?.transcript ?? '';
      if (transcript) respond(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.onstart = () => setListening(true);
    try {
      recognition.start();
    } catch {
      // already started — ignore
    }
  }, [listening, respond]);

  if (!supported) return null;

  return (
    <div className="assistant-wrap">
      {(lastHeard || reply) && (
        <div className="assistant-bubble">
          {lastHeard && <p className="assistant-heard">"{lastHeard}"</p>}
          {reply && <p className="assistant-reply"><Bot size={13} /> {reply}</p>}
        </div>
      )}
      <button className={`assistant-fab ${listening ? 'listening' : ''}`} onClick={toggleListening} aria-label="Asistente de voz WEROS">
        <Mic size={20} />
      </button>
    </div>
  );
}
