import fs from "node:fs/promises";
import { ensureDataDirs, idStamp, localIsoString, readMarkdownFiles, safeJoin, jobsDir, outputsDir } from "../file-utils";
import { parseMarkdown, serializeMarkdown, toNumber } from "../markdown-utils";
import type { JobRecord, OutputFormat, VoiceEmotion, VoiceProvider } from "../types";

export function createJobId() {
  return `job_${idStamp()}`;
}

export async function saveJob(record: Omit<JobRecord, "createdAt"> & { createdAt?: string }) {
  await ensureDataDirs();
  const job: JobRecord = {
    ...record,
    createdAt: record.createdAt || localIsoString()
  };
  const markdown = serializeMarkdown(
    {
      id: job.id,
      scriptId: job.scriptId,
      title: job.title,
      provider: job.provider,
      format: job.format,
      speed: job.speed,
      emotion: job.emotion,
      status: job.status,
      audioFile: job.audioFile,
      error: job.error,
      createdAt: job.createdAt
    },
    job.content
  );

  await fs.writeFile(safeJoin(jobsDir, `${job.id}.md`), markdown, "utf8");
  return job;
}

export async function listJobs(limit = 20) {
  const files = await readMarkdownFiles(jobsDir);
  return files
    .map(({ content }) => {
      const parsed = parseMarkdown(content);
      return {
        id: parsed.frontmatter.id || "",
        scriptId: parsed.frontmatter.scriptId || "",
        title: parsed.frontmatter.title || "Untitled Script",
        provider: (parsed.frontmatter.provider || "mock") as VoiceProvider,
        format: (parsed.frontmatter.format || "wav") as OutputFormat,
        speed: toNumber(parsed.frontmatter.speed, 1),
        emotion: (parsed.frontmatter.emotion || "neutral") as VoiceEmotion,
        status: parsed.frontmatter.status === "failed" ? "failed" : "completed",
        audioFile: parsed.frontmatter.audioFile,
        error: parsed.frontmatter.error,
        createdAt: parsed.frontmatter.createdAt || "",
        content: parsed.body
      } satisfies JobRecord;
    })
    .filter((job) => job.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function deleteJob(jobId: string) {
  await ensureDataDirs();

  if (!/^job_[a-zA-Z0-9_-]+$/.test(jobId)) {
    throw new Error("Invalid job id");
  }

  const jobFilePath = safeJoin(jobsDir, `${jobId}.md`);
  const markdown = await fs.readFile(jobFilePath, "utf8");
  const parsed = parseMarkdown(markdown);
  const audioFile = parsed.frontmatter.audioFile;

  await fs.unlink(jobFilePath);

  let audioDeleted = false;
  if (audioFile) {
    try {
      await fs.unlink(safeJoin(outputsDir, audioFile));
      audioDeleted = true;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }

  return {
    jobId,
    audioFile,
    audioDeleted
  };
}
