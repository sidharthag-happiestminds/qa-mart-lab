# QA Mart QA guidelines

These are the project-level standards also loaded by Copilot from [qa-guidelines.instructions.md](qa-guidelines.instructions.md). QA Mart is an e-commerce app in `app/` with Playwright + TypeScript tests in `tests/` and Page Objects in `pages/`.

## Non-negotiable rules
- Never edit `app/` to make a test pass. Keep a correct failing test and report the application defect.
- Trace every test to `docs/stories/US-101` through `US-106` and an acceptance criterion.
- Never put credentials, tokens or real personal data in code, prompts or reports. Accounts and secrets come from `tests/test-data.ts` and environment variables.
- Tests pass on v1 and v2 (`npm run test:v2`); v2 renames ids/classes and reverses the product order.

## Risk-based priorities
| Flow | Stories | Risk | Minimum coverage |
|---|---|---|---|
| Checkout and order placement | US-103, US-105, US-106 | Critical | UI happy path, API authorization (401/403), stock boundaries, every field validation |
| Coupons and pricing | US-101 | High | Threshold n-1/n/n+1, cap, rounding, first-order eligibility |
| Sign in | US-104 | High | Valid, wrong password, locked, empty fields, email normalization, sign-out |
| Order history | US-102 | Medium | Own orders only, newest first, no-token 401 |
| Product list and search | US-103 | Medium | Count, sold-out state, add-to-cart behavior |

Prioritize by business impact × likelihood. Use API tests for rules and UI tests for shopper journeys. Negative and boundary tests are required on Critical and High flows.

## Naming
- Specs: `tests/<area>/<story>-<feature>.spec.ts`; experiments go in `tests/lab/`.
- Page Objects: `pages/<Name>Page.ts`, one named-export class per page.
- Test titles: `US-104 AC2: wrong password shows the sign-in error`.
- Name tests for observable behavior, not implementation details.

## Defect reports
Use `docs/templates/bug-report.md`. Include title, story/AC, classification, severity, environment, reproducible steps, expected and actual results, evidence, and impact/workaround. Use Critical for money/security/data-loss/no-workaround, High for broken core flows, Medium for secondary behavior, Low for cosmetic issues. Include status, message or amount; never paste credentials, tokens, cookies or storage state.

## Regression strategy
| Tier | When | Command |
|---|---|---|
| Smoke | Every edit | `npx playwright test tests/tour/smoke.spec.ts` |
| Targeted | Pull request | `npx playwright test <impacted specs>` |
| Full | Merge/nightly | `npm test` and `npm run test:v2` |
| Known defects | Nightly/release | `npm run test:seeded` (expected planted failures) |
| Flakiness | Intermittent failure | `npx playwright test <spec> --repeat-each=5` |

A seeded failure is a known defect, not a regression. Before handoff, run `npm run typecheck`, `npm run lint:specs`, and the relevant test tier.
