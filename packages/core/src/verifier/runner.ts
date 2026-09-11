import { spawn } from "node:child_process";
import process from "node:process";
import type { TestTarget, VerificationOutcome, VerificationRunner } from "./types.js";

export interface PlaywrightRunnerOptions {
  timeoutMs?: number; // default 30000
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Creates a Playwright verification runner that executes tests via npx playwright test.
 */
export function createPlaywrightRunner(options: PlaywrightRunnerOptions = {}): VerificationRunner {
  const timeoutMs = options.timeoutMs ?? 30000;
  const cwd = options.cwd ?? process.cwd();

  return async (target: TestTarget): Promise<VerificationOutcome> => {
    const startTime = Date.now();
    const args = ["playwright", "test", target.testFile];

    if (target.testTitle) {
      args.push("-g", target.testTitle);
    }

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const child = spawn("npx", args, {
        cwd,
        shell: true,
        env: {
          ...process.env,
          ...options.env,
          // Disable AutoHeal during verification re-runs to avoid recursive loops
          AUTOHEAL_ACTIVE: "0",
        },
      });

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
      }, timeoutMs);

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        const exitCode = code ?? 1;

        if (timedOut) {
          resolve({
            passed: false,
            exitCode: 124,
            durationMs,
            output: stdout,
            error: `Verification timed out after ${timeoutMs}ms`,
          });
          return;
        }

        const passed = exitCode === 0;
        resolve({
          passed,
          exitCode,
          durationMs,
          output: stdout,
          error: passed ? undefined : stderr || stdout || "Test failed during verification",
        });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          passed: false,
          exitCode: 1,
          durationMs: Date.now() - startTime,
          output: stdout,
          error: `Failed to spawn verification process: ${err.message}`,
        });
      });
    });
  };
}
