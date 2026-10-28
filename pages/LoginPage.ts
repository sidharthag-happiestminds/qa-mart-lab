import type { Locator, Page } from '@playwright/test';

type Credentials = { email: string; password: string };

export class LoginPage {
  readonly heading: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly signInButton: Locator;
  readonly alert: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Sign in to QA Mart' });
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password');
    this.signInButton = page.getByRole('button', { name: 'Sign in' });
    this.alert = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async signIn({ email, password }: Credentials) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.signInButton.click();
  }
}
