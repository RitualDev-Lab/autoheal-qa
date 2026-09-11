import { describe, it, expect } from "vitest";
import {
  extractElementsFromHtml,
  generateCandidateLocators,
  mergeCandidates,
} from "../packages/core/src/snapshot/element-extractor.js";
import { pruneHtml } from "../packages/core/src/snapshot/dom-pruner.js";

describe("Phase 2 — Interactive Element Extractor & Candidate Generator (@autoheal/core)", () => {
  it("generates prioritized candidate locators for an element", () => {
    const locators = generateCandidateLocators({
      id: "elem-1",
      tag: "button",
      role: "button",
      name: "Submit Order",
      testId: "submit-order-btn",
      attributes: {
        id: "order-btn",
        "data-testid": "submit-order-btn",
      },
    });

    // Highest priority: TestID
    expect(locators).toContain("page.getByTestId('submit-order-btn')");
    // Second priority: Role + Name
    expect(locators).toContain("page.getByRole('button', { name: 'Submit Order' })");
    // Fallback: ID
    expect(locators).toContain("page.locator('#order-btn')");
  });

  it("extracts candidate elements from pruned HTML", () => {
    const html = pruneHtml(`
      <nav>
        <a href="/dashboard" id="dash-link">Dashboard</a>
      </nav>
      <main>
        <input type="text" placeholder="Search products" name="query" />
        <button type="submit" data-testid="search-btn">Search</button>
      </main>
    `);

    const candidates = extractElementsFromHtml(html);

    expect(candidates.length).toBeGreaterThanOrEqual(3);

    const link = candidates.find((c) => c.tag === "a");
    expect(link?.text).toBe("Dashboard");
    expect(link?.locators).toContain("page.locator('#dash-link')");

    const input = candidates.find((c) => c.tag === "input");
    expect(input?.placeholder).toBe("Search products");
    expect(input?.locators).toContain("page.getByPlaceholder('Search products')");

    const button = candidates.find((c) => c.tag === "button");
    expect(button?.testId).toBe("search-btn");
    expect(button?.locators).toContain("page.getByTestId('search-btn')");
    expect(button?.locators).toContain("page.getByRole('button', { name: 'Search' })");
  });

  it("merges HTML candidates with accessibility nodes without duplicates", () => {
    const htmlElements = [
      {
        id: "elem-1",
        tag: "button",
        role: "button",
        name: "Sign In",
        attributes: {},
        locators: ["page.getByRole('button', { name: 'Sign In' })"],
      },
    ];

    const axNodes = [
      {
        role: "button",
        name: "Sign In",
      },
      {
        role: "link",
        name: "Forgot Password?",
      },
    ];

    const merged = mergeCandidates(htmlElements, axNodes);

    expect(merged).toHaveLength(2);
    expect(merged.find((m) => m.name === "Forgot Password?")).toBeDefined();
    expect(merged.find((m) => m.name === "Forgot Password?")?.locators).toContain(
      "page.getByRole('link', { name: 'Forgot Password?' })",
    );
  });
});
