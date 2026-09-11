import { describe, expect, it } from "vitest";
import { parseAIHealingResponse } from "../packages/ai/src/parser.js";

describe("AI Response Parser", () => {
  it("parses clean JSON response", () => {
    const raw = JSON.stringify({
      suggestedLocator: "page.getByRole('button', { name: 'Submit Order' })",
      confidence: 0.95,
      explanation: "Button text was updated to 'Submit Order'",
    });

    const parsed = parseAIHealingResponse(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.suggestedLocator).toBe("page.getByRole('button', { name: 'Submit Order' })");
    expect(parsed?.confidence).toBe(0.95);
    expect(parsed?.explanation).toBe("Button text was updated to 'Submit Order'");
  });

  it("extracts JSON wrapped in markdown code fence", () => {
    const raw = `
Here is the recommended Playwright locator:
\`\`\`json
{
  "suggestedLocator": "page.getByTestId('checkout-submit-btn')",
  "confidence": 0.88,
  "explanation": "Matching test-id found on checkout form"
}
\`\`\`
Hope this helps!
`;

    const parsed = parseAIHealingResponse(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.suggestedLocator).toBe("page.getByTestId('checkout-submit-btn')");
    expect(parsed?.confidence).toBe(0.88);
  });

  it("normalizes integer percentage confidence (e.g. 90 -> 0.9)", () => {
    const raw = '{"suggestedLocator": "page.getByPlaceholder(\'Email\')", "confidence": 90}';
    const parsed = parseAIHealingResponse(raw);
    expect(parsed?.confidence).toBe(0.9);
  });

  it("returns null for non-JSON or missing locator", () => {
    expect(parseAIHealingResponse("I could not find any matching locator.")).toBeNull();
    expect(parseAIHealingResponse('{"error": "not found"}')).toBeNull();
  });
});
