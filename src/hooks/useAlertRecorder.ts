import { useCallback, useEffect, useRef, useState } from 'react';
import { getRearCameraStream } from '../utils/camera';

const BUFFER_MS = 20000;
const CHUNK_MS = 1000;

function pickMimeType(): string | undefined {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return candidates.find((c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c));
}

/**
 * Keeps a rolling ~20s circular buffer of camera+mic chunks while armed, so the SOS button can
 * hand over "what just happened" instead of only what happens after the button is pressed —
 * matters most in exactly the situation someone presses it for.
 */
export function useAlertRecorder() {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string>();
  const streamRef = useRef<MediaStream>();
  const recorderRef = useRef<MediaRecorder>();
  const chunksRef = useRef<Array<{ blob: Blob; ts: number }>>([]);

  const disarm = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch {
      // already stopped
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recorderRef.current = undefined;
    streamRef.current = undefined;
    chunksRef.current = [];
    setArmed(false);
  }, []);

  const arm = useCallback(async () => {
    if (streamRef.current) return;
    setError(undefined);
    try {
      const stream = await getRearCameraStream({ width: { ideal: 960 }, height: { ideal: 540 } }, true);
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (!e.data.size) return;
        const ts = Date.now();
        chunksRef.current = [...chunksRef.current, { blob: e.data, ts }].filter((c) => ts - c.ts < BUFFER_MS + CHUNK_MS);
      };
      recorder.start(CHUNK_MS);
      recorderRef.current = recorder;
      setArmed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo activar la cámara/micrófono de respaldo');
      setArmed(false);
    }
  }, []);

  /** Snapshot of the last ~20s as a single playable clip, or undefined if the buffer is still empty. */
  const captureClip = useCallback((): Blob | undefined => {
    if (!chunksRef.current.length) return undefined;
    const mimeType = chunksRef.current[0].blob.type || 'video/webm';
    return new Blob(chunksRef.current.map((c) => c.blob), { type: mimeType });
  }, []);

  useEffect(() => () => disarm(), [disarm]);

  return { armed, error, arm, disarm, captureClip };
}
