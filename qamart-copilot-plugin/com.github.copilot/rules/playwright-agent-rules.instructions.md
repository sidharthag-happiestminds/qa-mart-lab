---
name: 'Playwright agent rules'
description: 'Playwright + TypeScript coding rules for QA Mart specs, fixtures and Page Objects: locators, assertions, test data and POM conventions.'
applyTo: 'tests/**/*.ts,pages/**/*.ts,playwright.config.ts'
---
# Playwright agent rules for QA Mart

Follow these when you write, change or review any file under `tests/` or `pages/`.

## Project facts
- Config: `playwright.config.ts`. `baseURL` comes from `PORT` (default 3000) and the `webServer` starts the app, so never start it yourself inside a test.
- Projects: `chromium` (default, ignores `legacy`, `seeded`, `trace-demo`), `ui-v2` (sends `x-qamart-ui: v2`), `seeded`, `legacy`, `demo`.
- Fixtures in `tests/fixtures.ts`: `api` (`QaMartApi`) and `signedInPage` (signed in as `users.standard`, on `/products`).
- Data in `tests/test-data.ts`: `users`, `shipping`, `products`, `coupons`.

## Locators, in this order
1. `getByRole` with a name
2. `getByLabel`
3. `getByText` for static copy
4. `getByTestId` when there is no accessible name
5. CSS only as a last resort; ask for a test id

Never use XPath, `nth-child`, `.nth()`, `.first()` to pick a product, ids (`#email`) or class names (`.product-card`): v2 renames them and reverses the product order. Scope products by accessible name: `list.getByRole('listitem').filter({ hasText: products.mouse.name })`.

## Waiting and assertions
- No `waitForTimeout` or `waitForLoadState('networkidle')` as a sync point. Use web-first assertions: `toBeVisible`, `toHaveText`, `toHaveCount`, `toHaveURL`, `toBeDisabled`, `toHaveValue`.
- Never read then assert (`textContent()` then `toBe`). Assert on the locator so it retries.
- Assert exact values from the story: status code, message text, amount. Avoid `toBeTruthy()` and `> 0` where the value is known.
- Assertions live in specs, not Page Objects. One behavior per test; use `test.step` for multi-step journeys.
- No `test.only`, `page.pause()` or `console.log` in committed code. Skips need a condition and bug id.

## Test data and Page Object Model
- Import emails, passwords, prices and coupons from `tests/test-data.ts`; derive variants such as `` `${users.standard.password}-wrong` ``.
- One named-export class per page in `pages/<Name>Page.ts`; constructor takes `Page`, exposes `readonly` locators and intent-level async actions. No assertions in Page Objects.
- Tests needing `api` or `signedInPage` import `test` and `expect` from `tests/fixtures.ts`; others may import from `@playwright/test`.
- Each test sets up its own state. `api.reset()` wipes the shared order store; do not run it in parallel with order-placement tests.
- Every test title identifies story and AC, e.g. `US-104 AC2: wrong password shows the sign-in error`.

Before handoff run `npm run typecheck`, `npm run lint:specs`, the targeted spec, and `--project=ui-v2` for UI specs. Keep a correct test red when the app violates its story; never edit `app/` or weaken its assertion.
