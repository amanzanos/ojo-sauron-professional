/**
 * `facingMode: 'environment'` is only a hint — many browsers (notably some Android/desktop
 * Chrome builds) still hand back the front/selfie camera when it's just an `ideal` constraint,
 * silently satisfying the request with whatever default device it already had open. Forcing
 * `exact` makes it a hard requirement, so we try that first and only fall back to `ideal` (or no
 * preference at all) on devices — mainly single-camera laptops — where `exact` has nothing to match.
 */
export async function getRearCameraStream(videoConstraints: Omit<MediaTrackConstraints, 'facingMode'> = {}, audio: MediaStreamConstraints['audio'] = false): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { ...videoConstraints, facingMode: { exact: 'environment' } }, audio });
  } catch (e) {
    if (e instanceof OverconstrainedError || (e instanceof DOMException && e.name === 'OverconstrainedError')) {
      try {
        return await navigator.mediaDevices.getUserMedia({ video: { ...videoConstraints, facingMode: 'environment' }, audio });
      } catch {
        return navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio });
      }
    }
    throw e;
  }
}
