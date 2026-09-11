import { describe, expect, it } from "vitest";
import type { HarvestedFailureContext } from "../packages/core/src/snapshot/types.js";
import { generateHtmlReport } from "../packages/interceptor/src/html-report.js";

describe("HTML Visual Report Generator", () => {
  it("generates valid HTML document for empty failure list", () => {
    const html = generateHtmlReport([]);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("AutoHeal-QA");
    expect(html).toContain("No test failures detected");
  });

  it("generates failure cards with broken and candidate locators", () => {
    const mockFailures: HarvestedFailureContext[] = [
      {
        id: "fail-1",
        testTitle: "Login submission",
        durationMs: 1500,
        timestamp: new Date().toISOString(),
        brokenLocator: "page.getByRole('button', { name: 'Submit' })",
        action: "click",
        failureType: "TIMEOUT",
        rawErrorMessage: "Locator timeout exceeded",
        location: {
          file: "tests/login.spec.ts",
          line: 25,
          column: 5,
        },
        snapshot: {
          url: "http://localhost:3000/login",
          title: "Sign In",
          timestamp: new Date().toISOString(),
          prunedDom: "<button>Log In</button>",
          interactiveElements: [
            {
              id: "btn-1",
              tag: "button",
              role: "button",
              name: "Log In",
              attributes: {},
              locators: ["page.getByRole('button', { name: 'Log In' })"],
            },
          ],
        },
      },
    ];

    const html = generateHtmlReport(mockFailures);
    expect(html).toContain("Login submission");
    expect(html).toContain("tests/login.spec.ts:25");
    expect(html).toContain("page.getByRole(&#039;button&#039;, { name: &#039;Submit&#039; })");
    expect(html).toContain("page.getByRole(&#039;button&#039;, { name: &#039;Log In&#039; })");
    expect(html).toContain("TIMEOUT");
    expect(html).toContain("$0.00");
  });
});
