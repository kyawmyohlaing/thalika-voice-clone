"use client";

import { Clock3, Download, ExternalLink, Pause, Play, Trash2, Volume2 } from "lucide-react";
import { useRef, useState } from "react";

interface HistoryJob {
  id: string;
  title: string;
  provider: string;
  emotion: string;
  format: string;
  createdAt: string;
  audioFile?: string;
  status: string;
}

interface HistoryPanelProps {
  jobs: HistoryJob[];
  deletingJobId?: string;
  onDelete: (job: HistoryJob) => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function HistoryAudioPlayer({ filename }: { filename: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioUrl = `/api/audio/${filename}`;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      await audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;
    const nextTime = (value / 100) * duration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function changePlaybackRate(value: number) {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = value;
    setPlaybackRate(value);
  }

  return (
    <div className="studio-control-bg rounded-[1.6rem] border border-white/10 p-3">
      <audio
        ref={audioRef}
        preload="metadata"
        src={audioUrl}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="grid gap-3">
        <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlayback}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[1.2rem] bg-studio-accent text-white transition hover:bg-emerald-700"
          aria-label={isPlaying ? "Pause audio" : "Play audio"}
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-3 text-xs text-studio-muted">
            <span className="inline-flex min-w-0 items-center gap-2 text-studio-accent">
              <Volume2 size={14} className="shrink-0" />
              <span>Voice over</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={(event) => seek(Number(event.target.value))}
            className="h-2 w-full accent-studio-accent"
            aria-label={`Seek ${filename}`}
          />
        </div>
      </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pl-0 sm:pl-[52px]">
        <div className="studio-soft-chip-bg flex rounded-full border border-white/10 p-1">
          {[0.8, 1, 1.2].map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => changePlaybackRate(rate)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                playbackRate === rate ? "bg-studio-accent text-white" : "text-studio-muted hover:text-studio-text"
              }`}
            >
              {rate.toFixed(1)}x
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <a
            href={audioUrl}
            download={filename}
            className="studio-soft-chip-bg inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-studio-text transition hover:border-studio-accent"
          >
            <Download size={14} />
            Download
          </a>
          <a
            href={audioUrl}
            target="_blank"
            rel="noreferrer"
            className="studio-soft-chip-bg inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-studio-text transition hover:border-studio-accent"
          >
            <ExternalLink size={14} />
            Open
          </a>
        </div>
      </div>
      </div>
    </div>
  );
}

export function HistoryPanel({ jobs, deletingJobId, onDelete }: HistoryPanelProps) {
  return (
    <section className="studio-card-bg rounded-[2.2rem] border border-white/10 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
            <Clock3 size={19} />
          </div>
          <h2 className="text-lg font-semibold text-studio-text">History</h2>
        </div>
        <span className="studio-soft-chip-bg rounded-full border border-white/10 px-3 py-1 text-sm text-studio-muted">{jobs.length} recent</span>
      </div>
      <div className="grid gap-3">
        {jobs.length === 0 && <p className="text-sm text-studio-muted">Generated jobs will appear here.</p>}
        {jobs.map((job) => (
          <article key={job.id} className="studio-nested-card-bg grid gap-4 rounded-[1.85rem] border border-white/10 p-4 lg:grid-cols-[minmax(220px,0.36fr)_minmax(0,0.64fr)] lg:items-center">
            <div className="grid gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-studio-text">{job.title}</h3>
                <p className="mt-1 text-xs text-studio-muted">{job.createdAt}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-studio-muted">
                <span className="studio-soft-chip-bg rounded-full border border-white/10 px-2 py-1">{job.provider}</span>
                <span className="studio-soft-chip-bg rounded-full border border-white/10 px-2 py-1">{job.emotion}</span>
                <span className="studio-soft-chip-bg rounded-full border border-white/10 px-2 py-1">{job.format}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-studio-border px-2 py-1 text-xs text-studio-muted">
                  {job.status}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(job)}
                  disabled={deletingJobId === job.id}
                  className="inline-flex items-center gap-1 rounded-full border border-red-300/50 px-2 py-1 text-xs font-semibold text-red-600 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Delete ${job.title}`}
                >
                  <Trash2 size={13} />
                  {deletingJobId === job.id ? "Deleting" : "Delete"}
                </button>
              </div>
            </div>
            {job.audioFile && <HistoryAudioPlayer filename={job.audioFile} />}
          </article>
        ))}
      </div>
    </section>
  );
}
