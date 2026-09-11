import { describe, it, expect } from "vitest";
import { pruneHtml } from "../packages/core/src/snapshot/dom-pruner.js";

describe("Phase 2 — HTML DOM Pruner (@autoheal/core)", () => {
  it("strips scripts, styles, SVGs, iframes, and comments", () => {
    const rawHtml = `
      <!-- User profile header -->
      <div class="header">
        <script>console.log("analytics");</script>
        <style>.header { color: red; }</style>
        <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg>
        <iframe src="https://ads.com"></iframe>
        <button id="login-btn" data-testid="submit-login">Sign In</button>
      </div>
    `;

    const pruned = pruneHtml(rawHtml);

    expect(pruned).not.toContain("analytics");
    expect(pruned).not.toContain(".header { color: red; }");
    expect(pruned).not.toContain("<svg");
    expect(pruned).not.toContain("<iframe");
    expect(pruned).not.toContain("User profile header");
    expect(pruned).toContain('<button id="login-btn" data-testid="submit-login">Sign In</button>');
  });

  it("preserves vital accessibility and selector attributes while stripping utility classes", () => {
    const raw = `
      <input
        type="email"
        id="email-field"
        name="user_email"
        placeholder="you@company.com"
        aria-label="Work Email Address"
        data-testid="email-input"
        class="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600 email-control"
        style="box-shadow: none; border-color: rgb(200, 200, 200);"
      />
    `;

    const pruned = pruneHtml(raw);

    expect(pruned).toContain('type="email"');
    expect(pruned).toContain('id="email-field"');
    expect(pruned).toContain('name="user_email"');
    expect(pruned).toContain('placeholder="you@company.com"');
    expect(pruned).toContain('aria-label="Work Email Address"');
    expect(pruned).toContain('data-testid="email-input"');
    expect(pruned).toContain('class="email-control"');
    expect(pruned).not.toContain("style=");
    expect(pruned).not.toContain("focus:ring-blue-600");
  });

  it("achieves >75% reduction on a realistic noisy component tree", () => {
    const noisyHtml = `
      <div class="flex flex-col items-center justify-center min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        <div class="max-w-md w-full space-y-8 p-10 bg-white rounded-xl shadow-lg z-10">
          <svg class="mx-auto h-12 w-auto text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <script>window.tracker = { session: "xyz123" };</script>
          <form class="mt-8 space-y-6" action="#" method="POST">
            <input type="text" name="username" placeholder="Username" data-testid="username-input" class="w-full p-2" />
            <input type="password" name="password" placeholder="Password" data-testid="password-input" class="w-full p-2" />
            <button type="submit" data-testid="login-btn" class="w-full bg-indigo-600 text-white p-3 rounded">Log In</button>
          </form>
        </div>
      </div>
    `;

    const pruned = pruneHtml(noisyHtml);
    const reductionPercent = ((noisyHtml.length - pruned.length) / noisyHtml.length) * 100;

    expect(reductionPercent).toBeGreaterThan(60);
    expect(pruned).toContain('data-testid="login-btn"');
    expect(pruned).toContain('data-testid="username-input"');
  });
});
