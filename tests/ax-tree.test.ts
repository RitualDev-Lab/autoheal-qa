import { describe, it, expect } from "vitest";
import {
  extractInteractiveAXNodes,
  normalizeAXNode,
} from "../packages/core/src/snapshot/ax-tree.js";

describe("Phase 2 — Accessibility Tree Parser & Normalizer (@autoheal/core)", () => {
  it("normalizes a raw Playwright accessibility tree snapshot", () => {
    const rawSnapshot = {
      role: "WebArea",
      name: "Checkout Page",
      children: [
        {
          role: "heading",
          name: "Complete Your Order",
          level: 1,
        },
        {
          role: "button",
          name: "Pay $49.00",
          disabled: false,
        },
        {
          role: "textbox",
          name: "Cardholder Name",
          value: "John Doe",
        },
        {
          role: "checkbox",
          name: "Remember this card",
          checked: true,
        },
      ],
    };

    const normalized = normalizeAXNode(rawSnapshot);
    expect(normalized).toBeDefined();
    expect(normalized?.role).toBe("webarea");
    expect(normalized?.name).toBe("Checkout Page");
    expect(normalized?.children).toHaveLength(4);

    const button = normalized?.children?.[1];
    expect(button?.role).toBe("button");
    expect(button?.name).toBe("Pay $49.00");
    expect(button?.disabled).toBe(false);

    const checkbox = normalized?.children?.[3];
    expect(checkbox?.role).toBe("checkbox");
    expect(checkbox?.checked).toBe(true);
  });

  it("extracts all interactive nodes recursively from the tree", () => {
    const tree = {
      role: "webarea",
      name: "App",
      children: [
        {
          role: "navigation",
          children: [
            { role: "link", name: "Home" },
            { role: "link", name: "Pricing" },
          ],
        },
        {
          role: "main",
          children: [
            { role: "heading", name: "Login" },
            { role: "textbox", name: "Email" },
            { role: "textbox", name: "Password" },
            { role: "button", name: "Sign in" },
          ],
        },
      ],
    };

    const interactive = extractInteractiveAXNodes(tree);

    expect(interactive).toHaveLength(5);
    const roles = interactive.map((i) => i.role);
    expect(roles).toEqual(["link", "link", "textbox", "textbox", "button"]);
    expect(interactive.find((i) => i.name === "Sign in")).toBeDefined();
  });

  it("handles null or undefined tree gracefully", () => {
    expect(normalizeAXNode(null)).toBeNull();
    expect(extractInteractiveAXNodes(null)).toEqual([]);
  });
});
