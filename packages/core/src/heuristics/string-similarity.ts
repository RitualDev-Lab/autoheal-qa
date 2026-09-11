/**
 * Zero-dependency, high-performance string similarity and identifier comparison algorithms.
 */

/**
 * Computes standard Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 0; i < a.length; i++) {
    let prev = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      const current = Math.min(
        row[j + 1] + 1, // deletion
        prev + 1, // insertion
        row[j] + cost, // substitution
      );
      row[j] = prev;
      prev = current;
    }
    row[b.length] = prev;
  }

  return row[b.length];
}

/**
 * Computes normalized Levenshtein similarity (0.0 to 1.0).
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const s1 = a.trim().toLowerCase();
  const s2 = b.trim().toLowerCase();
  if (s1 === s2) return 1.0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(s1, s2);
  return Math.max(0, 1.0 - dist / maxLen);
}

/**
 * Computes Jaro similarity between two strings.
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1.length || !s2.length) return 0.0;

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (!s2Matches[j] && s1[i] === s2[j]) {
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < s1.length; i++) {
    if (s1Matches[i]) {
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
  }

  const m = matches;
  const t = transpositions / 2;
  return (m / s1.length + m / s2.length + (m - t) / m) / 3;
}

/**
 * Computes Jaro-Winkler similarity (0.0 to 1.0), emphasizing matching prefixes.
 */
export function jaroWinklerSimilarity(a: string, b: string, prefixScale = 0.1): number {
  const s1 = a.trim().toLowerCase();
  const s2 = b.trim().toLowerCase();
  if (s1 === s2) return 1.0;

  const jaro = jaroSimilarity(s1, s2);
  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));

  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return Math.min(1.0, jaro + prefix * prefixScale * (1 - jaro));
}

/**
 * Normalizes identifier into distinct lowercase tokens.
 * Handles kebab-case, snake_case, camelCase, PascalCase, dot.notation, and whitespace.
 *
 * Example: 'submitButton-primary_v2' -> ['submit', 'button', 'primary', 'v2']
 */
export function normalizeIdentifier(str: string): string[] {
  if (!str) return [];
  // Split on camelCase transitions
  const spaced = str
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  // Split on symbols and whitespace
  const tokens = spaced
    .toLowerCase()
    .split(/[\s\-_.:/\\#]+/)
    .filter((t) => t.length > 0);

  return tokens;
}

/**
 * Computes Dice-Sørensen coefficient on token sets (order independent).
 * E.g. 'Sign in with Google' and 'Google Sign In' share high similarity.
 */
export function tokenSetSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeIdentifier(a));
  const tokensB = new Set(normalizeIdentifier(b));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection++;
    }
  }

  return (2 * intersection) / (tokensA.size + tokensB.size);
}

/**
 * Checks if one normalized string is a substring or prefix of another.
 */
export function substringSimilarity(a: string, b: string): number {
  const s1 = a.trim().toLowerCase();
  const s2 = b.trim().toLowerCase();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;

  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length);
    const maxLen = Math.max(s1.length, s2.length);
    return minLen / maxLen;
  }
  return 0;
}

/**
 * Computes composite similarity score between two strings using best matching heuristic.
 */
export function computeStringSimilarity(target?: string, candidate?: string): number {
  if (!target || !candidate) return 0.0;
  const t = target.trim().toLowerCase();
  const c = candidate.trim().toLowerCase();

  if (t === c) return 1.0;

  const lev = levenshteinSimilarity(t, c);
  const jw = jaroWinklerSimilarity(t, c);
  const tokenSim = tokenSetSimilarity(t, c);
  const subSim = substringSimilarity(t, c);

  // Substring boost if one is prefix/suffix of other (e.g. "Submit" vs "Submit Application")
  const containmentScore = subSim > 0 ? 0.75 + subSim * 0.2 : 0;

  return Math.max(lev, jw, tokenSim, containmentScore);
}
