import fs from "node:fs/promises";
import path from "node:path";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { type FailureContext, parsePlaywrightError } from "@autoheal/core";

export interface AutoHealReporterOptions {
  outputFile?: string;
  silent?: boolean;
}

export class AutoHealReporter implements Reporter {
  private failures: FailureContext[] = [];
  private options: AutoHealReporterOptions;

  constructor(options: AutoHealReporterOptions = {}) {
    this.options = {
      outputFile: options.outputFile || "autoheal-failures.json",
      silent: options.silent ?? false,
    };
  }

  getFailures(): FailureContext[] {
    return [...this.failures];
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === "passed" || result.status === "skipped") {
      return;
    }

    for (const err of result.errors) {
      const parsed = parsePlaywrightError(err.message || "", err.stack);

      // If a broken locator or action was detected
      if (parsed.brokenLocator || parsed.action !== "unknown") {
        const failure: FailureContext = {
          ...parsed,
          id: `${test.id}-${Date.now()}`,
          testTitle: test.title,
          durationMs: result.duration,
          timestamp: new Date().toISOString(),
          snippet: err.snippet,
        };

        this.failures.push(failure);

        if (!this.options.silent) {
          console.log("\n⚡ [AutoHeal Interceptor] Broken Locator Detected:");
          console.log(`   • Test:    ${failure.testTitle}`);
          console.log(`   • Locator: ${failure.brokenLocator || "unknown"}`);
          console.log(`   • Action:  ${failure.action}`);
          console.log(`   • Reason:  ${failure.failureType}`);
          if (failure.location) {
            console.log(
              `   • At:      ${failure.location.file}:${failure.location.line}:${failure.location.column}`,
            );
          }
        }
      }
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    if (this.failures.length > 0 && this.options.outputFile) {
      try {
        const outPath = path.resolve(process.cwd(), this.options.outputFile);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(
          outPath,
          JSON.stringify(
            {
              totalFailures: this.failures.length,
              status: result.status,
              failures: this.failures,
            },
            null,
            2,
          ),
          "utf8",
        );
      } catch (err) {
        if (!this.options.silent) {
          console.error("Failed to write autoheal failure report:", err);
        }
      }
    }
  }
}

export default AutoHealReporter;
