import fs from "node:fs/promises";
import path from "node:path";
import { generateUnifiedDiff } from "./diff.js";
import type { PatchResult, PatcherOptions } from "./types.js";

/**
 * Normalizes a locator expression for flexible matching (removes 'page.' prefix, trims whitespace).
 */
function normalizeLocatorExpr(expr: string): string {
  let cleaned = expr.trim();
  if (cleaned.startsWith("page.")) {
    cleaned = cleaned.slice(5);
  }
  return cleaned;
}

/**
 * Extracts method name from locator (e.g. "getByRole" from "page.getByRole('button')").
 */
function extractMethodName(expr: string): string {
  const norm = normalizeLocatorExpr(expr);
  const match = norm.match(/^([a-zA-Z0-9_$]+)/);
  return match ? match[1] : "";
}

/**
 * Generates a patch for a Playwright test file by replacing the broken locator.
 */
export async function generatePatch(
  filePath: string,
  targetLineNumber: number,
  brokenLocator: string,
  healedLocator: string,
  options: PatcherOptions = {},
): Promise<PatchResult | null> {
  const tolerance = options.nearbyTolerance ?? 3;
  const resolvedPath = path.resolve(filePath);

  let fileContent: string;
  try {
    fileContent = await fs.readFile(resolvedPath, "utf8");
  } catch {
    return null;
  }

  const lines = fileContent.split(/\r?\n/);
  if (lines.length === 0) return null;

  // Convert to 0-indexed line index
  const targetIdx = Math.max(0, Math.min(lines.length - 1, targetLineNumber - 1));

  // Determine line search order: target line first, then +/- 1, +/- 2, etc.
  const indicesToCheck: number[] = [targetIdx];
  for (let offset = 1; offset <= tolerance; offset++) {
    if (targetIdx - offset >= 0) indicesToCheck.push(targetIdx - offset);
    if (targetIdx + offset < lines.length) indicesToCheck.push(targetIdx + offset);
  }

  const brokenNorm = normalizeLocatorExpr(brokenLocator);
  const brokenMethod = extractMethodName(brokenLocator);

  let matchedIdx = -1;
  let matchMode: "exact" | "method" = "exact";

  for (const idx of indicesToCheck) {
    const line = lines[idx];
    if (line.includes(brokenLocator) || (brokenNorm && line.includes(brokenNorm))) {
      matchedIdx = idx;
      matchMode = "exact";
      break;
    }
  }

  // If no exact match found, check if a line invokes the same method e.g. getByRole / getByTestId
  if (matchedIdx === -1 && brokenMethod) {
    for (const idx of indicesToCheck) {
      const line = lines[idx];
      if (line.includes(brokenMethod)) {
        matchedIdx = idx;
        matchMode = "method";
        break;
      }
    }
  }

  if (matchedIdx === -1) {
    return null;
  }

  const originalLine = lines[matchedIdx];
  let patchedLine = originalLine;

  const healedNorm = normalizeLocatorExpr(healedLocator);

  if (matchMode === "exact") {
    // If line has "page." and brokenLocator did not, adjust
    if (originalLine.includes(`page.${brokenNorm}`)) {
      patchedLine = originalLine.replace(`page.${brokenNorm}`, `page.${healedNorm}`);
    } else if (originalLine.includes(brokenLocator)) {
      patchedLine = originalLine.replace(brokenLocator, healedLocator);
    } else if (originalLine.includes(brokenNorm)) {
      patchedLine = originalLine.replace(brokenNorm, healedNorm);
    }
  } else {
    // Method match mode: replace locator invocation pattern e.g. .getByRole(...) or page.getByRole(...)
    const locatorRegex =
      /(?:page\.)?(?:getByRole|getByTestId|getByPlaceholder|getByText|getByLabel|getByTitle|locator)\([^)]*(?:\([^)]*\))*[^)]*\)/;
    const match = originalLine.match(locatorRegex);
    if (match) {
      const matchedExpr = match[0];
      const replacement = matchedExpr.startsWith("page.") ? `page.${healedNorm}` : healedNorm;
      patchedLine = originalLine.replace(matchedExpr, replacement);
    } else {
      return null;
    }
  }

  if (patchedLine === originalLine) {
    return null;
  }

  const newLines = [...lines];
  newLines[matchedIdx] = patchedLine;
  const patchedContent = newLines.join("\n");
  const actualLineNum = matchedIdx + 1;

  const diff = generateUnifiedDiff(filePath, actualLineNum, originalLine, patchedLine, true);

  return {
    file: resolvedPath,
    line: actualLineNum,
    originalLine,
    patchedLine,
    originalContent: fileContent,
    patchedContent,
    diff,
    applied: false,
  };
}

/**
 * Applies a generated patch to disk, creating a safety backup by default.
 */
export async function applyPatch(
  patch: PatchResult,
  options: PatcherOptions = {},
): Promise<boolean> {
  const createBackup = options.createBackup ?? true;
  const backupExt = options.backupExtension ?? ".autoheal-backup";
  const backupFile = `${patch.file}${backupExt}`;

  if (options.dryRun) {
    return true;
  }

  try {
    if (createBackup) {
      await fs.writeFile(backupFile, patch.originalContent, "utf8");
      patch.backupFile = backupFile;
    }

    await fs.writeFile(patch.file, patch.patchedContent, "utf8");
    patch.applied = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Rolls back a single file from its backup.
 */
export async function rollbackFile(
  filePath: string,
  options: PatcherOptions = {},
): Promise<boolean> {
  const backupExt = options.backupExtension ?? ".autoheal-backup";
  const resolvedPath = path.resolve(filePath);
  const backupFile = resolvedPath.endsWith(backupExt)
    ? resolvedPath
    : `${resolvedPath}${backupExt}`;
  const originalFile = backupFile.slice(0, -backupExt.length);

  try {
    const backupContent = await fs.readFile(backupFile, "utf8");
    await fs.writeFile(originalFile, backupContent, "utf8");
    await fs.unlink(backupFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively scans directory for backup files and rolls all of them back.
 */
export async function findAndRollbackAll(
  rootDir: string,
  backupExt = ".autoheal-backup",
): Promise<string[]> {
  const restored: string[] = [];

  async function scan(dir: string) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== "dist") {
          await scan(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith(backupExt)) {
        const success = await rollbackFile(fullPath, { backupExtension: backupExt });
        if (success) {
          restored.push(fullPath.slice(0, -backupExt.length));
        }
      }
    }
  }

  await scan(path.resolve(rootDir));
  return restored;
}

export const Patcher = {
  generatePatch,
  applyPatch,
  rollbackFile,
  findAndRollbackAll,
};
