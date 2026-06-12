import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  convertRemoteAudioToPcm24Wav,
  getPunctuationAwarePauseMilliseconds,
  mergeWavFiles
} from "../audio-utils";
import { ensureDataDirs, idStamp, outputsDir, safeJoin, sanitizeFilename } from "../file-utils";
import { REMOTE_TTS_CHUNK_CHARACTERS } from "../script-limits";
import { splitScriptIntoChunks } from "../script-chunker";
import { appendGenerationLog } from "../storage/generation-log";
import type { GenerateVoiceInput, GenerateVoiceResult, ReferenceAudioPayload, VoiceEmotion } from "../types";
import type { TTSProvider } from "./base";
import {
  assertOkResponse,
  fetchWithTimeout,
  RemoteProviderError,
  TimeoutError,
  withRetry
} from "./hf-utils";

const emotionControls: Record<VoiceEmotion, string> = {
  neutral: "neutral expression",
  calm: "calm and steady expression",
  energetic: "energetic but speaker-consistent expression",
  dramatic: "expressive but speaker-consistent delivery"
};

export function getLocalVoxCPM2BaseUrl() {
  return (process.env.VOXCPM_LOCAL_API_URL || "").replace(/\/+$/, "");
}

function getLocalInferenceTimeout() {
  const parsed = Number(process.env.VOXCPM_LOCAL_INFERENCE_TIMEOUT || 300000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300000;
}

function containsMyanmarText(value: string) {
  return /[\u1000-\u109f\uaa60-\uaa7f\ua9e0-\ua9ff]/.test(value);
}

function speedControl(speed: number) {
  if (speed <= 0.85) return "slow, deliberate pacing";
  if (speed <= 0.95) return "slightly slower pacing";
  if (speed >= 1.15) return "brisk pacing";
  if (speed >= 1.05) return "slightly faster pacing";
  return "natural pacing";
}

function decodeReferenceAudio(referenceAudio: ReferenceAudioPayload) {
  const match = referenceAudio.dataUrl.match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new RemoteProviderError("Invalid reference audio", {
      publicMessage: "Local VoxCPM2 requires a valid audio reference file."
    });
  }

  const mimeType = match[1];
  const format = mimeType.includes("mpeg") || mimeType.includes("mp3") ? "mp3" : "wav";
  return {
    base64: match[2],
    format
  };
}

function diagnosticError(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return "Unknown local inference error";
}

