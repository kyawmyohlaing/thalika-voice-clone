"use client";

import { Gauge, Mic2, RefreshCw, Server, SlidersHorizontal, UploadCloud, Wand2 } from "lucide-react";
import { assessReferenceAudio } from "@/lib/reference-audio-quality";
import type { CloneMode, ReferenceAudioPayload, VoiceEmotion, VoiceProvider } from "@/lib/types";

export type ProviderHealthStatus = "connected" | "timeout" | "rate_limited" | "unavailable" | "invalid_response";

export interface ProviderHealth {
  ok: boolean;
  status: ProviderHealthStatus;
  message: string;
  latencyMs?: number;
  checkedAt?: string;
}

interface VoiceSettingsProps {
  provider: VoiceProvider;
  speed: number;
  emotion: VoiceEmotion;
  cloneMode: CloneMode;
  cloneStrength: number;
  denoiseReference: boolean;
  normalizeText: boolean;
  referenceAudio?: ReferenceAudioPayload;
  referenceAudioError?: string;
  providerHealth?: ProviderHealth;
  providerHealthLoading?: boolean;
  onProviderChange: (value: VoiceProvider) => void;
  onSpeedChange: (value: number) => void;
  onEmotionChange: (value: VoiceEmotion) => void;
  onCloneModeChange: (value: CloneMode) => void;
  onCloneStrengthChange: (value: number) => void;
  onDenoiseReferenceChange: (value: boolean) => void;
  onNormalizeTextChange: (value: boolean) => void;
  onReferenceAudioChange: (file: File | null) => void;
  onRefreshProviderHealth?: () => void;
}

const healthLabel: Record<ProviderHealthStatus, string> = {
  connected: "HF connected",
  timeout: "HF timeout",
  rate_limited: "HF rate limited",
  unavailable: "HF unavailable",
  invalid_response: "HF invalid response"
};

const healthClassName: Record<ProviderHealthStatus, string> = {
  connected: "border-emerald-300/45 bg-emerald-400/10 text-emerald-800",
  timeout: "border-amber-300/45 bg-amber-400/10 text-amber-800",
  rate_limited: "border-amber-300/45 bg-amber-400/10 text-amber-800",
  unavailable: "border-red-300/50 bg-red-400/10 text-red-700",
  invalid_response: "border-red-300/50 bg-red-400/10 text-red-700"
};

