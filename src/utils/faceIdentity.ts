import { FaceAnalysisEngine } from '../engine/FaceAnalysisEngine';
import { FaceIdentityEngine, SAME_PERSON_DISTANCE } from '../engine/FaceIdentityEngine';
import { euclideanDistance } from 'face-api.js';

const KEY = 'weros.ownerFaceDescriptor.v1';

function loadOwnerDescriptor(): Float32Array | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? new Float32Array(JSON.parse(raw) as number[]) : undefined;
  } catch {
    return undefined;
  }
}

export function hasOwnerDescriptor(): boolean {
  return !!loadOwnerDescriptor();
}

export function clearOwnerDescriptor() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Grabs a quick front-camera frame, waits briefly for a face, and returns its 128-d descriptor + a cropped snapshot for the whole engine stack this needs. Caller owns stopping the camera stream. */
async function captureDescriptorFromCamera(timeoutMs = 6000): Promise<{ descriptor: Float32Array; stream: MediaStream } | undefined> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  await video.play();

  const faceEngine = new FaceAnalysisEngine();
  const identityEngine = new FaceIdentityEngine();
  await Promise.all([faceEngine.init(), identityEngine.init()]);

  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      if (video.videoWidth > 0) {
        const frame = faceEngine.analyze(video, video.videoWidth, video.videoHeight);
        if (frame.faceBox) {
          const canvas = document.createElement('canvas');
          canvas.width = frame.faceBox.width;
          canvas.height = frame.faceBox.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(video, frame.faceBox.x, frame.faceBox.y, frame.faceBox.width, frame.faceBox.height, 0, 0, frame.faceBox.width, frame.faceBox.height);
          const descriptor = await identityEngine.computeDescriptor(canvas);
          if (descriptor) return { descriptor, stream };
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return undefined;
  } finally {
    // stream is stopped by the caller once it's done with it (capture flow keeps it briefly for
    // a confirmation frame; the match flow closes it immediately) — nothing else to clean up here.
  }
}

export async function captureOwnerDescriptor(): Promise<boolean> {
  const result = await captureDescriptorFromCamera();
  result?.stream.getTracks().forEach((t) => t.stop());
  if (!result) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.from(result.descriptor)));
    return true;
  } catch {
    return false;
  }
}

/**
 * True if a face is detected and it matches the saved owner, OR if no face was detected at all
 * within the timeout (fails open — a camera glitch shouldn't silently kill the daily greeting).
 * False only when a face was clearly detected and clearly isn't a match.
 */
export async function matchesOwner(): Promise<boolean> {
  const owner = loadOwnerDescriptor();
  if (!owner) return true; // face-gating not configured — nothing to check against
  const result = await captureDescriptorFromCamera(4000);
  result?.stream.getTracks().forEach((t) => t.stop());
  if (!result) return true; // no face seen — fail open rather than silently skipping the greeting
  return euclideanDistance(result.descriptor, owner) < SAME_PERSON_DISTANCE;
}
