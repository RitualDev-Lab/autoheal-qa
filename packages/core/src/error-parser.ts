import type { FailureType, ParsedErrorDetails, ParsedLocation, TargetAction } from "./types.js";

const ACTION_MAP: Record<string, TargetAction> = {
  click: "click",
  fill: "fill",
  check: "check",
  uncheck: "uncheck",
  hover: "hover",
  dblclick: "dblclick",
  press: "press",
  selectoption: "selectOption",
  waitfor: "waitFor",
};

/**
 * Determines failure category from raw Playwright error string.
 */
export function classifyFailureType(errorMessage: string): FailureType {
  const lower = errorMessage.toLowerCase();
  if (
    lower.includes("strict mode violation") ||
    (lower.includes("resolved to") && lower.includes("elements"))
  ) {
    return "STRICT_MODE_VIOLATION";
  }
  if (lower.includes("not visible") || lower.includes("element is not visible")) {
    return "NOT_VISIBLE";
  }
  if (lower.includes("not attached") || lower.includes("detached from the dom")) {
    return "NOT_ATTACHED";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "TIMEOUT";
  }
  return "UNKNOWN";
}

/**
 * Extracts the user-space test file and line/column from a stack trace.
 */
export function extractTestLocation(stackTrace?: string): ParsedLocation | undefined {
  if (!stackTrace) return undefined;

  const lines = stackTrace.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("at ")) continue;

    // Ignore node_modules, internal node libraries, and playwright internal runners
    if (
      trimmed.includes("node_modules") ||
      trimmed.includes("node:internal") ||
      trimmed.includes("@playwright/test")
    ) {
      continue;
    }

    // Pattern 1: with parentheses, e.g. "at Object.<anonymous> (tests/auth.spec.ts:18:5)"
    let match = trimmed.match(/\((.+?):(\d+):(\d+)\)$/);
    if (!match) {
      // Pattern 2: without parentheses, e.g. "at tests/auth.spec.ts:18:5"
      match = trimmed.match(/^at\s+(.+?):(\d+):(\d+)$/);
    }

    if (match) {
      const file = match[1].replace(/\\/g, "/");
      const lineNum = Number.parseInt(match[2], 10);
      const colNum = Number.parseInt(match[3], 10);
      if (!Number.isNaN(lineNum)) {
        return {
          file,
          line: lineNum,
          column: Number.isNaN(colNum) ? 0 : colNum,
        };
      }
    }
  }

  return undefined;
}

/**
 * Parses raw Playwright test error message and stack trace into structured details.
 */
export function parsePlaywrightError(
  errorMessage: string,
  stackTrace?: string,
): ParsedErrorDetails {
  const failureType = classifyFailureType(errorMessage);
  const location = extractTestLocation(stackTrace);

  // 1. Extract action (e.g. locator.click, locator.fill)
  let action: TargetAction = "unknown";
  const actionMatch = errorMessage.match(/locator\.([a-zA-Z]+)(?:\(|$|:)/);
  if (actionMatch) {
    const actKey = actionMatch[1].toLowerCase();
    action = ACTION_MAP[actKey] || "unknown";
  }

  // 2. Extract broken locator string
  // Formats:
  // "waiting for locator('#submit-btn')"
  // "waiting for getByRole('button', { name: 'Submit' })"
  // "strict mode violation: locator('button') resolved to 2 elements"
  let brokenLocator = "";

  const waitingForMatch = errorMessage.match(/waiting for (locator\(.*?\)|getBy[a-zA-Z]+\(.*?\))/s);
  if (waitingForMatch) {
    brokenLocator = waitingForMatch[1].trim();
  } else {
    const strictMatch = errorMessage.match(
      /strict mode violation: (locator\(.*?\)|getBy[a-zA-Z]+\(.*?\))/s,
    );
    if (strictMatch) {
      brokenLocator = strictMatch[1].trim();
    } else {
      // Fallback regex looking for any locator/getBy expression
      const genericMatch = errorMessage.match(/(locator\([^)]+\)|getBy[a-zA-Z]+\([^)]+\))/);
      if (genericMatch) {
        brokenLocator = genericMatch[1].trim();
      }
    }
  }

  // 3. Extract action argument if applicable (e.g. .fill("value"))
  let actionArg: string | undefined;
  if (action === "fill") {
    const fillArgMatch = errorMessage.match(/locator\.fill\((.*?)\)/);
    if (fillArgMatch) {
      actionArg = fillArgMatch[1].replace(/^['"]|['"]$/g, "");
    }
  }

  return {
    action,
    actionArg,
    brokenLocator,
    failureType,
    rawErrorMessage: errorMessage,
    location,
  };
}
