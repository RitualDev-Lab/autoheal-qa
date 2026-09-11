import type { NormalizedAXNode } from "./types.js";

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "option",
  "menuitem",
  "tab",
  "switch",
  "searchbox",
  "slider",
  "spinbutton",
]);

/**
 * Normalizes a raw Playwright accessibility snapshot node into a clean NormalizedAXNode.
 */
export function normalizeAXNode(rawNode: any): NormalizedAXNode | null {
  if (!rawNode || typeof rawNode !== "object") return null;

  const role = typeof rawNode.role === "string" ? rawNode.role.toLowerCase() : "generic";

  const normalized: NormalizedAXNode = {
    role,
  };

  if (typeof rawNode.name === "string" && rawNode.name.trim().length > 0) {
    normalized.name = rawNode.name.trim();
  }

  if (typeof rawNode.value === "string" && rawNode.value.trim().length > 0) {
    normalized.value = rawNode.value.trim();
  }

  if (typeof rawNode.description === "string" && rawNode.description.trim().length > 0) {
    normalized.description = rawNode.description.trim();
  }

  if (typeof rawNode.disabled === "boolean") {
    normalized.disabled = rawNode.disabled;
  }

  if (rawNode.checked === true || rawNode.checked === false || rawNode.checked === "mixed") {
    normalized.checked = rawNode.checked;
  }

  if (rawNode.pressed === true || rawNode.pressed === false || rawNode.pressed === "mixed") {
    normalized.pressed = rawNode.pressed;
  }

  if (typeof rawNode.level === "number") {
    normalized.level = rawNode.level;
  }

  if (typeof rawNode.expanded === "boolean") {
    normalized.expanded = rawNode.expanded;
  }

  if (typeof rawNode.focused === "boolean") {
    normalized.focused = rawNode.focused;
  }

  if (Array.isArray(rawNode.children)) {
    const children: NormalizedAXNode[] = [];
    for (const child of rawNode.children) {
      const normChild = normalizeAXNode(child);
      if (normChild) {
        children.push(normChild);
      }
    }
    if (children.length > 0) {
      normalized.children = children;
    }
  }

  return normalized;
}

/**
 * Recursively extracts all interactive nodes from an accessibility tree.
 */
export function extractInteractiveAXNodes(root: NormalizedAXNode | null): NormalizedAXNode[] {
  if (!root) return [];

  const results: NormalizedAXNode[] = [];

  function traverse(node: NormalizedAXNode) {
    if (INTERACTIVE_ROLES.has(node.role)) {
      results.push(node);
    }
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(root);
  return results;
}
