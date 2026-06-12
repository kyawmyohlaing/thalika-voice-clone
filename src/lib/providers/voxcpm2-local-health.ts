import { fetchWithTimeout, getHFRequestTimeout, readJsonResponse, TimeoutError } from "./hf-utils";
import { getLocalVoxCPM2BaseUrl } from "./voxcpm2-local-provider";

export type LocalVoxCPM2HealthStatus = "connected" | "timeout" | "rate_limited" | "unavailable" | "invalid_response";

export interface LocalVoxCPM2Health {
  provider: "voxcpm2_local";
  backend: "local-http";
  ok: boolean;
  status: LocalVoxCPM2HealthStatus;
  baseUrl: string;
  endpoint: string;
  latencyMs: number;
  timeoutMs: number;
  message: string;
  checkedAt: string;
}

function makeHealth(
  status: LocalVoxCPM2HealthStatus,
  options: {
    baseUrl: string;
    endpoint: string;
    latencyMs: number;
    message: string;
  }
): LocalVoxCPM2Health {
  return {
    provider: "voxcpm2_local",
    backend: "local-http",
    ok: status === "connected",
    status,
    baseUrl: options.baseUrl,
    endpoint: options.endpoint,
    latencyMs: options.latencyMs,
    timeoutMs: getHFRequestTimeout(),
    message: options.message,
    checkedAt: new Date().toISOString()
  };
}

export async function checkLocalVoxCPM2Health(): Promise<LocalVoxCPM2Health> {
  const baseUrl = getLocalVoxCPM2BaseUrl();
  if (!baseUrl) {
    return makeHealth("unavailable", {
      baseUrl: "",
      endpoint: "/info",
      latencyMs: 0,
      message: "VOXCPM_LOCAL_API_URL is not configured."
    });
  }

  const endpoint = "/info";
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(`${baseUrl}${endpoint}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    const latencyMs = Date.now() - startedAt;

    if (response.status === 429) {
      return makeHealth("rate_limited", {
        baseUrl,
        endpoint,
        latencyMs,
        message: "Local VoxCPM2 API is busy or rate limited."
      });
    }

    if (!response.ok) {
      return makeHealth("unavailable", {
        baseUrl,
        endpoint,
        latencyMs,
        message: `Local VoxCPM2 API returned HTTP ${response.status}.`
      });
    }

    const info = await readJsonResponse<{ model_loaded?: boolean; device?: string }>(
      response,
      "Invalid response from Local VoxCPM2 API."
    ).catch(() => undefined);

    const detail = info?.model_loaded
      ? "Model is loaded."
      : "Model is not loaded yet; the first generation or /load request may take several minutes.";

    return makeHealth("connected", {
      baseUrl,
      endpoint,
      latencyMs,
      message: `Local VoxCPM2 API is connected. ${detail}${info?.device ? ` Device: ${info.device}.` : ""}`
    });
  } catch (error) {
    if (error instanceof TimeoutError) {
      return makeHealth("timeout", {
        baseUrl,
        endpoint,
        latencyMs: getHFRequestTimeout(),
        message: "Local VoxCPM2 API timed out."
      });
    }

    return makeHealth("unavailable", {
      baseUrl,
      endpoint,
      latencyMs: 0,
      message: "Local VoxCPM2 API is unavailable."
    });
  }
}