export function VoiceSettings({
  provider,
  speed,
  emotion,
  cloneMode,
  cloneStrength,
  denoiseReference,
  normalizeText,
  referenceAudio,
  referenceAudioError,
  providerHealth,
  providerHealthLoading = false,
  onProviderChange,
  onSpeedChange,
  onEmotionChange,
  onCloneModeChange,
  onCloneStrengthChange,
  onDenoiseReferenceChange,
  onNormalizeTextChange,
  onReferenceAudioChange,
  onRefreshProviderHealth
}: VoiceSettingsProps) {
  const referenceAssessment = assessReferenceAudio(referenceAudio);
  const isCloneProvider = provider === "voxcpm2" || provider === "burmese_production";

  return (
    <section className="studio-card-bg rounded-[2.2rem] border border-white/10 p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
          <SlidersHorizontal size={19} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-studio-text">Voice Settings</h2>
        </div>
      </div>
      <div className="mt-5 grid gap-4">
        <label className="grid gap-2 text-sm font-medium text-studio-muted">
          Provider
          <select
            value={provider}
            onChange={(event) => onProviderChange(event.target.value as VoiceProvider)}
            className="studio-control-bg rounded-2xl border border-white/10 px-3 py-3 text-studio-text outline-none focus:border-studio-accent"
          >
            <option value="mock">Mock Provider</option>
            <option value="voxcpm2">VoxCPM2</option>
            <option value="burmese_production">Burmese Production</option>
          </select>
        </label>

        {isCloneProvider && (
          <div className="studio-nested-card-bg grid gap-3 rounded-[1.8rem] border border-white/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {provider === "voxcpm2" ? (
                <>
                  <span className="inline-flex items-center gap-2 rounded-full border border-studio-accent/30 bg-studio-accent/10 px-3 py-1 text-xs font-semibold text-emerald-800">
                    <Mic2 size={13} /> VoxCPM2 remote inference
                  </span>
                  <span className="rounded-full border border-amber-300/45 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-700">
                    Public shared inference may be slow
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-2 rounded-full border border-studio-accent/30 bg-studio-accent/10 px-3 py-1 text-xs font-semibold text-emerald-800">
                    <Mic2 size={13} /> Burmese production backend
                  </span>
                  <span className="rounded-full border border-amber-300/45 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-700">
                    Uses VoxCPM2 remote inference
                  </span>
                </>
              )}
            </div>

            <div className="studio-control-bg grid gap-2 rounded-2xl border border-white/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-studio-text">
                  <Server size={15} /> HF backend
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      providerHealth
                        ? healthClassName[providerHealth.status]
                        : "border-slate-300 bg-slate-100 text-slate-600"
                    }`}
                  >
                    {providerHealthLoading ? "Checking..." : providerHealth ? healthLabel[providerHealth.status] : "Not checked"}
                  </span>
                  {onRefreshProviderHealth && (
                    <button
                      type="button"
                      onClick={onRefreshProviderHealth}
                      disabled={providerHealthLoading}
                      className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/35 text-studio-muted transition hover:text-studio-text disabled:opacity-50"
                      aria-label="Refresh VoxCPM2 backend health"
                    >
                      <RefreshCw size={14} className={providerHealthLoading ? "animate-spin" : ""} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs leading-relaxed text-studio-muted">
                {providerHealth?.message || "Checks the public Hugging Face Space before remote generation."}
                {providerHealth?.latencyMs !== undefined && providerHealth.latencyMs > 0
                  ? ` ${providerHealth.latencyMs}ms.`
                  : ""}
              </p>
            </div>

            <label className="grid gap-2 text-sm font-medium text-studio-muted">
              <span className="inline-flex items-center gap-2"><UploadCloud size={15} /> Reference audio</span>
              <input
                type="file"
                accept="audio/*"
                onChange={(event) => onReferenceAudioChange(event.target.files?.[0] || null)}
                className="studio-control-bg block w-full rounded-2xl border border-white/10 px-3 py-3 text-sm text-studio-text file:mr-3 file:rounded-xl file:border-0 file:bg-studio-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-950"
              />
            </label>
            <p className={referenceAudioError ? "text-sm text-red-600" : "text-sm text-studio-muted"}>
              {referenceAudioError ||
                (referenceAudio
                  ? `${referenceAudio.filename} (${Math.ceil(referenceAudio.size / 1024)} KB${
                      referenceAudio.durationSeconds ? `, ${referenceAudio.durationSeconds.toFixed(1)}s` : ""
                    })`
                  : provider === "voxcpm2"
                    ? "Upload a clean voice reference for VoxCPM2 cloning."
                    : provider === "burmese_production"
                    ? "Upload clean Burmese voice data. This will run through the VoxCPM2 backend."
                    : "Upload a 3-10 second audio sample for the remote Space.")}
            </p>

            {referenceAudio && (
              <div className="studio-control-bg grid gap-2 rounded-2xl border border-white/10 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="inline-flex items-center gap-2 font-medium text-studio-muted"><Gauge size={15} /> Reference quality</span>
                  <span className="font-semibold text-studio-text">{referenceAssessment.score}/100</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-studio-border">
                  <div className="h-full rounded-full bg-studio-accent" style={{ width: `${referenceAssessment.score}%` }} />
                </div>
                <p className="text-xs text-studio-muted">{referenceAssessment.message}</p>
              </div>
            )}
          </div>
        )}

        {isCloneProvider && (
          <div className="studio-nested-card-bg grid gap-4 rounded-[1.8rem] border border-white/10 p-4">
            <label className="grid gap-2 text-sm font-medium text-studio-muted">
              <span className="inline-flex items-center gap-2"><Wand2 size={15} /> Clone mode</span>
              <select
                value={cloneMode}
                onChange={(event) => onCloneModeChange(event.target.value as CloneMode)}
                className="studio-control-bg rounded-2xl border border-white/10 px-3 py-3 text-studio-text outline-none focus:border-studio-accent"
              >
                <option value="high_fidelity">high fidelity</option>
                <option value="balanced">balanced</option>
              </select>
            </label>

            <label className="grid gap-3 text-sm font-medium text-studio-muted">
              <span className="flex justify-between">
                Clone strength <span className="text-studio-text">{cloneStrength.toFixed(1)}</span>
              </span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={cloneStrength}
                onChange={(event) => onCloneStrengthChange(Number(event.target.value))}
                className="accent-studio-accent"
              />
            </label>

            <div className="grid gap-3 text-sm text-studio-muted">
              <label className="studio-control-bg flex items-center justify-between gap-3 rounded-2xl border border-white/10 px-3 py-2">
                <span>Reference denoise</span>
                <input
                  type="checkbox"
                  checked={denoiseReference}
                  onChange={(event) => onDenoiseReferenceChange(event.target.checked)}
                  className="h-4 w-4 accent-studio-accent"
                />
              </label>
              <label className="studio-control-bg flex items-center justify-between gap-3 rounded-2xl border border-white/10 px-3 py-2">
                <span>Text normalization</span>
                <input
                  type="checkbox"
                  checked={normalizeText}
                  onChange={(event) => onNormalizeTextChange(event.target.checked)}
                  className="h-4 w-4 accent-studio-accent"
                />
              </label>
            </div>
          </div>
        )}

        <label className="grid gap-3 text-sm font-medium text-studio-muted">
          <span className="flex justify-between">
            Speed <span className="text-studio-text">{speed.toFixed(1)}x</span>
          </span>
          <input
            type="range"
            min="0.8"
            max="1.2"
            step="0.1"
            value={speed}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
            className="accent-studio-accent"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-studio-muted">
          Emotion
          <select
            value={emotion}
            onChange={(event) => onEmotionChange(event.target.value as VoiceEmotion)}
            className="studio-control-bg rounded-2xl border border-white/10 px-3 py-3 text-studio-text outline-none focus:border-studio-accent"
          >
            <option value="neutral">neutral</option>
            <option value="calm">calm</option>
            <option value="energetic">energetic</option>
            <option value="dramatic">dramatic</option>
          </select>
        </label>
      </div>
    </section>
  );
}
