import { expect, test } from '@playwright/test';
import { agreeToTerms, field, uniqueEmail } from './helpers';

// GitHub links point to the branch the app was built from (scripts/write-app-config.mjs).
const REF = process.env['APP_REPO_REF'] || (process.env['GITHUB_REF_NAME'] === 'main' ? 'main' : 'development');

test.describe('public pages', () => {
  test('landing page shows the product and leads to sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Your Money. Your Goals.');
    await expect(page.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', new RegExp(`/tree/${REF}/docs$`));
    await expect(page.getByRole('link', { name: 'Download the Android app' })).toHaveAttribute(
      'href',
      /\/arthapath\/releases\/latest$/,
    );
    // Installable as a PWA: manifest linked and served.
    const manifest = await page.request.get('/manifest.webmanifest');
    expect((await manifest.json()).display).toBe('standalone');
    // routerLink buttons render as links (navigation semantics).
    await page.getByRole('link', { name: 'Get Started' }).click();
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  for (const [path, title] of [
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Service'],
  ] as const) {
    test(`${path} renders formatted markdown with branch links`, async ({ page }) => {
      await page.goto(path);
      const doc = page.locator('article.markdown');
      await expect(doc.locator('h1')).toContainText(title);
      expect(await doc.locator('h2, li').count()).toBeGreaterThan(3);
      await expect(doc).not.toContainText('## ');
      await expect(doc).not.toContainText('**');
      await expect(page.getByRole('link', { name: /docs\/product\// })).toHaveAttribute('href', new RegExp(`/blob/${REF}/`));
    });
  }

  test('app routes require sign-in', async ({ page }) => {
    await page.goto('/app/settings');
    await expect(page).toHaveURL(/\/auth$/);
  });

  test('sign-in errors do not reveal whether the account exists', async ({ page }) => {
    await page.goto('/auth');
    await page.locator('ion-input[label="Email"] input').fill('nobody@example.com');
    await page.locator('ion-input[label="Password"] input').fill('wrong-password-1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  });

  test('sign-up requires agreeing to the terms and privacy policy', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await field(page, 'Email').fill(uniqueEmail('terms'));
    await field(page, 'Password').fill('emulator-test-pass');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toContainText('agree to the Terms and Privacy Policy');
    await expect(page).toHaveURL(/\/auth$/);
    await agreeToTerms(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/setup-pin$/);
  });

  test('welcome slides (Android first launch) advance and lead to sign-up', async ({ page }) => {
    await page.goto('/welcome');
    await expect(page.getByRole('heading', { name: 'Your money. Your goals. Your future.' })).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { name: 'Private by design' })).toBeVisible();
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(page.getByRole('heading', { name: 'Your money. Your goals. Your future.' })).toBeVisible();
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { name: 'Stay on track' })).toBeVisible();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/auth\?mode=signup$/);
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('arthapath.welcome.seen'))).toBe('1');
  });
});
