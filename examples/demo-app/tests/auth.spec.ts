import path from "node:path";
import { expect, test } from "@playwright/test";

test.describe("Authentication Suite", () => {
  test("user logs in successfully", async ({ page }) => {
    const htmlPath = `file://${path.resolve("public/index.html")}`;
    await page.goto(htmlPath);

    // Valid email input
    await page.getByPlaceholder("Business email address").fill("developer@example.com");

    // Password input
    await page.locator("#password").fill("SuperSecret123");

    // Broken locator: Dev team renamed button from "Submit" to "Sign In to Account"
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.locator("#status")).toBeVisible();
  });
});
