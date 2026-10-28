# Playwright agent rules

These are the project-level rules also loaded by Copilot from [playwright-agent-rules.instructions.md](playwright-agent-rules.instructions.md). Apply them to specs, fixtures and Page Objects.

## Existing framework
- Config: `playwright.config.ts`; `baseURL` and `webServer` are already set up. Use relative paths; never hard-code `http://localhost:3000`.
- Shared fixtures: `tests/fixtures.ts` provides `api` and `signedInPage`. Shared data: `tests/test-data.ts` provides `users`, `shipping`, `products`, `coupons`.
- Reuse existing classes under `pages/` before adding another Page Object.

## Locator order
1. `getByRole(role, { name })`
2. `getByLabel(label)`
3. `getByText(text)` for static copy
4. `getByTestId(id)` where there is no accessible name
5. CSS only as a last resort; request a test id

Never use XPath, `nth-child`, `.nth()`, product positions, generated classes or CSS ids. v2 changes ids/classes and reverses the product list. Scope a product by accessible content: `page.getByRole('listitem').filter({ hasText: products.mouse.name })`.

## Assertions and waits
- Never use `waitForTimeout`. Use auto-waiting and web-first assertions (`toBeVisible`, `toHaveText`, `toHaveCount`, `toHaveURL`, `toBeDisabled`).
- Do not read a value and then assert (`textContent()` then `toBe`). Assert on the locator.
- Assert exact expected status, message and amount. Avoid `toBeTruthy()` if the exact value is known.
- Assertions belong in specs, not Page Objects.
- One behavior per test; use `test.step` for multi-step flows.

## Test data and POM
- Never type emails, passwords, prices or coupons into a spec; import from `tests/test-data.ts`. Derive negative inputs such as `` `${users.standard.password}-wrong` ``.
- Tests use `baseURL` with relative routes. No sleeps, XPath, positional selectors or `test.only`.
- A Page Object is `pages/<Name>Page.ts`, a named-export class with a `Page` constructor, `readonly` locators and intent-level async actions. It contains no assertions and returns no test verdict.
- Tests using `api` or `signedInPage` import `test` and `expect` from `tests/fixtures.ts`; others may import from `@playwright/test`.
- Every test title identifies the story and AC (`US-104 AC2: ...`). Tests set up their own state. `api.reset()` wipes the shared order store, so never run it in parallel with order-placement tests.

Before handoff run `npm run typecheck`, `npm run lint:specs`, the targeted spec, and `--project=ui-v2` for UI specs. Keep a correct test red when the app violates its story; never edit `app/` or weaken its assertion.
