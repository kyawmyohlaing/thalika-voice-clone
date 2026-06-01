import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { once } from "node:events";
import type { VoiceEmotion } from "./types";

const emotionFrequency: Record<VoiceEmotion, number> = {
  neutral: 440,
  calm: 330,
  energetic: 660,
  dramatic: 220
};

export function durationFromScript(script: string) {
  return Math.min(10, Math.max(2, Math.ceil(script.length / 450)));
}

export function createSineWaveWavBuffer(script: string, emotion: VoiceEmotion, speed: number) {
  const sampleRate = 44100;
  const channels = 1;
  const bitsPerSample = 16;
  const baseDuration = durationFromScript(script);
  const durationSeconds = Math.min(10, Math.max(2, baseDuration / speed));
  const samples = Math.floor(sampleRate * durationSeconds);
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = samples * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  const frequency = emotionFrequency[emotion];

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples; i += 1) {
    const fadeIn = Math.min(1, i / (sampleRate * 0.05));
    const fadeOut = Math.min(1, (samples - i) / (sampleRate * 0.08));
    const envelope = Math.min(fadeIn, fadeOut) * 0.25;
    const wobble = Math.sin((2 * Math.PI * i) / sampleRate / 0.35) * 8;
    const value = Math.sin((2 * Math.PI * (frequency + wobble) * i) / sampleRate) * envelope;
    buffer.writeInt16LE(Math.floor(value * 32767), 44 + i * 2);
  }

  return buffer;
}

interface ParsedWav {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  data: Buffer;
}

function readWavChunk(buffer: Buffer, offset: number) {
  if (offset + 8 > buffer.length) return undefined;
  const id = buffer.toString("ascii", offset, offset + 4);
  const size = buffer.readUInt32LE(offset + 4);
  const dataStart = offset + 8;
  const dataEnd = dataStart + size;
  if (dataEnd > buffer.length) return undefined;
  return { id, size, dataStart, dataEnd, nextOffset: dataEnd + (size % 2) };
}

function parsePcmWav(buffer: Buffer): ParsedWav {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Only WAV audio can be merged into a final local file.");
  }

  let offset = 12;
  let fmt: ParsedWav | undefined;
  let data: Buffer | undefined;

  while (offset < buffer.length) {
    const chunk = readWavChunk(buffer, offset);
    if (!chunk) break;

    if (chunk.id === "fmt ") {
      if (chunk.size < 16) throw new Error("Invalid WAV fmt chunk.");
      fmt = {
        audioFormat: buffer.readUInt16LE(chunk.dataStart),
        channels: buffer.readUInt16LE(chunk.dataStart + 2),
        sampleRate: buffer.readUInt32LE(chunk.dataStart + 4),
        byteRate: buffer.readUInt32LE(chunk.dataStart + 8),
        blockAlign: buffer.readUInt16LE(chunk.dataStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunk.dataStart + 14),
        data: Buffer.alloc(0)
      };
    }

    if (chunk.id === "data") {
      data = buffer.subarray(chunk.dataStart, chunk.dataEnd);
    }

    offset = chunk.nextOffset;
  }

  if (!fmt || !data) throw new Error("Invalid WAV audio.");
  if (fmt.audioFormat !== 1) throw new Error("Only PCM WAV audio can be merged.");

  return { ...fmt, data };
}

export function mergeWavBuffers(buffers: Buffer[], gapMilliseconds = 180) {
  if (buffers.length === 0) throw new Error("No WAV audio chunks to merge.");
  if (buffers.length === 1) return buffers[0];

  const parsed = buffers.map(parsePcmWav);
  const first = parsed[0];

  for (const wav of parsed.slice(1)) {
    const compatible =
      wav.audioFormat === first.audioFormat &&
      wav.channels === first.channels &&
      wav.sampleRate === first.sampleRate &&
      wav.blockAlign === first.blockAlign &&
      wav.bitsPerSample === first.bitsPerSample;

    if (!compatible) {
      throw new Error("Generated WAV chunks have different audio formats and cannot be merged safely.");
    }
  }

  const silenceBytes = Math.floor((first.byteRate * gapMilliseconds) / 1000 / first.blockAlign) * first.blockAlign;
  const silence = Buffer.alloc(silenceBytes);
  const dataParts = parsed.flatMap((wav, index) => (index === parsed.length - 1 ? [wav.data] : [wav.data, silence]));
  const dataSize = dataParts.reduce((total, part) => total + part.length, 0);
  if (dataSize > 0xffffffff - 36) throw new Error("Merged WAV file is too large.");

  const output = Buffer.alloc(44 + dataSize);
  output.write("RIFF", 0);
  output.writeUInt32LE(36 + dataSize, 4);
  output.write("WAVE", 8);
  output.write("fmt ", 12);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(first.audioFormat, 20);
  output.writeUInt16LE(first.channels, 22);
  output.writeUInt32LE(first.sampleRate, 24);
  output.writeUInt32LE(first.byteRate, 28);
  output.writeUInt16LE(first.blockAlign, 32);
  output.writeUInt16LE(first.bitsPerSample, 34);
  output.write("data", 36);
  output.writeUInt32LE(dataSize, 40);

  let writeOffset = 44;
  for (const part of dataParts) {
    part.copy(output, writeOffset);
    writeOffset += part.length;
  }

  return output;
}

