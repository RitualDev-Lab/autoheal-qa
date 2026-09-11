#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { HealingOrchestrator } from "@autoheal/ai";
import { type HarvestedFailureContext, Patcher, VerificationLoop } from "@autoheal/core";
import { saveHtmlReport } from "@autoheal/interceptor";

const VERSION = "0.1.0";

const HELP_TEXT = `
AutoHeal-QA v${VERSION} — Agentic Self-Healing E2E Testing Runner

Usage:
  autoheal test [options] [playwright args...]
  autoheal heal [options]
  autoheal report [options]
  autoheal rollback
  autoheal --help
  autoheal --version

Commands:
  test                 Runs Playwright test suite with AutoHeal interception enabled
  heal                 Reviews failures and interactively patches test files with healed locators
  report               Generates a standalone visual HTML dashboard from test failures
  rollback             Reverts all .autoheal-backup files in the workspace

Options:
  --heal               Automatically launch healing prompt after test failure (for "test" command)
  --yes, -y            Automatically apply all patches without interactive confirmation
  --verify             Re-run test to verify patch before committing (default: true)
  --no-verify          Apply patch immediately without re-running test verification
  --provider <type>    Healing provider: "auto" (default), "heuristic", or "ollama"
  --model <name>       Ollama model name (default: "qwen2.5-coder:7b")
  --file <path>        Path to failure report (default: autoheal-failures.json)
  --version, -v        Display version
  --help, -h           Display help
`;

interface RunOptions {
  provider?: "auto" | "heuristic" | "ollama";
  model?: string;
  reportFile?: string;
  autoApply?: boolean;
  verify?: boolean;
}

function parseCliOptions(args: string[]): RunOptions {
  const options: RunOptions = {
    reportFile: "autoheal-failures.json",
    verify: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--yes" || arg === "-y") {
      options.autoApply = true;
    } else if (arg === "--no-verify") {
      options.verify = false;
    } else if (arg === "--verify") {
      options.verify = true;
    } else if (arg === "--provider" && args[i + 1]) {
      options.provider = args[++i] as any;
    } else if (arg === "--model" && args[i + 1]) {
      options.model = args[++i];
    } else if (arg === "--file" && args[i + 1]) {
      options.reportFile = args[++i];
    }
  }

  return options;
}

