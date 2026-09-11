import type { CandidateElement } from "../snapshot/types.js";
import type { TargetAction } from "../types.js";
import { evaluateActionCompatibility } from "./action-compatibility.js";
import { parseLocator } from "./locator-parser.js";
import {
  computeStringSimilarity,
  normalizeIdentifier,
  tokenSetSimilarity,
} from "./string-similarity.js";
import type {
  HeuristicEngineOptions,
  HeuristicMatch,
  ParsedLocator,
  ScoreBreakdown,
} from "./types.js";

/**
 * Calculates role compatibility between requested locator role and candidate element.
 */
function calculateRoleMatch(parsed: ParsedLocator, candidate: CandidateElement): number {
  if (!parsed.role) return 0.8; // neutral if role wasn't explicitly tested

  const targetRole = parsed.role.toLowerCase();
  const candRole = (candidate.role || "").toLowerCase();
  const candTag = candidate.tag.toLowerCase();

  // Exact match
  if (candRole === targetRole) return 1.0;

  // Semantic equivalents
  if (targetRole === "button") {
    if (candTag === "button") return 1.0;
    if (candTag === "input" && ["submit", "button", "reset"].includes(candidate.inputType || "")) {
      return 1.0;
    }
    if (candRole === "link" || candTag === "a") return 0.65;
    if (["menuitem", "tab"].includes(candRole)) return 0.6;
    return 0.1;
  }

  if (targetRole === "textbox") {
    if (candTag === "textarea") return 1.0;
    if (
      candTag === "input" &&
      ["text", "email", "password", "search", "url"].includes(candidate.inputType || "")
    ) {
      return 1.0;
    }
    if (candRole === "searchbox") return 0.9;
    return 0.1;
  }

  if (targetRole === "checkbox") {
    if (candTag === "input" && candidate.inputType === "checkbox") return 1.0;
    if (candRole === "switch") return 0.85;
    return 0.1;
  }

  if (targetRole === "link") {
    if (candTag === "a" || candRole === "link") return 1.0;
    if (candTag === "button" || candRole === "button") return 0.6;
    return 0.1;
  }

  if (targetRole === "combobox") {
    if (candTag === "select" || candRole === "listbox") return 1.0;
    return 0.2;
  }

  return 0.2;
}

/**
 * Calculates string similarity between target locator and candidate element.
 */
function calculateStringSimilarity(
  parsed: ParsedLocator,
  candidate: CandidateElement,
): { similarity: number; targetMatched: string; candMatched: string } {
  let targetStr = "";

  if (parsed.type === "role" && parsed.name) {
    targetStr = parsed.name;
  } else if (parsed.type === "testid" && parsed.value) {
    targetStr = parsed.value;
  } else if (parsed.type === "placeholder" && parsed.value) {
    targetStr = parsed.value;
  } else if ((parsed.type === "text" || parsed.type === "label") && parsed.value) {
    targetStr = parsed.value;
  } else if (parsed.type === "css") {
    targetStr = parsed.value || parsed.name || parsed.selector || "";
  } else {
    targetStr = parsed.raw;
  }

  // Candidate comparison pool
  const candidatePool: Array<{ label: string; text: string }> = [];

  if (parsed.type === "testid") {
    if (candidate.testId) candidatePool.push({ label: "testId", text: candidate.testId });
    if (candidate.attributes.id) candidatePool.push({ label: "id", text: candidate.attributes.id });
    if (candidate.attributes.name)
      candidatePool.push({ label: "name", text: candidate.attributes.name });
  } else if (parsed.type === "placeholder") {
    if (candidate.placeholder)
      candidatePool.push({ label: "placeholder", text: candidate.placeholder });
    if (candidate.attributes["aria-label"])
      candidatePool.push({ label: "aria-label", text: candidate.attributes["aria-label"] });
    if (candidate.name) candidatePool.push({ label: "name", text: candidate.name });
  } else {
    if (candidate.name) candidatePool.push({ label: "name", text: candidate.name });
    if (candidate.text) candidatePool.push({ label: "text", text: candidate.text });
    if (candidate.placeholder)
      candidatePool.push({ label: "placeholder", text: candidate.placeholder });
    if (candidate.attributes["aria-label"])
      candidatePool.push({ label: "aria-label", text: candidate.attributes["aria-label"] });
    if (candidate.attributes.title)
      candidatePool.push({ label: "title", text: candidate.attributes.title });
    if (candidate.testId) candidatePool.push({ label: "testId", text: candidate.testId });
  }

  if (candidatePool.length === 0) {
    return { similarity: 0.0, targetMatched: targetStr, candMatched: "" };
  }

  let bestScore = 0.0;
  let bestCandidateStr = "";

  for (const item of candidatePool) {
    const score = computeStringSimilarity(targetStr, item.text);
    if (score > bestScore) {
      bestScore = score;
      bestCandidateStr = `${item.label} "${item.text}"`;
    }
  }

  return {
    similarity: Math.round(bestScore * 100) / 100,
    targetMatched: targetStr,
    candMatched: bestCandidateStr,
  };
}

/**
 * Calculates attribute overlap (id, name, data-testid, etc.).
 */
function calculateAttributeMatch(parsed: ParsedLocator, candidate: CandidateElement): number {
  const targetText = parsed.value || parsed.name || parsed.selector || "";
  const targetTokens = normalizeIdentifier(targetText);

  if (targetTokens.length === 0) return 0.5;

  const candAttrText = [
    candidate.testId,
    candidate.attributes.id,
    candidate.attributes.name,
    candidate.attributes["aria-label"],
  ]
    .filter(Boolean)
    .join(" ");

  if (!candAttrText) return 0.2;

  return tokenSetSimilarity(targetTokens.join(" "), candAttrText);
}

