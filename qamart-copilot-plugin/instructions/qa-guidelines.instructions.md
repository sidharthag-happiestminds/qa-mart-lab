---
name: 'QA Mart QA guidelines'
description: 'QA Mart test standards: risk-based priorities, naming, defect logging and regression strategy. Use for any test design, test review or bug report in this repository.'
applyTo: '**'
---
# QA Mart QA guidelines

QA Mart is an e-commerce app (`app/`) with a Playwright + TypeScript suite (`tests/`, `pages/`). These rules apply to every test you plan, write, review or report on. The house rules in [docs/team-conventions.md](../../docs/team-conventions.md) win if anything here disagrees.

## Golden rules
- `app/` is the system under test. Never edit it to make a test pass.
- A correct test that fails because the app is wrong stays red. Report the bug; do not weaken the assertion.
- Every test traces to a story in `docs/stories/` (US-101 to US-106) and an acceptance criterion.
- Never put credentials, tokens or real personal data in code, prompts or reports. Accounts come from `tests/test-data.ts`, which reads `QA_USER` and `QA_PASS`.

## Risk-based priorities
Rank work by business impact times likelihood of failure. Test the top of this table first and deepest.

| Flow | Stories | Risk | Why | Minimum coverage |
|---|---|---|---|---|
| Checkout and order placement | US-105, US-106, US-103 | Critical | Money, stock and authorization | UI happy path, API auth (401/403), stock limit boundaries, every field validation |
| Coupons and pricing | US-101 | High | Revenue leakage at thresholds | Boundary matrix (n-1, n, n+1) per coupon, first-order eligibility |
| Sign in | US-104 | High | Gate to every flow, account lockout | Valid, wrong password, locked, empty fields, email normalisation, sign-out |
| Order history | US-102 | Medium | Data isolation between shoppers | Own orders only, newest first, no token gives 401 |
| Product list and search | US-103 | Medium | Slow load (300-1700 ms), sold-out items | Count, sold-out button disabled, add to cart toast |

- Negative and boundary cases are mandatory for Critical and High flows, not optional extras.
- Prefer the API layer for rules (status codes, amounts, limits) and the UI layer for the journey a shopper sees. Do not repeat every API case in the UI.
- Tests must pass on both designs: v1 and v2 (`npm run test:v2`). v2 renames classes and ids and reverses the product order; accessible names stay the same.

## Naming conventions
| Item | Convention | Example |
|---|---|---|
| Spec file | `tests/<area>/<story-id-lowercase>-<feature>.spec.ts`; lab work in `tests/lab/` | `tests/lab/us-104-sign-in.spec.ts` |
| Page Object | `pages/<Name>Page.ts`, named export class `<Name>Page` | `pages/LoginPage.ts` |
| Describe | `<story id> <feature>` | `US-104 Sign in` |
| Test title | `<story id> AC<n>: <observable behavior>` | `US-104 AC2: wrong password shows "Invalid email or password"` |
| Test case id | `TC-<story number>-<nn>` in plans | `TC-104-03` |
| Branch | `test/<story id>-<short-name>` | `test/us-104-sign-in` |

Name tests after behavior and outcome, never after implementation ("clicks button 3").

## Defect logging standard
Use [docs/templates/bug-report.md](../../docs/templates/bug-report.md) for every defect. A report is complete only when it has:
1. A one-line title: what is wrong and where (`FLAT100 rejected at exactly ₹500 on POST /api/coupons/validate`).
2. The story and AC it breaks.
3. Classification: application bug, test bug, environment issue or unconfirmed. Do not call it an application bug until the expected result is traced to the story.
4. Severity: Critical (money, security, data loss, no workaround), High (core flow broken, workaround exists), Medium (secondary flow or wrong message), Low (cosmetic).
5. Reproducible steps, expected (quote the story) and actual (status code, message, amount).
6. Evidence: failing test and command, trace or response body. Never paste tokens, cookies or storage state.

## Regression strategy
| Tier | When | Command | Scope |
|---|---|---|---|
| Smoke | Every edit, pre-commit | `npx playwright test tests/tour/smoke.spec.ts` | App up, sign in, product list |
| Targeted | Every pull request | `npx playwright test <impacted specs>` | Specs mapped from changed files by the `qa-regression-analyzer` skill |
| Full | Merge to main, nightly | `npm test` then `npm run test:v2` | All chromium specs on v1 and v2 |
| Known defects | Nightly, before release | `npm run test:seeded` | Planted-bug tests; expected to fail until fixed |
| Flakiness | When a test fails intermittently | `npx playwright test <spec> --repeat-each=5` | Prove stability before merging a fix |

- A failing seeded test is a known defect, not a regression. A new failure anywhere else blocks the merge.
- Never mark a test flaky without a trace showing the race. Fix the wait, not the timeout.
- Before handing work over, run `npm run typecheck`, `npm run lint:specs` and the relevant tier.
