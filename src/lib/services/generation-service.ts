import { localIsoString } from "@/lib/file-utils";
import { preflightProvider } from "@/lib/provider-capabilities";
import { getProvider } from "@/lib/providers";
import { RemoteProviderError } from "@/lib/providers/hf-utils";
import { createJobId, saveJob } from "@/lib/storage/job-store";
import { saveScript } from "@/lib/storage/script-store";
import type { GenerateVoiceRequest, GenerateVoiceResult, ProviderPreflightResult } from "@/lib/types";

export class ProviderPreflightError extends Error {
  constructor(public preflight: ProviderPreflightResult) {
    super(preflight.message);
    this.name = "ProviderPreflightError";
  }
}

export interface GenerationSuccess {
  jobId: string;
  scriptId: string;
  status: "completed";
  audioUrl: string;
  filename: string;
  provider: GenerateVoiceRequest["provider"];
  format: GenerateVoiceRequest["format"];
  createdAt: string;
  metadata?: Record<string, string | number | boolean>;
}

function providerErrorMessage(error: unknown) {
  if (error instanceof RemoteProviderError) return error.publicMessage;
  if (error instanceof Error) return error.message;
  return "Audio generation failed";
}

function formatJobContent(providerName: string, audio: GenerateVoiceResult) {
  const metadata = audio.metadata ? `\nMetadata: ${JSON.stringify(audio.metadata)}` : "";
  return `Generated voice metadata.\n\nProvider: ${providerName}\nFormat: ${audio.format}\nAudio file: ${audio.filename}${metadata}`;
}

export async function generateVoice(input: GenerateVoiceRequest): Promise<GenerationSuccess> {
  const preflight = preflightProvider(input);
  if (!preflight.ok) {
    throw new ProviderPreflightError(preflight);
  }

  const scriptRecord = await saveScript({ title: input.title, script: input.script });
  const jobId = createJobId();
  const createdAt = localIsoString();

  try {
    const provider = getProvider(input.provider);
    const audio = await provider.generate({
      ...input,
      jobId,
      scriptId: scriptRecord.id,
      title: scriptRecord.title
    });

    const job = await saveJob({
      id: jobId,
      scriptId: scriptRecord.id,
      title: scriptRecord.title,
      provider: input.provider,
      format: audio.format,
      speed: input.speed,
      emotion: input.emotion,
      status: "completed",
      audioFile: audio.filename,
      createdAt,
      content: formatJobContent(provider.name, audio)
    });

    return {
      jobId: job.id,
      scriptId: scriptRecord.id,
      status: "completed",
      audioUrl: audio.localAudioUrl || `/api/audio/${audio.filename}`,
      filename: audio.filename,
      provider: input.provider,
      format: audio.format,
      createdAt: job.createdAt,
      metadata: audio.metadata
    };
  } catch (error) {
    const specificMessage = providerErrorMessage(error);
    await saveJob({
      id: jobId,
      scriptId: scriptRecord.id,
      title: scriptRecord.title,
      provider: input.provider,
      format: input.format,
      speed: input.speed,
      emotion: input.emotion,
      status: "failed",
      error: specificMessage,
      createdAt,
      content: "Generation failed before audio output was created."
    });

    throw new RemoteProviderError("Voice generation failed", {
      publicMessage: specificMessage
    });
  }
}
