import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateOllamaCompletion,
  isOllamaAvailable,
  listLocalModels,
} from "../packages/ai/src/ollama.js";

describe("Ollama Client", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("reports true when Ollama server is running", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    const available = await isOllamaAvailable("http://127.0.0.1:11434");
    expect(available).toBe(true);
  });

  it("reports false when Ollama server is unreachable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const available = await isOllamaAvailable("http://127.0.0.1:11434");
    expect(available).toBe(false);
  });

  it("lists local models from /api/tags", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: "qwen2.5-coder:7b" }, { name: "llama3.2:latest" }],
      }),
    } as Response);

    const models = await listLocalModels();
    expect(models).toEqual(["qwen2.5-coder:7b", "llama3.2:latest"]);
  });

  it("generates completion sending correct JSON payload", async () => {
    let capturedBody: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        json: async () => ({
          model: "qwen2.5-coder:7b",
          response: '{"suggestedLocator": "page.getByRole(\'button\')", "confidence": 0.9}',
          done: true,
        }),
      } as Response;
    });

    const result = await generateOllamaCompletion("Test prompt", {
      model: "qwen2.5-coder:7b",
      temperature: 0.2,
    });

    expect(capturedBody.model).toBe("qwen2.5-coder:7b");
    expect(capturedBody.format).toBe("json");
    expect(capturedBody.options.temperature).toBe(0.2);
    expect(result.model).toBe("qwen2.5-coder:7b");
    expect(result.done).toBe(true);
  });
});
