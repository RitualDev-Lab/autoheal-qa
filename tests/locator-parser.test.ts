import { describe, expect, it } from "vitest";
import { parseLocator } from "../packages/core/src/heuristics/locator-parser.js";

describe("Playwright Locator Parser", () => {
  it("parses getByRole with name and exact options", () => {
    const res = parseLocator("page.getByRole('button', { name: 'Sign in', exact: true })");
    expect(res.type).toBe("role");
    expect(res.role).toBe("button");
    expect(res.name).toBe("Sign in");
    expect(res.exact).toBe(true);
  });

  it("parses getByRole with regex name", () => {
    const res = parseLocator("page.getByRole('link', { name: /checkout/i })");
    expect(res.type).toBe("role");
    expect(res.role).toBe("link");
    expect(res.name).toBe("checkout");
  });

  it("parses getByTestId", () => {
    const res = parseLocator("page.getByTestId('submit-btn')");
    expect(res.type).toBe("testid");
    expect(res.value).toBe("submit-btn");
  });

  it("parses getByPlaceholder", () => {
    const res = parseLocator("page.getByPlaceholder('Enter your email address')");
    expect(res.type).toBe("placeholder");
    expect(res.value).toBe("Enter your email address");
  });

  it("parses getByText", () => {
    const res = parseLocator("page.getByText('Terms of Service')");
    expect(res.type).toBe("text");
    expect(res.value).toBe("Terms of Service");
  });

  it("parses getByLabel", () => {
    const res = parseLocator("page.getByLabel('Password')");
    expect(res.type).toBe("label");
    expect(res.value).toBe("Password");
  });

  it("parses locator with ID and data-testid selectors", () => {
    const resId = parseLocator("page.locator('#checkout-button')");
    expect(resId.type).toBe("css");
    expect(resId.value).toBe("checkout-button");

    const resTestId = parseLocator("page.locator('[data-testid=\"checkout-btn\"]')");
    expect(resTestId.type).toBe("testid");
    expect(resTestId.value).toBe("checkout-btn");
  });

  it("parses xpath locator", () => {
    const res = parseLocator("page.locator('//button[@id=\"login\"]')");
    expect(res.type).toBe("xpath");
    expect(res.selector).toBe('//button[@id="login"]');
  });
});
