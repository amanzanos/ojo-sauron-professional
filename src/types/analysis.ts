export type EmotionName = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'fearful' | 'disgusted';

export type MetricKey =
  | 'attention'
  | 'eyeContact'
  | 'tension'
  | 'fatigue'
  | 'nervousness'
  | 'expressiveness'
  | 'bodyMotion'
  | 'smile'
  | 'browFurrow'
  | 'browRaise'
  | 'mouthTension'
  | 'eyeOpenness'
  | 'headStability'
  | 'asymmetry'
  | 'engagementIndex'
  | 'stressIndex'
  | 'expressionCongruence';

export interface EmotionScore {
  name: EmotionName;
  label: string;
  score: number;
}

export interface MetricValue {
  key: MetricKey;
  label: string;
  value: number;
  status: 'low' | 'normal' | 'medium' | 'high' | 'critical';
  unit?: string;
}

export interface AnalysisEvent {
  id: string;
  time: number;
  severity: 'info' | 'positive' | 'warning' | 'critical';
  title: string;
  detail: string;
}

export interface OverlayAlert {
  id: string;
  text: string;
  severity: 'info' | 'positive' | 'warning' | 'critical';
  expiresAt: number;
  createdAt: number;
  x: number;
  y: number;
}

export interface HeadPose {
  yaw: number;
  pitch: number;
  roll: number;
  label: string;
}

export interface EyeState {
  leftEAR: number;
  rightEAR: number;
  blink: boolean;
  blinkRate: number;
  avgBlinkDurationMs: number;
  gaze: 'center' | 'left' | 'right' | 'up' | 'down' | 'unknown';
  awaySeconds: number;
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QualitySignal {
  score: number;
  label: string;
  ok: boolean;
}

export type GestureName =
  | 'thumb_up'
  | 'thumb_down'
  | 'victory'
  | 'open_palm'
  | 'closed_fist'
  | 'pointing_up'
  | 'love_sign'
  | 'ok_sign'
  | 'heart_hands'
  | 'hand_near_face';

export interface GestureResult {
  id: string;
  name: GestureName;
  label: string;
  hand: 'left' | 'right' | 'both';
  score: number;
  x: number;
  y: number;
}

export interface HandsFrame {
  handsDetected: number;
  gestures: GestureResult[];
  handPositions: Array<{ x: number; y: number }>;
}

/** Lightweight per-face data for every face seen this frame (tracking/overlay), not just the primary one. */
export interface FaceObservation {
  box: FaceBox;
  frontality: number; // 0 (frontal) .. 1 (turned away), lower is better for a photo
  mood: EmotionName;
}

export interface PersonSummary {
  id: string;
  photo: string;
  sex: 'masculino' | 'femenino';
  sexConfidence: number;
  age: number;
  mood: string;
  moodScore: number;
  firstSeenAt: number;
}

export interface ObjectDetection {
  id: string;
  label: string;
  score: number;
  box: FaceBox;
  held: boolean;
  screenState?: 'encendida' | 'apagada';
}

export interface ObjectInventoryEntry {
  label: string;
  firstSeenAt: number;
  lastSeenAt: number;
  totalMs: number;
  timesSeen: number;
}

export interface SoundCategory {
  label: string;
  score: number;
}

export interface SoundFrame {
  active: boolean;
  topLabel: string;
  topScore: number;
  categories: SoundCategory[];
}

export interface SoundLogEntry {
  label: string;
  score: number;
  time: number;
}

export interface SoundCategoryStat {
  label: string;
  totalMs: number;
  count: number;
}

export interface VoiceFrame {
  active: boolean;
  speaking: boolean;
  volume: number;
  pitchHz: number;
  pitchVariability: number;
  speakingRatePerMin: number;
  vocalTension: number;
  jitter: number;
  shimmer: number;
  hesitationsPerMin: number;
  totalHesitations: number;
  pitchBaselineDeviation: number;
  ambientNoise: number;
  fingerprint: number[];
  utterancePitchHz: number;
  justStoppedSpeaking: boolean;
  activeSpeakerLabel: string;
}

export interface VoiceProfile {
  id: string;
  label: string;
  avgPitchHz: number;
  firstHeardAt: number;
  lastHeardAt: number;
  totalMs: number;
  utterances: number;
}

export interface FirewallAlert {
  key: string;
  label: string;
  since: number;
  severity: 'critical';
}

export interface HeartRateFrame {
  active: boolean;
  bpm: number;
  confidence: number;
}

export interface SessionReport {
  durationMs: number;
  avgAttention: number;
  avgStress: number;
  avgEngagement: number;
  emotionTimeMs: Record<EmotionName, number>;
  totalSpeakingMs: number;
  hesitations: number;
  alertCounts: Record<AnalysisEvent['severity'], number>;
  heartRateAvg?: number;
  heartRateRange?: [number, number];
}

export interface SceneMotionFrame {
  overallMotion: number;
  heatmap: number[];
  gridW: number;
  gridH: number;
}

export interface EnvironmentReport {
  trafficIndex: number;
  ambientNoise: number;
  avgOccupancy: number;
  peakOccupancy: number;
  emptyTimeMs: number;
  overallMotion: number;
  workSessions: number;
  breaksCount: number;
  avgWorkSessionMs: number;
  avgBreakMs: number;
  currentState: 'trabajando' | 'descanso' | 'sin_datos';
  roomType: string;
  clutterScore: number;
}

export interface AmbientFrame {
  lux: number;
  colorTemp: number;
  colorTempLabel: 'cálida' | 'neutra' | 'fría';
  flickerScore: number;
  backlightScore: number;
  shakeScore: number;
  hazeScore: number;
}

export type SocialMode = 'monologo' | 'conversacion' | 'coexistencia' | 'silencio' | 'sin_datos';

export interface SocialFrame {
  mode: SocialMode;
  label: string;
  activeVoices: number;
}

export interface AnalysisFrame {
  timestamp: number;
  fps: number;
  faceDetected: boolean;
  faceBox?: FaceBox;
  peopleDetected: number;
  allFaces: FaceObservation[];
  emotions: EmotionScore[];
  dominantEmotion: EmotionScore;
  metrics: MetricValue[];
  eye: EyeState;
  headPose: HeadPose;
  hands: HandsFrame;
  objects: ObjectDetection[];
  voice: VoiceFrame;
  sound: SoundFrame;
  heartRate: HeartRateFrame;
  sceneMotion: SceneMotionFrame;
  ambient: AmbientFrame;
  social: SocialFrame;
  firewall: FirewallAlert[];
  dataQuality: QualitySignal;
  lighting: QualitySignal;
  framing: QualitySignal;
  events: AnalysisEvent[];
  alerts: OverlayAlert[];
  raw: {
    landmarksCount: number;
    facePresence: number;
    motion: number;
  };
}