async function callLocalVoxCPM2(
  baseUrl: string,
  input: GenerateVoiceInput,
  referenceAudio: ReferenceAudioPayload,
  scriptChunk: string,
  chunkIndex: number,
  chunkCount: number,
  plainClone = false
) {
  const reference = decodeReferenceAudio(referenceAudio);
  const cfgValue = Math.min(3, Math.max(1, input.cloneStrength ?? 2));
  const instruction = plainClone
    ? ""
    : `Use ${emotionControls[input.emotion]} with ${speedControl(input.speed)}. This is segment ${chunkIndex + 1} of ${chunkCount}; keep the same speaker identity, pace, volume, accent, and emotional style.`;
  const targetText = instruction ? `${instruction}\n${scriptChunk}` : scriptChunk;

  const response = await fetchWithTimeout(
    `${baseUrl}/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_text: targetText,
        cfg_value: cfgValue,
        inference_timesteps: 10,
        normalize: containsMyanmarText(scriptChunk) ? false : input.normalizeText ?? false,
        prompt_text: input.referenceText?.trim() || "",
        ref_audio_wav_base64: reference.base64,
        ref_audio_format: reference.format
      })
    },
    getLocalInferenceTimeout()
  );

  assertOkResponse(response, "Local VoxCPM2 inference failed");

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new RemoteProviderError("Empty local VoxCPM2 audio response", {
      publicMessage: "Local VoxCPM2 returned no audio for this segment.",
      retryable: true
    });
  }

  return bytes;
}

function normalizeLocalError(error: unknown) {
  if (error instanceof TimeoutError) {
    return `Local VoxCPM2 inference timed out after ${Math.round(getLocalInferenceTimeout() / 1000)} seconds. If the model is still loading or running on CPU, wait for /load to finish, use a GPU, or increase VOXCPM_LOCAL_INFERENCE_TIMEOUT.`;
  }
  if (error instanceof RemoteProviderError) return error.publicMessage;
  if (error instanceof TypeError && error.message === "fetch failed") {
    return "Local VoxCPM2 API is unavailable. Start the local server or update VOXCPM_LOCAL_API_URL.";
  }
  if (error instanceof Error) return error.message;
  return "Local VoxCPM2 inference failed";
}

function shouldFallbackToPlainClone(error: unknown) {
  return error instanceof RemoteProviderError && error.message.startsWith("Empty local VoxCPM2 audio response");
}

function shouldRetryLocalError(error: unknown) {
  return error instanceof RemoteProviderError && error.retryable;
}

async function generateLocal(input: GenerateVoiceInput) {
  if (!input.referenceAudio) {
    throw new RemoteProviderError("Missing reference audio", {
      publicMessage: "Local VoxCPM2 requires reference audio for voice cloning."
    });
  }

  const baseUrl = getLocalVoxCPM2BaseUrl();
  if (!baseUrl) {
    throw new RemoteProviderError("Missing local VoxCPM2 URL", {
      publicMessage: "Add VOXCPM_LOCAL_API_URL to .env.local, then restart the app."
    });
  }

  await ensureDataDirs();
  const chunks = splitScriptIntoChunks(input.script, REMOTE_TTS_CHUNK_CHARACTERS);
  if (chunks.length === 0) {
    throw new RemoteProviderError("Empty script", {
      publicMessage: "Script is required."
    });
  }

  const outputStem = sanitizeFilename(`voice_${idStamp()}`);
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "thalika-voxcpm2-local-"));
  let result: GenerateVoiceResult | undefined;

  try {
    const audioChunkPaths: string[] = [];
    const remoteFormats = new Set<string>();
    await appendGenerationLog("generation_started", {
      jobId: input.jobId,
      provider: "voxcpm2_local",
      characters: input.script.length,
      chunks: chunks.length
    });
    await input.onProgress?.({
      completedChunks: 0,
      totalChunks: chunks.length,
      message: `Preparing ${chunks.length} local audio segment${chunks.length === 1 ? "" : "s"}.`
    });

    for (const [chunkIndex, chunk] of chunks.entries()) {
      await appendGenerationLog("chunk_started", {
        jobId: input.jobId,
        chunk: chunkIndex + 1,
        chunks: chunks.length,
        characters: chunk.length
      });
      await input.onProgress?.({
        completedChunks: chunkIndex,
        totalChunks: chunks.length,
        message: `Generating local audio segment ${chunkIndex + 1} of ${chunks.length}.`
      });

      const audio = await withRetry(
        async () => {
          try {
            return await callLocalVoxCPM2(baseUrl, input, input.referenceAudio!, chunk, chunkIndex, chunks.length);
          } catch (error) {
            if (!shouldFallbackToPlainClone(error)) throw error;
            await appendGenerationLog("local_plain_clone_fallback", {
              jobId: input.jobId,
              chunk: chunkIndex + 1,
              chunks: chunks.length,
              error: diagnosticError(error)
            });
            return await callLocalVoxCPM2(baseUrl, input, input.referenceAudio!, chunk, chunkIndex, chunks.length, true);
          }
        },
        shouldRetryLocalError,
        0,
        async (error, attempt) => {
          await appendGenerationLog("chunk_retry", {
            jobId: input.jobId,
            chunk: chunkIndex + 1,
            chunks: chunks.length,
            attempt,
            error: diagnosticError(error)
          });
        }
      );

      let converted;
      try {
        converted = await convertRemoteAudioToPcm24Wav(audio);
      } catch {
        throw new RemoteProviderError("Local audio decode failed", {
          publicMessage: "Local VoxCPM2 returned an audio segment that could not be decoded into PCM WAV."
        });
      }

      const chunkPath = path.join(temporaryDir, `chunk-${chunkIndex}.wav`);
      await fs.writeFile(chunkPath, converted.wav);
      audioChunkPaths.push(chunkPath);
      remoteFormats.add(converted.remoteFormat);
      await appendGenerationLog("chunk_completed", {
        jobId: input.jobId,
        chunk: chunkIndex + 1,
        chunks: chunks.length,
        remoteFormat: converted.remoteFormat,
        remoteBytes: audio.length,
        pcmWavBytes: converted.wav.length
      });
      await input.onProgress?.({
        completedChunks: chunkIndex + 1,
        totalChunks: chunks.length,
        message: `Generated local audio segment ${chunkIndex + 1} of ${chunks.length}.`
      });
    }

    const filename = sanitizeFilename(`${outputStem}.wav`);
    const audioFilePath = safeJoin(outputsDir, filename);
    const pauses = chunks.slice(0, -1).map(getPunctuationAwarePauseMilliseconds);
    await appendGenerationLog("merge_started", {
      jobId: input.jobId,
      chunks: chunks.length,
      format: "wav",
      encoding: "pcm_s24le",
      pausesMilliseconds: pauses.join(",")
    });
    await mergeWavFiles(audioChunkPaths, audioFilePath, pauses);
    await appendGenerationLog("generation_completed", { jobId: input.jobId, chunks: chunks.length, filename, format: "wav" });
    result = {
      filename,
      audioFilePath,
      format: "wav",
      localAudioUrl: `/api/audio/${filename}`,
      metadata: {
        remoteProvider: "local-voxcpm2-api",
        remoteBaseUrl: baseUrl,
        remoteFormats: [...remoteFormats].join(","),
        outputEncoding: "pcm_s24le",
        outputSampleRate: 48_000,
        outputChannels: 1,
        outputBitDepth: 24,
        chunkedGeneration: chunks.length > 1,
        chunkCount: chunks.length,
        chunkMaxCharacters: REMOTE_TTS_CHUNK_CHARACTERS,
        originalCharacters: input.script.length
      }
    };
  } catch (error) {
    await appendGenerationLog("generation_failed", {
      jobId: input.jobId,
      chunks: chunks.length,
      error: diagnosticError(error),
      publicMessage: normalizeLocalError(error)
    });
    throw error;
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }

  if (!result) throw new Error("Local VoxCPM2 generation completed without a local audio result.");
  return result;
}

export const voxcpm2LocalProvider: TTSProvider = {
  id: "voxcpm2_local",
  name: "Local VoxCPM2",
  async generate(input) {
    try {
      return await generateLocal(input);
    } catch (error) {
      throw new RemoteProviderError("Local VoxCPM2 inference failed", {
        publicMessage: normalizeLocalError(error)
      });
    }
  }
};
