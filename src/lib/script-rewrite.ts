export const OPENROUTER_REWRITE_MODELS = [
  { id: "openrouter/free", label: "OpenRouter Free Auto" },
  { id: "qwen/qwen3-32b:free", label: "Qwen3 32B Free" },
  { id: "deepseek/deepseek-chat-v3.1:free", label: "DeepSeek V3.1 Free" }
] as const;

export type OpenRouterRewriteModel = (typeof OPENROUTER_REWRITE_MODELS)[number]["id"];