export async function runInteractiveHealing(options: RunOptions = {}): Promise<void> {
  const reportPath = path.resolve(process.cwd(), options.reportFile || "autoheal-failures.json");

  let raw: string;
  try {
    raw = await fs.readFile(reportPath, "utf8");
  } catch {
    console.log(`\n❌ Could not find failure report at "${reportPath}".`);
    console.log("   Run your tests first using: autoheal test\n");
    return;
  }

  let report: { failures?: HarvestedFailureContext[] };
  try {
    report = JSON.parse(raw);
  } catch {
    console.error("❌ Failed to parse failure report JSON.");
    return;
  }

  const failures = report.failures || [];
  if (failures.length === 0) {
    console.log("\n✨ No test failures found in report. All tests are clean!\n");
    return;
  }

  console.log("\n=========================================================");
  console.log(
    `   AutoHeal Interactive Patcher (${failures.length} Failure${failures.length > 1 ? "s" : ""})`,
  );
  console.log("=========================================================\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let autoApplyAll = options.autoApply ?? false;
  let patchedCount = 0;

  try {
    for (let i = 0; i < failures.length; i++) {
      const f = failures[i];
      console.log("\n---------------------------------------------------------");
      console.log(`[#${i + 1}/${failures.length}] ${f.testTitle}`);
      console.log(`Broken: ${f.brokenLocator}`);
      if (f.location) {
        console.log(`File:   ${f.location.file}:${f.location.line}`);
      }

      console.log("\n🔍 Analyzing candidates and finding optimal replacement...");
      const healed = await HealingOrchestrator.healLocator(f, {
        aiOptions: { model: options.model },
        forceStrategy:
          options.provider === "heuristic" || options.provider === "ollama"
            ? options.provider
            : undefined,
      });

      if (!healed) {
        console.log("⚠️  Could not confidently determine a replacement locator.");
        continue;
      }

      const badge =
        healed.strategy === "ollama"
          ? `🤖 Ollama AI (${healed.modelUsed || "local"})`
          : "⚡ Local Heuristics ($0)";
      console.log(
        `✨ Suggested: ${healed.healedLocator} (${Math.round(healed.confidence * 100)}% confidence) [${badge}]`,
      );
      console.log(`   Reason:    ${healed.explanation}`);

      if (!f.location) {
        console.log(
          "⚠️  Could not patch file: Source code location was not available in stack trace.",
        );
        continue;
      }

      const patch = await Patcher.generatePatch(
        f.location.file,
        f.location.line,
        f.brokenLocator,
        healed.healedLocator,
      );

      if (!patch) {
        console.log("⚠️  Could not locate matching locator in source file to apply patch.");
        continue;
      }

      console.log("\n📋 Proposed Diff Preview:");
      console.log(patch.diff);
      console.log();

      let shouldApply = autoApplyAll;

      if (!shouldApply) {
        const answer = (await rl.question("👉 Apply this patch? [Y]es / [n]o / [a]ll / [q]uit: "))
          .trim()
          .toLowerCase();

        if (answer === "q" || answer === "quit") {
          console.log("Aborted healing.");
          break;
        }
        if (answer === "a" || answer === "all") {
          autoApplyAll = true;
          shouldApply = true;
        } else if (answer === "" || answer === "y" || answer === "yes") {
          shouldApply = true;
        } else {
          console.log("Skipped patch.");
        }
      }

      if (shouldApply) {
        if (options.verify !== false) {
          console.log("⏳ Verifying patch with Playwright runner...");
          const vResult = await VerificationLoop.verifyAndApplyPatch(
            f.location.file,
            f.location.line,
            f.brokenLocator,
            [{ suggestedLocator: healed.healedLocator, confidence: healed.confidence }],
            { testFile: f.location.file, testTitle: f.testTitle },
          );

          if (vResult.status === "VERIFIED") {
            patchedCount++;
            console.log(
              `✅ Verification PASSED: Tests pass with new locator! Committed to ${path.basename(f.location.file)}.`,
            );
          } else {
            console.log(
              "❌ Verification FAILED: Test did not pass with this locator. Codebase auto-rolled back.",
            );
          }
        } else {
          const success = await Patcher.applyPatch(patch);
          if (success) {
            patchedCount++;
            console.log(
              `✅ Patched: ${path.basename(f.location.file)} (Backup created: ${path.basename(patch.backupFile || "")})`,
            );
          } else {
            console.error(`❌ Failed to write patch to ${f.location.file}`);
          }
        }
      }
    }
  } finally {
    rl.close();
  }

  console.log(`\n🎉 Healing session finished. Patched ${patchedCount} locator(s).`);
  if (patchedCount > 0) {
    console.log("   (To revert any changes, run: autoheal rollback)\n");
  }
}

async function runPlaywrightTests(
  passThroughArgs: string[],
  cliOptions: RunOptions,
  launchHeal: boolean,
): Promise<number> {
  console.log("\n🔮 [AutoHeal-QA] Starting Playwright Test Runner with Interception...\n");

  const reportFile = cliOptions.reportFile || "autoheal-failures.json";

  // Filter out our own CLI flags before passing to playwright
  const pwArgs = passThroughArgs.filter(
    (arg) =>
      arg !== "--heal" &&
      arg !== "--yes" &&
      arg !== "-y" &&
      !arg.startsWith("--provider") &&
      !arg.startsWith("--model") &&
      !arg.startsWith("--file"),
  );

  const args = ["playwright", "test", ...pwArgs];

  return new Promise((resolve) => {
    const child = spawn("npx", args, {
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        AUTOHEAL_ACTIVE: "1",
        AUTOHEAL_OUTPUT: reportFile,
      },
    });

    child.on("close", async (code) => {
      try {
        const reportRaw = await fs.readFile(path.resolve(process.cwd(), reportFile), "utf8");
        const report = JSON.parse(reportRaw);
        const failures: HarvestedFailureContext[] = report.failures || [];

        if (failures.length > 0) {
          console.log("\n=========================================================");
          console.log(`   AutoHeal Detected ${failures.length} Broken Locator Failure(s)`);
          console.log("=========================================================\n");

          for (let i = 0; i < failures.length; i++) {
            const f = failures[i];
            console.log(` [${i + 1}/${failures.length}] ${f.testTitle}`);
            console.log(`       Broken:   ${f.brokenLocator || "Unknown"}`);
            console.log(`       Action:   ${f.action}`);
            console.log(`       Reason:   ${f.failureType}`);
            if (f.location) {
              console.log(`       File:     ${f.location.file}:${f.location.line}`);
            }

            const healed = await HealingOrchestrator.healLocator(f);
            if (healed) {
              const badge =
                healed.strategy === "ollama"
                  ? `🤖 Ollama AI (${healed.modelUsed || "local"})`
                  : "⚡ Local Heuristics ($0)";
              const confPct = Math.round(healed.confidence * 100);
              console.log(
                `       ✨ Healed:  ${healed.healedLocator} (${confPct}% confidence) [${badge}]`,
              );
              console.log(`          Reason:  ${healed.explanation}`);
            }
            console.log();
          }

          // Generate standalone HTML report
          await saveHtmlReport(failures, "autoheal-report.html").catch(() => {});
          console.log("📊 Visual report generated: autoheal-report.html\n");

          if (launchHeal) {
            await runInteractiveHealing(cliOptions);
          } else {
            console.log("💡 Run 'autoheal heal' to interactively review and patch test files.\n");
          }
        }
      } catch {
        // Clean run or no report
      }

      resolve(code ?? 0);
    });
  });
}

