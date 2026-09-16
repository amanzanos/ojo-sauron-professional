import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, MessageCircleWarning, ShieldCheck, X } from 'lucide-react';
import { useAlertRecorder } from '../hooks/useAlertRecorder';
import { loadAlertContact, saveAlertContact, sanitizePhone } from '../utils/alertContact';
import { createEvent } from '../utils/eventStorage';
import { getCurrentPosition, mapsLink } from '../utils/geo';
import type { AlertContact } from '../types/citizen';

type SendState = 'idle' | 'sending' | 'sent' | 'error';

export function AlertButton({ onSent }: { onSent?: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [contact, setContact] = useState<AlertContact>(() => loadAlertContact() ?? { name: '', phone: '' });
  const [sendState, setSendState] = useState<SendState>('idle');
  const [sendError, setSendError] = useState<string>();
  const [clipUrl, setClipUrl] = useState<string>();
  const [waLink, setWaLink] = useState<string>();
  const confirmTimer = useRef<number>();
  const { armed, error: recorderError, arm, captureClip } = useAlertRecorder();

  useEffect(() => {
    if (open) arm().catch(() => undefined);
  }, [open, arm]);

  useEffect(() => () => {
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
  }, []);

  const startConfirm = useCallback(() => {
    setConfirming(true);
    confirmTimer.current = window.setTimeout(() => setConfirming(false), 5000);
  }, []);

  const saveContact = useCallback((next: AlertContact) => {
    setContact(next);
    saveAlertContact(next);
  }, []);

  const trigger = useCallback(async () => {
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    setConfirming(false);
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
        title: contact.name ? `Alerta SOS de ${contact.name}` : 'Alerta SOS',
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

      if (contact.phone) {
        const link = `https://wa.me/${sanitizePhone(contact.phone).replace(/^\+/, '')}?text=${encodeURIComponent(message)}`;
        setWaLink(link);
        window.open(link, '_blank', 'noopener,noreferrer');
      }

      setSendState('sent');
      onSent?.();
    } catch (e) {
      setSendState('error');
      setSendError(e instanceof Error ? e.message : 'No se pudo enviar la alerta');
    }
  }, [contact, captureClip, onSent]);

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
        <div className="sos-modal-backdrop" onClick={() => setOpen(false)}>
          <div className="sos-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sos-modal-head">
              <h2><AlertTriangle size={18} /> Alerta de emergencia</h2>
              <button className="icon-btn" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>

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
                  <button className="sos-trigger confirming" onClick={trigger} disabled={sendState === 'sending'}>
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
