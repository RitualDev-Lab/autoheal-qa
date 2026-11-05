import { describe, expect, it } from "vitest";
import { MultimodalVisionHealer } from "../packages/ai/src/multimodal-vision-healer.js";
import { SelfHealingGitPrEngine } from "../packages/core/src/self-healing-git-pr.js";

describe("Phase 3 (AutoHeal-QA): Multimodal Vision-Language Test Healing", () => {
  it("detects and classifies CSS-in-JS obfuscated class selectors", () => {
    const healer = new MultimodalVisionHealer();

    expect(healer.isCssInJsObfuscated("button.css-1a2b3c4d")).toBe(true);
    expect(healer.isCssInJsObfuscated("div.sc-bdVaJa")).toBe(true);
    expect(healer.isCssInJsObfuscated("button._submit_a8fbc_12")).toBe(true);
    expect(healer.isCssInJsObfuscated("button.btn-primary")).toBe(false);
    expect(healer.isCssInJsObfuscated("[data-testid='login-btn']")).toBe(false);
  });

  it("heals CSS-in-JS obfuscated button into semantic getByRole Playwright locator", async () => {
    const healer = new MultimodalVisionHealer();

    const result = await healer.healLocator({
      failingLocator: "button.css-9z8y7x.btn-submit",
      action: "click",
      errorMessage: "locator.click: Target page, context or browser has been closed",
      candidates: [
        {
          tag: "button",
          role: "button",
          text: "Log In",
          ariaLabel: "Submit credentials to log in",
          testId: "login-submit-button",
        },
      ],
    });

    expect(result.strategy).toBe("css_in_js_resilient");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.healedLocator).toBe("getByTestId('login-submit-button')");
    expect(result.playwrightSnippet).toBe("await page.getByTestId('login-submit-button').click();");
  });

  it("heals input field into getByRole or getByLabel when testId is absent", async () => {
    const healer = new MultimodalVisionHealer();

    const result = await healer.healLocator({
      failingLocator: "input.sc-1a2b3c[name='password']",
      action: "fill",
      errorMessage: "Timeout 5000ms waiting for element",
      candidates: [
        {
          tag: "input",
          role: "textbox",
          name: "password",
          ariaLabel: "User Password",
        },
      ],
    });

    expect(result.healedLocator).toBe("getByRole('textbox', { name: 'User Password' })");
    expect(result.playwrightSnippet).toBe(
      "await page.getByRole('textbox', { name: 'User Password' }).fill();",
    );
  });

  it("estimates visual UI difference percentage between screenshots", async () => {
    const healer = new MultimodalVisionHealer();

    const result = await healer.healLocator({
      failingLocator: "button.css-8x9y0z",
      action: "click",
      errorMessage: "Element not interactable",
      baselineScreenshotBase64:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      failureScreenshotBase64:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      candidates: [
        {
          tag: "button",
          role: "button",
          text: "Confirm",
        },
      ],
    });

    expect(result.visualDiffPercentage).toBeDefined();
    expect(result.visualDiffPercentage).toBeGreaterThan(0);
  });
});

describe("Phase 3 (AutoHeal-QA): Automated Self-Healing Git PR Branches & CI Reporting", () => {
  it("generates a complete self-healing Git PR payload with visual regression diff", () => {
    const prEngine = new SelfHealingGitPrEngine();

    const payload = prEngine.generatePrPayload({
      runId: "run-e2e-ci-99",
      baseBranch: "main",
      gitDiff: [
        "--- a/tests/e2e/login.spec.ts",
        "+++ b/tests/e2e/login.spec.ts",
        "@@ -15,1 +15,1 @@",
        "- await page.click('button.css-1f8a92');",
        "+ await page.getByRole('button', { name: 'Log In' }).click();",
      ].join("\n"),
      executions: [
        {
          testFile: "tests/e2e/login.spec.ts",
          testTitle: "User Authentication Flow",
          originalLocator: "button.css-1f8a92",
          healedLocator: "getByRole('button', { name: 'Log In' })",
          lineNumber: 15,
          durationMs: 1450,
          status: "healed",
          visualDiffPercentage: 1.8,
        },
      ],
    });

    expect(payload.branchName).toMatch(/^autoheal\/heal-run-e2e-/);
    expect(payload.title).toContain("auto-heal 1 brittle Playwright locator");
    expect(payload.body).toContain("AutoHeal-QA: Self-Healing Test Automation Report");
    expect(payload.body).toContain("getByRole('button', { name: 'Log In' })");
    expect(payload.body).toContain("1.8%");
    expect(payload.commitMessage).toContain("Signed-off-by: AutoHeal QA Bot");
  });

  it("exports valid JUnit XML report for containerized test runners", () => {
    const prEngine = new SelfHealingGitPrEngine();

    const xml = prEngine.exportJUnitXml([
      {
        testFile: "tests/checkout.spec.ts",
        testTitle: "Complete Cart Checkout",
        originalLocator: ".btn-checkout-sc99",
        healedLocator: "getByTestId('checkout-cta')",
        lineNumber: 42,
        durationMs: 2500,
        status: "healed",
      },
    ]);

    expect(xml).toContain(`<?xml version="1.0" encoding="UTF-8"?>`);
    expect(xml).toContain(
      `<testsuites name="AutoHeal-QA Parallel Container Suite" tests="1" failures="0"`,
    );
    expect(xml).toContain(`AutoHeal healed locator '.btn-checkout-sc99'`);
  });

  it("exports structured Allure results with step parameters", () => {
    const prEngine = new SelfHealingGitPrEngine();

    const allureJson = prEngine.exportAllureJson(
      [
        {
          testFile: "tests/nav.spec.ts",
          testTitle: "Top Navigation Bar",
          originalLocator: "nav.css-hdr > a:nth-child(2)",
          healedLocator: "getByRole('link', { name: 'Pricing' })",
          lineNumber: 10,
          durationMs: 950,
          status: "healed",
          visualDiffPercentage: 0.5,
        },
      ],
      "run-42",
    );

    const parsed = JSON.parse(allureJson);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].status).toBe("passed");
    expect(parsed[0].name).toBe("Top Navigation Bar");
    expect(parsed[0].steps[0].parameters.length).toBe(3);
  });
});
