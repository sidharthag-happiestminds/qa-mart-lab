---
name: qa-regression-analyzer
description: 'Use when deciding what to retest in QA Mart after a change: analyses changed files or a pull request, maps them to impacted flows and stories, scores risk, recommends regression suites and specs to run, and lists acceptance criteria with no test (coverage gaps).'
---
# QA regression analyzer (QA Mart)

Answer "what could this change break, and what do we run?" with evidence. Worked examples are in [examples.md](./examples.md).

## 1. Get the change set
Run the bundled script from the repository root. It is next to this file: [impact-map.cjs](./impact-map.cjs).

| Situation | Command |
|---|---|
| Local, uncommitted work | `node <skill-dir>/impact-map.cjs` |
| A branch or pull request | `node <skill-dir>/impact-map.cjs --base origin/main` |
| A list from a PR or a ticket | `node <skill-dir>/impact-map.cjs --files app/public/checkout.html,pages/LoginPage.ts` |
| Data for another tool | add `--json` |
| Gaps for every story | add `--all-gaps` |

In this repository `npm run plugin:impact -- --base origin/main` runs the same script. For a GitHub pull request, list its changed files with the `github` MCP tools and pass them with `--files`.

## 2. Check the mapping
The script maps files to flows:

| Changed file | Flows | Weight |
|---|---|---|
| `app/server.js` | Flows whose keywords appear in the changed lines (all flows if unknown) | 3 (business rules) |
| `app/public/app.js` | All UI flows | 2 |
| `app/public/<page>.html` | That page's flows | 2 |
| `pages/<Name>Page.ts` | That page's flows | 2 |
| `tests/fixtures.ts`, `tests/test-data.ts`, `playwright.config.ts` | All flows | 2 (infrastructure) |
| `docs/stories/US-1xx`, `docs/api/openapi.yaml`, `styles.css`, specs | Matching flows | 1 |

Risk score = flow risk (Critical 4: checkout, orders; High 3: sign in, coupons, stock, cart; Medium 2: product list) times change weight. 9 or more adds the full suite on v1 and v2.

Read the diff yourself and correct the mapping when the script is too broad or too narrow (for example a comment-only change to `app/server.js` is low risk; a renamed accessible name in `login.html` is high risk for every UI spec).

## 3. Recommend the regression
Present tiers in the order to run them: Smoke, Targeted, Targeted v2, Known defects (`npm run test:seeded` when server logic changed), Flakiness (`--repeat-each=3` for changed specs), Full. Explain each in one line. Never drop Smoke.

## 4. Coverage gaps and risk-based tests
- The script lists acceptance criteria that no test title tags as `US-xxx ACn`. Before calling one a real gap, search the specs it mapped: some older tests cover a criterion without the tag. Report those as **traceability gaps** (add the tag) and the rest as **coverage gaps** (write the test).
- For each real gap in a High or Critical flow, propose one test: title `US-xxx ACn: <behavior>`, layer (UI or API), technique (boundary, negative, state change), and the data from `tests/test-data.ts` it needs. Hand these to the `playwright-test-generator` skill or the QA Test Generator agent.
- Known planted defects (seeded tests) are not regressions. Say whether the change could fix or worsen one.

## Output
1. Impacted flows table: flow, stories, risk, why.
2. Suites to run, with commands.
3. Coverage and traceability gaps, ordered by risk.
4. Up to five proposed risk-based tests.
5. Residual risk: what this regression does not cover.
