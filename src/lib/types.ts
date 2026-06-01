export type VoiceProvider = "mock" | "voxcpm2" | "burmese_production";
export type OutputFormat = "wav";
export type VoiceEmotion = "neutral" | "calm" | "energetic" | "dramatic";
export type CloneMode = "balanced" | "high_fidelity";
export type JobStatus = "completed" | "failed";
export type LanguageCode = "unknown" | "my" | "en" | "zh" | "ja" | "ko" | "yue" | "de" | "fr" | "ru" | "pt" | "es" | "it" | "mixed_supported";
export type CapabilityLevel = "mock" | "demo" | "baseline" | "production";

export interface LanguageDetectionResult {
  code: LanguageCode;
  label: string;
  confidence: number;
  reason: string;
}

export interface ProviderCapability {
  provider: VoiceProvider;
  name: string;
  inference: "local_mock" | "remote_hf" | "placeholder";
  cloneQuality: CapabilityLevel;
  privacy: "local" | "remote_public";
  statusLabel?: string;
  supportedLanguages: LanguageCode[];
  supportedLanguageLabels: string[];
  requiresReferenceAudio: boolean;
  canCloneVoice: boolean;
  limitations: string[];
  recommendation: string;
}

export interface ProviderPreflightResult {
  ok: boolean;
  severity: "info" | "warning" | "blocked";
  detectedLanguage: LanguageDetectionResult;
  message: string;
  nextStep: string;
  hideNextStep?: boolean;
}

export interface ReferenceAudioPayload {
  dataUrl: string;
  filename: string;
  mimeType: string;
  size: number;
  durationSeconds?: number;
}

export interface ReferenceAudioAssessment {
  score: number;
  label: "missing" | "too_short" | "good" | "too_long" | "unknown";
  message: string;
}

export interface GenerateVoiceRequest {
  title?: string;
  script: string;
  provider: VoiceProvider;
  format: OutputFormat;
  speed: number;
  emotion: VoiceEmotion;
  cloneMode?: CloneMode;
  cloneStrength?: number;
  denoiseReference?: boolean;
  normalizeText?: boolean;
  referenceAudio?: ReferenceAudioPayload;
  referenceText?: string;
}

export interface GenerateVoiceInput extends GenerateVoiceRequest {
  jobId: string;
  scriptId: string;
}

export interface GenerateVoiceResult {
  filename: string;
  audioFilePath: string;
  format: OutputFormat;
  localAudioUrl?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface ScriptRecord {
  id: string;
  title: string;
  createdAt: string;
  characterCount: number;
  wordCount: number;
  content: string;
}

export interface JobRecord {
  id: string;
  scriptId: string;
  title: string;
  provider: VoiceProvider;
  format: OutputFormat;
  speed: number;
  emotion: VoiceEmotion;
  status: JobStatus;
  audioFile?: string;
  error?: string;
  createdAt: string;
  content: string;
}
