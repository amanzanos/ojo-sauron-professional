import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, Ear, MessageCircleWarning, ShieldCheck, X } from 'lucide-react';
import { useAlertRecorder } from '../hooks/useAlertRecorder';
import { loadAlertContact, saveAlertContact, sanitizePhone } from '../utils/alertContact';
import { createEvent } from '../utils/eventStorage';
import { getCurrentPosition, mapsLink } from '../utils/geo';
import { notify } from '../utils/notify';
import { speak } from '../utils/tts';
import type { AlertContact } from '../types/citizen';
import type { DistressSoundDetail } from '../utils/distressBus';
import { DISTRESS_SOUND_EVENT } from '../utils/distressBus';

type SendState = 'idle' | 'sending' | 'sent' | 'error';

const AUTO_COUNTDOWN_S = 8;

export function AlertButton({ onSent }: { onSent?: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [contact, setContact] = useState<AlertContact>(() => loadAlertContact() ?? { name: '', phone: '' });
  const [sendState, setSendState] = useState<SendState>('idle');
  const [sendError, setSendError] = useState<string>();
  const [clipUrl, setClipUrl] = useState<string>();
  const [waLink, setWaLink] = useState<string>();
  const [autoReason, setAutoReason] = useState<string>();
  const [autoSecondsLeft, setAutoSecondsLeft] = useState<number>();
  const confirmTimer = useRef<number>();
  const autoInterval = useRef<number>();
  const { armed, error: recorderError, arm, captureClip } = useAlertRecorder();

  useEffect(() => {
    if (open) arm().catch(() => undefined);
  }, [open, arm]);

  useEffect(() => () => {
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    if (autoInterval.current) window.clearInterval(autoInterval.current);
  }, []);

  const startConfirm = useCallback(() => {
    setConfirming(true);
    confirmTimer.current = window.setTimeout(() => setConfirming(false), 5000);
  }, []);

  const saveContact = useCallback((next: AlertContact) => {
    setContact(next);
    saveAlertContact(next);
  }, []);

  const trigger = useCallback(async (contactOverride?: AlertContact) => {
    const activeContact = contactOverride ?? contact;
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    if (autoInterval.current) window.clearInterval(autoInterval.current);
    setConfirming(false);
    setAutoSecondsLeft(undefined);
    setSendState('sending');
    setSendError(undefined);
    setClipUrl(undefined);
    setWaLink(undefined);
    try {
      const position = await getCurrentPosition();
      const locationText = position ? mapsLink(position) : 'ubicación no disponible';
      const message = `🆘 ALERTA WEROS: necesito ayuda ahora mismo. Mi ubicación: ${locationText}`;

      await createEvent({
        category: 'alerta',
        title: activeContact.name ? `Alerta SOS de ${activeContact.name}` : 'Alerta SOS',
        description: `Enviada desde el botón de pánico de WEROS.${position ? '' : ' Ubicación no disponible.'}`,
        lat: position?.lat ?? 0,
        lng: position?.lng ?? 0,
        authorLabel: 'Tú'
      });

      const clip = captureClip();
      if (clip) {
        const file = new File([clip], `alerta-weros-${Date.now()}.webm`, { type: clip.type || 'video/webm' });
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], text: message, title: 'Alerta WEROS' });
          } catch {
            // user dismissed the native share sheet — the clip is still downloadable below
          }
        }
        setClipUrl(URL.createObjectURL(clip));
      }

      if (activeContact.phone) {
        const link = `https://wa.me/${sanitizePhone(activeContact.phone).replace(/^\+/, '')}?text=${encodeURIComponent(message)}`;
        setWaLink(link);
        window.open(link, '_blank', 'noopener,noreferrer');
      }

      setSendState('sent');
      speak('Alerta enviada a tu contacto de emergencia');
      notify('Alerta SOS enviada', 'Se compartió tu ubicación con tu contacto de emergencia y se guardó en el mapa.');
      onSent?.();
    } catch (e) {
      setSendState('error');
      setSendError(e instanceof Error ? e.message : 'No se pudo enviar la alerta');
    }
  }, [contact, captureClip, onSent]);

  const cancelAuto = useCallback(() => {
    if (autoInterval.current) window.clearInterval(autoInterval.current);
    setAutoReason(undefined);
    setAutoSecondsLeft(undefined);
    setOpen(false);
  }, []);

  // Automatic distress-sound trigger: SoundClassificationEngine (running in the "Vigilancia" tab
  // with audio on) dispatches this whenever it hears a scream/gunshot/explosion. A cancellable
  // countdown — not an instant silent send — so a loud movie or a dropped tray doesn't fire a real
  // alert to someone's emergency contact unattended.
  useEffect(() => {
    const onDistress = (e: Event) => {
      if (open) return; // an alert is already in flight/open — don't stack another
      const detail = (e as CustomEvent<DistressSoundDetail>).detail;
      setOpen(true);
      setSendState('idle');
      setAutoReason(detail?.label ?? 'sonido de socorro');
      setAutoSecondsLeft(AUTO_COUNTDOWN_S);
      speak(`Sonido de socorro detectado. Enviando alerta en ${AUTO_COUNTDOWN_S} segundos`);
      autoInterval.current = window.setInterval(() => {
        setAutoSecondsLeft((s) => {
          if (s === undefined) return s;
          if (s <= 1) {
            window.clearInterval(autoInterval.current);
            trigger(loadAlertContact() ?? { name: '', phone: '' });
            return undefined;
          }
          return s - 1;
        });
      }, 1000);
    };
    window.addEventListener(DISTRESS_SOUND_EVENT, onDistress);
    return () => window.removeEventListener(DISTRESS_SOUND_EVENT, onDistress);
  }, [open, trigger]);

  return (
    <>
      <button
        className="sos-fab"
        onClick={() => { setOpen(true); setSendState('idle'); }}
        aria-label="Botón de alerta"
      >
        <AlertTriangle size={22} />
        <span>SOS</span>
      </button>

      {open && (
        <div className="sos-modal-backdrop" onClick={() => (autoSecondsLeft !== undefined ? undefined : setOpen(false))}>
          <div className="sos-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sos-modal-head">
              <h2><AlertTriangle size={18} /> Alerta de emergencia</h2>
              <button className="icon-btn" onClick={() => (autoSecondsLeft !== undefined ? cancelAuto() : setOpen(false))}><X size={18} /></button>
            </div>

            {autoSecondsLeft !== undefined && (
              <div className="sos-auto-banner">
                <Ear size={16} />
                <span>Sonido de socorro detectado ({autoReason}). Enviando alerta en <strong>{autoSecondsLeft}s</strong>…</span>
                <button className="sos-cancel-auto" onClick={cancelAuto}>Cancelar</button>
              </div>
            )}

            {sendState === 'sent' ? (
              <div className="sos-result">
                <ShieldCheck size={30} color="var(--ok)" />
                <p>Alerta enviada. Se compartió tu ubicación{waLink ? ' y se abrió WhatsApp con tu contacto' : ''}.</p>
                {clipUrl && (
                  <a className="sos-download" href={clipUrl} download={`alerta-weros-${Date.now()}.webm`}>
                    <Download size={14} /> Descargar los últimos 20s grabados
                  </a>
                )}
                <button className="sos-secondary" onClick={() => setOpen(false)}>Cerrar</button>
              </div>
            ) : (
              <>
                <p className="sos-hint">
                  Al confirmar se enviará tu ubicación a tu contacto de emergencia por WhatsApp/SMS,
                  se guardará como alerta en el mapa ciudadano y se conservarán los últimos 20 segundos
                  de cámara y micrófono grabados.
                </p>

                <div className="sos-field">
                  <label>Nombre del contacto</label>
                  <input value={contact.name} onChange={(e) => saveContact({ ...contact, name: e.target.value })} placeholder="Ej. Mamá" />
                </div>
                <div className="sos-field">
                  <label>Teléfono (con prefijo, ej. +34...)</label>
                  <input value={contact.phone} onChange={(e) => saveContact({ ...contact, phone: e.target.value })} placeholder="+34600000000" />
                </div>

                <div className={`sos-armed-badge ${armed ? 'ok' : ''}`}>
                  <ShieldCheck size={13} />
                  {armed ? 'Cámara/micrófono de respaldo activos — grabando en bucle' : 'Activando cámara/micrófono de respaldo…'}
                </div>
                {recorderError && <p className="sos-error">{recorderError}</p>}
                {sendState === 'error' && <p className="sos-error">{sendError}</p>}

                {!confirming ? (
                  <button className="sos-trigger" onClick={startConfirm}>
                    <MessageCircleWarning size={18} /> Enviar alerta SOS
                  </button>
                ) : (
                  <button className="sos-trigger confirming" onClick={() => trigger()} disabled={sendState === 'sending'}>
                    {sendState === 'sending' ? 'Enviando…' : '¿Confirmar? Toca de nuevo'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
