---
name: playwright-test-generator
description: 'Use when generating new Playwright + TypeScript tests for QA Mart from a user story, acceptance criteria or flow name (login, search product, add to cart, checkout, order history). Produces a test-case table, Page Objects in pages/ and specs in tests/lab/ that reuse the existing fixtures and test data.'
---
# Playwright test generator (QA Mart)

Turn a story into tests that fit the existing framework. Worked examples are in [examples.md](./examples.md).

## 1. Collect inputs
| Need | Where |
|---|---|
| Story and acceptance criteria | `docs/stories/US-1xx-*.md` |
| House rules | `docs/team-conventions.md` |
| API contract | `docs/api/openapi.yaml` |
| Fixtures | `tests/fixtures.ts` (`api`, `signedInPage`) |
| Data | `tests/test-data.ts` (`users`, `shipping`, `products`, `coupons`) |
| Page Objects | `pages/*.ts` (reuse before you create) |
| Existing coverage | `grep -r "US-1xx" tests` |

Flow to story map: Login = US-104; Search/browse products and stock = US-103; Add to cart and coupons = US-101; Checkout = US-106 and US-105; Order history = US-102.

## 2. Design the cases
For each acceptance criterion write at least one row. Then add:
- **Negative**: wrong input, missing input, unauthorised caller (401), wrong owner (403), unavailable item (422).
- **Boundary**: n-1, n, n+1 around every threshold or limit (coupon minimums, stock limits, field lengths such as a 10-digit mobile and 6-digit PIN).
- **State**: before and after (cart cleared after sign-out, order appears in history).

Choose the layer: rules and status codes on the **API** with the `api` fixture; what the shopper sees on the **UI**. Use the table format of `docs/templates/test-case.md`.

## 3. Write Page Objects
```ts
import type { Locator, Page } from '@playwright/test';

export class ExamplePage {
  readonly heading: Locator;
  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Example' });
  }
  async goto() { await this.page.goto('/example'); }
}
```
- Locators: role > label > text > test id. No ids, classes, XPath or positions.
- Actions take data objects (`signIn(users.standard)`), not loose strings.
- No `expect` in Page Objects.

## 4. Write the spec
- File: `tests/lab/<story id lowercase>-<feature>.spec.ts`.
- `import { test, expect } from '../fixtures';` when using `api` or `signedInPage`.
- `test.describe('US-1xx <feature>', ...)`, titles `US-1xx ACn: <behavior>`.
- Data only from `tests/test-data.ts`; derive variants (`${users.standard.password}-wrong`, `email.toUpperCase()`).
- Web-first assertions with exact values; `test.step` for multi-step journeys.
- To prove "no API call", record requests with `page.on('request', ...)` and assert the list is empty.

## 5. Verify and triage
```bash
npm run typecheck
npm run lint:specs
npx playwright test tests/lab/<spec>
npx playwright test tests/lab/<spec> --project=ui-v2
```
A failure caused by the app disagreeing with the story is a bug: keep the test, do not edit `app/`, draft the report with `docs/templates/bug-report.md`.

## Output
The table, the created or changed files, the run results per project, and bug drafts.
