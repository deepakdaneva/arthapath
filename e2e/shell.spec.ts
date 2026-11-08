import { expect, test } from '@playwright/test';
import { PIN, currentUid, field, readDoc, setupPin, signUp, uniqueEmail } from './helpers';

test.describe('app shell', () => {
  test('top bar: AI status, notifications, account menu header opens profile', async ({ page }) => {
    await signUp(page, uniqueEmail('shell'), 'Shell User');
    await setupPin(page);

    await expect(page.getByRole('status', { name: 'Current AI: AI not configured' })).toBeVisible();

    await page.getByRole('button', { name: 'Notifications' }).click();
    await expect(page.getByText("You're all caught up.")).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Open account menu' }).click();
    const menu = page.locator('ion-popover .menu');
    await expect(menu.getByText('Profile', { exact: true })).toHaveCount(0);
    await expect(menu.getByText('Current AI')).toHaveCount(0);
    const { version } = await (await page.request.get('/version.json')).json();
    await expect(menu.getByText(`Version ${version}`)).toBeVisible();

    // Theme switcher in the menu footer: System -> Light -> Dark -> System.
    const themeBtn = menu.getByRole('button', { name: /^Theme: / });
    await expect(themeBtn).toHaveAttribute('aria-label', 'Theme: System. Switch to Light');
    await themeBtn.click();
    await expect(themeBtn).toHaveAttribute('aria-label', 'Theme: Light. Switch to Dark');
    await themeBtn.click();
    await expect(page.locator('html')).toHaveClass(/ion-palette-dark/);
    await themeBtn.click();
    await expect(themeBtn).toHaveAttribute('aria-label', 'Theme: System. Switch to Light');
    await expect(menu.getByRole('button', { name: 'Log out' })).toBeVisible();

    await menu.getByRole('button', { name: 'Open your profile' }).click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  });

  test('AI indicator blinks when the provider switches', async ({ page }) => {
    await signUp(page, uniqueEmail('blink'));
    await setupPin(page);
    // Simulates the AI router reporting a fallback (dev-mode Angular API).
    await page.evaluate(() => {
      const w = window as unknown as { ng: { getComponent(e: Element): { ai: { switchedTo(p: string, m: string): void } } } };
      w.ng.getComponent(document.querySelector('app-ai-status')!).ai.switchedTo('Groq', 'llama');
    });
    const chip = page.locator('app-ai-status .chip');
    await expect(chip).toHaveClass(/blink/);
    await expect(chip).toContainText('Groq · llama');
    const iterations = await chip.evaluate((el) => getComputedStyle(el).animationIterationCount);
    expect(iterations).toBe('5');
  });

  test('bottom tabs: Home, Chat, and Updates navigate and mark the current page', async ({ page }) => {
    await signUp(page, uniqueEmail('tabs'));
    await setupPin(page);
    const tabs = page.getByRole('navigation', { name: 'Primary' });
    const current = tabs.locator('[aria-current="page"]');
    await expect(current).toHaveText('Home');
    await tabs.getByRole('link', { name: 'Chat' }).click();
    await expect(page).toHaveURL(/\/app\/chat$/);
    await expect(current).toHaveText('Chat');
    await tabs.getByRole('link', { name: 'Updates' }).click();
    await expect(page).toHaveURL(/\/app\/updates$/);
    await expect(current).toHaveText('Updates');
    await tabs.getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(current).toHaveText('Home');
  });

  test('offers a reload when a newer version is deployed', async ({ page }) => {
    await page.goto('/');
    const { version } = await (await page.request.get('/version.json')).json();
    const [maj, min, build] = (version as string).split('.').map(Number);
    await page.route('**/version.json', (route) =>
      route.fulfill({ json: { version: `${maj}.${min}.${build! + 1}` } }),
    );
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const toast = page.locator('ion-toast');
    await expect(toast).toContainText('New version available');
    await expect(toast).toContainText(`${maj}.${min}.${build! + 1}`);
    await page.unroute('**/version.json');
    await Promise.all([page.waitForEvent('load'), toast.getByRole('button', { name: 'Reload' }).click()]);
  });
});

test.describe('delete account', () => {
  test('requires password and DELETE, then removes data and sign-in', async ({ page }) => {
    const email = uniqueEmail('delete');
    await signUp(page, email);
    await setupPin(page);
    const uid = await currentUid(page);
    await page.goto('/app/profile');
    await field(page, 'PIN or passphrase').fill(PIN);
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/profile$/);

    await page.getByRole('button', { name: 'Delete my account' }).click();
    const confirm = page.getByRole('button', { name: 'Permanently delete' });
    await expect(confirm).toBeDisabled();
    await field(page, 'Your password').fill('wrong-password-x');
    await field(page, 'Type DELETE to confirm').fill('DELETE');
    await confirm.click();
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
    expect(await readDoc(`users/${uid}`)).not.toBeNull();

    await field(page, 'Your password').fill('emulator-test-pass');
    await confirm.click();
    await expect(page).toHaveURL('/');
    expect(await readDoc(`users/${uid}`)).toBeNull();

    // The sign-in no longer exists.
    await page.goto('/auth');
    await field(page, 'Email').fill(email);
    await field(page, 'Password').fill('emulator-test-pass');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  });
});
