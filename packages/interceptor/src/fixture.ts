import type { HarvestedSnapshot } from "@ritualdev-lab/autoheal-core";
import { type Page, test as base } from "@playwright/test";
import { harvestPageSnapshot } from "./harvester.js";

export interface AutoHealFixture {
  page: Page;
  autoheal: {
    harvestSnapshot: () => Promise<HarvestedSnapshot>;
    captureDomSnapshot: () => Promise<string>;
    captureAccessibilityTree: () => Promise<any>;
  };
}

/**
 * Custom Playwright test fixture that equips the test with DOM/AX snapshot utilities.
 */
export const test = base.extend<AutoHealFixture>({
  autoheal: async ({ page }, use) => {
    const helper = {
      harvestSnapshot: async () => harvestPageSnapshot(page),
      captureDomSnapshot: async () => {
        try {
          return await page.content();
        } catch {
          return "";
        }
      },
      captureAccessibilityTree: async () => {
        try {
          return (await (page as any).accessibility?.snapshot()) ?? null;
        } catch {
          return null;
        }
      },
    };

    await use(helper);
  },
});

export { expect } from "@playwright/test";
