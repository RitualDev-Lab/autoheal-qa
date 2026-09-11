import type { LocatorType, ParsedLocator } from "./types.js";

/**
 * Strips quotes and surrounding slashes from extracted regex or string literals.
 */
function cleanLiteral(str?: string): string {
  if (!str) return "";
  let s = str.trim();
  // Strip outer quotes
  if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("`") && s.endsWith("`"))
  ) {
    s = s.slice(1, -1);
  }
  // Strip regex delimiters e.g. /submit/i -> submit
  if (s.startsWith("/") && s.lastIndexOf("/") > 0) {
    s = s.slice(1, s.lastIndexOf("/"));
  }
  return s.trim();
}

/**
 * Parses a Playwright locator expression string into structured semantic components.
 */
export function parseLocator(rawLocator: string): ParsedLocator {
  const trimmed = rawLocator.trim();

  // 1. getByRole('button', { name: 'Submit' })
  const roleMatch = trimmed.match(
    /getByRole\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*\{\s*name:\s*(?:['"`]([^'"`]+)['"`]|\/([^/]+)\/[a-z]*)(?:\s*,\s*exact:\s*(true|false))?\s*\}\s*)?/i,
  );
  if (roleMatch) {
    const role = roleMatch[1].toLowerCase();
    const name = cleanLiteral(roleMatch[2] || roleMatch[3]);
    const exact = roleMatch[4] === "true";
    return {
      raw: trimmed,
      type: "role",
      role,
      name: name || undefined,
      exact,
    };
  }

  // 2. getByTestId('...')
  const testIdMatch = trimmed.match(/getByTestId\(\s*['"`]([^'"`]+)['"`]\s*\)/i);
  if (testIdMatch) {
    return {
      raw: trimmed,
      type: "testid",
      value: cleanLiteral(testIdMatch[1]),
    };
  }

  // 3. getByPlaceholder('...')
  const placeholderMatch = trimmed.match(
    /getByPlaceholder\(\s*(?:['"`]([^'"`]+)['"`]|\/([^/]+)\/[a-z]*)\s*\)/i,
  );
  if (placeholderMatch) {
    return {
      raw: trimmed,
      type: "placeholder",
      value: cleanLiteral(placeholderMatch[1] || placeholderMatch[2]),
    };
  }

  // 4. getByText('...')
  const textMatch = trimmed.match(
    /getByText\(\s*(?:['"`]([^'"`]+)['"`]|\/([^/]+)\/[a-z]*)(?:\s*,\s*\{\s*exact:\s*(true|false)\s*\}\s*)?\)/i,
  );
  if (textMatch) {
    return {
      raw: trimmed,
      type: "text",
      value: cleanLiteral(textMatch[1] || textMatch[2]),
      exact: textMatch[3] === "true",
    };
  }

  // 5. getByLabel('...')
  const labelMatch = trimmed.match(
    /getByLabel\(\s*(?:['"`]([^'"`]+)['"`]|\/([^/]+)\/[a-z]*)\s*\)/i,
  );
  if (labelMatch) {
    return {
      raw: trimmed,
      type: "label",
      value: cleanLiteral(labelMatch[1] || labelMatch[2]),
    };
  }

  // 6. locator('...')
  const locatorMatch = trimmed.match(/locator\(\s*(['"`])([\s\S]+?)\1\s*\)/i);
  if (locatorMatch) {
    const selector = locatorMatch[2].trim();

    // Check if selector is an ID e.g. #submit-button
    if (selector.startsWith("#")) {
      return {
        raw: trimmed,
        type: "css",
        selector,
        value: selector.slice(1),
      };
    }

    // Check if selector is a test-id e.g. [data-testid="submit-button"]
    const attrTestId = selector.match(
      /\[(?:data-testid|data-test|data-cy)=['"`]?([^'"\]`]+)['"`]?\]/i,
    );
    if (attrTestId) {
      return {
        raw: trimmed,
        type: "testid",
        selector,
        value: attrTestId[1],
      };
    }

    // Check if selector is name e.g. [name="email"]
    const attrName = selector.match(/\[name=['"`]?([^'"\]`]+)['"`]?\]/i);
    if (attrName) {
      return {
        raw: trimmed,
        type: "css",
        selector,
        name: attrName[1],
      };
    }

    // Check for xpath e.g. //button[@id='foo']
    if (selector.startsWith("//") || selector.startsWith("(//")) {
      return {
        raw: trimmed,
        type: "xpath",
        selector,
      };
    }

    return {
      raw: trimmed,
      type: "css",
      selector,
    };
  }

  // Fallback
  return {
    raw: trimmed,
    type: "unknown",
  };
}
