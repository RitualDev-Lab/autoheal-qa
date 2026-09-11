import { describe, expect, it } from "vitest";
import { evaluateActionCompatibility } from "../packages/core/src/heuristics/action-compatibility.js";
import type { CandidateElement } from "../packages/core/src/snapshot/types.js";

describe("Action Compatibility Evaluator", () => {
  const buttonCandidate: CandidateElement = {
    id: "btn-1",
    tag: "button",
    role: "button",
    name: "Submit Order",
    attributes: {},
    locators: ["page.getByRole('button', { name: 'Submit Order' })"],
  };

  const inputCandidate: CandidateElement = {
    id: "input-1",
    tag: "input",
    inputType: "email",
    placeholder: "user@example.com",
    attributes: { type: "email" },
    locators: ["page.getByPlaceholder('user@example.com')"],
  };

  const checkboxCandidate: CandidateElement = {
    id: "chk-1",
    tag: "input",
    inputType: "checkbox",
    role: "checkbox",
    attributes: { type: "checkbox" },
    locators: ["page.getByRole('checkbox')"],
  };

  it("favors text inputs for fill action and rejects buttons", () => {
    const inputScore = evaluateActionCompatibility("fill", inputCandidate);
    const buttonScore = evaluateActionCompatibility("fill", buttonCandidate);

    expect(inputScore).toBe(1.0);
    expect(buttonScore).toBeLessThanOrEqual(0.1);
  });

  it("favors buttons and links for click action", () => {
    const buttonScore = evaluateActionCompatibility("click", buttonCandidate);
    expect(buttonScore).toBe(1.0);
  });

  it("favors checkboxes for check action", () => {
    const chkScore = evaluateActionCompatibility("check", checkboxCandidate);
    const btnScore = evaluateActionCompatibility("check", buttonCandidate);

    expect(chkScore).toBe(1.0);
    expect(btnScore).toBeLessThan(0.2);
  });
});
