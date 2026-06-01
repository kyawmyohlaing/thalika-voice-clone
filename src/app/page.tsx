"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, UploadCloud, WandSparkles } from "lucide-react";
import { AudioPreview } from "@/components/AudioPreview";
import { GenerateButton } from "@/components/GenerateButton";
import { ScriptInput } from "@/components/ScriptInput";
import { StatusPanel, type StudioStatus } from "@/components/StatusPanel";
import { StudioPageShell } from "@/components/StudioPageShell";
import { VoiceSettings, type ProviderHealth } from "@/components/VoiceSettings";
import { preflightProvider } from "@/lib/provider-capabilities";
import { MAX_SCRIPT_CHARACTERS } from "@/lib/script-limits";
import type {
  CloneMode,
  ProviderPreflightResult,
  ReferenceAudioPayload,
  VoiceEmotion,
  VoiceProvider
} from "@/lib/types";

interface AudioResult {
  audioUrl: string;
  filename: string;
  provider: string;
  createdAt: string;
}

interface VoiceOverDraft {
  title?: string;
  script?: string;
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [provider, setProvider] = useState<VoiceProvider>("burmese_production");
  const [speed, setSpeed] = useState(1);
  const [emotion, setEmotion] = useState<VoiceEmotion>("calm");
  const [cloneMode, setCloneMode] = useState<CloneMode>("high_fidelity");
  const [cloneStrength, setCloneStrength] = useState(2.8);
  const [denoiseReference, setDenoiseReference] = useState(false);
  const [normalizeText, setNormalizeText] = useState(true);
  const [status, setStatus] = useState<StudioStatus>("idle");
  const [error, setError] = useState("");
  const [audioResult, setAudioResult] = useState<AudioResult | undefined>();
  const [referenceAudio, setReferenceAudio] = useState<ReferenceAudioPayload | undefined>();
  const [referenceAudioError, setReferenceAudioError] = useState("");
  const [providerHealth, setProviderHealth] = useState<ProviderHealth | undefined>();
  const [providerHealthLoading, setProviderHealthLoading] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const loadedDraftRef = useRef(false);

  useEffect(() => {
    async function loadDraft() {
      try {
        const response = await fetch("/api/drafts/voice-over", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { draft: VoiceOverDraft | null };
        if (!data.draft) return;
        if (data.draft.title) setTitle(data.draft.title);
        if (data.draft.script) setScript(data.draft.script);
        loadedDraftRef.current = true;
      } catch {
        // Draft transfer is optional; voice generation still works without it.
      } finally {
        setDraftReady(true);
      }
    }

    void loadDraft();
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    if (!script.trim()) {
      const timeout = window.setTimeout(() => {
        void fetch("/api/drafts/voice-over", { method: "DELETE" });
      }, 600);

      return () => window.clearTimeout(timeout);
    }
    if (script.trim().length < 10) return;

    const timeout = window.setTimeout(() => {
      void fetch("/api/drafts/voice-over", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          script
        })
      });
      loadedDraftRef.current = false;
    }, loadedDraftRef.current ? 1200 : 600);

