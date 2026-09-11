import { describe, expect, it } from "vitest";
import { HeuristicEngine } from "../packages/core/src/heuristics/engine.js";
import type { CandidateElement } from "../packages/core/src/snapshot/types.js";

describe("Deterministic HeuristicEngine ($0 AI)", () => {
  const mockCandidates: CandidateElement[] = [
    {
      id: "cand-1",
      tag: "button",
      role: "button",
      name: "Sign in to account",
      text: "Sign in to account",
      testId: "signin-btn",
      attributes: { id: "signin-btn", "data-testid": "signin-btn" },
      locators: [
        "page.getByTestId('signin-btn')",
        "page.getByRole('button', { name: 'Sign in to account' })",
      ],
    },
    {
      id: "cand-2",
      tag: "button",
      role: "button",
      name: "Cancel",
      text: "Cancel",
      testId: "cancel-btn",
      attributes: { id: "cancel-btn" },
      locators: ["page.getByRole('button', { name: 'Cancel' })"],
    },
    {
      id: "cand-3",
      tag: "input",
      inputType: "email",
      placeholder: "Your business email",
      attributes: { type: "email", placeholder: "Your business email", id: "email-input" },
      locators: ["page.getByPlaceholder('Your business email')"],
    },
    {
      id: "cand-4",
      tag: "button",
      role: "button",
      name: "Submit Order",
      text: "Submit Order",
      testId: "submit_order_button",
      attributes: { "data-testid": "submit_order_button" },
      locators: [
        "page.getByTestId('submit_order_button')",
        "page.getByRole('button', { name: 'Submit Order' })",
      ],
    },
  ];

  it("finds closest button when button text changed slightly", () => {
    const broken = "page.getByRole('button', { name: 'Sign in' })";
    const matches = HeuristicEngine.findCandidates(broken, "click", mockCandidates);

    expect(matches.length).toBeGreaterThan(0);
    const top = matches[0];
    expect(top.candidate.id).toBe("cand-1");
    expect(top.suggestedLocator).toBe("page.getByRole('button', { name: 'Sign in to account' })");
    expect(top.confidence).toBeGreaterThan(0.75);
    expect(top.matchReason).toContain("Matching button");
  });

  it("detects test-id migration from kebab-case to snake_case", () => {
    const broken = "page.getByTestId('submit-order-button')";
    const matches = HeuristicEngine.findCandidates(broken, "click", mockCandidates);

    expect(matches.length).toBeGreaterThan(0);
    const top = matches[0];
    expect(top.candidate.id).toBe("cand-4");
    expect(top.suggestedLocator).toBe("page.getByTestId('submit_order_button')");
    expect(top.confidence).toBeGreaterThan(0.8);
    expect(top.matchReason).toContain("Test-ID migration detected");
  });

  it("matches input placeholder change", () => {
    const broken = "page.getByPlaceholder('business email')";
    const matches = HeuristicEngine.findCandidates(broken, "fill", mockCandidates);

    expect(matches.length).toBeGreaterThan(0);
    const top = matches[0];
    expect(top.candidate.id).toBe("cand-3");
    expect(top.suggestedLocator).toBe("page.getByPlaceholder('Your business email')");
    expect(top.confidence).toBeGreaterThan(0.75);
  });

  it("penalizes button candidates if action is fill", () => {
    const broken = "page.getByPlaceholder('Email')";
    // Action is fill - should reject or heavily penalize buttons
    const matches = HeuristicEngine.findCandidates(broken, "fill", mockCandidates, {
      minConfidence: 0.2,
    });

    const buttonMatches = matches.filter((m) => m.candidate.tag === "button");
    for (const btn of buttonMatches) {
      expect(btn.confidence).toBeLessThan(0.5);
    }
  });

  it("sorts candidates strictly descending by confidence", () => {
    const broken = "page.getByRole('button', { name: 'Submit' })";
    const matches = HeuristicEngine.findCandidates(broken, "click", mockCandidates, {
      minConfidence: 0.1,
    });

    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].confidence).toBeGreaterThanOrEqual(matches[i].confidence);
    }
  });
});
