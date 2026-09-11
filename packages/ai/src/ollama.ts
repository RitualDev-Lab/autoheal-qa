import type { AIOptions, OllamaGenerateResponse } from "./types.js";

export const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:7b";

/**
 * Checks if a local Ollama server is active and reachable.
 */
export async function isOllamaAvailable(
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
  timeoutMs = 2000,
): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Lists available local models currently downloaded in Ollama.
 */
export async function listLocalModels(
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
  timeoutMs = 3000,
): Promise<string[]> {
  try {
    const res = await fetch(`${endpoint}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

/**
 * Requests an LLM completion from local Ollama with JSON formatting enforced.
 */
export async function generateOllamaCompletion(
  prompt: string,
  options: AIOptions = {},
): Promise<OllamaGenerateResponse> {
  const endpoint = options.endpoint || DEFAULT_OLLAMA_ENDPOINT;
  const model = options.model || DEFAULT_OLLAMA_MODEL;
  const timeoutMs = options.timeoutMs || 25000;
  const temperature = options.temperature ?? 0.1;

  const body = {
    model,
    prompt,
    stream: false,
    format: "json",
    options: {
      temperature,
    },
  };

  const res = await fetch(`${endpoint}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Ollama generation failed with status ${res.status}: ${errText}`);
  }

  const json = (await res.json()) as OllamaGenerateResponse;
  return json;
}
