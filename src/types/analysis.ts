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
}

export interface VoiceFrame {
  active: boolean;
  speaking: boolean;
  volume: number;
  pitchHz: number;
  pitchVariability: number;
  speakingRatePerMin: number;
  vocalTension: number;
}

export interface FirewallAlert {
  key: string;
  label: string;
  since: number;
  severity: 'critical';
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
