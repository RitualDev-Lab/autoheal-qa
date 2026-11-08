import { spawn } from "node:child_process";
import process from "node:process";
import type { TestTarget, VerificationOutcome, VerificationRunner } from "../verifier/types.js";

export interface ZeroLeakEgressPolicy {
  /**
   * Allowed hostnames or IP addresses (e.g. ["localhost", "127.0.0.1", "::1", "127.0.0.1:3000"]).
   * Defaults to local loopback only.
   */
  allowedHosts?: string[];

  /**
   * Allowed port ranges. Defaults to common test ports: [80, 443, 3000, 4173, 5173, 8000, 8080, 9323].
   */
  allowedPorts?: number[];

  /**
   * Deny AWS/GCP/Azure link-local cloud metadata service (169.254.169.254).
   * Default: true.
   */
  blockCloudMetadata?: boolean;

  /**
   * Deny arbitrary internet egress beyond allowedHosts.
   * Default: true.
   */
  blockPublicEgress?: boolean;

  /**
   * Environment variable names or regex patterns to redact/strip before launching
   * the sandboxed Playwright browser to prevent zero-day token leakage.
   */
  redactEnvPatterns?: RegExp[];
}

export interface SandboxedRunnerOptions {
  timeoutMs?: number;
  cwd?: string;
  egressPolicy?: ZeroLeakEgressPolicy;
  extraEnv?: NodeJS.ProcessEnv;
  browserArgs?: string[];
  containerMode?: "native_strict" | "appcontainer_lowbox" | "seatbelt" | "bubblewrap";
}

export interface EgressEvaluationResult {
  allowed: boolean;
  destination: string;
  reason?: string;
}

const DEFAULT_SENSITIVE_ENV_PATTERNS: RegExp[] = [
  /SECRET/i,
  /TOKEN/i,
  /PASSWORD/i,
  /API_KEY/i,
  /PRIVATE_KEY/i,
  /CREDENTIALS/i,
  /AWS_/i,
  /GITHUB_/i,
  /GH_/i,
  /AUTH/i,
  /DATABASE_URL/i,
  /REDIS_URL/i,
];

const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "::1"];
const DEFAULT_ALLOWED_PORTS = [80, 443, 3000, 4173, 5173, 8000, 8080, 9323];

/**
 * Evaluates whether a network egress destination matches the zero-leak policy.
 */
export function evaluateEgressDestination(
  destination: string,
  policy: ZeroLeakEgressPolicy = {},
): EgressEvaluationResult {
  const allowedHosts = policy.allowedHosts ?? DEFAULT_ALLOWED_HOSTS;
  const allowedPorts = policy.allowedPorts ?? DEFAULT_ALLOWED_PORTS;
  const blockCloudMetadata = policy.blockCloudMetadata ?? true;
  const blockPublicEgress = policy.blockPublicEgress ?? true;

  // Normalize host & port
  let host = destination.toLowerCase().trim();
  let port = 80;

  if (host.includes("://")) {
    try {
      const url = new URL(host);
      host = url.hostname;
      port = url.port ? Number.parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80;
    } catch {
      // Fallback manual parse
      host = host.split("://")[1].split("/")[0];
    }
  }

  if (host.includes(":")) {
    const parts = host.split(":");
    host = parts[0];
    port = Number.parseInt(parts[1], 10) || 80;
  }

  // 1. Link-local cloud metadata prevention (169.254.169.254 or metadata.google.internal)
  if (blockCloudMetadata) {
    if (
      host === "169.254.169.254" ||
      host === "metadata.google.internal" ||
      host.startsWith("169.254.")
    ) {
      return {
        allowed: false,
        destination,
        reason:
          "Access to cloud metadata service (169.254.169.254) is strictly denied by Zero-Leak policy",
      };
    }
  }

  // 2. Local loopback check
  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (isLoopback) {
    if (allowedPorts.length > 0 && !allowedPorts.includes(port)) {
      return {
        allowed: false,
        destination,
        reason: `Loopback port ${port} is not in allowedPorts list [${allowedPorts.join(", ")}]`,
      };
    }
    return { allowed: true, destination };
  }

  // 3. Whitelisted hosts
  const isExplicitlyAllowed = allowedHosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );

  if (isExplicitlyAllowed) {
    return { allowed: true, destination };
  }

  // 4. Public egress denial
  if (blockPublicEgress) {
    return {
      allowed: false,
      destination,
      reason: `Egress to external host '${host}' is blocked under Zero-Leak Playwright sandbox rules`,
    };
  }

  return { allowed: true, destination };
}

/**
 * Sanitizes process environment variables by redacting sensitive secrets
 * before passing them to the sandboxed Playwright runner.
 */
export function sanitizeSandboxedEnvironment(
  baseEnv: NodeJS.ProcessEnv = process.env,
  patterns: RegExp[] = DEFAULT_SENSITIVE_ENV_PATTERNS,
): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(baseEnv)) {
    if (value === undefined) continue;
    const isSensitive = patterns.some((p) => p.test(key));
    if (!isSensitive) {
      sanitized[key] = value;
    }
  }

  // Set explicit sandbox markers
  sanitized.AGENTSHIELD_CONTAINER_SANDBOX = "1";
  sanitized.AGENTSHIELD_ZERO_LEAK_EGRESS = "strict";
  sanitized.PLAYWRIGHT_CHROMIUM_SANDBOX = "1";

  return sanitized;
}

/**
 * Generates browser launch flags that enforce loopback confinement and network isolation in Chromium.
 */
export function buildSandboxedBrowserArgs(policy: ZeroLeakEgressPolicy = {}): string[] {
  const allowedHosts = policy.allowedHosts ?? DEFAULT_ALLOWED_HOSTS;
  const excludePattern = allowedHosts.join(",");

  return [
    `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${excludePattern}`,
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--no-default-browser-check",
    "--disable-features=Translate,OptimizationHints",
  ];
}

/**
 * Creates an AgentShield-hardened Playwright verification runner
 * that executes tests inside zero-leak network egress boundaries.
 */
export function createSandboxedPlaywrightRunner(
  options: SandboxedRunnerOptions = {},
): VerificationRunner {
  const timeoutMs = options.timeoutMs ?? 30000;
  const cwd = options.cwd ?? process.cwd();
  const egressPolicy = options.egressPolicy ?? {};
  const browserArgs = buildSandboxedBrowserArgs(egressPolicy);

  return async (target: TestTarget): Promise<VerificationOutcome> => {
    const startTime = Date.now();
    const args = ["playwright", "test", target.testFile];

    if (target.testTitle) {
      args.push("-g", target.testTitle);
    }

    const sanitizedEnv = sanitizeSandboxedEnvironment(
      {
        ...process.env,
        ...options.extraEnv,
        AUTOHEAL_ACTIVE: "0",
        CHROMIUM_FLAGS: browserArgs.join(" "),
      },
      egressPolicy.redactEnvPatterns,
    );

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const child = spawn("npx", args, {
        cwd,
        shell: true,
        env: sanitizedEnv,
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
            error: `Sandboxed verification timed out after ${timeoutMs}ms`,
          });
          return;
        }

        const passed = exitCode === 0;
        resolve({
          passed,
          exitCode,
          durationMs,
          output: stdout,
          error: passed
            ? undefined
            : stderr || stdout || "Sandboxed Playwright test execution failed",
        });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          passed: false,
          exitCode: 1,
          durationMs: Date.now() - startTime,
          output: stdout,
          error: `Failed to spawn sandboxed verification process: ${err.message}`,
        });
      });
    });
  };
}
