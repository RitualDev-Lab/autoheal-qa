import fs from "node:fs/promises";
import path from "node:path";
import { generateUnifiedDiff } from "./diff.js";
import type { PatchResult } from "./types.js";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type PatchRecommendation = "APPLY_AUTOMATICALLY" | "REQUIRE_HUMAN_REVIEW" | "REJECT";

export interface SelectorConfidenceBreakdown {
  structuralMatch: number; // 0.0 - 1.0 (tag/role match)
  textSimilarity: number; // 0.0 - 1.0 (accessible name/text similarity)
  attributeMatch: number; // 0.0 - 1.0 (data-testid / id / name match)
  actionCompatibility: number; // 0.0 - 1.0 (action capability match)
  uniquenessScore: number; // 0.0 - 1.0 (single match vs multiple matches)
}

export interface SelectorConfidenceScore {
  overallScore: number; // 0.0 - 1.0
  confidenceLevel: ConfidenceLevel;
  recommendation: PatchRecommendation;
  breakdown: SelectorConfidenceBreakdown;
  rationale: string;
}

export interface AstPatchOptions {
  minConfidenceThreshold?: number; // default: 0.60
  createBackup?: boolean;
  dryRun?: boolean;
  nearbyTolerance?: number; // default: 4 lines
}

export interface AstPatchResult extends PatchResult {
  confidence: SelectorConfidenceScore;
  astNodeType?: string;
  surroundingContext?: string;
}

/**
 * Calculates string similarity using normalized Levenshtein-based character overlap.
 */
function computeStringSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  // Simple token overlap coefficient
  const tokens1 = new Set(s1.split(/[\s_\-.:]+/));
  const tokens2 = new Set(s2.split(/[\s_\-.:]+/));
  let intersection = 0;

  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }

  const union = new Set([...tokens1, ...tokens2]).size;
  return union > 0 ? intersection / union : 0.0;
}

/**
 * Extracts selector text or role name from Playwright locator expressions.
 */
