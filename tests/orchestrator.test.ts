import { afterEach, describe, expect, it, vi } from "vitest";
import { HealingOrchestrator } from "../packages/ai/src/orchestrator.js";
import type { HarvestedFailureContext } from "../packages/core/src/snapshot/types.js";

describe("Healing Orchestrator ($0 AI Multi-Tier)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const highConfidenceFailure: HarvestedFailureContext = {
    id: "fail-1",
    testTitle: "Checkout test",
    durationMs: 1200,
    timestamp: new Date().toISOString(),
    brokenLocator: "page.getByRole('button', { name: 'Submit' })",
    action: "click",
    failureType: "TIMEOUT",
    rawErrorMessage: "Locator timeout waiting for locator",
    snapshot: {
      url: "http://localhost:3000",
      title: "Store",
      timestamp: new Date().toISOString(),
      prunedDom: "<button>Submit Application</button>",
      interactiveElements: [
        {
          id: "btn-1",
          tag: "button",
          role: "button",
          name: "Submit Application",
          text: "Submit Application",
          attributes: {},
          locators: ["page.getByRole('button', { name: 'Submit Application' })"],
        },
      ],
    },
  };

  it("Tier 1: Uses fast heuristic bypass for high-confidence candidate", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const result = await HealingOrchestrator.healLocator(highConfidenceFailure, {
      heuristicFastThreshold: 0.8,
    });

    expect(result).not.toBeNull();
    expect(result?.strategy).toBe("heuristic");
    expect(result?.healedLocator).toBe("page.getByRole('button', { name: 'Submit Application' })");
    expect(result?.confidence).toBeGreaterThanOrEqual(0.8);
    // Ollama fetch should NOT have been called because heuristic was fast and high confidence
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Tier 2: Invokes Ollama when forced or heuristic confidence is below threshold", async () => {
    // Mock Ollama available and returns completion
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/tags")) {
        return { ok: true, status: 200 } as Response;
      }
      if (url.includes("/api/generate")) {
        return {
          ok: true,
          json: async () => ({
            model: "qwen2.5-coder:7b",
            response: JSON.stringify({
              suggestedLocator: "page.getByRole('button', { name: 'Submit Application' })",
              confidence: 0.95,
              explanation: "AI resolved button from semantic context",
            }),
            done: true,
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    const result = await HealingOrchestrator.healLocator(highConfidenceFailure, {
      forceStrategy: "ollama",
    });

    expect(result).not.toBeNull();
    expect(result?.strategy).toBe("ollama");
    expect(result?.confidence).toBe(0.95);
    expect(result?.modelUsed).toBe("qwen2.5-coder:7b");
    expect(result?.explanation).toContain("AI resolved");
  });

  it("Tier 3: Gracefully falls back to heuristic candidate when Ollama is offline", async () => {
    // Mock Ollama offline (fetch throws ECONNREFUSED)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await HealingOrchestrator.healLocator(highConfidenceFailure, {
      heuristicFastThreshold: 0.99, // artificially high to test fallback
    });

    expect(result).not.toBeNull();
    expect(result?.strategy).toBe("heuristic");
    expect(result?.explanation).toContain("Ollama offline");
  });
});
