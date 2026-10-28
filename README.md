# QA Mart lab

A small shop app plus a Playwright project. Two uses:

1. Practise Playwright: locators, Page Objects, flaky tests, v1 and v2 designs.
2. A **playground for GitHub Copilot agent customizations**: build instructions, prompts, skills, custom agents, hooks and a plugin with an MCP server, against a codebase that has real conventions, planted bugs, stories and test reports.

Everything runs on your machine. The app has no dependencies besides Node.

## 1. Set up (once)
Needs Node.js 20 or newer.

```bash
npm install
npx playwright install chromium
npm test
```
`npm test` starts the app for you (see `webServer` in `playwright.config.ts`) and should end with all tests passed.

For the Copilot playground, continue with [exercises/00-start-here.md](exercises/00-start-here.md).

## Copilot Agent Plugin
The installable capstone plugin, displayed as **qamart-copilot-plugin-sidharthag**, is in [qamart-copilot-plugin/](qamart-copilot-plugin/README.md). If VS Code is opened at the parent `qamart` folder, run `npm run plugin:install -- --workspace ..`; if it is opened directly at `qa-mart-lab`, run `npm run plugin:install`. Then reload VS Code. See [the plugin README](qamart-copilot-plugin/README.md), [recorded demo](qamart-copilot-plugin/demo/DEMO.md), and run `npm run plugin:check` to validate the package, hooks and MCP server.

## 2. Look around the app
```bash
npm start
```
Open http://localhost:3000 and sign in as `asha@qamart.test` / `Test@1234`.
Use the footer links to switch between the v1 design and the v2 redesign. The app listens on 127.0.0.1 only.

## Commands
| Command | What it does |
|---|---|
| `npm start` | Runs QA Mart at http://localhost:3000 (keep it running while you record) |
| `npm test` | Runs your tests (chromium project) and writes `reports/results.json` |
| `npm run test:ui` | Opens UI mode: watch, time-travel and pick locators |
| `npm run codegen` | Records into `tests/lab/recorded.spec.ts` (needs `npm start` running) |
| `npm run test:v2` | Runs your tests plus the legacy suite against the v2 redesign (not the seeded tests or the trainer demo) |
| `npm run test:legacy` | Runs the inherited legacy test once |
| `npm run flaky` | Runs the legacy test 5 times to expose flakiness |
| `npm run test:seeded` | Runs correct tests that fail on purpose because of planted bugs (5 failures) |
| `npm run typecheck` | `tsc --noEmit` over tests and pages |
| `npm run lint:specs` | Convention check for specs and Page Objects (hard waits, XPath, hard-coded credentials, ...) |
| `npm run mcp:smoke` | Starts the app on port 3199 (`SMOKE_PORT` to change it) and drives the trainer MCP server over stdio |
| `npm run report` | Opens the last HTML report |
| `npm run demo:trace` | Trainer demo: one failing test with a full trace |
| `npm run plugin:install` | Validates and registers the Copilot Agent Plugin in this workspace |
| `npm run plugin:check` | Validates the plugin, hook guardrails and MCP server |
| `npm run plugin:impact -- --base origin/main` | Analyze changed files and recommend regression suites |

## Folders
- `app/`: the QA Mart app (do not edit during the lab)
- `pages/`: your Page Objects go here
- `tests/tour/`: working examples to read
- `tests/seeded/`: correct tests that expose planted bugs
- `tests/legacy/`: the inherited script you will review
- `tests/lab/`: your lab tests go here
- `tests/fixtures.ts`: `api` and `signedInPage` fixtures
- `tests/test-data.ts`: accounts, shipping data, products and coupons
- `docs/stories/`: user stories US-101 to US-106
- `docs/team-conventions.md`: the house rules for tests
- `docs/templates/`: bug-report and test-case templates
- `docs/api/openapi.yaml`: API contract
- `exercises/`: the six Copilot customization exercises (start at `00-start-here.md`)
- `solutions/`: trainer reference (not loaded by Copilot)
- `.github/`: where testers build their customizations (empty on purpose, except `copilot/settings.json`, which recommends the team's agent plugin)
- `scripts/`: `lint-specs.cjs` and `mcp-smoke.cjs`

## App features
Sign in, products (some out of stock), cart, checkout with coupons, order confirmation, order history at `/orders`. API endpoints are in `docs/api/openapi.yaml`. `/api/test/reset` and `/api/test/orders` help tests and tools; set `QAMART_TEST_API=0` to switch them off.

## Accounts
asha@qamart.test, ravi@qamart.test, locked@qamart.test. Password for all: `Test@1234`.

## Port 3000 busy?
`PORT=3100 npm test` (macOS/Linux) or `$env:PORT=3100; npm test` (PowerShell). For `npm start`, set PORT the same way. If tests behave strangely, check `lsof -i :3000`: Playwright reuses whatever answers on the port. The legacy test hard-codes `localhost:3000` on purpose (it is a review exercise), so with another `PORT` it fails with a connection error. `npm run codegen` and the plugin's `mcp.json` (`QAMART_URL`) also point at 3000: run `npx playwright codegen --output tests/lab/recorded.spec.ts http://localhost:3100/login` instead, and edit `QAMART_URL`.