interface ParsedWavFile extends Omit<ParsedWav, "data"> {
  filePath: string;
  dataStart: number;
  dataSize: number;
}

async function readExact(file: FileHandle, length: number, position: number) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, position);
  if (bytesRead !== length) throw new Error("Invalid WAV audio.");
  return buffer;
}

async function parsePcmWavFile(filePath: string): Promise<ParsedWavFile> {
  const file = await fs.open(filePath, "r");

  try {
    const header = await readExact(file, 12, 0);
    if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WAVE") {
      throw new Error("Only WAV audio can be merged into a final local file.");
    }

    const { size } = await file.stat();
    let offset = 12;
    let fmt: Omit<ParsedWav, "data"> | undefined;
    let dataStart: number | undefined;
    let dataSize: number | undefined;

    while (offset + 8 <= size) {
      const chunkHeader = await readExact(file, 8, offset);
      const id = chunkHeader.toString("ascii", 0, 4);
      const chunkSize = chunkHeader.readUInt32LE(4);
      const chunkDataStart = offset + 8;
      const chunkDataEnd = chunkDataStart + chunkSize;
      if (chunkDataEnd > size) throw new Error("Invalid WAV audio.");

      if (id === "fmt ") {
        if (chunkSize < 16) throw new Error("Invalid WAV fmt chunk.");
        const value = await readExact(file, 16, chunkDataStart);
        fmt = {
          audioFormat: value.readUInt16LE(0),
          channels: value.readUInt16LE(2),
          sampleRate: value.readUInt32LE(4),
          byteRate: value.readUInt32LE(8),
          blockAlign: value.readUInt16LE(12),
          bitsPerSample: value.readUInt16LE(14)
        };
      }

      if (id === "data") {
        dataStart = chunkDataStart;
        dataSize = chunkSize;
        break;
      }

      offset = chunkDataEnd + (chunkSize % 2);
    }

    if (!fmt || dataStart === undefined || dataSize === undefined) throw new Error("Invalid WAV audio.");
    if (fmt.audioFormat !== 1) throw new Error("Only PCM WAV audio can be merged.");

    return { ...fmt, filePath, dataStart, dataSize };
  } finally {
    await file.close();
  }
}

function createPcmWavHeader(wav: Omit<ParsedWav, "data">, dataSize: number) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(wav.audioFormat, 20);
  header.writeUInt16LE(wav.channels, 22);
  header.writeUInt32LE(wav.sampleRate, 24);
  header.writeUInt32LE(wav.byteRate, 28);
  header.writeUInt16LE(wav.blockAlign, 32);
  header.writeUInt16LE(wav.bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return header;
}

async function writePart(output: ReturnType<typeof createWriteStream>, data: Buffer) {
  if (!output.write(data)) {
    await once(output, "drain");
  }
}

export async function mergeWavFiles(filePaths: string[], outputFilePath: string, gapMilliseconds = 180) {
  if (filePaths.length === 0) throw new Error("No WAV audio chunks to merge.");
  if (filePaths.length === 1) {
    await fs.copyFile(filePaths[0], outputFilePath);
    return;
  }

  const parsed: ParsedWavFile[] = [];
  for (const filePath of filePaths) {
    parsed.push(await parsePcmWavFile(filePath));
  }

  const first = parsed[0];
  for (const wav of parsed.slice(1)) {
    const compatible =
      wav.audioFormat === first.audioFormat &&
      wav.channels === first.channels &&
      wav.sampleRate === first.sampleRate &&
      wav.blockAlign === first.blockAlign &&
      wav.bitsPerSample === first.bitsPerSample;

    if (!compatible) {
      throw new Error("Generated WAV chunks have different audio formats and cannot be merged safely.");
    }
  }

  const silenceBytes = Math.floor((first.byteRate * gapMilliseconds) / 1000 / first.blockAlign) * first.blockAlign;
  const dataSize = parsed.reduce((total, wav) => total + wav.dataSize, 0) + silenceBytes * (parsed.length - 1);
  if (dataSize > 0xffffffff - 36) throw new Error("Merged WAV file is too large.");

  const output = createWriteStream(outputFilePath);
  try {
    await writePart(output, createPcmWavHeader(first, dataSize));
    const silence = Buffer.alloc(silenceBytes);

    for (const [index, wav] of parsed.entries()) {
      const input = createReadStream(wav.filePath, {
        start: wav.dataStart,
        end: wav.dataStart + wav.dataSize - 1
      });
      for await (const chunk of input) {
        await writePart(output, chunk as Buffer);
      }
      if (index < parsed.length - 1) {
        await writePart(output, silence);
      }
    }

    output.end();
    await once(output, "finish");
  } catch (error) {
    output.destroy();
    await fs.rm(outputFilePath, { force: true });
    throw error;
  }
}
