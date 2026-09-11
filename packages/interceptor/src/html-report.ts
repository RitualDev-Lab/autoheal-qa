import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { HarvestedFailureContext } from "@autoheal/core";

/**
 * Escapes HTML characters to prevent XSS.
 */
function escapeHtml(str?: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generates a standalone, dark-mode visual HTML report for AutoHeal-QA failure and healing diagnostics.
 */
export function generateHtmlReport(failures: HarvestedFailureContext[]): string {
  const total = failures.length;
  const withSnapshot = failures.filter((f) =>
    Boolean(f.snapshot?.interactiveElements?.length),
  ).length;
  const timestamp = new Date().toLocaleString();

  const failureCards = failures
    .map((f, i) => {
      const candidates = f.snapshot?.interactiveElements || [];
      const candidatesList =
        candidates.length > 0
          ? candidates
              .slice(0, 5)
              .map(
                (c) => `
            <div class="candidate-item">
              <span class="tag">&lt;${escapeHtml(c.tag)}&gt;</span>
              ${c.role ? `<span class="badge role">role="${escapeHtml(c.role)}"</span>` : ""}
              ${c.name ? `<span class="badge name">name="${escapeHtml(c.name)}"</span>` : ""}
              ${c.testId ? `<span class="badge testid">testid="${escapeHtml(c.testId)}"</span>` : ""}
              <code class="locator">${escapeHtml(c.locators[0] || "")}</code>
            </div>
          `,
              )
              .join("")
          : '<p class="empty-notice">No live candidate elements captured.</p>';

      return `
      <div class="card">
        <div class="card-header">
          <div class="title-row">
            <span class="index">#${i + 1}</span>
            <h3 class="test-title">${escapeHtml(f.testTitle)}</h3>
            <span class="failure-badge ${f.failureType.toLowerCase()}">${escapeHtml(f.failureType)}</span>
          </div>
          ${
            f.location
              ? `<div class="file-location">📁 ${escapeHtml(f.location.file)}:${f.location.line}</div>`
              : ""
          }
        </div>

        <div class="card-body">
          <div class="comparison-grid">
            <div class="locator-box broken">
              <div class="box-label">Broken Locator (${escapeHtml(f.action)})</div>
              <code>${escapeHtml(f.brokenLocator)}</code>
            </div>
            <div class="arrow">➔</div>
            <div class="locator-box healed">
              <div class="box-label">Target Page State (${candidates.length} Candidate Elements)</div>
              <code>${candidates.length > 0 ? escapeHtml(candidates[0].locators[0] || "No candidate") : "Analyzing..."}</code>
            </div>
          </div>

          <details class="candidates-toggle">
            <summary>View Top Captured Candidates (${candidates.length})</summary>
            <div class="candidates-container">
              ${candidatesList}
            </div>
          </details>
        </div>
      </div>
    `;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AutoHeal-QA Diagnostics & Healing Report</title>
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-card: #21262d;
      --text-primary: #f0f6fc;
      --text-secondary: #8b949e;
      --border: #30363d;
      --accent-green: #238636;
      --accent-red: #da3633;
      --accent-purple: #8957e5;
      --accent-blue: #58a6ff;
      --accent-amber: #d29922;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.5;
      padding: 2rem 1rem;
    }

    .container {
      max-width: 1000px;
      margin: 0 auto;
    }

    header {
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
    }

    .header-badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--accent-blue);
      background: rgba(88, 166, 255, 0.1);
      border: 1px solid rgba(88, 166, 255, 0.2);
      padding: 0.2rem 0.6rem;
      border-radius: 20px;
      margin-bottom: 0.5rem;
    }

    h1 { font-size: 1.8rem; margin-bottom: 0.4rem; }
    .subtitle { color: var(--text-secondary); font-size: 0.9rem; }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2.5rem;
    }

    .kpi-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
    }

    .kpi-title { font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.25rem; }
    .kpi-value { font-size: 1.6rem; font-weight: 700; color: var(--text-primary); }

    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 1.5rem;
      overflow: hidden;
    }

    .card-header {
      padding: 1rem;
      border-bottom: 1px solid var(--border);
      background: rgba(255,255,255,0.02);
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.4rem;
    }

    .index { color: var(--text-secondary); font-weight: 600; }
    .test-title { font-size: 1.1rem; flex-grow: 1; }

    .failure-badge {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      background: rgba(218, 54, 51, 0.2);
      color: var(--accent-red);
      border: 1px solid rgba(218, 54, 51, 0.4);
    }

    .file-location { font-size: 0.85rem; color: var(--text-secondary); font-family: monospace; }

    .card-body { padding: 1.25rem; }

    .comparison-grid {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 0.75rem;
      align-items: center;
      margin-bottom: 1rem;
    }

    .arrow { color: var(--text-secondary); font-size: 1.2rem; }

    .locator-box {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.75rem;
    }

    .locator-box.broken { border-left: 3px solid var(--accent-red); }
    .locator-box.healed { border-left: 3px solid var(--accent-green); }

    .box-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 0.35rem;
      text-transform: uppercase;
    }

    code {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 0.85rem;
      color: var(--text-primary);
      word-break: break-all;
    }

    details.candidates-toggle {
      margin-top: 1rem;
      cursor: pointer;
    }

    details summary {
      font-size: 0.85rem;
      color: var(--accent-blue);
      user-select: none;
    }

    .candidates-container {
      margin-top: 0.75rem;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .candidate-item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
    }

    .badge {
      font-size: 0.7rem;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      background: var(--bg-card);
      border: 1px solid var(--border);
    }

    .empty-notice { color: var(--text-secondary); font-size: 0.85rem; }

    footer {
      text-align: center;
      color: var(--text-secondary);
      font-size: 0.85rem;
      margin-top: 3rem;
      border-top: 1px solid var(--border);
      padding-top: 1.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-badge">AutoHeal-QA Diagnostics Engine</div>
      <h1>Test Healing & Diagnostics Dashboard</h1>
      <p class="subtitle">Generated on ${escapeHtml(timestamp)} · Zero Cloud Cost ($0 AI & Local Heuristics)</p>
    </header>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">Intercepted Failures</div>
        <div class="kpi-value">${total}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">DOM Snapshots Captured</div>
        <div class="kpi-value">${withSnapshot}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Running Cost</div>
        <div class="kpi-value" style="color: var(--accent-green);">$0.00</div>
      </div>
    </div>

    <div class="failures-section">
      ${failureCards || '<p class="empty-notice">No test failures detected. All Playwright tests passed!</p>'}
    </div>

    <footer>
      <p>AutoHeal-QA (Healwright) · Free & Open-Source Playwright Test Self-Healing Agent</p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Saves generated HTML report to disk.
 */
export async function saveHtmlReport(
  failures: HarvestedFailureContext[],
  outputPath = "autoheal-report.html",
): Promise<string> {
  const html = generateHtmlReport(failures);
  const resolved = path.resolve(process.cwd(), outputPath);
  await fs.writeFile(resolved, html, "utf8");
  return resolved;
}
