import { expect, type Page } from '@playwright/test';

export const PIN = 'river-mango-42';
export const NEW_PIN = 'ocean-lamp-77';
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-arthapath/databases/(default)/documents';

/** Fresh account per test so tests are independent. */
export function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Ionic inputs render a native <input> inside; target it by the field label. */
export const field = (page: Page, label: string) => page.locator(`ion-input[label="${label}"] input`);

export async function signUp(page: Page, email: string, name = 'E2E User'): Promise<void> {
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await field(page, 'Name (optional)').fill(name);
  await field(page, 'Email').fill(email);
  await field(page, 'Password').fill('emulator-test-pass');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/setup-pin$/);
}

export async function setupPin(page: Page, pin = PIN): Promise<void> {
  await field(page, 'PIN or passphrase').fill(pin);
  await field(page, 'Confirm PIN').fill(pin);
  await page.locator('ion-checkbox').click();
  await page.getByRole('button', { name: 'Create PIN' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

export async function unlock(page: Page, pin: string): Promise<void> {
  await expect(page).toHaveURL(/\/unlock/);
  await field(page, 'PIN or passphrase').fill(pin);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
}

/** Reads a Firestore document from the emulator with admin rights (bypasses rules). */
export async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${FIRESTORE}/${path}`, { headers: { Authorization: 'Bearer owner' } });
  if (res.status === 404) return null;
  return ((await res.json()) as { fields: Record<string, unknown> }).fields;
}

/** UID of the signed-in user, from the Firebase Auth state in the page. */
export async function currentUid(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const r = indexedDB.open('firebaseLocalStorageDb');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const rows: { value: { uid: string } }[] = await new Promise((resolve, reject) => {
      const r = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const user = rows.find((x) => x.value?.uid);
    if (!user) throw new Error('No signed-in user');
    return user.value.uid;
  });
}
