import { useCallback, useEffect, useRef, useState } from 'react';

function pickMimeType(): string | undefined {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return candidates.find((c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c));
}

/**
 * Records the phone/computer's own screen (getDisplayMedia), not the camera — evidence for things
 * that happen *in* a screen: a scam call, a suspicious app, a phishing page walking you through
 * something. The browser's own share-picker UI is the permission prompt; nothing else to ask for.
 */
export function useScreenRecording() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string>();
  const [clipUrl, setClipUrl] = useState<string>();
  const streamRef = useRef<MediaStream>();
  const recorderRef = useRef<MediaRecorder>();
  const chunksRef = useRef<Blob[]>([]);

  const stop = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch {
      // already stopped
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const mimeType = chunksRef.current[0]?.type || 'video/webm';
    if (chunksRef.current.length) {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setClipUrl(URL.createObjectURL(blob));
    }
    recorderRef.current = undefined;
    streamRef.current = undefined;
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    setError(undefined);
    setClipUrl(undefined);
    chunksRef.current = [];
    try {
      const media = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamRef.current = media;
      // The browser's own "stop sharing" control (or closing the shared tab) ends the stream —
      // treat that the same as pressing our own stop button.
      media.getVideoTracks()[0]?.addEventListener('ended', () => stop());
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.start(2000);
      recorderRef.current = recorder;
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la grabación de pantalla');
      setRecording(false);
    }
  }, [stop]);

  useEffect(() => () => {
    try {
      recorderRef.current?.stop();
    } catch {
      // already stopped
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { recording, error, clipUrl, start, stop };
}