    return () => window.clearTimeout(timeout);
  }, [draftReady, script, title]);

  const refreshProviderHealth = useCallback(async () => {
    setProviderHealthLoading(true);
    try {
      const response = await fetch("/api/providers/voxcpm2/health", { cache: "no-store" });
      const data = (await response.json()) as ProviderHealth;
      setProviderHealth(data);
    } catch {
      setProviderHealth({
        ok: false,
        status: "unavailable",
        message: "Could not reach the local VoxCPM2 health route.",
        checkedAt: new Date().toISOString()
      });
    } finally {
      setProviderHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (provider !== "voxcpm2" && provider !== "burmese_production") {
      setProviderHealth(undefined);
      return;
    }

    void refreshProviderHealth();
  }, [provider, refreshProviderHealth]);

  const scriptError = useMemo(() => {
    const trimmed = script.trim();
    if (!trimmed) return "Script is required.";
    if (trimmed.length < 10) return "Script must be at least 10 characters.";
    if (trimmed.length > MAX_SCRIPT_CHARACTERS) return `Script must be ${MAX_SCRIPT_CHARACTERS.toLocaleString()} characters or fewer.`;
    return "";
  }, [script]);

  async function handleReferenceAudioChange(file: File | null) {
    setReferenceAudio(undefined);
    setReferenceAudioError("");

    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setReferenceAudioError("Reference audio must be an audio file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setReferenceAudioError("Reference audio must be 10MB or smaller.");
      return;
    }

    try {
      const durationSeconds = await new Promise<number | undefined>((resolve) => {
        const audio = document.createElement("audio");
        const url = URL.createObjectURL(file);
        audio.preload = "metadata";
        audio.onloadedmetadata = () => {
          URL.revokeObjectURL(url);
          resolve(Number.isFinite(audio.duration) ? audio.duration : undefined);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(undefined);
        };
        audio.src = url;
      });

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read reference audio."));
        reader.readAsDataURL(file);
      });
      setReferenceAudio({
        dataUrl,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        durationSeconds
      });
    } catch (caught) {
      setReferenceAudioError(caught instanceof Error ? caught.message : "Could not read reference audio.");
    }
  }

  async function generateAudio() {
    const preflight = preflightProvider({ provider, script, referenceAudio });
    if (scriptError || !preflight.ok) {
      setError(preflight.message);
      setStatus("failed");
      return;
    }
    setStatus("saving");
    setError("");
    setAudioResult(undefined);

    try {
      setStatus("generating");
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          script,
          provider,
          format: "wav",
          speed,
          emotion,
          cloneMode,
          cloneStrength,
          denoiseReference,
          normalizeText,
          referenceAudio
        })
      });
      const data = await response.json();

      if (!response.ok || data.status === "failed") {
        throw new Error(data.message || data.error || "Generation failed");
      }

      setAudioResult({
        audioUrl: data.audioUrl,
        filename: data.filename,
        provider: data.provider,
        createdAt: data.createdAt
      });
      setStatus("completed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Generation failed");
      setStatus("failed");
    }
  }

  const isGenerating = status === "saving" || status === "generating";
  const referenceRequirementError =
    provider === "burmese_production"
      ? referenceAudioError ||
        (!referenceAudio
          ? "Burmese production cloning requires clean reference voice data."
          : referenceAudio.durationSeconds && referenceAudio.durationSeconds < 3
            ? "Reference audio is too short. Use at least 3 seconds, ideally 6-15 seconds."
            : referenceAudio.durationSeconds && referenceAudio.durationSeconds > 50
              ? "Reference audio is too long for VoxCPM2. Trim it to 6-30 seconds of clean speech."
              : "")
      : provider === "voxcpm2"
        ? referenceAudioError ||
          (!referenceAudio
            ? "VoxCPM2 requires reference audio for voice cloning."
            : referenceAudio.durationSeconds && referenceAudio.durationSeconds < 3
              ? "Reference audio is too short. Use at least 3 seconds, ideally 6-15 seconds."
              : referenceAudio.durationSeconds && referenceAudio.durationSeconds > 50
                ? "Reference audio is too long for VoxCPM2. Trim it to 6-30 seconds of clean speech."
                : "")
      : referenceAudioError;
  const generateDisabled =
    Boolean(scriptError) ||
    isGenerating ||
    ((provider === "voxcpm2" || provider === "burmese_production") &&
      (!referenceAudio || Boolean(referenceRequirementError)));
  const activePreflight: ProviderPreflightResult = preflightProvider({ provider, script, referenceAudio });
  const capabilityDisabled = !activePreflight.ok;
  const disabledReason = scriptError || referenceRequirementError || (!activePreflight.ok ? activePreflight.message : "");

  const workflowSteps = [
    { label: "Script", helper: script.trim() ? "Ready" : "Paste text", icon: FileText, active: Boolean(script.trim()) },
    { label: "Voice", helper: referenceAudio ? "Uploaded" : "Add sample", icon: UploadCloud, active: Boolean(referenceAudio) },
    { label: "Generate", helper: status === "completed" ? "Done" : "Create audio", icon: WandSparkles, active: status === "completed" }
  ];
  const heroAside = (
    <div className="grid gap-3">
      <div className="studio-card-bg grid grid-cols-3 gap-2 rounded-[2.1rem] border border-white/10 p-2">
        {workflowSteps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.label}
              className={`rounded-[1.25rem] px-3 py-3 ${
                step.active ? "bg-studio-accent text-slate-950" : "studio-soft-chip-bg text-studio-muted"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Icon size={16} />
                <span>{step.label}</span>
              </div>
              <p className={`mt-1 text-xs ${step.active ? "text-slate-800" : "text-studio-muted"}`}>{step.helper}</p>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <StudioPageShell
      activeTab="voiceover"
      badge="Local-first voice cloning"
      title="Voice Over"
      description="Paste Burmese script, add a clean voice reference, generate audio, then review everything locally."
      aside={heroAside}
    >
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="grid gap-5">
            <ScriptInput
              title={title}
              script={script}
              error={scriptError}
              onTitleChange={setTitle}
              onScriptChange={setScript}
            />
          </div>

          <aside className="grid content-start gap-5">
            <VoiceSettings
              provider={provider}
              speed={speed}
              emotion={emotion}
              cloneMode={cloneMode}
              cloneStrength={cloneStrength}
              denoiseReference={denoiseReference}
              normalizeText={normalizeText}
              referenceAudio={referenceAudio}
              referenceAudioError={referenceRequirementError}
              providerHealth={providerHealth}
              providerHealthLoading={providerHealthLoading}
              onProviderChange={setProvider}
              onSpeedChange={setSpeed}
              onEmotionChange={setEmotion}
              onCloneModeChange={setCloneMode}
              onCloneStrengthChange={setCloneStrength}
              onDenoiseReferenceChange={setDenoiseReference}
              onNormalizeTextChange={setNormalizeText}
              onReferenceAudioChange={handleReferenceAudioChange}
              onRefreshProviderHealth={refreshProviderHealth}
            />
            <GenerateButton
              disabled={generateDisabled || capabilityDisabled}
              loading={isGenerating}
              disabledReason={disabledReason}
              onClick={generateAudio}
            />
            <StatusPanel status={status} error={error} />
            <AudioPreview result={audioResult} />
          </aside>
        </div>
    </StudioPageShell>
  );
}
