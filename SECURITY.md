# Security Policy

The AutoHeal-QA team treats code safety, DOM data sanitization, and automated patch safety as critical priorities. Because AutoHeal-QA instruments Playwright test executions and writes patches to your `.spec.ts` source files, we adhere to strict defensive engineering standards.

## Supported Versions

Security fixes and updates are provided for the following releases:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Security Vulnerability

If you discover a security vulnerability (such as sensitive DOM credential leakage, AST code injection risk, or an unverified file write bug):

1. **Do NOT open a public GitHub issue.** Public disclosures expose users before a coordinated patch is deployed.
2. **Use GitHub Private Vulnerability Reporting**:
   - Navigate to the **[Security tab](https://github.com/RitualDev-Lab/autoheal-qa/security)** on GitHub.
   - Click **"Report a vulnerability"** to submit a private report to project maintainers.
3. **Alternative Direct Contact**:
   - Email our maintainers directly at: **`security@ritualdev.com`**
   - Please provide:
     - Description of the vulnerability.
     - Playwright version, OS, and reproduction `.spec.ts` test case.
     - Potential impact on test environments or sensitive data.

## Response SLA

- **Initial Triage**: Within 24-48 hours.
- **Remediation Plan**: Within 72 hours.
- **Patch Release**: High-priority patches will be pushed to npm immediately.

---

## ??? Core Security & Safety Invariants

- **Zero Remote Code Injection**: Healing locators are strictly parsed as AST CallExpressions (`page.locator()`, `page.getByRole()`). AutoHeal will never evaluate or inject arbitrary executable JavaScript strings into your test suites.
- **Sensitive DOM Pruning**: AutoHeal's DOM harvesting engine strips values from password inputs (`input[type="password"]`), authentication tokens, and hidden sensitive form fields before passing accessibility trees to heuristic or LLM analyzers.
- **Atomic Backup & Verification Guard**: AutoHeal creates a `.autoheal-backup` directory before modifying any file on disk, and automatically verifies that the healed test passes before finalizing changes.
