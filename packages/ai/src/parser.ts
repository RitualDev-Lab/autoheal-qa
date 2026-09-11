import type { ParsedAIHealingPayload } from "./types.js";

/**
 * Resiliently parses and validates JSON output from LLM responses.
 * Handles markdown code fences and extraneous text.
 */
export function parseAIHealingResponse(raw: string): ParsedAIHealingPayload | null {
  if (!raw || typeof raw !== "string") return null;

  let cleaned = raw.trim();

  // Strip markdown code fences if present
  if (cleaned.includes("```")) {
    const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) {
      cleaned = match[1].trim();
    }
  }

  // Extract outermost JSON object if surrounded by chat prose
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") return null;

    const suggestedLocator =
      typeof parsed.suggestedLocator === "string" ? parsed.suggestedLocator.trim() : "";
    if (!suggestedLocator) return null;

    let confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.8;
    // Normalize percentage if LLM output e.g. 95 instead of 0.95
    if (confidence > 1.0 && confidence <= 100) {
      confidence = confidence / 100;
    }
    confidence = Math.min(1.0, Math.max(0.0, Math.round(confidence * 100) / 100));

    const explanation =
      typeof parsed.explanation === "string"
        ? parsed.explanation.trim()
        : "AI identified matching candidate element";

    return {
      suggestedLocator,
      confidence,
      explanation,
    };
  } catch {
    return null;
  }
}
