/**
 * Fast deterministic HTML DOM pruner.
 * Strips script tags, styles, SVGs, iframes, comments, and utility classes,
 * keeping only semantic HTML tags and locator-relevant attributes.
 */

const NOISY_TAGS_REGEX = /<(script|style|noscript|svg|iframe)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi;
const COMMENTS_REGEX = /<!--[\s\S]*?-->/g;
const EXTRA_WHITESPACE_REGEX = /\s{2,}/g;

const PRESERVED_ATTRIBUTES = new Set([
  "id",
  "name",
  "type",
  "role",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-hidden",
  "aria-expanded",
  "aria-checked",
  "aria-selected",
  "aria-disabled",
  "data-testid",
  "data-cy",
  "data-test",
  "data-qa",
  "data-id",
  "placeholder",
  "href",
  "value",
  "title",
  "alt",
  "for",
]);

const UTILITY_CLASS_REGEX =
  /^(p[xytblr]?|m[xytblr]?|w|h|bg|text|flex|grid|border|rounded|shadow|cursor|items|justify|space|gap|max|min|z|top|bottom|left|right|opacity|transition|duration)(-[a-z0-9]+)?$/i;

/**
 * Filters attributes on a single HTML tag to retain only selector-relevant attributes.
 */
export function pruneAttributes(tagString: string): string {
  const match = tagString.match(/^<(\/?[a-zA-Z0-9-]+)([\s\S]*?)(\/?)>$/);
  if (!match) return tagString;

  const [, tagName, attrString, closingSlash] = match;
  if (tagName.startsWith("/")) {
    return `<${tagName}>`;
  }

  const prunedAttrs: string[] = [];
  const attrRegex = /([a-zA-Z0-9_:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

  let attrMatch = attrRegex.exec(attrString);
  while (attrMatch !== null) {
    const attrName = attrMatch[1].toLowerCase();
    const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

    if (
      PRESERVED_ATTRIBUTES.has(attrName) ||
      attrName.startsWith("aria-") ||
      attrName.startsWith("data-")
    ) {
      prunedAttrs.push(`${attrName}="${attrValue}"`);
    } else if (attrName === "class" && attrValue.length > 0) {
      // Filter out utility styles (Tailwind, etc.), keep semantic classes
      const classes = attrValue
        .split(/\s+/)
        .filter((cls) => cls.length > 2 && !cls.includes(":") && !UTILITY_CLASS_REGEX.test(cls))
        .slice(0, 3);
      if (classes.length > 0) {
        prunedAttrs.push(`class="${classes.join(" ")}"`);
      }
    }
    attrMatch = attrRegex.exec(attrString);
  }

  const attrsPart = prunedAttrs.length > 0 ? ` ${prunedAttrs.join(" ")}` : "";
  const endPart = closingSlash ? " />" : ">";
  return `<${tagName}${attrsPart}${endPart}`;
}

/**
 * Prunes a raw HTML string into a compact, token-efficient semantic representation.
 */
export function pruneHtml(rawHtml: string): string {
  if (!rawHtml) return "";

  // 1. Remove comments
  let cleaned = rawHtml.replace(COMMENTS_REGEX, "");

  // 2. Remove script, style, svg, noscript, iframe tags and contents
  cleaned = cleaned.replace(NOISY_TAGS_REGEX, "");

  // 3. Prune attributes on each remaining HTML tag
  cleaned = cleaned.replace(/<[^>]+>/g, (tag) => pruneAttributes(tag));

  // 4. Normalize whitespace
  cleaned = cleaned.replace(EXTRA_WHITESPACE_REGEX, " ").replace(/>\s+</g, ">\n<").trim();

  return cleaned;
}
