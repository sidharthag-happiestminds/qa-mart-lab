import { test, expect } from '../fixtures';
import { users, products } from '../test-data';
import { LoginPage } from '../../pages/LoginPage';
import { ProductsPage } from '../../pages/ProductsPage';

const wrongPassword = `${users.standard.password}-wrong`;

test.describe('US-104 Sign in', () => {
  test('US-104 AC1: valid credentials open the product list and greet the shopper by first name', async ({ page }) => {
    const login = new LoginPage(page);
    const shop = new ProductsPage(page);

    await login.goto();
    await login.signIn(users.standard);

    await expect(page).toHaveURL(/\/products$/);
    await expect(shop.greeting).toHaveText('Hi, Asha');
    await expect(shop.productCards).toHaveCount(Object.keys(products).length);
  });

  test('US-104 AC2: wrong password shows "Invalid email or password" and stays on sign-in', async ({ page }) => {
    const login = new LoginPage(page);

    await login.goto();
    await login.signIn({ email: users.standard.email, password: wrongPassword });

    await expect(login.alert).toHaveText('Invalid email or password');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('US-104 AC2: the API rejects a wrong password with 401', async ({ api }) => {
    const { status, body } = await api.login({ email: users.standard.email, password: wrongPassword });

    expect(status).toBe(401);
    expect(body.error).toBe('Invalid email or password');
  });

  for (const missing of ['email', 'password'] as const) {
    test(`US-104 AC3: empty ${missing} shows a message without calling the API`, async ({ page }) => {
      const login = new LoginPage(page);
      const loginCalls: string[] = [];
      page.on('request', (req) => {
        if (new URL(req.url()).pathname === '/api/login') loginCalls.push(req.method());
      });

      await login.goto();
      await login.signIn({
        email: missing === 'email' ? '' : users.standard.email,
        password: missing === 'password' ? '' : users.standard.password,
      });

      await expect(login.alert).toHaveText('Enter your email and password');
      await expect(page).toHaveURL(/\/login$/);
      expect(loginCalls).toEqual([]);
    });
  }

  test('US-104 AC4: a locked account sees the support message', async ({ page }) => {
    const login = new LoginPage(page);

    await login.goto();
    await login.signIn(users.locked);

    await expect(login.alert).toHaveText('This account is locked. Contact support.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('US-104 AC4: the API answers 423 for a locked account', async ({ api }) => {
    const { status, body } = await api.login(users.locked);

    expect(status).toBe(423);
    expect(body.error).toBe('This account is locked. Contact support.');
  });

  test('US-104 AC5: email is case-insensitive and surrounding spaces are ignored', async ({ page }) => {
    const login = new LoginPage(page);
    const shop = new ProductsPage(page);

    await login.goto();
    await login.signIn({ email: `  ${users.standard.email.toUpperCase()}  `, password: users.standard.password });

    await expect(page).toHaveURL(/\/products$/);
    await expect(shop.greeting).toHaveText('Hi, Asha');
  });

  test('US-104 AC6: signing out clears the cart and returns to sign-in', async ({ page }) => {
    const login = new LoginPage(page);
    const shop = new ProductsPage(page);

    await test.step('sign in and add a product', async () => {
      await login.goto();
      await login.signIn(users.standard);
      await shop.addToCart(products.mouse.name);
      await expect(shop.cartCount).toHaveText('1');
    });

    await test.step('sign out', async () => {
      await shop.signOut();
      await expect(page).toHaveURL(/\/login$/);
      await expect(login.heading).toBeVisible();
    });

    await test.step('sign in again and find an empty cart', async () => {
      await login.signIn(users.standard);
      await expect(page).toHaveURL(/\/products$/);
      await expect(shop.cartCount).toHaveText('0');
    });
  });
});
