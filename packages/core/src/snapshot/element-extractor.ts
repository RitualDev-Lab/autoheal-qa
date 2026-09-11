import type { CandidateElement, NormalizedAXNode } from "./types.js";

/**
 * Generates canonical Playwright locator expressions for a candidate element.
 */
export function generateCandidateLocators(element: Omit<CandidateElement, "locators">): string[] {
  const locators: string[] = [];

  // 1. By Test ID (Highest priority in stable tests)
  if (element.testId) {
    locators.push(`page.getByTestId('${element.testId}')`);
  }

  // 2. By Role with accessible name (Playwright standard)
  if (element.role && element.name) {
    locators.push(`page.getByRole('${element.role}', { name: '${element.name}' })`);
  }

  // 3. By Placeholder
  if (element.placeholder) {
    locators.push(`page.getByPlaceholder('${element.placeholder}')`);
  }

  // 4. By Label (aria-label or label text)
  const ariaLabel = element.attributes["aria-label"];
  if (ariaLabel && ariaLabel !== element.name) {
    locators.push(`page.getByLabel('${ariaLabel}')`);
  }

  // 5. By Text
  if (
    element.text &&
    element.text.length > 0 &&
    element.text.length < 50 &&
    element.text !== element.name
  ) {
    locators.push(`page.getByText('${element.text}')`);
  }

  // 6. By Role only (if specific role like searchbox)
  if (element.role && !element.name && element.role !== "generic") {
    locators.push(`page.getByRole('${element.role}')`);
  }

  // 7. By ID
  if (element.attributes.id) {
    locators.push(`page.locator('#${element.attributes.id}')`);
  }

  // 8. By Tag + Name attribute
  if (element.attributes.name) {
    locators.push(`page.locator('${element.tag}[name="${element.attributes.name}"]')`);
  }

  return Array.from(new Set(locators));
}

/**
 * Extracts interactive candidate elements from pruned HTML string.
 */
export function extractElementsFromHtml(prunedHtml: string): CandidateElement[] {
  const candidates: CandidateElement[] = [];
  const INTERACTIVE_TAGS = new Set(["button", "a", "input", "select", "textarea"]);

  const openTagRegex = /<([a-zA-Z0-9-]+)([\s\S]*?)(\/?>)/gi;
  let counter = 0;

  let match = openTagRegex.exec(prunedHtml);
  while (match !== null) {
    const tag = match[1].toLowerCase();
    if (tag.startsWith("/")) {
      match = openTagRegex.exec(prunedHtml);
      continue;
    }

    const attrString = match[2];
    const isSelfClosing = match[3] === "/>" || tag === "input" || tag === "img" || tag === "br";

    // Parse attributes
    const attributes: Record<string, string> = {};
    const attrRegex = /([a-zA-Z0-9_:-]+)="([^"]*)"/g;
    let attrMatch = attrRegex.exec(attrString);
    while (attrMatch !== null) {
      attributes[attrMatch[1].toLowerCase()] = attrMatch[2];
      attrMatch = attrRegex.exec(attrString);
    }

    // Extract text content if paired tag
    let innerText = "";
    if (!isSelfClosing) {
      const closeTagStr = `</${tag}>`;
      const afterIndex = openTagRegex.lastIndex;
      const closeIndex = prunedHtml.indexOf(closeTagStr, afterIndex);
      if (closeIndex !== -1 && closeIndex - afterIndex < 500) {
        innerText = prunedHtml
          .slice(afterIndex, closeIndex)
          .replace(/<[^>]+>/g, "")
          .trim();
      }
    }

    const role =
      attributes.role ||
      (tag === "button"
        ? "button"
        : tag === "a"
          ? "link"
          : tag === "input"
            ? "textbox"
            : undefined);
    const testId =
      attributes["data-testid"] ||
      attributes["data-cy"] ||
      attributes["data-test"] ||
      attributes["data-qa"];
    const placeholder = attributes.placeholder;
    const name = attributes["aria-label"] || innerText || attributes.name || attributes.title;

    const isInteractive =
      INTERACTIVE_TAGS.has(tag) ||
      Boolean(attributes.role) ||
      Boolean(attributes["aria-label"]) ||
      Boolean(testId) ||
      Boolean(attributes.id);

    if (isInteractive) {
      counter++;
      const base: Omit<CandidateElement, "locators"> = {
        id: `elem-${counter}`,
        tag,
        role,
        name: name ? name.trim() : undefined,
        text: innerText ? innerText.trim() : undefined,
        testId,
        placeholder,
        inputType: attributes.type,
        href: attributes.href,
        attributes,
      };

      candidates.push({
        ...base,
        locators: generateCandidateLocators(base),
      });
    }

    match = openTagRegex.exec(prunedHtml);
  }

  return candidates;
}

/**
 * Combines AX nodes with HTML candidates into a unified interactive element list.
 */
export function mergeCandidates(
  htmlElements: CandidateElement[],
  axNodes: NormalizedAXNode[],
): CandidateElement[] {
  const merged: CandidateElement[] = [...htmlElements];

  // For each AX node with role and name, ensure candidate locators exist
  for (const ax of axNodes) {
    if (!ax.name) continue;

    const existing = merged.find(
      (e) => (e.name === ax.name || e.text === ax.name) && (e.role === ax.role || !e.role),
    );

    if (existing) {
      if (ax.role) existing.role = ax.role;
      const roleLocator = `page.getByRole('${ax.role}', { name: '${ax.name}' })`;
      if (!existing.locators.includes(roleLocator)) {
        existing.locators.unshift(roleLocator);
      }
    } else {
      const base: Omit<CandidateElement, "locators"> = {
        id: `ax-${merged.length + 1}`,
        tag: ax.role === "button" ? "button" : ax.role === "link" ? "a" : "div",
        role: ax.role,
        name: ax.name,
        attributes: {},
      };
      merged.push({
        ...base,
        locators: generateCandidateLocators(base),
      });
    }
  }

  return merged;
}
