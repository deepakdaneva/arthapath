import { expect, test } from '@playwright/test';
import { NEW_PIN, PIN, currentUid, field, readDoc, setupPin, signUp, uniqueEmail, unlock } from './helpers';

test.describe('account, PIN and encryption', () => {
  test('sign-up saves the profile, PIN setup validates input and stores no PIN', async ({ page }) => {
    await signUp(page, uniqueEmail('setup'), 'Asha Rao');

    // Validation hints
    await field(page, 'PIN or passphrase').fill('123456');
    await expect(page.getByText('Strength: weak')).toBeVisible();
    await field(page, 'Confirm PIN').fill('123457');
    await expect(page.getByText('The PINs do not match.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create PIN' })).toBeDisabled();

    await setupPin(page);
    await expect(page.getByText("Let's start with your financial goals.")).toBeVisible();

    const user = await readDoc(`users/${await currentUid(page)}`);
    expect(Object.keys(user!).sort()).toEqual(['createdAt', 'crypto', 'displayName', 'email', 'photoURL', 'updatedAt']);
    expect(JSON.stringify(user)).not.toContain(PIN);
    expect(JSON.stringify(user)).toContain('argon2id');
  });

  test('reload locks; wrong PIN is rejected; right PIN returns to the same page', async ({ page }) => {
    await signUp(page, uniqueEmail('unlock'));
    await setupPin(page);

    await page.goto('/app/settings');
    await unlock(page, 'not-the-pin-9');
    await expect(page.getByRole('alert')).toContainText('Incorrect PIN. 4 attempts');

    await unlock(page, PIN);
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('preferences are stored encrypted and survive lock and reload', async ({ page }) => {
    await signUp(page, uniqueEmail('prefs'));
    await setupPin(page);
    await page.goto('/app/settings');
    await unlock(page, PIN);

    await page.locator('ion-select').click();
    await page.getByRole('radio', { name: '15 minutes' }).click();
    await expect(page.locator('ion-select')).toContainText('15 minutes');

    const uid = await currentUid(page);
    // Saving is asynchronous: wait for the encrypted document to appear.
    await expect.poll(() => readDoc(`users/${uid}/vault/main`)).not.toBeNull();
    const vault = await readDoc(`users/${uid}/vault/main`);
    expect(Object.keys(vault!).sort()).toEqual(['ct', 'iv', 'updatedAt', 'v']);
    expect(JSON.stringify(vault)).not.toContain('lockAfterMinutes');

    await page.reload();
    await unlock(page, PIN);
    await expect(page.locator('ion-select')).toContainText('15 minutes');
  });

  test('lock now removes app pages from the DOM', async ({ page }) => {
    await signUp(page, uniqueEmail('lock'));
    await setupPin(page);
    await page.locator('#profile-trigger').click();
    await page.getByText('Settings', { exact: true }).click();
    await expect(page).toHaveURL(/\/app\/settings$/);

    await page.getByRole('button', { name: 'Lock now' }).click();
    await expect(page).toHaveURL(/\/unlock/);
    await expect(page.locator('app-shell')).toHaveCount(0);
    await expect(page.locator('app-settings')).toHaveCount(0);
    await expect(page.locator('app-dashboard')).toHaveCount(0);
  });

  test('change PIN: old PIN stops working, new PIN unlocks the same data', async ({ page }) => {
    await signUp(page, uniqueEmail('change'));
    await setupPin(page);
    await page.goto('/app/settings');
    await unlock(page, PIN);

    await field(page, 'Current PIN').fill('wrong-current-1');
    await field(page, 'New PIN').fill(NEW_PIN);
    await field(page, 'Confirm new PIN').fill(NEW_PIN);
    await page.getByRole('button', { name: 'Change PIN' }).click();
    await expect(page.getByText('Current PIN is incorrect.')).toBeVisible();

    await field(page, 'Current PIN').fill(PIN);
    await page.getByRole('button', { name: 'Change PIN' }).click();
    await expect(page.getByText('PIN changed.')).toBeVisible();

    await page.reload();
    await unlock(page, PIN);
    await expect(page.getByRole('alert')).toContainText('Incorrect PIN');
    await unlock(page, NEW_PIN);
    await expect(page).toHaveURL(/\/app\/settings$/);
  });

  test('forgotten PIN reset deletes encrypted data and keeps the profile', async ({ page }) => {
    await signUp(page, uniqueEmail('reset'), 'Reset User');
    await setupPin(page);
    const uid = await currentUid(page);

    await page.goto('/app');
    await page.getByRole('button', { name: 'Forgot PIN?' }).click();
    const del = page.getByRole('button', { name: 'Delete my encrypted data' });
    await expect(del).toBeDisabled();
    await field(page, 'Type DELETE to confirm').fill('DELETE');
    await del.click();
    await expect(page).toHaveURL(/\/setup-pin$/);

    const user = await readDoc(`users/${uid}`);
    expect(user!['crypto']).toBeUndefined();
    expect(JSON.stringify(user!['displayName'])).toContain('Reset User');
  });

  test('sign out returns to the landing page and clears the app', async ({ page }) => {
    await signUp(page, uniqueEmail('signout'));
    await setupPin(page);
    await page.locator('#profile-trigger').click();
    await page.getByText('Log out', { exact: true }).click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('app-shell')).toHaveCount(0);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/auth$/);
  });
});
