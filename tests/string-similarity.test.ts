import { describe, expect, it } from "vitest";
import {
  computeStringSimilarity,
  jaroWinklerSimilarity,
  levenshteinDistance,
  levenshteinSimilarity,
  normalizeIdentifier,
  substringSimilarity,
  tokenSetSimilarity,
} from "../packages/core/src/heuristics/string-similarity.js";

describe("String Similarity Heuristics", () => {
  describe("levenshteinDistance & similarity", () => {
    it("handles exact and empty string edge cases", () => {
      expect(levenshteinDistance("submit", "submit")).toBe(0);
      expect(levenshteinSimilarity("submit", "submit")).toBe(1.0);
      expect(levenshteinDistance("", "")).toBe(0);
      expect(levenshteinSimilarity("", "")).toBe(1.0);
      expect(levenshteinDistance("abc", "")).toBe(3);
      expect(levenshteinSimilarity("abc", "")).toBe(0.0);
    });

    it("calculates accurate normalized similarity for slight typos", () => {
      // 1 edit out of 6 -> ~0.833
      const sim = levenshteinSimilarity("submtt", "submit");
      expect(sim).toBeGreaterThan(0.8);
    });
  });

  describe("jaroWinklerSimilarity", () => {
    it("boosts matching prefixes", () => {
      const jw = jaroWinklerSimilarity("checkout", "checkin");
      expect(jw).toBeGreaterThan(0.8);
    });

    it("returns 1.0 for case-insensitive match", () => {
      expect(jaroWinklerSimilarity("SIGN IN", "sign in")).toBe(1.0);
    });
  });

  describe("normalizeIdentifier", () => {
    it("correctly tokenizes kebab-case, snake_case, camelCase, and PascalCase", () => {
      expect(normalizeIdentifier("submit-button")).toEqual(["submit", "button"]);
      expect(normalizeIdentifier("submit_button_v2")).toEqual(["submit", "button", "v2"]);
      expect(normalizeIdentifier("submitButton")).toEqual(["submit", "button"]);
      expect(normalizeIdentifier("SubmitButtonComponent")).toEqual([
        "submit",
        "button",
        "component",
      ]);
      expect(normalizeIdentifier("login.btn#primary")).toEqual(["login", "btn", "primary"]);
    });
  });

  describe("tokenSetSimilarity", () => {
    it("handles word order inversions", () => {
      const score = tokenSetSimilarity("Sign In with Google", "Google Sign In");
      // Shares 3 out of 4 distinct tokens
      expect(score).toBeGreaterThan(0.7);
    });

    it("matches snake_case with kebab-case", () => {
      const score = tokenSetSimilarity("checkout_submit_btn", "checkout-submit-btn");
      expect(score).toBe(1.0);
    });
  });

  describe("substringSimilarity", () => {
    it("detects containment", () => {
      const score = substringSimilarity("Submit", "Submit Application Now");
      expect(score).toBeGreaterThan(0.25);
    });
  });

  describe("computeStringSimilarity", () => {
    it("finds strong similarity between renamed buttons", () => {
      const score = computeStringSimilarity("Submit", "Submit Order");
      expect(score).toBeGreaterThan(0.75);
    });

    it("rejects completely different labels", () => {
      const score = computeStringSimilarity("Submit", "Delete Account");
      expect(score).toBeLessThan(0.45);
      expect(computeStringSimilarity("Submit", "XYZ 123")).toBe(0.0);
    });
  });
});
