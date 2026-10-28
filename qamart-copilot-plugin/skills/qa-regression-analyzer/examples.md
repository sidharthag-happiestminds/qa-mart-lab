# qa-regression-analyzer: worked examples

The `--files` outputs below are real runs of `impact-map.cjs` against this repository.

## Example 1: checkout page markup changed

**Request:** "The checkout page HTML was restyled. What do we retest?"

```
node qamart-copilot-plugin/skills/qa-regression-analyzer/impact-map.cjs --files app/public/checkout.html
```

| Flow | Stories | Risk | Score | Because |
|---|---|---|---|---|
| Checkout and order placement | US-106, US-105 | High | 8 | app/public/checkout.html (page markup) |
| Coupons and pricing | US-101 | Medium | 6 | app/public/checkout.html (page markup) |

Recommended suites:
- **Smoke**: `npx playwright test tests/tour/smoke.spec.ts`
- **Targeted**: `npx playwright test tests/tour/api.spec.ts tests/tour/orders-and-stock.spec.ts`
- **Targeted v2**: same specs with `--project=ui-v2`

**Analyst reading.** The targeted specs are API-heavy; nothing in `chromium` drives the checkout form end to end. Gaps the script reports for US-106 (AC2 to AC8: field validation messages, `aria-invalid`, empty cart) are real **coverage gaps**, and this change touches exactly that markup. Proposed risk-based tests:

| Proposed test | Layer | Technique |
|---|---|---|
| `US-106 AC2: valid details reach confirmation with order number and amount paid` | UI | Happy path |
| `US-106 AC4: mobile with 9 and 11 digits shows "Enter a 10-digit mobile number"` | UI | Boundary |
| `US-106 AC6: PIN "012345" and "56001" show "Enter a 6-digit PIN code"` | UI | Boundary, negative |
| `US-106 AC7: invalid fields are marked aria-invalid and linked to their message` | UI | Accessibility |
| `US-106 AC8: empty cart disables Place order` | UI | State |

Residual risk: the legacy checkout script (`tests/legacy/`) is not in the run; it uses the CSS ids this change may rename.

## Example 2: server business rules changed

```
node qamart-copilot-plugin/skills/qa-regression-analyzer/impact-map.cjs --files app/server.js
```
With an explicit file list the script cannot see the diff, so every flow is impacted: checkout and orders score 12 (Critical), sign in, stock, cart and coupons 9 (High). Suites: Smoke, Targeted, Targeted v2, **Known defects** (`npm run test:seeded`), **Full** (`npm test`) and **Full v2** (`npm run test:v2`).

With `--base origin/main` the script reads the changed lines instead. A diff that only touches `validateCoupon` maps to **Coupons and pricing** (score 9) alone, and the analyst adds: "Run `npm run test:seeded`: B1 (FLAT100 at exactly ₹500) lives in this function; a fix turns `coupon-boundary.spec.ts` green, any other change to it is a regression risk for US-101 AC3."

## Example 3: a Page Object changed

```
node qamart-copilot-plugin/skills/qa-regression-analyzer/impact-map.cjs --files app/public/login.html,pages/LoginPage.ts
```

| Flow | Stories | Risk | Score |
|---|---|---|---|
| Sign in | US-104 | Medium | 6 |

Targeted specs: `tests/lab/us-104-sign-in.spec.ts`, `tests/seed.spec.ts`, `tests/tour/api.spec.ts`, `tests/tour/orders-and-stock.spec.ts`, `tests/tour/smoke.spec.ts`. Every spec that signs in is included, because sign-in is the gate to every other flow. Coverage gaps: none for US-104, because every acceptance criterion has a tagged test in `tests/lab/us-104-sign-in.spec.ts`.

## Example 4: traceability versus coverage

`--all-gaps` lists `US-103 AC1: A product with no stock shows "Out of stock" and its "Add to cart" button is disabled.` Searching the mapped specs finds `tests/tour/orders-and-stock.spec.ts` → "a sold-out product cannot be added to the cart", which checks exactly that. That is a **traceability gap**: rename the test to `US-103 AC1: a sold-out product cannot be added to the cart`. No new test is needed.
