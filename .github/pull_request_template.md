## ?? Summary of Changes

<!-- Explain the bug fixed or feature added to AutoHeal-QA -->

---

## ?? Monorepo Packages Affected

- [ ] `apps/cli` (CLI commands & options)
- [ ] `packages/playwright-runner` (Playwright interception & error harvester)
- [ ] `packages/ast-patcher` (Source code rewriting & AST manipulations)
- [ ] `packages/ai-reasoner` (Heuristic scoring & LLM prompts)
- [ ] `packages/core` (Types & config)
- [ ] `examples/` or test suites

---

## ?? Type of Change

- [ ] ?? **Bug Fix** (locator parsing or execution fix)
- [ ] ? **New Feature** (new locator strategy, reporting format, AI model)
- [ ] ? **Performance Improvement** (faster DOM pruning, speedier test loop)
- [ ] ??? **Safety / Rollback Guard**
- [ ] ?? **Tests Added / Updated**
- [ ] ?? **Documentation**

---

## ?? Verification Checklist

- [ ] **Tests Pass**: `pnpm test` passes completely without regressions.
- [ ] **Type Check**: `pnpm typecheck` succeeds with 0 errors.
- [ ] **Format Check**: `pnpm format:check` runs cleanly via Biome.
- [ ] **Demo Validation**: Verified by running `pnpm demo` or against a custom Playwright test suite.
- [ ] **Backup Integrity**: Verified that `.autoheal-backup` snapshots are properly created and can be restored via `autoheal rollback`.

---

## ?? Test Execution Output / Logs

<!-- Paste output or screenshot showing successful self-healing and verification -->