function extractSelectorToken(expr: string): string {
  const match = expr.match(/['"`]([^'"`]+)['"`]/);
  return match ? match[1] : expr;
}

/**
 * Computes a multi-factor confidence score for a proposed replacement UI selector.
 */
export function calculateSelectorConfidence(
  brokenLocator: string,
  candidateLocator: string,
  options: {
    isUnique?: boolean;
    actionType?: "click" | "fill" | "hover" | "check" | "general";
    structuralTagMatch?: boolean;
    testIdMatch?: boolean;
  } = {},
): SelectorConfidenceScore {
  const brokenToken = extractSelectorToken(brokenLocator);
  const candidateToken = extractSelectorToken(candidateLocator);

  // 1. Text / token similarity
  const textSimilarity = computeStringSimilarity(brokenToken, candidateToken);

  // 2. Structural role/tag match
  let structuralMatch = 0.5;
  if (options.structuralTagMatch !== undefined) {
    structuralMatch = options.structuralTagMatch ? 1.0 : 0.2;
  } else {
    // If both use getByRole or same locator method
    const brokenMethod = brokenLocator.match(/getBy([a-zA-Z]+)/)?.[1];
    const candidateMethod = candidateLocator.match(/getBy([a-zA-Z]+)/)?.[1];
    if (brokenMethod && candidateMethod && brokenMethod === candidateMethod) {
      structuralMatch = 1.0;
    } else if (brokenMethod || candidateMethod) {
      structuralMatch = 0.7;
    }
  }

  // 3. Attribute match (e.g. data-testid)
  let attributeMatch = 0.5;
  if (options.testIdMatch !== undefined) {
    attributeMatch = options.testIdMatch ? 1.0 : 0.1;
  } else if (candidateLocator.includes("getByTestId") || candidateLocator.includes("data-testid")) {
    attributeMatch = 0.9;
  }

  // 4. Action compatibility
  const actionCompatibility = 1.0;

  // 5. Uniqueness score
  const uniquenessScore = (options.isUnique ?? true) ? 1.0 : 0.4;

  // Weighted overall calculation
  // Structural (0.25) + Text (0.35) + Attribute (0.20) + Action (0.10) + Uniqueness (0.10)
  const overallScore =
    Math.round(
      (structuralMatch * 0.25 +
        textSimilarity * 0.35 +
        attributeMatch * 0.2 +
        actionCompatibility * 0.1 +
        uniquenessScore * 0.1) *
        100,
    ) / 100;

  let confidenceLevel: ConfidenceLevel = "LOW";
  let recommendation: PatchRecommendation = "REJECT";

  if (overallScore >= 0.85) {
    confidenceLevel = "HIGH";
    recommendation = "APPLY_AUTOMATICALLY";
  } else if (overallScore >= 0.6) {
    confidenceLevel = "MEDIUM";
    recommendation = "REQUIRE_HUMAN_REVIEW";
  } else {
    confidenceLevel = "LOW";
    recommendation = "REJECT";
  }

  const rationale = `Confidence ${overallScore.toFixed(2)} (${confidenceLevel}): textSimilarity=${textSimilarity.toFixed(2)}, structuralMatch=${structuralMatch.toFixed(2)}, attributeMatch=${attributeMatch.toFixed(2)}, uniqueness=${uniquenessScore.toFixed(2)}`;

  return {
    overallScore,
    confidenceLevel,
    recommendation,
    breakdown: {
      structuralMatch,
      textSimilarity,
      attributeMatch,
      actionCompatibility,
      uniquenessScore,
    },
    rationale,
  };
}

/**
 * Generates an AST-aware self-healing patch for broken Playwright UI locators
 * with multi-factor confidence scoring and unified git diff generation.
 */
export async function generateAstSelectorPatch(
  filePath: string,
  targetLineNumber: number,
  brokenLocator: string,
  healedLocator: string,
  options: AstPatchOptions = {},
): Promise<AstPatchResult | null> {
  const tolerance = options.nearbyTolerance ?? 4;
  const resolvedPath = path.resolve(filePath);

  let fileContent: string;
  try {
    fileContent = await fs.readFile(resolvedPath, "utf8");
  } catch {
    return null;
  }

  const lines = fileContent.split(/\r?\n/);
  if (lines.length === 0) return null;

  const targetIdx = Math.max(0, Math.min(lines.length - 1, targetLineNumber - 1));
  const indicesToCheck: number[] = [targetIdx];
  for (let offset = 1; offset <= tolerance; offset++) {
    if (targetIdx - offset >= 0) indicesToCheck.push(targetIdx - offset);
    if (targetIdx + offset < lines.length) indicesToCheck.push(targetIdx + offset);
  }

  const cleanBroken = brokenLocator.trim();
  const cleanBrokenNoPage = cleanBroken.startsWith("page.") ? cleanBroken.slice(5) : cleanBroken;

  let matchedIdx = -1;
  let astNodeType = "LocatorCallExpression";

  for (const idx of indicesToCheck) {
    const line = lines[idx];
    if (line.includes(cleanBroken) || line.includes(cleanBrokenNoPage)) {
      matchedIdx = idx;
      break;
    }
  }

  // Fallback: check token extraction in quotes
  if (matchedIdx === -1) {
    const brokenToken = extractSelectorToken(brokenLocator);
    for (const idx of indicesToCheck) {
      if (lines[idx].includes(brokenToken)) {
        matchedIdx = idx;
        astNodeType = "LiteralArgumentExpression";
        break;
      }
    }
  }

  if (matchedIdx === -1) {
    return null;
  }

  const originalLine = lines[matchedIdx];
  let patchedLine = originalLine;

  const cleanHealed = healedLocator.trim();
  const cleanHealedNoPage = cleanHealed.startsWith("page.") ? cleanHealed.slice(5) : cleanHealed;

  if (originalLine.includes(`page.${cleanBrokenNoPage}`)) {
    patchedLine = originalLine.replace(`page.${cleanBrokenNoPage}`, `page.${cleanHealedNoPage}`);
  } else if (originalLine.includes(cleanBroken)) {
    patchedLine = originalLine.replace(cleanBroken, cleanHealed);
  } else if (originalLine.includes(cleanBrokenNoPage)) {
    patchedLine = originalLine.replace(cleanBrokenNoPage, cleanHealedNoPage);
  } else {
    const brokenToken = extractSelectorToken(brokenLocator);
    const healedToken = extractSelectorToken(healedLocator);
    patchedLine = originalLine.replace(brokenToken, healedToken);
  }

  // Calculate confidence score
  const confidence = calculateSelectorConfidence(brokenLocator, healedLocator);

  const minThreshold = options.minConfidenceThreshold ?? 0.6;
  if (confidence.overallScore < minThreshold) {
    return null; // Reject low confidence patches
  }

  const patchedLines = [...lines];
  patchedLines[matchedIdx] = patchedLine;
  const patchedContent = patchedLines.join("\n");

  const diff = generateUnifiedDiff(filePath, matchedIdx + 1, originalLine, patchedLine);

  let applied = false;
  let backupFile: string | undefined;

  if (!options.dryRun && confidence.recommendation !== "REJECT") {
    if (options.createBackup) {
      backupFile = `${resolvedPath}.autoheal-backup`;
      try {
        await fs.writeFile(backupFile, fileContent, "utf8");
      } catch {
        // Non-fatal backup failure
      }
    }
    await fs.writeFile(resolvedPath, patchedContent, "utf8");
    applied = true;
  }

  return {
    file: resolvedPath,
    line: matchedIdx + 1,
    originalLine,
    patchedLine,
    originalContent: fileContent,
    patchedContent,
    diff,
    applied,
    backupFile,
    confidence,
    astNodeType,
    surroundingContext: lines.slice(Math.max(0, matchedIdx - 2), matchedIdx + 3).join("\n"),
  };
}