async function runGenerateReport(cliOptions: RunOptions): Promise<void> {
  const reportPath = path.resolve(process.cwd(), cliOptions.reportFile || "autoheal-failures.json");
  try {
    const raw = await fs.readFile(reportPath, "utf8");
    const data = JSON.parse(raw);
    const failures: HarvestedFailureContext[] = data.failures || [];
    const htmlPath = await saveHtmlReport(failures, "autoheal-report.html");
    console.log("\n📊 Visual HTML report generated successfully:");
    console.log(`   file://${htmlPath}\n`);
  } catch {
    console.log(`\n❌ Could not find failure report at "${reportPath}".`);
    console.log("   Run your tests first using: autoheal test\n");
  }
}

async function runRollback(): Promise<void> {
  console.log("\n🔄 Searching for .autoheal-backup files in workspace...");
  const restored = await Patcher.findAndRollbackAll(process.cwd());

  if (restored.length === 0) {
    console.log("   No backup files found. Nothing to rollback.\n");
  } else {
    console.log(`\n✅ Successfully rolled back ${restored.length} file(s):`);
    for (const f of restored) {
      console.log(`   • ${path.relative(process.cwd(), f)}`);
    }
    console.log();
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(`autoheal v${VERSION}`);
    process.exit(0);
  }

  const command = args[0];

  if (command === "test") {
    const passThrough = args.slice(1);
    const cliOptions = parseCliOptions(passThrough);
    const launchHeal = passThrough.includes("--heal");
    const exitCode = await runPlaywrightTests(passThrough, cliOptions, launchHeal);
    process.exit(exitCode);
  }

  if (command === "heal") {
    const cliOptions = parseCliOptions(args.slice(1));
    await runInteractiveHealing(cliOptions);
    process.exit(0);
  }

  if (command === "report") {
    const cliOptions = parseCliOptions(args.slice(1));
    await runGenerateReport(cliOptions);
    process.exit(0);
  }

  if (command === "rollback") {
    await runRollback();
    process.exit(0);
  }

  console.error(`Unknown command: "${command}". Run "autoheal --help" for usage.`);
  process.exit(1);
}

main().catch((err) => {
  console.error("AutoHeal Fatal Error:", err);
  process.exit(1);
});