/**
 * Selects the most appropriate locator from the candidate element's available locators.
 */
function pickSuggestedLocator(parsed: ParsedLocator, candidate: CandidateElement): string {
  if (candidate.locators.length === 0) {
    return `page.locator('${candidate.tag}')`;
  }

  // If user used getByRole, prefer getByRole
  if (parsed.type === "role") {
    const roleLoc = candidate.locators.find((l) => l.includes("getByRole"));
    if (roleLoc) return roleLoc;
  }

  // If user used getByTestId, prefer getByTestId
  if (parsed.type === "testid") {
    const testIdLoc = candidate.locators.find((l) => l.includes("getByTestId"));
    if (testIdLoc) return testIdLoc;
  }

  // If user used getByPlaceholder, prefer getByPlaceholder
  if (parsed.type === "placeholder") {
    const phLoc = candidate.locators.find((l) => l.includes("getByPlaceholder"));
    if (phLoc) return phLoc;
  }

  // If user used getByLabel, prefer getByLabel
  if (parsed.type === "label") {
    const labelLoc = candidate.locators.find((l) => l.includes("getByLabel"));
    if (labelLoc) return labelLoc;
  }

  // Default: First locator is already ranked highest priority in element extractor
  return candidate.locators[0];
}

/**
 * Generates an explanatory human-readable reason for the match.
 */
function generateMatchReason(
  parsed: ParsedLocator,
  breakdown: ScoreBreakdown,
  targetMatched: string,
  candMatched: string,
  confidence: number,
): string {
  const confPct = Math.round(confidence * 100);

  if (parsed.type === "testid" && breakdown.stringSimilarity >= 0.7) {
    return `Test-ID migration detected (${confPct}% confidence): "${targetMatched}" matched with ${candMatched}`;
  }

  if (parsed.type === "role") {
    if (breakdown.roleMatch >= 0.9 && breakdown.stringSimilarity >= 0.7) {
      return `Matching ${parsed.role} with ${Math.round(breakdown.stringSimilarity * 100)}% text similarity to ${candMatched}`;
    }
    if (breakdown.stringSimilarity >= 0.8) {
      return `Strong text match (${Math.round(breakdown.stringSimilarity * 100)}%) on ${candMatched}`;
    }
  }

  if (breakdown.stringSimilarity >= 0.85) {
    return `High semantic similarity (${Math.round(breakdown.stringSimilarity * 100)}%): "${targetMatched}" -> ${candMatched}`;
  }

  return `Candidate matched with ${confPct}% overall confidence`;
}

/**
 * Deterministic Candidate Heuristic Engine ($0 AI).
 * Analyzes broken Playwright locators alongside harvested live page candidates to discover
 * and rank replacement locators with zero network latency and $0 cost.
 */
/**
 * Finds and ranks candidate locator replacements.
 */
export function findCandidates(
  brokenLocator: string,
  action: TargetAction,
  candidates: CandidateElement[],
  options: HeuristicEngineOptions = {},
): HeuristicMatch[] {
  const minConfidence = options.minConfidence ?? 0.55;
  const maxCandidates = options.maxCandidates ?? 5;

  const parsed = parseLocator(brokenLocator);
  const matches: HeuristicMatch[] = [];

  for (const candidate of candidates) {
    const roleMatch = calculateRoleMatch(parsed, candidate);
    const actionComp = evaluateActionCompatibility(action, candidate);
    const {
      similarity: strSim,
      targetMatched,
      candMatched,
    } = calculateStringSimilarity(parsed, candidate);
    const attrMatch = calculateAttributeMatch(parsed, candidate);

    // Weight assignments based on locator type
    let simWeight = 0.45;
    let roleWeight = 0.25;
    let actionWeight = 0.15;
    let attrWeight = 0.15;

    if (parsed.type === "testid") {
      simWeight = 0.55;
      roleWeight = 0.15;
      actionWeight = 0.15;
      attrWeight = 0.15;
    } else if (parsed.type === "placeholder" || parsed.type === "label") {
      simWeight = 0.5;
      roleWeight = 0.2;
      actionWeight = 0.15;
      attrWeight = 0.15;
    }

    // Hard penalty: If action is completely incompatible (e.g. fill on a button), drastically lower confidence
    const actionPenalty = actionComp < 0.2 ? 0.3 : 1.0;

    const rawScore =
      (strSim * simWeight +
        roleMatch * roleWeight +
        actionComp * actionWeight +
        attrMatch * attrWeight) *
      actionPenalty;

    const confidence = Math.min(1.0, Math.max(0.0, Math.round(rawScore * 100) / 100));

    if (confidence >= minConfidence) {
      const breakdown: ScoreBreakdown = {
        stringSimilarity: strSim,
        roleMatch: Math.round(roleMatch * 100) / 100,
        actionCompatibility: Math.round(actionComp * 100) / 100,
        attributeMatch: Math.round(attrMatch * 100) / 100,
      };

      const suggestedLocator = pickSuggestedLocator(parsed, candidate);
      const matchReason = generateMatchReason(
        parsed,
        breakdown,
        targetMatched,
        candMatched,
        confidence,
      );

      matches.push({
        candidate,
        suggestedLocator,
        confidence,
        matchReason,
        breakdown,
      });
    }
  }

  // Sort descending by confidence
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches.slice(0, maxCandidates);
}

/**
 * Deterministic Candidate Heuristic Engine ($0 AI).
 * Analyzes broken Playwright locators alongside harvested live page candidates to discover
 * and rank replacement locators with zero network latency and $0 cost.
 */
export const HeuristicEngine = {
  findCandidates,
};
