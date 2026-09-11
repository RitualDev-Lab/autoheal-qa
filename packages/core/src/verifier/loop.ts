import fs from "node:fs/promises";
import { applyPatch, generatePatch, rollbackFile } from "../patcher/patcher.js";
import { createPlaywrightRunner } from "./runner.js";
import type {
  CandidateAttemptRecord,
  TestTarget,
  VerificationCandidate,
  VerificationLoopOptions,
  VerificationLoopResult,
} from "./types.js";

/**
 * Executes a verification loop testing candidate locator patches against the test runner.
 * Automatically rolls back on failure and commits only verified patches.
 */
export async function verifyAndApplyPatch(
  filePath: string,
  lineNumber: number,
  brokenLocator: string,
  candidates: VerificationCandidate[],
  target: TestTarget,
  options: VerificationLoopOptions = {},
): Promise<VerificationLoopResult> {
  const startTime = Date.now();
  const maxRetries = options.maxCandidateRetries ?? 3;
  const runner = options.runner ?? createPlaywrightRunner();
  const patcherOpts = options.patcherOptions ?? { createBackup: true };

  const attempts: CandidateAttemptRecord[] = [];

  if (candidates.length === 0) {
    return {
      status: "NO_CANDIDATES",
      attempts: [],
      totalDurationMs: Date.now() - startTime,
    };
  }

  const candidatePool = candidates.slice(0, maxRetries);

  for (const candidate of candidatePool) {
    const attemptStart = Date.now();

    const patch = await generatePatch(
      filePath,
      lineNumber,
      brokenLocator,
      candidate.suggestedLocator,
      patcherOpts,
    );

    if (!patch) {
      attempts.push({
        candidate,
        passed: false,
        durationMs: Date.now() - attemptStart,
        error: "Could not generate valid source patch for candidate locator",
      });
      continue;
    }

    const applied = await applyPatch(patch, patcherOpts);
    if (!applied) {
      attempts.push({
        candidate,
        passed: false,
        durationMs: Date.now() - attemptStart,
        error: "Failed to write patch to disk",
      });
      continue;
    }

    // Run verification on the patched test
    let outcome: import("./types.js").VerificationOutcome;
    try {
      outcome = await runner(target);
    } catch (err: any) {
      outcome = {
        passed: false,
        exitCode: 1,
        durationMs: Date.now() - attemptStart,
        output: "",
        error: `Runner exception: ${err?.message || err}`,
      };
    }

    const attemptDuration = Date.now() - attemptStart;

    if (outcome.passed) {
      // Verification passed! Commit the patch by deleting the backup file
      if (patch.backupFile) {
        try {
          await fs.unlink(patch.backupFile);
        } catch {
          // ignore
        }
      }

      attempts.push({
        candidate,
        passed: true,
        durationMs: attemptDuration,
      });

      return {
        status: "VERIFIED",
        verifiedCandidate: candidate,
        finalPatch: patch,
        attempts,
        totalDurationMs: Date.now() - startTime,
      };
    }

    // Verification failed: Immediately roll back from backup
    await rollbackFile(filePath, patcherOpts);

    attempts.push({
      candidate,
      passed: false,
      durationMs: attemptDuration,
      error: outcome.error,
    });
  }

  // Ensure file is definitely in its original state
  await rollbackFile(filePath, patcherOpts).catch(() => {});

  return {
    status: "FAILED_VERIFICATION",
    attempts,
    totalDurationMs: Date.now() - startTime,
  };
}

export const VerificationLoop = {
  verifyAndApplyPatch,
};
