import { NextResponse } from "next/server";
import { z } from "zod";
import {
  OPENROUTER_REWRITE_MODELS,
  type OpenRouterRewriteModel
} from "@/lib/script-rewrite";
import { MAX_SCRIPT_CHARACTERS } from "@/lib/script-limits";
import { getOpenRouterApiKey } from "@/lib/storage/env-store";

export const runtime = "nodejs";

const requestSchema = z.object({
  title: z.string().trim().max(100).optional().or(z.literal("")),
  script: z
    .string()
    .trim()
    .min(10, "Script must be at least 10 characters")
    .max(MAX_SCRIPT_CHARACTERS, `Script must be ${MAX_SCRIPT_CHARACTERS.toLocaleString()} characters or fewer`),
  model: z.enum(OPENROUTER_REWRITE_MODELS.map((item) => item.id) as [OpenRouterRewriteModel, ...OpenRouterRewriteModel[]]),
  keepBurmese: z.boolean().optional()
});

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

class OpenRouterTimeoutError extends Error {
  constructor() {
    super("OpenRouter request timed out.");
    this.name = "OpenRouterTimeoutError";
  }
}

function getOpenRouterRequestTimeout() {
  const parsed = Number(process.env.OPENROUTER_REQUEST_TIMEOUT || 60000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60000;
}

async function fetchOpenRouterWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getOpenRouterRequestTimeout());

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenRouterTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(input: z.infer<typeof requestSchema>) {
  const languageInstruction = input.keepBurmese ?? true
    ? "Keep the rewritten script in Burmese/Myanmar language. Do not translate it into English."
    : "Keep the original language unless the text clearly asks for another language.";

  return [
    "You are a senior narration script editor for a professional voice-over studio.",
    "Convert the user's original script into a narration-ready reading script.",
    languageInstruction,
    "Do not change the story, category, facts, names, numbers, claims, message, or intent.",
    "Do not add documentary, warm story, brand, social, or any other separate style category.",
    "Do not add headings, markdown, bullet points, explanations, scene labels, speaker labels, or bracketed directions that a TTS engine might read aloud.",
    "Only polish it for spoken delivery: add natural pauses using punctuation, short sentence breaks, ellipses where useful, smoother breath points, and clearer emphasis through wording and rhythm.",
    "Use punctuation and line breaks to suggest voice rise/fall and pacing. Keep the output clean enough to paste directly into a TTS voice-over generator.",
    "Avoid making it much longer than the original. Output only the final narration-ready script.",
    input.title ? `Title context: ${input.title}` : "",
    "Original script:",
    input.script
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function callOpenRouter(input: z.infer<typeof requestSchema>) {
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        status: "failed",
        error: "OpenRouter API key is not configured.",
        message: "Add OPENROUTER_API_KEY to .env.local, then restart the app."
      },
      { status: 503 }
    );
  }

  const response = await fetchOpenRouterWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Thalika Voice Clone"
    },
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: "user", content: buildPrompt(input) }],
      temperature: 0.45,
      top_p: 0.9,
      max_tokens: 8192
    })
  });

  let json: OpenRouterResponse;
  try {
    json = (await response.json()) as OpenRouterResponse;
  } catch {
    return NextResponse.json(
      { status: "failed", error: "Invalid OpenRouter response.", message: "OpenRouter returned a response the app could not parse." },
      { status: 502 }
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        status: "failed",
        error: "OpenRouter script rewrite failed.",
        message: json.error?.message || "OpenRouter returned an error."
      },
      { status: response.status }
    );
  }

  const rewrittenScript = json.choices?.[0]?.message?.content?.trim();
  if (!rewrittenScript) {
    return NextResponse.json(
      {
        status: "failed",
        error: "OpenRouter returned an empty rewrite.",
        message: "Try a different model or shorten the script."
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    status: "completed",
    title: input.title || "Narration Rewrite",
    originalCharacterCount: input.script.length,
    rewrittenCharacterCount: rewrittenScript.length,
    model: input.model,
    rewrittenScript
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "failed", error: "Invalid JSON request body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "failed", error: parsed.error.issues.map((issue) => issue.message).join(". ") },
      { status: 400 }
    );
  }

  try {
    return await callOpenRouter(parsed.data);
  } catch (error) {
    if (error instanceof OpenRouterTimeoutError) {
      return NextResponse.json(
        {
          status: "failed",
          error: "OpenRouter script rewrite timed out.",
          message: "OpenRouter took too long to respond. Try a shorter script or increase OPENROUTER_REQUEST_TIMEOUT."
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        status: "failed",
        error: "OpenRouter script rewrite failed.",
        message: error instanceof Error ? error.message : "Could not rewrite the script."
      },
      { status: 500 }
    );
  }
}
