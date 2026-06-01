import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mergeWavFiles } from "../audio-utils";
import { ensureDataDirs, idStamp, outputsDir, safeJoin, sanitizeFilename } from "../file-utils";
import { REMOTE_TTS_CHUNK_CHARACTERS } from "../script-limits";
import { splitScriptIntoChunks } from "../script-chunker";
import type { GenerateVoiceInput, ReferenceAudioPayload, VoiceEmotion } from "../types";
import type { TTSProvider } from "./base";
import {
  assertOkResponse,
  extractAudioUrlFromEvents,
  fetchWithTimeout,
  getHFRequestTimeout,
  parseSSEData,
  parseUploadResponse,
  readJsonResponse,
  RemoteProviderError,
  shouldRetryHFError,
  TimeoutError,
  withRetry
} from "./hf-utils";
import { getVoxCPM2BaseUrl } from "./voxcpm2-health";

const emotionControls: Record<VoiceEmotion, string> = {
  neutral: "neutral expression",
  calm: "calm and steady expression",
  energetic: "energetic but speaker-consistent expression",
  dramatic: "expressive but speaker-consistent delivery"
};

function decodeReferenceAudio(referenceAudio: ReferenceAudioPayload) {
  const match = referenceAudio.dataUrl.match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new RemoteProviderError("Invalid reference audio", {
      publicMessage: "VoxCPM2 requires a valid audio reference file."
    });
  }

  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], "base64")
  };
}

async function uploadReferenceAudio(baseUrl: string, referenceAudio: ReferenceAudioPayload) {
  const { bytes, mimeType } = decodeReferenceAudio(referenceAudio);
  const filename = sanitizeFilename(referenceAudio.filename || "reference.wav");
  const form = new FormData();
  form.append("files", new Blob([bytes], { type: mimeType }), filename);

  const response = await fetchWithTimeout(`${baseUrl}/gradio_api/upload`, {
    method: "POST",
    body: form
  });
  assertOkResponse(response, "VoxCPM2 reference audio upload failed");

  const json = await readJsonResponse<unknown>(response, "Invalid response from VoxCPM2 Space.");
  return parseUploadResponse(json);
}

