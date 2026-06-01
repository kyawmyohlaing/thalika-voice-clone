import fs from "node:fs/promises";
import { createSineWaveWavBuffer } from "../audio-utils";
import { ensureDataDirs, outputsDir, safeJoin, sanitizeFilename } from "../file-utils";
import type { GenerateVoiceInput } from "../types";
import type { TTSProvider } from "./base";

export const mockProvider: TTSProvider = {
  id: "mock",
  name: "Mock Provider",
  async generate(input: GenerateVoiceInput) {
    await ensureDataDirs();

    const filename = sanitizeFilename(`voice_${input.jobId}.wav`);
    const audioFilePath = safeJoin(outputsDir, filename);
    const wav = createSineWaveWavBuffer(input.script, input.emotion, input.speed);
    await fs.writeFile(audioFilePath, wav);

    return {
      filename,
      audioFilePath,
      format: "wav"
    };
  }
};
