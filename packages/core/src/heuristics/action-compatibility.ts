import type { CandidateElement } from "../snapshot/types.js";
import type { TargetAction } from "../types.js";

/**
 * Evaluates semantic compatibility between a target Playwright action and a candidate element.
 * Returns a score between 0.0 (completely incompatible) and 1.0 (perfect match).
 */
export function evaluateActionCompatibility(
  action: TargetAction,
  candidate: CandidateElement,
): number {
  const tag = candidate.tag.toLowerCase();
  const role = candidate.role?.toLowerCase() || "";
  const type = candidate.inputType?.toLowerCase() || candidate.attributes.type?.toLowerCase() || "";

  switch (action) {
    case "fill":
    case "press": {
      // Text inputs, textareas, contenteditable, textbox/searchbox roles
      if (tag === "textarea") return 1.0;
      if (tag === "input") {
        if (["text", "email", "password", "search", "tel", "url", "number", ""].includes(type)) {
          return 1.0;
        }
        if (["checkbox", "radio", "button", "submit", "reset"].includes(type)) {
          return 0.1; // Very low compatibility
        }
      }
      if (["textbox", "searchbox", "combobox"].includes(role)) return 1.0;
      if (candidate.attributes.contenteditable === "true") return 0.9;
      // Incompatible with pure buttons or links
      if (
        ["button", "link", "checkbox", "radio"].includes(role) ||
        tag === "button" ||
        tag === "a"
      ) {
        return 0.0;
      }
      return 0.3;
    }

    case "check":
    case "uncheck": {
      if (type === "checkbox" || role === "checkbox" || role === "switch") return 1.0;
      if (type === "radio" || role === "radio") return 0.9;
      return 0.1;
    }

    case "selectOption": {
      if (tag === "select" || role === "listbox" || role === "combobox") return 1.0;
      return 0.2;
    }

    case "click":
    case "dblclick": {
      if (tag === "button" || role === "button") return 1.0;
      if (tag === "a" || role === "link") return 1.0;
      if (type === "submit" || type === "button") return 1.0;
      if (["checkbox", "radio", "tab", "menuitem", "switch"].includes(role)) return 0.95;
      if (tag === "input" && (type === "checkbox" || type === "radio")) return 0.95;
      if (tag === "input" || tag === "select" || tag === "textarea") return 0.8;
      return 0.7; // clickable general elements
    }

    case "hover": {
      if (
        tag === "button" ||
        tag === "a" ||
        role === "button" ||
        role === "link" ||
        role === "menuitem"
      ) {
        return 1.0;
      }
      return 0.8;
    }

    case "waitFor":
    case "unknown":
      return 0.8;

    default:
      return 0.7;
  }
}
