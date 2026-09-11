import { describe, expect, it } from "vitest";
import { generateUnifiedDiff, stripAnsi } from "../packages/core/src/patcher/diff.js";

describe("Unified Diff Generator", () => {
  it("generates a unified diff with line numbers and file path", () => {
    const originalLine = "  await page.getByRole('button', { name: 'Submit' }).click();";
    const patchedLine = "  await page.getByRole('button', { name: 'Log In' }).click();";
    const diff = generateUnifiedDiff("tests/login.spec.ts", 15, originalLine, patchedLine, false);

    expect(diff).toContain("--- a/tests/login.spec.ts:15");
    expect(diff).toContain("+++ b/tests/login.spec.ts:15");
    expect(diff).toContain("@@ -15,1 +15,1 @@");
    expect(diff).toContain("-   await page.getByRole('button', { name: 'Submit' }).click();");
    expect(diff).toContain("+   await page.getByRole('button', { name: 'Log In' }).click();");
  });

  it("strips ANSI color codes cleanly", () => {
    const originalLine = "page.locator('#old')";
    const patchedLine = "page.locator('#new')";
    const coloredDiff = generateUnifiedDiff(
      "tests/test.spec.ts",
      1,
      originalLine,
      patchedLine,
      true,
    );
    const plainDiff = stripAnsi(coloredDiff);

    expect(plainDiff).not.toContain("\x1b[");
    expect(plainDiff).toContain("- page.locator('#old')");
    expect(plainDiff).toContain("+ page.locator('#new')");
  });
});
