---
name: review-playwright-tests
description: 'Review QA Mart Playwright specs or Page Objects for flaky patterns, weak selectors and assertions, and refactoring opportunities. Read-only.'
argument-hint: 'file or folder, for example tests/legacy/legacy-checkout.spec.ts'
agent: 'QA Review'
---
Review: **${input:target:tests/legacy/legacy-checkout.spec.ts}**

You are reviewing, not editing. Do not change any file.

1. Read `docs/team-conventions.md` and the files under review. If the target is a folder, review every `*.spec.ts` and `pages/*.ts` in it.
2. Run `node scripts/lint-specs.cjs <files>` and treat its output as the minimum set of findings.
3. Check what the linter cannot see:
   - **Flaky patterns:** hard waits, races with the 300-1700 ms product load, reading a value then asserting, `page.url()` checks, order-dependent selection (v2 reverses products), shared state, `api.reset()` in parallel tests, missing `await`.
   - **Selectors:** anything that is not role, label, text or test id; ids and classes that v2 renames (`#login-btn` becomes `#signin-submit`, `.product-card` becomes `.tile`).
   - **Assertions:** missing, non-retrying, vague (`toBeTruthy`, `> 0`), or not tied to the story outcome (order id, amount paid, status code, message).
   - **Structure:** no story id, several behaviors in one test, no `test.step`, logic that belongs in a Page Object, hard-coded data or URL.
4. For each finding give a concrete fix as a short snippet using QA Mart locators and `tests/test-data.ts`.
5. Say whether the test will pass on v2 (`npm run test:v2`) and why.

Output:
- a table: file, line, rule, severity (blocker, major, minor), problem, fix; ordered by severity
- a refactoring outline: which Page Objects and steps the test should become
- a verdict: **Keep**, **Fix** or **Kill**, and the single most important change
