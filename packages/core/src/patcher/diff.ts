/**
 * Terminal-friendly colorized and plain unified diff generator.
 */

const ANSI_RED = "\x1b[31m";
const ANSI_GREEN = "\x1b[32m";
const ANSI_CYAN = "\x1b[36m";
const ANSI_DIM = "\x1b[90m";
const ANSI_RESET = "\x1b[0m";

/**
 * Strips ANSI escape sequences from a string.
 */
export function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: necessary for ANSI codes
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Generates a colorized git-style unified diff for a single line replacement.
 */
export function generateUnifiedDiff(
  filePath: string,
  line: number,
  originalLine: string,
  patchedLine: string,
  useColor = true,
): string {
  const red = useColor ? ANSI_RED : "";
  const green = useColor ? ANSI_GREEN : "";
  const cyan = useColor ? ANSI_CYAN : "";
  const dim = useColor ? ANSI_DIM : "";
  const reset = useColor ? ANSI_RESET : "";

  const lines = [
    `${dim}--- a/${filePath}:${line}${reset}`,
    `${dim}+++ b/${filePath}:${line}${reset}`,
    `${cyan}@@ -${line},1 +${line},1 @@${reset}`,
    `${red}- ${originalLine.trimEnd()}${reset}`,
    `${green}+ ${patchedLine.trimEnd()}${reset}`,
  ];

  return lines.join("\n");
}
