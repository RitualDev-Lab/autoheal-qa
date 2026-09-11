import { describe, expect, it } from "vitest";
import { createPlaywrightRunner } from "../packages/core/src/verifier/runner.js";

describe("Playwright Runner Builder", () => {
  it("creates a runner function", () => {
    const runner = createPlaywrightRunner({ timeoutMs: 5000 });
    expect(typeof runner).toBe("function");
  });
});
