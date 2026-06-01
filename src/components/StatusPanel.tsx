"use client";

import { CheckCircle2, Loader2, Radio, XCircle } from "lucide-react";

export type StudioStatus = "idle" | "saving" | "generating" | "completed" | "failed";

interface StatusPanelProps {
  status: StudioStatus;
  error?: string;
}

const labels: Record<StudioStatus, string> = {
  idle: "Idle",
  saving: "Saving script",
  generating: "Generating audio",
  completed: "Completed",
  failed: "Failed"
};

export function StatusPanel({ status, error }: StatusPanelProps) {
  const Icon = status === "completed" ? CheckCircle2 : status === "failed" ? XCircle : status === "idle" ? Radio : Loader2;

  return (
    <section className="studio-card-bg rounded-[2.2rem] border border-white/10 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
            <Icon size={19} className={status === "saving" || status === "generating" ? "animate-spin" : ""} />
          </div>
          <h2 className="text-lg font-semibold text-studio-text">Status</h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            status === "completed"
              ? "bg-emerald-400/15 text-emerald-800"
              : status === "failed"
                ? "bg-red-400/15 text-red-700"
                : "bg-studio-border text-studio-muted"
          }`}
        >
          {labels[status]}
        </span>
      </div>
      <p className="mt-3 text-sm text-studio-muted">
        {status === "idle" && "Waiting for a valid script."}
        {status === "saving" && "Writing Markdown files into local storage."}
        {status === "generating" && "Generating audio through the selected provider."}
        {status === "completed" && "Audio is ready for preview and download."}
        {status === "failed" && (error || "Something went wrong.")}
      </p>
    </section>
  );
}
