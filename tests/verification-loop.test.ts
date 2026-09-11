import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyAndApplyPatch } from "../packages/core/src/verifier/loop.js";
import type {
  TestTarget,
  VerificationCandidate,
  VerificationOutcome,
} from "../packages/core/src/verifier/types.js";

describe("Verification Loop & Regression Protection Engine", () => {
  let tempDir: string;
  let sampleTestFile: string;

  const originalContent = `import { test, expect } from '@playwright/test';

test('login test', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page).toHaveURL('/dashboard');
});
`;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "autoheal-verify-test-"));
    sampleTestFile = path.join(tempDir, "login.spec.ts");
    await fs.writeFile(sampleTestFile, originalContent, "utf8");
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const testTarget: TestTarget = {
    testFile: "tests/login.spec.ts",
    testTitle: "login test",
  };

  it("commits patch and deletes backup when candidate passes verification", async () => {
    const candidate: VerificationCandidate = {
      suggestedLocator: "page.getByRole('button', { name: 'Log In' })",
      confidence: 0.95,
      explanation: "Button was renamed",
    };

    // Mock runner that passes
    const mockRunner = async (): Promise<VerificationOutcome> => ({
      passed: true,
      exitCode: 0,
      durationMs: 150,
      output: "1 passed",
    });

    const result = await verifyAndApplyPatch(
      sampleTestFile,
      5,
      "page.getByRole('button', { name: 'Submit' })",
      [candidate],
      testTarget,
      { runner: mockRunner },
    );

    expect(result.status).toBe("VERIFIED");
    expect(result.attempts.length).toBe(1);
    expect(result.attempts[0].passed).toBe(true);
    expect(result.verifiedCandidate?.suggestedLocator).toBe(
      "page.getByRole('button', { name: 'Log In' })",
    );

    // File should contain the verified patch
    const finalContent = await fs.readFile(sampleTestFile, "utf8");
    expect(finalContent).toContain("Log In");
    expect(finalContent).not.toContain("Submit");

    // Backup should be cleaned up on success
    const backupFile = `${sampleTestFile}.autoheal-backup`;
    await expect(fs.access(backupFile)).rejects.toThrow();
  });

  it("rolls back Candidate 1 when it fails and successfully commits Candidate 2", async () => {
    const candidate1: VerificationCandidate = {
      suggestedLocator: "page.getByRole('button', { name: 'Wrong Guess' })",
      confidence: 0.8,
    };
    const candidate2: VerificationCandidate = {
      suggestedLocator: "page.getByRole('button', { name: 'Log In' })",
      confidence: 0.9,
    };

    let attemptCount = 0;
    // Mock runner fails on candidate 1, passes on candidate 2
    const mockRunner = async (): Promise<VerificationOutcome> => {
      attemptCount++;
      if (attemptCount === 1) {
        return {
          passed: false,
          exitCode: 1,
          durationMs: 200,
          output: "Error: locator timeout",
          error: "Timeout 30000ms exceeded",
        };
      }
      return {
        passed: true,
        exitCode: 0,
        durationMs: 180,
        output: "1 passed",
      };
    };

    const result = await verifyAndApplyPatch(
      sampleTestFile,
      5,
      "page.getByRole('button', { name: 'Submit' })",
      [candidate1, candidate2],
      testTarget,
      { runner: mockRunner },
    );

    expect(result.status).toBe("VERIFIED");
    expect(result.attempts.length).toBe(2);
    expect(result.attempts[0].passed).toBe(false);
    expect(result.attempts[1].passed).toBe(true);
    expect(result.verifiedCandidate?.suggestedLocator).toBe(
      "page.getByRole('button', { name: 'Log In' })",
    );

    // File should have Candidate 2's patch
    const finalContent = await fs.readFile(sampleTestFile, "utf8");
    expect(finalContent).toContain("Log In");
    expect(finalContent).not.toContain("Wrong Guess");

    // Backup should be cleaned up
    const backupFile = `${sampleTestFile}.autoheal-backup`;
    await expect(fs.access(backupFile)).rejects.toThrow();
  });

  it("reverts file to exact original state when all candidates fail verification", async () => {
    const candidate1: VerificationCandidate = {
      suggestedLocator: "page.getByRole('button', { name: 'Bad 1' })",
      confidence: 0.7,
    };
    const candidate2: VerificationCandidate = {
      suggestedLocator: "page.getByRole('button', { name: 'Bad 2' })",
      confidence: 0.6,
    };

    // Mock runner fails all attempts
    const mockRunner = async (): Promise<VerificationOutcome> => ({
      passed: false,
      exitCode: 1,
      durationMs: 200,
      output: "AssertionError: element not found",
      error: "Element not found",
    });

    const result = await verifyAndApplyPatch(
      sampleTestFile,
      5,
      "page.getByRole('button', { name: 'Submit' })",
      [candidate1, candidate2],
      testTarget,
      { runner: mockRunner },
    );

    expect(result.status).toBe("FAILED_VERIFICATION");
    expect(result.attempts.length).toBe(2);
    expect(result.attempts[0].passed).toBe(false);
    expect(result.attempts[1].passed).toBe(false);

    // Codebase MUST be restored completely to original
    const restoredContent = await fs.readFile(sampleTestFile, "utf8");
    expect(restoredContent).toBe(originalContent);
  });
});
