import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateSelectorConfidence,
  generateAstSelectorPatch,
} from "../packages/core/src/patcher/ast-patcher.js";
import {
  buildSandboxedBrowserArgs,
  evaluateEgressDestination,
  sanitizeSandboxedEnvironment,
} from "../packages/core/src/sandbox/agentshield-sandbox.js";

describe("Phase 3: AutoHeal-QA Sandboxed Execution & Confidence-Scored AST Patches", () => {
  describe("AgentShield Playwright Zero-Leak Sandboxed Egress", () => {
    it("allows local loopback destinations on permitted ports", () => {
      const res1 = evaluateEgressDestination("http://localhost:3000/api/health");
      expect(res1.allowed).toBe(true);

      const res2 = evaluateEgressDestination("127.0.0.1:8080");
      expect(res2.allowed).toBe(true);
    });

    it("strictly blocks cloud metadata endpoints (169.254.169.254 / metadata.google.internal)", () => {
      const awsMeta = evaluateEgressDestination("http://169.254.169.254/latest/meta-data/");
      expect(awsMeta.allowed).toBe(false);
      expect(awsMeta.reason).toContain("cloud metadata");

      const gcpMeta = evaluateEgressDestination(
        "http://metadata.google.internal/computeMetadata/v1/",
      );
      expect(gcpMeta.allowed).toBe(false);
    });

    it("blocks unauthorized public external egress under zero-leak rules", () => {
      const external = evaluateEgressDestination("https://api.exfiltration-target.com/leak");
      expect(external.allowed).toBe(false);
      expect(external.reason).toContain("Zero-Leak");
    });

    it("permits explicitly whitelisted external domains", () => {
      const res = evaluateEgressDestination("https://auth.ritualdev.in/login", {
        allowedHosts: ["localhost", "ritualdev.in"],
      });
      expect(res.allowed).toBe(true);
    });

    it("sanitizes sensitive environment variables before launching Playwright browser", () => {
      const dirtyEnv = {
        PATH: "/usr/bin:/bin",
        NODE_ENV: "test",
        AWS_SECRET_ACCESS_KEY: "AKIA_FAKE_SECRET_KEY_123",
        GH_TOKEN: "ghp_fake_token_abc",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        ANTHROPIC_API_KEY: "sk-ant-fake-key",
      };

      const cleanEnv = sanitizeSandboxedEnvironment(dirtyEnv);
      expect(cleanEnv.PATH).toBe("/usr/bin:/bin");
      expect(cleanEnv.NODE_ENV).toBe("test");
      expect(cleanEnv.AWS_SECRET_ACCESS_KEY).toBeUndefined();
      expect(cleanEnv.GH_TOKEN).toBeUndefined();
      expect(cleanEnv.DATABASE_URL).toBeUndefined();
      expect(cleanEnv.ANTHROPIC_API_KEY).toBeUndefined();
      expect(cleanEnv.AGENTSHIELD_CONTAINER_SANDBOX).toBe("1");
      expect(cleanEnv.AGENTSHIELD_ZERO_LEAK_EGRESS).toBe("strict");
    });

    it("generates Chromium host resolver confinement flags", () => {
      const flags = buildSandboxedBrowserArgs({
        allowedHosts: ["localhost", "127.0.0.1", "testserver.local"],
      });

      const resolverFlag = flags.find((f) => f.startsWith("--host-resolver-rules="));
      expect(resolverFlag).toBeDefined();
      expect(resolverFlag).toContain("MAP * ~NOTFOUND");
      expect(resolverFlag).toContain("EXCLUDE localhost,127.0.0.1,testserver.local");
      expect(flags).toContain("--disable-background-networking");
    });
  });

  describe("Confidence-Scored AST Selector Patching", () => {
    it("computes high confidence and automatic approval for matching role and similar name", () => {
      const broken = "page.getByRole('button', { name: 'Submit Order' })";
      const candidate = "page.getByRole('button', { name: 'Place Order' })";

      const score = calculateSelectorConfidence(broken, candidate, {
        isUnique: true,
        structuralTagMatch: true,
      });

      expect(score.overallScore).toBeGreaterThanOrEqual(0.7);
      expect(["HIGH", "MEDIUM"]).toContain(score.confidenceLevel);
      expect(score.breakdown.structuralMatch).toBe(1.0);
      expect(score.breakdown.uniquenessScore).toBe(1.0);
    });

    it("assigns high confidence to resilient getByTestId locators", () => {
      const broken = "page.locator('.btn-checkout-primary')";
      const candidate = "page.getByTestId('checkout-submit-btn')";

      const score = calculateSelectorConfidence(broken, candidate, {
        isUnique: true,
        testIdMatch: true,
      });

      expect(score.overallScore).toBeGreaterThanOrEqual(0.7);
      expect(score.breakdown.attributeMatch).toBe(1.0);
    });

    it("rejects non-unique candidate with mismatched semantics with LOW confidence", () => {
      const broken = "page.getByRole('button', { name: 'Delete Account' })";
      const candidate = "page.locator('div > span')";

      const score = calculateSelectorConfidence(broken, candidate, {
        isUnique: false,
        structuralTagMatch: false,
        testIdMatch: false,
      });

      expect(score.confidenceLevel).toBe("LOW");
      expect(score.recommendation).toBe("REJECT");
    });

    it("generates and applies AST patch with unified diff and backup file", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "autoheal-test-"));
      const testFile = path.join(tmpDir, "checkout.spec.ts");

      const fileContent = [
        "import { test, expect } from '@playwright/test';",
        "",
        "test('user can submit order', async ({ page }) => {",
        "  await page.goto('/checkout');",
        "  await page.getByRole('button', { name: 'Submit Payment' }).click();",
        "  await expect(page.getByText('Success')).toBeVisible();",
        "});",
      ].join("\n");

      await fs.writeFile(testFile, fileContent, "utf8");

      const patchResult = await generateAstSelectorPatch(
        testFile,
        5,
        "page.getByRole('button', { name: 'Submit Payment' })",
        "page.getByRole('button', { name: 'Pay Now' })",
        {
          createBackup: true,
          dryRun: false,
        },
      );

      expect(patchResult).not.toBeNull();
      expect(patchResult?.line).toBe(5);
      expect(patchResult?.applied).toBe(true);
      expect(patchResult?.diff).toContain(
        "-   await page.getByRole('button', { name: 'Submit Payment' }).click();",
      );
      expect(patchResult?.diff).toContain(
        "+   await page.getByRole('button', { name: 'Pay Now' }).click();",
      );
      expect(patchResult?.confidence.overallScore).toBeGreaterThanOrEqual(0.6);

      // Verify file updated on disk
      const updatedContent = await fs.readFile(testFile, "utf8");
      expect(updatedContent).toContain("page.getByRole('button', { name: 'Pay Now' })");

      // Verify backup created
      if (patchResult?.backupFile) {
        const backupExists = await fs
          .stat(patchResult.backupFile)
          .then(() => true)
          .catch(() => false);
        expect(backupExists).toBe(true);
      }

      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true });
    });
  });
});
