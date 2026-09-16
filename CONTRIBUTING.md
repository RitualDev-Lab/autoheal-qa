# ?? Contributing to AutoHeal-QA

Thank you for contributing to **AutoHeal-QA**!  
AutoHeal-QA is a 100% free, open-source agentic self-healing test runner for Playwright. We eliminate flaky tests and broken locators with $0 cloud cost by pairing fast deterministic heuristics with local Ollama models.

---

## ??? Development Setup

### Prerequisites
- **Node.js**: v20 or higher
- **pnpm**: v9 or higher
- **Git**
- *(Optional)* **Ollama**: If testing Tier-2 local LLM healing (`ollama run qwen2.5-coder:7b` or `llama3.2`)

### 1. Clone & Install
```bash
git clone https://github.com/RitualDev-Lab/autoheal-qa.git
cd autoheal-qa
pnpm install
```

### 2. Build Monorepo Packages
```bash
pnpm build
```

### 3. Run Automated Tests & Code Quality
```bash
# Run unit and integration tests with Vitest
pnpm test

# Type check all packages
pnpm typecheck

# Check code formatting with Biome
pnpm format:check

# Auto-format codebase
pnpm format
```

### 4. Test Live Self-Healing Demo
You can run our built-in intentionally broken demo suite to watch AutoHeal inspect the live DOM, calculate candidate locators, patch `.spec.ts` files, and verify the fix:
```bash
pnpm demo
```

---

## ??? Monorepo Architecture

- **`packages/core/`**: Shared interfaces, test event telemetry, and configuration schemas.
- **`packages/playwright-runner/`**: Playwright test listener and runner interception wrapper.
- **`packages/ast-patcher/`**: Surgical TypeScript/JavaScript AST parser that updates `page.locator()` and `page.getBy*()` calls while strictly preserving code formatting and method chaining.
- **`packages/ai-reasoner/`**: Multi-tiered locator analysis engine (Tier 1: Fast Heuristics, Tier 2: Local Ollama / AI models).
- **`apps/cli/`**: The terminal entry point (`autoheal run`, `autoheal rollback`, `autoheal status`).
- **`examples/`**: Demonstration Playwright test suites used for end-to-end integration validation.

---

## ?? Pull Request Process

1. Fork the repo and create your branch from `main`:
   ```bash
   git checkout -b feat/my-locator-heuristic
   ```
2. Write unit tests for your changes in the corresponding `tests/` directory.
3. Ensure all tests and format checks pass:
   ```bash
   pnpm test
   pnpm format:check
   pnpm typecheck
   ```
4. Commit your changes using conventional commit messages (`feat: ...`, `fix: ...`).
5. Open a Pull Request and complete the [Pull Request Template](.github/pull_request_template.md).

---

## ?? Code of Conduct

All contributors are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any unacceptable behavior to `maintainers@ritualdev.com`.
