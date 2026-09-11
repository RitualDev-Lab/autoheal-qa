import { describe, expect, it } from "vitest";
import { buildHealingPrompt } from "../packages/ai/src/prompt.js";
import type { CandidateElement } from "../packages/core/src/snapshot/types.js";

describe("AI Healing Prompt Builder", () => {
  const mockCandidates: CandidateElement[] = [
    {
      id: "cand-1",
      tag: "button",
      role: "button",
      name: "Confirm Payment",
      text: "Confirm Payment",
      testId: "confirm-payment-btn",
      attributes: { "data-testid": "confirm-payment-btn" },
      locators: [
        "page.getByTestId('confirm-payment-btn')",
        "page.getByRole('button', { name: 'Confirm Payment' })",
      ],
    },
  ];

  it("includes failure details, broken locator, and candidates", () => {
    const prompt = buildHealingPrompt({
      brokenLocator: "page.getByRole('button', { name: 'Pay Now' })",
      action: "click",
      failureType: "TIMEOUT",
      candidates: mockCandidates,
      prunedDom: "<form><button data-testid='confirm-payment-btn'>Confirm Payment</button></form>",
    });

    expect(prompt).toContain("page.getByRole('button', { name: 'Pay Now' })");
    expect(prompt).toContain("click");
    expect(prompt).toContain("TIMEOUT");
    expect(prompt).toContain("Confirm Payment");
    expect(prompt).toContain("confirm-payment-btn");
    expect(prompt).toContain("PRUNED DOM SNIPPET");
    expect(prompt).toContain('"suggestedLocator"');
  });

  it("handles empty candidate lists and missing DOM gracefully", () => {
    const prompt = buildHealingPrompt({
      brokenLocator: "page.locator('#missing')",
      action: "click",
      failureType: "NOT_VISIBLE",
      candidates: [],
    });

    expect(prompt).toContain("No candidate elements extracted.");
    expect(prompt).not.toContain("PRUNED DOM SNIPPET");
  });
});
