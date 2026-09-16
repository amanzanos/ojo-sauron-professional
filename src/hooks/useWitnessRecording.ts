import { useCallback, useEffect, useRef, useState } from 'react';
import { getRearCameraStream } from '../utils/camera';

function pickMimeType(): string | undefined {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return candidates.find((c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c));
}

/**
 * Unlike useAlertRecorder's ~20s circular buffer, this keeps every chunk for the whole session —
 * "modo testigo" is a deliberate, visible recording of everything that happens while it's on, not
 * a just-in-case backup.
 */
export function useWitnessRecording() {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string>();
  const [stream, setStream] = useState<MediaStream>();
  const [clipUrl, setClipUrl] = useState<string>();
  const streamRef = useRef<MediaStream>();
  const recorderRef = useRef<MediaRecorder>();
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number>();
  const wakeLockRef = useRef<WakeLockSentinel>();

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = undefined;
  }, []);

  const start = useCallback(async () => {
    setError(undefined);
    setClipUrl(undefined);
    chunksRef.current = [];
    try {
      const media = await getRearCameraStream({ width: { ideal: 1280 }, height: { ideal: 720 } }, true);
      streamRef.current = media;
      setStream(media);
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.start(2000);
      recorderRef.current = recorder;
      startedAtRef.current = performance.now();
      setElapsedMs(0);
      tickRef.current = window.setInterval(() => setElapsedMs(performance.now() - startedAtRef.current), 500);
      setRecording(true);
      // Keeps the screen from auto-locking mid-recording — a locked phone stops the camera stream
      // on most mobile browsers, which would silently cut the recording short.
      navigator.wakeLock?.request('screen').then((lock) => { wakeLockRef.current = lock; }).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo activar la cámara/micrófono');
      setRecording(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    try {
      recorderRef.current?.stop();
    } catch {
      // already stopped
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    releaseWakeLock();
    const mimeType = chunksRef.current[0]?.type || 'video/webm';
    if (chunksRef.current.length) {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setClipUrl(URL.createObjectURL(blob));
    }
    recorderRef.current = undefined;
    streamRef.current = undefined;
    setStream(undefined);
    setRecording(false);
  }, [releaseWakeLock]);

  // Leaving the "Testigo" tab unmounts this without necessarily calling stop() first — without this,
  // the camera/mic would stay open (and silently keep recording into a clip nobody can reach) in
  // the background after navigating away.
  useEffect(() => () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    try {
      recorderRef.current?.stop();
    } catch {
      // already stopped
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    releaseWakeLock();
  }, [releaseWakeLock]);

  return { recording, elapsedMs, error, stream, clipUrl, start, stop };
}
