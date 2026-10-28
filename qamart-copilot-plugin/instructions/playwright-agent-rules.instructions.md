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
- Fixtures in `tests/fixtures.ts`: `api` (a `QaMartApi` with `login`, `validateCoupon`, `placeOrder`, `reset`) and `signedInPage` (signed in as `users.standard`, on `/products`).
- Data in `tests/test-data.ts`: `users`, `shipping`, `products`, `coupons`.

## Locators, in this order
1. `getByRole(role, { name })`
2. `getByLabel(label)`
3. `getByText(text)` for static copy only
4. `getByTestId(id)` when there is no accessible name (QA Mart has `cart-count`, `greeting`, `toast`, `cart-subtotal`, `order-subtotal`, `order-discount`, `order-total`, `coupon-message`, `order-id`, `order-paid`, `qty-<id>`)
5. CSS only as a last resort, with a comment asking for a test id

Never use XPath, `nth-child`, `.nth()`, `.first()` to pick a product, ids (`#email`) or class names (`.product-card`): v2 renames them and reverses the product order. Scope instead: `list.getByRole('listitem').filter({ hasText: products.mouse.name })`.

## Waiting and assertions
- No `waitForTimeout`, no `waitForLoadState('networkidle')` as a sync point. Use web-first assertions: `toBeVisible`, `toHaveText`, `toHaveCount`, `toHaveURL`, `toBeDisabled`, `toHaveValue`.
- Never read then assert (`textContent()` then `toBe`). Assert on the locator so it retries.
- Assert the exact value the story states: status code, message text, amount (`'₹1,299'`). Avoid `toBeTruthy()` and `> 0` when the value is known.
- For API tests assert both `status` and the relevant body field (`body.error`, `body.discount`).
- Prove a negative explicitly: for "does not call the API", record requests and assert the list is empty.
- One behavior per test. Wrap multi-step journeys in `test.step('<what the shopper does>', ...)`.
- No `test.only`, `page.pause()` or `console.log` in committed code. `test.skip`/`test.fixme` need a condition and a bug id.

## Test data
- Import accounts, shipping details, products, prices and coupons from `tests/test-data.ts`. Never type an email, password, price or coupon code literal into a spec.
- Derive variants from existing data instead of inventing secrets: `` `${users.standard.password}-wrong` `` for a wrong password, `users.standard.email.toUpperCase()` for case tests.
- Compute expected money from `products.<x>.price` and format it the way the UI does (`₹` plus `en-IN` grouping).
- Tests that place orders use `users.returning` or a fresh state; `api.reset()` wipes orders for everyone, so do not call it from tests that run in parallel with order-placing tests.

## Page Object Model
- One class per page in `pages/<Name>Page.ts`, named export, constructor takes `Page`.
- Expose `readonly` locators and intent-level async actions (`signIn(credentials)`, `addToCart(productName)`). Accept data objects, not raw strings scattered across calls.
- No assertions in Page Objects. No `expect` import. Return nothing or the next Page Object.
- Navigation via `goto()` with a relative path (`/login`).
- Reuse existing Page Objects before creating new ones; extend them with a new locator or action rather than duplicating.

## Specs
- Import `test` and `expect` from `../fixtures` when you need `api` or `signedInPage`, otherwise from `@playwright/test`.
- Title format: `US-<id> AC<n>: <behavior>` inside `test.describe('US-<id> <feature>')`.
- Each test sets up its own state; no shared mutable variables between tests.
- After writing or changing a spec run `npm run typecheck`, `npm run lint:specs` and `npx playwright test <spec>`, then `--project=ui-v2` for UI specs.
