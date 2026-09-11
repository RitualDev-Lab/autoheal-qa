# AutoHeal-QA Demo Sandbox

This demo showcases how **AutoHeal-QA** automatically detects, suggests, and verifies healed locators when web UI elements change.

## The Scenario

In `public/index.html`, the authentication button text was changed from `"Submit"` to `"Sign In to Account"`.
The existing Playwright test in `tests/auth.spec.ts` still looks for:
```ts
await page.getByRole("button", { name: "Submit" }).click();
```

## Running the Demo

### 1. Run Tests with AutoHeal Interception
```bash
autoheal test
```
The test will fail because `Submit` does not exist on the page. AutoHeal intercepts the failure, extracts live candidates, and analyzes potential replacements using zero-cost heuristics ($0 AI).

### 2. Review and Apply the Healed Locator
```bash
autoheal heal
```
You will see an interactive colorized diff preview:
```diff
- await page.getByRole("button", { name: "Submit" }).click();
+ await page.getByRole("button", { name: "Sign In to Account" }).click();
```
Press `Y` to verify and apply the patch. AutoHeal will re-run the test to confirm the fix passes!

### 3. Revert Anytime
```bash
autoheal rollback
```
Instantly restores the test file to its original unpatched state.
