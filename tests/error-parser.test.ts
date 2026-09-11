import { describe, it, expect } from "vitest";
import {
  classifyFailureType,
  extractTestLocation,
  parsePlaywrightError,
} from "../packages/core/src/error-parser.js";

describe("Phase 1 — Playwright Error Parser (@autoheal/core)", () => {
  it("classifies failure types accurately", () => {
    expect(classifyFailureType("locator.click: Timeout 5000ms waiting for locator('#btn')")).toBe(
      "TIMEOUT",
    );

    expect(
      classifyFailureType(
        "locator.click: Error: strict mode violation: locator('button') resolved to 2 elements",
      ),
    ).toBe("STRICT_MODE_VIOLATION");

    expect(
      classifyFailureType(
        "locator.click: Timeout 5000ms waiting for locator('#btn')\n  element is not visible",
      ),
    ).toBe("NOT_VISIBLE");

    expect(classifyFailureType("locator.click: element is detached from the DOM")).toBe(
      "NOT_ATTACHED",
    );

    expect(classifyFailureType("Unexpected network error")).toBe("UNKNOWN");
  });

  it("extracts test file and line number from stack trace (POSIX and Windows)", () => {
    const posixStack = `
Error: locator.click: Timeout 5000ms waiting for locator('#submit')
    at Object.<anonymous> (tests/auth.spec.ts:24:9)
    at node_modules/@playwright/test/lib/worker/workerRunner.js:200:10
`;
    const loc1 = extractTestLocation(posixStack);
    expect(loc1).toBeDefined();
    expect(loc1?.file).toBe("tests/auth.spec.ts");
    expect(loc1?.line).toBe(24);
    expect(loc1?.column).toBe(9);

    const winStack = `
Error: locator.fill: Timeout 5000ms
    at D:\\projects\\my-app\\e2e\\login.spec.ts:42:15
    at node:internal/process/task_queues:95:5
`;
    const loc2 = extractTestLocation(winStack);
    expect(loc2).toBeDefined();
    expect(loc2?.file).toBe("D:/projects/my-app/e2e/login.spec.ts");
    expect(loc2?.line).toBe(42);
    expect(loc2?.column).toBe(15);
  });

  it("parses broken locator, action, and target details from Playwright timeout error", () => {
    const errorMsg =
      "locator.click: Timeout 5000ms waiting for locator('#login-submit-btn')\n=========================== logs ===========================";
    const stack = "    at tests/auth.spec.ts:18:5";

    const details = parsePlaywrightError(errorMsg, stack);
    expect(details.action).toBe("click");
    expect(details.brokenLocator).toBe("locator('#login-submit-btn')");
    expect(details.failureType).toBe("TIMEOUT");
    expect(details.location?.file).toBe("tests/auth.spec.ts");
    expect(details.location?.line).toBe(18);
  });

  it("parses getByRole locator from strict mode violation", () => {
    const errorMsg =
      "locator.click: Error: strict mode violation: getByRole('button', { name: 'Sign in' }) resolved to 2 elements:\n    1) <button>Sign in</button>\n    2) <button>Sign in with Google</button>";
    const stack = "    at tests/checkout.spec.ts:33:12";

    const details = parsePlaywrightError(errorMsg, stack);
    expect(details.action).toBe("click");
    expect(details.brokenLocator).toBe("getByRole('button', { name: 'Sign in' })");
    expect(details.failureType).toBe("STRICT_MODE_VIOLATION");
    expect(details.location?.file).toBe("tests/checkout.spec.ts");
    expect(details.location?.line).toBe(33);
  });

  it("parses fill action and extracts input value argument", () => {
    const errorMsg =
      "locator.fill: Timeout 5000ms waiting for getByPlaceholder('Enter your email')";
    const details = parsePlaywrightError(errorMsg);

    expect(details.action).toBe("fill");
    expect(details.brokenLocator).toBe("getByPlaceholder('Enter your email')");
  });
});
