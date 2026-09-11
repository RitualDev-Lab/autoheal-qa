import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPatch,
  findAndRollbackAll,
  generatePatch,
  rollbackFile,
} from "../packages/core/src/patcher/patcher.js";

describe("Patcher Engine", () => {
  let tempDir: string;
  let sampleTestFile: string;

  const sampleContent = `import { test, expect } from '@playwright/test';

test('user login flow', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page).toHaveURL('/dashboard');
});
`;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "autoheal-patcher-test-"));
    sampleTestFile = path.join(tempDir, "login.spec.ts");
    await fs.writeFile(sampleTestFile, sampleContent, "utf8");
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("generates patch replacing broken locator and preserves indentation and chaining", async () => {
    const patch = await generatePatch(
      sampleTestFile,
      5,
      "page.getByRole('button', { name: 'Submit' })",
      "page.getByRole('button', { name: 'Log In' })",
    );

    expect(patch).not.toBeNull();
    expect(patch?.line).toBe(5);
    expect(patch?.originalLine).toBe(
      "  await page.getByRole('button', { name: 'Submit' }).click();",
    );
    expect(patch?.patchedLine).toBe(
      "  await page.getByRole('button', { name: 'Log In' }).click();",
    );
    expect(patch?.diff).toContain(
      "-   await page.getByRole('button', { name: 'Submit' }).click();",
    );
    expect(patch?.diff).toContain(
      "+   await page.getByRole('button', { name: 'Log In' }).click();",
    );
  });

  it("handles line drift tolerance when reported line is offset by 1-2 lines", async () => {
    // Reported line is 4, but actual line is 5
    const patch = await generatePatch(
      sampleTestFile,
      4,
      "page.getByRole('button', { name: 'Submit' })",
      "page.getByRole('button', { name: 'Log In' })",
      { nearbyTolerance: 2 },
    );

    expect(patch).not.toBeNull();
    expect(patch?.line).toBe(5);
    expect(patch?.patchedLine).toContain("Log In");
  });

  it("applies patch to disk and creates a .autoheal-backup file", async () => {
    const patch = await generatePatch(
      sampleTestFile,
      5,
      "page.getByRole('button', { name: 'Submit' })",
      "page.getByRole('button', { name: 'Log In' })",
    );

    expect(patch).not.toBeNull();
    if (!patch) throw new Error("Expected patch to exist");
    const applied = await applyPatch(patch);
    expect(applied).toBe(true);

    // Verify modified file
    const modified = await fs.readFile(sampleTestFile, "utf8");
    expect(modified).toContain("Log In");
    expect(modified).not.toContain("Submit");

    // Verify backup exists
    const backupFile = `${sampleTestFile}.autoheal-backup`;
    const backupContent = await fs.readFile(backupFile, "utf8");
    expect(backupContent).toBe(sampleContent);
  });

  it("rolls back file using rollbackFile", async () => {
    const patch = await generatePatch(
      sampleTestFile,
      5,
      "page.getByRole('button', { name: 'Submit' })",
      "page.getByRole('button', { name: 'Log In' })",
    );

    expect(patch).not.toBeNull();
    if (!patch) throw new Error("Expected patch to exist");
    await applyPatch(patch);
    expect(await fs.readFile(sampleTestFile, "utf8")).toContain("Log In");

    const rolledBack = await rollbackFile(sampleTestFile);
    expect(rolledBack).toBe(true);

    const restored = await fs.readFile(sampleTestFile, "utf8");
    expect(restored).toBe(sampleContent);

    // Backup should be cleaned up
    const backupFile = `${sampleTestFile}.autoheal-backup`;
    await expect(fs.access(backupFile)).rejects.toThrow();
  });

  it("findAndRollbackAll recursively restores all backup files in directory", async () => {
    const subDir = path.join(tempDir, "sub");
    await fs.mkdir(subDir, { recursive: true });
    const secondFile = path.join(subDir, "checkout.spec.ts");
    await fs.writeFile(secondFile, "await page.getByTestId('old-btn').click();", "utf8");

    const patch1 = await generatePatch(
      sampleTestFile,
      5,
      "page.getByRole('button', { name: 'Submit' })",
      "page.getByRole('button', { name: 'Log In' })",
    );
    const patch2 = await generatePatch(
      secondFile,
      1,
      "page.getByTestId('old-btn')",
      "page.getByTestId('new-btn')",
    );

    expect(patch1).not.toBeNull();
    expect(patch2).not.toBeNull();
    if (!patch1 || !patch2) throw new Error("Expected patches to exist");
    await applyPatch(patch1);
    await applyPatch(patch2);

    const restoredFiles = await findAndRollbackAll(tempDir);
    expect(restoredFiles.length).toBe(2);

    expect(await fs.readFile(sampleTestFile, "utf8")).toBe(sampleContent);
    expect(await fs.readFile(secondFile, "utf8")).toBe(
      "await page.getByTestId('old-btn').click();",
    );
  });
});
