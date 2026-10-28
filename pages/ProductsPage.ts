import type { Locator, Page } from '@playwright/test';

export class ProductsPage {
  readonly heading: Locator;
  readonly productList: Locator;
  readonly productCards: Locator;
  readonly greeting: Locator;
  readonly cartCount: Locator;
  readonly toast: Locator;
  readonly signOutButton: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Products', level: 1 });
    this.productList = page.getByRole('list', { name: 'Products' });
    this.productCards = this.productList.getByRole('listitem');
    this.greeting = page.getByTestId('greeting');
    this.cartCount = page.getByTestId('cart-count');
    this.toast = page.getByTestId('toast');
    this.signOutButton = page.getByRole('button', { name: 'Sign out' });
  }

  async goto() {
    await this.page.goto('/products');
  }

  product(name: string): Locator {
    return this.productCards.filter({ hasText: name });
  }

  async addToCart(name: string) {
    await this.product(name).getByRole('button', { name: 'Add to cart' }).click();
  }

  async signOut() {
    await this.signOutButton.click();
  }
}
