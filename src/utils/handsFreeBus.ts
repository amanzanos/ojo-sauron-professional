// Bridges features that live outside VoiceAssistant (driving-mode auto-detection) into its
// hands-free toggle — same plain-CustomEvent pattern as distressBus, for the same reason: the
// two components don't otherwise share a prop path worth threading for this.
export const FORCE_HANDS_FREE_EVENT = 'weros:force-hands-free';

export function requestHandsFree(on: boolean) {
  window.dispatchEvent(new CustomEvent<{ on: boolean }>(FORCE_HANDS_FREE_EVENT, { detail: { on } }));
}
