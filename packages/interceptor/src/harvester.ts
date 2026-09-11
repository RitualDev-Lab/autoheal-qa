import type { Page } from "@playwright/test";
import {
  type HarvestedSnapshot,
  extractElementsFromHtml,
  extractInteractiveAXNodes,
  mergeCandidates,
  normalizeAXNode,
  pruneHtml,
} from "@autoheal/core";

/**
 * Safely harvests a pruned semantic snapshot and accessibility tree from a live Playwright page.
 */
export async function harvestPageSnapshot(page: Page): Promise<HarvestedSnapshot> {
  let url = "unknown";
  let title = "unknown";
  let rawHtml = "";
  let rawAX: any = null;

  try {
    url = page.url();
  } catch {
    // page may be closing
  }

  try {
    title = await page.title();
  } catch {
    // fallback
  }

  try {
    rawHtml = await page.content();
  } catch {
    // fallback
  }

  try {
    rawAX = (await (page as any).accessibility?.snapshot()) ?? null;
  } catch {
    // fallback
  }

  const prunedDom = pruneHtml(rawHtml);
  const axTree = normalizeAXNode(rawAX);
  const axInteractive = extractInteractiveAXNodes(axTree);
  const htmlElements = extractElementsFromHtml(prunedDom);
  const interactiveElements = mergeCandidates(htmlElements, axInteractive);

  return {
    url,
    title,
    timestamp: new Date().toISOString(),
    axTree,
    prunedDom,
    interactiveElements,
  };
}
