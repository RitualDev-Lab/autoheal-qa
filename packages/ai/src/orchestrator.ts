import { type HarvestedFailureContext, HeuristicEngine } from "@autoheal/core";
import { DEFAULT_OLLAMA_ENDPOINT, generateOllamaCompletion, isOllamaAvailable } from "./ollama.js";
import { parseAIHealingResponse } from "./parser.js";
import { buildHealingPrompt } from "./prompt.js";
import type { AIHealingResult, OrchestratorOptions } from "./types.js";

/**
 * Evaluates a test failure and heals broken locators using the optimal strategy.
 */
export async function healLocator(
  failure: HarvestedFailureContext,
  options: OrchestratorOptions = {},
): Promise<AIHealingResult | null> {
  const startTime = Date.now();
  const fastThreshold = options.heuristicFastThreshold ?? 0.85;
  const forceStrategy = options.forceStrategy;
  const endpoint = options.aiOptions?.endpoint || DEFAULT_OLLAMA_ENDPOINT;

  const candidates = failure.snapshot?.interactiveElements || [];

  // Step 1: Run deterministic Heuristic Engine ($0 AI)
  const heuristicMatches = HeuristicEngine.findCandidates(
    failure.brokenLocator,
    failure.action,
    candidates,
  );
  const topHeuristic = heuristicMatches.length > 0 ? heuristicMatches[0] : null;

  // Tier 1: Fast Heuristic Bypass (if confidence >= 0.85 and not forced to ollama)
  if (forceStrategy !== "ollama" && topHeuristic && topHeuristic.confidence >= fastThreshold) {
    return {
      healedLocator: topHeuristic.suggestedLocator,
      confidence: topHeuristic.confidence,
      strategy: "heuristic",
      explanation: topHeuristic.matchReason,
      durationMs: Date.now() - startTime,
    };
  }

  // If forced to heuristic, return best match or null
  if (forceStrategy === "heuristic") {
    if (!topHeuristic) return null;
    return {
      healedLocator: topHeuristic.suggestedLocator,
      confidence: topHeuristic.confidence,
      strategy: "heuristic",
      explanation: topHeuristic.matchReason,
      durationMs: Date.now() - startTime,
    };
  }

  // Tier 2: Invoke Local Ollama if available
  const ollamaOnline = await isOllamaAvailable(endpoint, 1500);

  if (ollamaOnline) {
    try {
      const prompt = buildHealingPrompt({
        brokenLocator: failure.brokenLocator,
        action: failure.action,
        failureType: failure.failureType,
        rawErrorMessage: failure.rawErrorMessage,
        candidates,
        prunedDom: failure.snapshot?.prunedDom,
      });

      const completion = await generateOllamaCompletion(prompt, options.aiOptions);
      const parsed = parseAIHealingResponse(completion.response);

      if (parsed?.suggestedLocator) {
        return {
          healedLocator: parsed.suggestedLocator,
          confidence: parsed.confidence,
          strategy: "ollama",
          explanation: parsed.explanation,
          modelUsed: completion.model,
          durationMs: Date.now() - startTime,
        };
      }
    } catch {
      // Fall through to Tier 3 on generation error
    }
  }

  // Tier 3: Graceful Degradation to best heuristic candidate
  if (topHeuristic) {
    const fallbackSuffix = ollamaOnline
      ? " (Ollama fallback)"
      : " (Ollama offline, heuristic fallback)";

    return {
      healedLocator: topHeuristic.suggestedLocator,
      confidence: topHeuristic.confidence,
      strategy: "heuristic",
      explanation: `${topHeuristic.matchReason}${fallbackSuffix}`,
      durationMs: Date.now() - startTime,
    };
  }

  return null;
}

/**
 * Multi-tiered Healing Orchestrator coordinating deterministic heuristics ($0)
 * and local open-source LLMs via Ollama ($0).
 */
export const HealingOrchestrator = {
  healLocator,
};
