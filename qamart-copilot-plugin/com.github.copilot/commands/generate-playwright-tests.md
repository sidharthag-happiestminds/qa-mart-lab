---
name: generate-playwright-tests
description: 'Generate QA Mart Playwright tests, Page Objects and test data from a story or flow, covering positive, negative and boundary cases.'
argument-hint: 'story id or flow, for example US-104 or checkout with coupon'
agent: 'QA Test Generator'
---
Generate Playwright tests for: **${input:target:US-104}**

Follow the `playwright-test-generator` skill and the QA Mart instructions.

1. **Understand.** If the target is a story id, read the matching file in `docs/stories/`. If it is a flow name (Login, Search Product, Add To Cart, Checkout, Order History), find the stories that cover it. If nothing matches, say so and stop.
2. **Reuse.** List the Page Objects in `pages/`, the fixtures in `tests/fixtures.ts`, the data in `tests/test-data.ts` and any spec in `tests/` that already covers this flow. Reuse them; do not duplicate.
3. **Plan.** Write a test-case table in the format of `docs/templates/test-case.md`: one row per acceptance criterion, plus negative and boundary rows. Mark each row UI or API and name the technique (equivalence class, boundary value, state change, negative).
4. **Confirm live behavior (optional).** If the `qamart-api` MCP tools are available and the app is running, use them to check statuses and messages for API rows (for example `auth_negative_matrix`, `coupons_validate`, `products_list`). Expected values still come from the story, not from the app.
5. **Page Objects.** Create or extend `pages/<Name>Page.ts` with `readonly` locators and intent-level actions. No assertions.
6. **Test data.** Use `tests/test-data.ts`. If a new value is genuinely needed, derive it from existing data in the spec or propose an addition to `tests/test-data.ts`; never hard-code emails, passwords, prices or URLs.
7. **Specs.** Write `tests/lab/<story id lowercase>-<feature>.spec.ts`. Positive and negative cases, one behavior per test, `test.step` for journeys, story id and AC in every title.
8. **Verify.** Run `npm run typecheck`, `npm run lint:specs`, `npx playwright test <spec>` and, for UI specs, `npx playwright test <spec> --project=ui-v2`.
9. **Triage failures.** If a correct test fails because the app disagrees with the story, keep the test, do not touch `app/`, and draft a bug with `docs/templates/bug-report.md`.

Finish with the test-case table, files created or changed, run result per project, and any bug drafts linked to the failing test and story criterion.
