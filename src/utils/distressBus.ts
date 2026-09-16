// A plain window CustomEvent, not React context/state — SoundClassificationEngine runs inside
// App.tsx's analysis loop (only while the "Vigilancia" tab has the mic on), while AlertButton is
// mounted at the app root across every tab. A DOM event is the simplest way to cross that boundary
// without threading a callback through props that most of the tree doesn't otherwise need.
export const DISTRESS_SOUND_EVENT = 'weros:distress-sound';

export interface DistressSoundDetail {
  label: string;
}

export function dispatchDistressSound(label: string) {
  window.dispatchEvent(new CustomEvent<DistressSoundDetail>(DISTRESS_SOUND_EVENT, { detail: { label } }));
}
