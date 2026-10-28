# playwright-test-generator: worked examples

## Example 1: US-104 Sign in (UI + API)

**Request:** "Generate tests for US-104."

### Test-case table
| ID | Story / AC | Title | Technique | Layer | Preconditions | Steps | Expected | Priority |
|---|---|---|---|---|---|---|---|---|
| TC-104-01 | US-104 AC1 | Valid sign-in greets by first name | Equivalence (valid) | UI | none | Sign in as `users.standard` | `/products`, greeting "Hi, Asha", 6 products | High |
| TC-104-02 | US-104 AC2 | Wrong password message | Negative | UI | none | Sign in with `${password}-wrong` | Alert "Invalid email or password", stays on `/login` | High |
| TC-104-03 | US-104 AC2 | Wrong password status | Negative | API | none | `api.login` with wrong password | 401 and same message | High |
| TC-104-04 | US-104 AC3 | Empty email | Negative, boundary (empty) | UI | none | Submit with empty email | Alert "Enter your email and password", no `/api/login` request | Medium |
| TC-104-05 | US-104 AC3 | Empty password | Negative, boundary (empty) | UI | none | Submit with empty password | Same as above | Medium |
| TC-104-06 | US-104 AC4 | Locked account message | Negative (state) | UI | none | Sign in as `users.locked` | Alert "This account is locked. Contact support." | High |
| TC-104-07 | US-104 AC4 | Locked account status | Negative (state) | API | none | `api.login(users.locked)` | 423 | High |
| TC-104-08 | US-104 AC5 | Email normalisation | Equivalence | UI | none | Upper-case email with surrounding spaces | Signed in | Medium |
| TC-104-09 | US-104 AC6 | Sign-out clears cart | State change | UI | Signed in, 1 item in cart | Sign out, sign in again | `/login` after sign-out, cart badge 0 | Medium |

### Page Objects (created)
`pages/LoginPage.ts`
```ts
export class LoginPage {
  readonly heading: Locator;      // getByRole('heading', { name: 'Sign in to QA Mart' })
  readonly email: Locator;        // getByLabel('Email')
  readonly password: Locator;     // getByLabel('Password')
  readonly signInButton: Locator; // getByRole('button', { name: 'Sign in' })
  readonly alert: Locator;        // getByRole('alert')
  async goto() { await this.page.goto('/login'); }
  async signIn({ email, password }: Credentials) { /* fill, fill, click */ }
}
```
`pages/ProductsPage.ts` exposes `productList`, `productCards`, `greeting`, `cartCount`, `toast`, `product(name)`, `addToCart(name)` and `signOut()`.

### Spec (excerpt of `tests/lab/us-104-sign-in.spec.ts`)
```ts
import { test, expect } from '../fixtures';
import { users, products } from '../test-data';
import { LoginPage } from '../../pages/LoginPage';

const wrongPassword = `${users.standard.password}-wrong`;

test('US-104 AC3: empty email shows a message without calling the API', async ({ page }) => {
  const login = new LoginPage(page);
  const loginCalls: string[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname === '/api/login') loginCalls.push(req.method());
  });

  await login.goto();
  await login.signIn({ email: '', password: users.standard.password });

  await expect(login.alert).toHaveText('Enter your email and password');
  expect(loginCalls).toEqual([]);
});
```
Why it is shaped this way:
- The wrong password is derived from test data, so no credential literal enters the spec.
- "Without calling the API" is proven by recording requests, not assumed.
- `getByRole('alert')` survives the v2 redesign; `#login-btn` would not (v2 renames it `#signin-submit`).

## Example 2: US-102 Order history (API setup, UI check)

**Request:** "Automate: a shopper sees the order they just placed in Order history."

Plan: place the order through the API (fast, deterministic), check the UI row.
```ts
import { test, expect } from '../fixtures';
import { users, products } from '../test-data';
import { LoginPage } from '../../pages/LoginPage';

test('US-102 AC1: a placed order appears in order history with its total', async ({ api, page }) => {
  const login = await api.login(users.returning);
  const { body: order } = await api.placeOrder(
    { email: users.returning.email, items: [{ id: products.cable.id, qty: 2 }] },
    login.body.token,
  );

  await new LoginPage(page).goto();
  await new LoginPage(page).signIn(users.returning);
  await page.getByRole('link', { name: 'Orders' }).click();

  const row = page.getByRole('row').filter({ hasText: order.orderId });
  await expect(row.getByRole('cell').last()).toHaveText(`₹${(products.cable.price * 2).toLocaleString('en-IN')}`);
});
```
Uses `users.returning` so it does not consume Asha's first-order WELCOME50 eligibility, and does not call `api.reset()`.

## Example 3: What the generator must refuse to write
```ts
// Rejected: every line breaks a QA Mart rule.
await page.goto('http://localhost:3000/login');      // hard-coded URL
await page.fill('#email', 'asha@qamart.test');       // CSS id, literal email
await page.waitForTimeout(1000);                      // hard wait
await page.click('//ul/li[1]/button');                // XPath + position (v2 reverses order)
expect(await page.textContent('.cart-badge')).toBe('1'); // read-then-assert, class renamed in v2
test.only('debug', async () => {});                   // blocked by the pre-execution hook
```
The plugin's `post-execution` hook reports these after the edit, and `pre-execution` blocks `test.only` before it is written.