async function callVoxCPM2(
  baseUrl: string,
  input: GenerateVoiceInput,
  uploadedReferencePath: string,
  scriptChunk: string,
  chunkIndex: number,
  chunkCount: number
) {
  const cloneMode = input.cloneMode || "high_fidelity";
  const cloneStrength = Math.min(3, Math.max(1, input.cloneStrength ?? (cloneMode === "high_fidelity" ? 2.8 : 2.2)));
  const denoiseReference = input.denoiseReference ?? false;
  const normalizeText = input.normalizeText ?? true;
  const continuityInstruction =
    chunkCount > 1
      ? ` This is segment ${chunkIndex + 1} of ${chunkCount}; keep the same speaker identity, pace, volume, accent, and emotional style so all segments join naturally.`
      : "";
  const controlInstruction =
    cloneMode === "high_fidelity"
      ? `Preserve the uploaded speaker identity as closely as possible: timbre, accent, pitch range, rhythm, breath, tone, speaking style, and Burmese pronunciation. Use ${emotionControls[input.emotion]}.${continuityInstruction}`
      : `Clone the uploaded speaker while keeping natural speech. Use ${emotionControls[input.emotion]}.${continuityInstruction}`;
  const body = {
    data: [
      scriptChunk,
      controlInstruction,
      {
        path: uploadedReferencePath,
        orig_name: sanitizeFilename(input.referenceAudio?.filename || "reference.wav"),
        mime_type: input.referenceAudio?.mimeType || "audio/wav",
        meta: { _type: "gradio.FileData" }
      },
      false,
      "",
      cloneStrength,
      normalizeText,
      denoiseReference
    ]
  };

  const response = await fetchWithTimeout(`${baseUrl}/gradio_api/call/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  assertOkResponse(response, "VoxCPM2 remote inference failed");

  const json = await readJsonResponse<{ event_id?: string }>(response, "Invalid response from VoxCPM2 Space.");
  if (!json.event_id) {
    throw new RemoteProviderError("Missing Gradio event id", {
      publicMessage: "Invalid response from VoxCPM2 Space."
    });
  }

  const resultResponse = await fetchWithTimeout(`${baseUrl}/gradio_api/call/generate/${json.event_id}`, {
    method: "GET",
    headers: { Accept: "text/event-stream" }
  });
  assertOkResponse(resultResponse, "VoxCPM2 remote inference failed");

  const resultText = await resultResponse.text();
  const events = parseSSEData(resultText);
  return extractAudioUrlFromEvents(events, baseUrl);
}

async function downloadRemoteAudio(audioUrl: string) {
  const response = await fetchWithTimeout(audioUrl, { method: "GET" });
  assertOkResponse(response, "VoxCPM2 audio download failed");

  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.includes("audio") && !contentType.includes("octet-stream")) {
    throw new RemoteProviderError("Unexpected VoxCPM2 audio response type", {
      publicMessage: "Invalid response from VoxCPM2 Space."
    });
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new RemoteProviderError("Empty VoxCPM2 audio response", {
      publicMessage: "VoxCPM2 audio download failed."
    });
  }

  return bytes;
}

function normalizeVoxCPM2Error(error: unknown) {
  if (error instanceof TimeoutError) return "Remote inference timed out.";
  if (error instanceof RemoteProviderError) return error.publicMessage;
  return "VoxCPM2 remote inference failed";
}

async function generateRemote(input: GenerateVoiceInput) {
  if (!input.referenceAudio) {
    throw new RemoteProviderError("Missing reference audio", {
      publicMessage: "VoxCPM2 requires reference audio for voice cloning."
    });
  }
  const referenceAudio = input.referenceAudio;

  await ensureDataDirs();
  const baseUrl = getVoxCPM2BaseUrl();
  const chunks = splitScriptIntoChunks(input.script, REMOTE_TTS_CHUNK_CHARACTERS);
  if (chunks.length === 0) {
    throw new RemoteProviderError("Empty script", {
      publicMessage: "Script is required."
    });
  }

  const uploadedReferencePath = await withRetry(() => uploadReferenceAudio(baseUrl, referenceAudio), shouldRetryHFError, 2);
  const filename = sanitizeFilename(`voice_${idStamp()}.wav`);
  const audioFilePath = safeJoin(outputsDir, filename);
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "thalika-voxcpm2-"));

  try {
    const audioChunkPaths: string[] = [];
    for (const [chunkIndex, chunk] of chunks.entries()) {
      const audio = await withRetry(async () => {
        const remoteAudioUrl = await callVoxCPM2(baseUrl, input, uploadedReferencePath, chunk, chunkIndex, chunks.length);
        return downloadRemoteAudio(remoteAudioUrl);
      }, shouldRetryHFError, 2);
      const chunkPath = path.join(temporaryDir, `chunk-${chunkIndex}.wav`);
      await fs.writeFile(chunkPath, audio);
      audioChunkPaths.push(chunkPath);
    }

    await mergeWavFiles(audioChunkPaths, audioFilePath);
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }

  return {
    filename,
    audioFilePath,
    format: "wav" as const,
    localAudioUrl: `/api/audio/${filename}`,
    metadata: {
      remoteProvider: "huggingface-space",
      remoteBaseUrl: baseUrl,
      mode: "voxcpm2-controllable-cloning",
      cloneMode: input.cloneMode || "high_fidelity",
      cloneStrength: input.cloneStrength ?? 2.8,
      denoiseReference: input.denoiseReference ?? false,
      normalizeText: input.normalizeText ?? true,
      chunkedGeneration: chunks.length > 1,
      chunkCount: chunks.length,
      chunkMaxCharacters: REMOTE_TTS_CHUNK_CHARACTERS,
      originalCharacters: input.script.length,
      timeoutMs: getHFRequestTimeout()
    }
  };
}

export const voxcpm2Provider: TTSProvider = {
  id: "voxcpm2",
  name: "VoxCPM2",
  async generate(input) {
    try {
      return await generateRemote(input);
    } catch (error) {
      throw new RemoteProviderError("VoxCPM2 remote inference failed", {
        publicMessage: normalizeVoxCPM2Error(error)
      });
    }
  }
};
