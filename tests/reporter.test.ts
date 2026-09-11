import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AutoHealReporter } from "../packages/interceptor/src/reporter.js";

describe("Phase 1 — AutoHeal Reporter Integration (@autoheal/interceptor)", () => {
  let tmpDir: string;
  let reportPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "autoheal-reporter-test-"));
    reportPath = path.join(tmpDir, "failures.json");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("intercepts failed test events and extracts structured failure context", async () => {
    const reporter = new AutoHealReporter({
      outputFile: reportPath,
      silent: true,
    });

    const mockTest: any = {
      id: "test-auth-login",
      title: "User can log in with valid credentials",
    };

    const mockResult: any = {
      status: "failed",
      duration: 5210,
      errors: [
        {
          message: "locator.click: Timeout 5000ms waiting for locator('#btn-login')",
          stack: "    at tests/login.spec.ts:15:3",
        },
      ],
    };

    // 1. Trigger test end hook
    reporter.onTestEnd(mockTest, mockResult);

    const failures = reporter.getFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0].testTitle).toBe("User can log in with valid credentials");
    expect(failures[0].brokenLocator).toBe("locator('#btn-login')");
    expect(failures[0].action).toBe("click");
    expect(failures[0].failureType).toBe("TIMEOUT");
    expect(failures[0].location?.file).toBe("tests/login.spec.ts");
    expect(failures[0].location?.line).toBe(15);

    // 2. Trigger suite end hook
    await reporter.onEnd({ status: "failed" } as any);

    // 3. Verify report file was written
    const writtenRaw = await fs.readFile(reportPath, "utf8");
    const written = JSON.parse(writtenRaw);
    expect(written.totalFailures).toBe(1);
    expect(written.status).toBe("failed");
    expect(written.failures[0].brokenLocator).toBe("locator('#btn-login')");
  });

  it("ignores passed and skipped tests", () => {
    const reporter = new AutoHealReporter({ silent: true });

    reporter.onTestEnd({ id: "1", title: "pass" } as any, { status: "passed", errors: [] } as any);
    reporter.onTestEnd({ id: "2", title: "skip" } as any, { status: "skipped", errors: [] } as any);

    expect(reporter.getFailures()).toHaveLength(0);
  });
});
