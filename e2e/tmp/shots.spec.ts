import { test } from '@playwright/test';
import { field, setupPin, signUp, uniqueEmail } from '../helpers';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
test('ai screens', async ({ page }) => {
  await page.route('https://api.groq.com/**', (r) => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: CORS }) :
    r.fulfill({ status: 200, headers: CORS, json: { model: 'llama-3.3-70b-versatile', choices: [{ message: { content: 'Start with an emergency fund covering 6 months of essential expenses (about ₹3,00,000 for you), then put 15% of income toward retirement through EPF and an index fund SIP.' } }] } }));
  await page.emulateMedia({ colorScheme: 'dark' });
  await signUp(page, uniqueEmail('shot'), 'Deepak Kumar Jangir');
  await setupPin(page);
  await page.goto('/app/ai-providers');
  await field(page, 'PIN or passphrase').fill('river-mango-42');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  for (const [p, k, m] of [['Groq', 'gsk_FAKE_e2e_groq_key_00000000000000002', 'llama-3.3-70b-versatile'], ['Google Gemini', 'AIzaFAKE-e2e-gemini-key-0000000000001', 'gemini-2.5-flash-lite']]) {
    await page.getByRole('button', { name: 'Add an AI provider' }).click();
    if (p !== 'Google Gemini') { await page.locator('ion-select[label="Provider"]').click(); await page.getByRole('radio', { name: p }).click(); }
    await field(page, 'API key').fill(k); await field(page, 'Model').fill(m);
    await page.getByRole('button', { name: 'Save key' }).click();
    await page.waitForTimeout(500);
  }
  await page.getByRole('button', { name: 'Add an AI provider' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/tmp/providers-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('link', { name: 'Chat' }).click();
  await page.getByRole('textbox', { name: 'Message' }).fill('I earn ₹1,50,000 a month and spend ₹50,000. What should I save for first?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/tmp/chat-dark.png' });
  await page.setViewportSize({ width: 390, height: 760 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/tmp/chat-mobile-light.png' });
});
