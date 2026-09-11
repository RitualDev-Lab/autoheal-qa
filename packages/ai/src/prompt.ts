import type { CandidateElement, FailureType, TargetAction } from "@autoheal/core";

export interface BuildPromptParams {
  brokenLocator: string;
  action: TargetAction;
  failureType: FailureType;
  rawErrorMessage?: string;
  candidates: CandidateElement[];
  prunedDom?: string;
}

/**
 * Formats a candidate element into a concise summary line for the LLM prompt.
 */
function formatCandidate(c: CandidateElement, index: number): string {
  const parts: string[] = [`[#${index + 1}] <${c.tag}>`];
  if (c.role) parts.push(`role="${c.role}"`);
  if (c.name) parts.push(`name="${c.name}"`);
  if (c.text && c.text !== c.name) parts.push(`text="${c.text}"`);
  if (c.testId) parts.push(`data-testid="${c.testId}"`);
  if (c.placeholder) parts.push(`placeholder="${c.placeholder}"`);
  if (c.inputType) parts.push(`type="${c.inputType}"`);
  if (c.locators.length > 0) parts.push(`candidateLocator="${c.locators[0]}"`);

  return parts.join(" ");
}

/**
 * Builds a token-efficient, highly targeted prompt for Playwright locator healing.
 */
export function buildHealingPrompt(params: BuildPromptParams): string {
  const { brokenLocator, action, failureType, candidates, prunedDom } = params;

  // Format top 15 candidate elements
  const candidateList =
    candidates.length > 0
      ? candidates
          .slice(0, 15)
          .map((c, i) => formatCandidate(c, i))
          .join("\n")
      : "No candidate elements extracted.";

  // Truncate pruned DOM to safe token budget if present
  let domExcerpt = "";
  if (prunedDom) {
    const trimmed = prunedDom.trim();
    domExcerpt =
      trimmed.length > 1500
        ? `${trimmed.slice(0, 1500)}\n<!-- ... [truncated for brevity] -->`
        : trimmed;
  }

  return `You are an expert Playwright automation engineer. A Playwright test failed because a locator broke.
Your job is to identify the replacement locator from the live page elements.

### FAILURE CONTEXT:
- Broken Locator: ${brokenLocator}
- Target Action:  ${action}
- Failure Reason: ${failureType}

### CANDIDATE INTERACTIVE ELEMENTS FROM LIVE PAGE:
${candidateList}
${
  domExcerpt
    ? `
### PRUNED DOM SNIPPET:
\`\`\`html
${domExcerpt}
\`\`\`
`
    : ""
}

### PLAYWRIGHT BEST PRACTICES:
1. Prefer user-facing role locators: \`page.getByRole(role, { name: '...' })\`
2. Next prefer test-id locators: \`page.getByTestId('...')\`
3. Next prefer placeholder / label: \`page.getByPlaceholder('...')\` or \`page.getByLabel('...')\`
4. Do NOT use brittle CSS or absolute XPath unless no semantic locator exists.
5. The replacement MUST be actionable with the target action "${action}".

Respond ONLY with a valid JSON object matching this schema:
{
  "suggestedLocator": "page.getByRole('button', { name: '...' })",
  "confidence": 0.95,
  "explanation": "Why this element corresponds to the broken locator"
}`;
}
