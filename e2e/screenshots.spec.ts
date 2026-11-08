import { expect, test, type Page } from '@playwright/test';
import { field, setupPin, signUp, uniqueEmail } from './helpers';

/**
 * Captures the README screenshots from a demo account on the emulators, with
 * the AI provider mocked. Not part of the regression suite; run with
 * `npm run screenshots` (playwright.screenshots.config.ts). Output: docs/screenshots/*.png
 */

const OUT = 'docs/screenshots';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

const CHAT_REPLY = [
  '## Your next step',
  'You keep about **₹38,000** a month after expenses and your SIP. A good order:',
  '',
  '1. **Emergency fund:** grow it from ₹1,20,000 to about **₹2,70,000** (six months of necessary spending). At ₹15,000 a month that takes 10 months.',
  '2. **Car goal:** the remaining ₹23,000 a month keeps it on track for September 2027.',
  '3. **Cut the unused gym** (₹2,500): that alone adds ₹30,000 a year.',
  '',
  '_Estimates only; returns are not guaranteed._',
].join('\n');

const ANALYSIS_REPLY = [
  '## Where you stand',
  'You save **31%** of your income, above the 20% guideline. Dining out has grown three months in a row.',
  '## What to do this month',
  '- Move ₹15,000 to the emergency fund before spending.',
  '- Set a ₹6,000 dining budget; you averaged ₹7,900.',
  '- Cancel the unused gym membership.',
].join('\n');

/** dd/mm/yy rows, oldest first, in an HDFC-style layout the importer reads on the device. */
function statement(): string {
  const rows: string[] = [];
  const months = [
    ['08', 8200, 9800, 1900],
    ['09', 7400, 10400, 2300],
    ['10', 8900, 11200, 2600],
  ] as const;
  for (const [m, dining, groceries, uber] of months) {
    rows.push(`01/${m}/26,SALARY ACME LTD,,01/${m}/26,,"1,50,000.00",`);
    rows.push(`03/${m}/26,SIP MUTUAL FUND,,03/${m}/26,"15,000.00",,`);
    rows.push(`06/${m}/26,UPI-DMART-GROCERIES,,06/${m}/26,"${groceries}.00",,`);
    rows.push(`09/${m}/26,UPI-SWIGGY-ORDER,,09/${m}/26,"${dining}.00",,`);
    rows.push(`12/${m}/26,UBER RIDES,,12/${m}/26,"${uber}.00",,`);
    rows.push(`15/${m}/26,ELECTRICITY BILL BESCOM,,15/${m}/26,"2,400.00",,`);
    rows.push(`18/${m}/26,NETFLIX SUBSCRIPTION,,18/${m}/26,649.00,,`);
    rows.push(`22/${m}/26,AMAZON SHOPPING,,22/${m}/26,"3,${m}0.00",,`);
  }
  rows.push('01/11/26,SALARY ACME LTD,,01/11/26,,"1,50,000.00",');
  rows.push('03/11/26,SIP MUTUAL FUND,,03/11/26,"15,000.00",,');
  rows.push('05/11/26,UPI-SWIGGY-ORDER,,05/11/26,"3,100.00",,');
  rows.push('06/11/26,UPI-DMART-GROCERIES,,06/11/26,"4,800.00",,');
  return ['Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance', ...rows].join('\n');
}

async function addItem(page: Page, section: string, fill: Record<string, string>, selects: Record<string, string> = {}) {
  const sec = page.locator('section', { has: page.getByRole('heading', { name: section }) });
  await sec.getByRole('button', { name: 'Add' }).click();
  const form = sec.locator('form.add');
  for (const [label, value] of Object.entries(selects)) await form.getByLabel(label).selectOption(value);
  for (const [label, value] of Object.entries(fill)) await form.getByLabel(label, { exact: false }).fill(value);
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toHaveCount(0);
}

async function menu(page: Page, item: string) {
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByText(item, { exact: true }).click();
}

async function shot(page: Page, name: string) {
  // Close toasts, then let page transitions and charts settle.
  await page.evaluate(() => document.querySelectorAll('ion-toast').forEach((t) => (t as unknown as { dismiss(): void }).dismiss()));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

/** Verifies the demo account's email in the Auth emulator so the reminder banner is not shown. */
async function verifyEmail() {
  const res = await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-arthapath/oobCodes');
  const { oobCodes } = (await res.json()) as { oobCodes: { requestType: string; oobLink: string }[] };
  const link = oobCodes.filter((c) => c.requestType === 'VERIFY_EMAIL').at(-1)!.oobLink;
  await fetch(link);
}

test('capture README screenshots', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.route('https://api.groq.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') return route.fulfill({ status: 200, headers: CORS, json: { data: [{ id: 'openai/gpt-oss-120b' }] } });
    const body = req.postData() ?? '';
    const content = body.includes('Calculated recommendations') ? ANALYSIS_REPLY : CHAT_REPLY;
    return route.fulfill({ status: 200, headers: CORS, json: { model: 'openai/gpt-oss-120b', choices: [{ message: { content } }] } });
  });

  await page.goto('/');
  await shot(page, 'landing');

  const email = uniqueEmail('shots');
  await signUp(page, email, 'Asha');
  await verifyEmail();
  // Sign in again so the session carries the verified email.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/auth');
  await field(page, 'Email').fill(email);
  await field(page, 'Password').fill('emulator-test-pass');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/setup-pin$/);
  await setupPin(page);

  // Plan.
  await page.getByRole('link', { name: 'Prefer a form? Enter details manually' }).click();
  await addItem(page, 'Income', { 'Amount (₹)': '150000' }, { Type: 'salary' });
  await addItem(page, 'Expenses', { 'Name (optional)': 'Rent', 'Amount (₹)': '35000' }, { Type: 'rent', 'How needed': 'necessary' });
  await addItem(page, 'Expenses', { 'Name (optional)': 'Groceries', 'Amount (₹)': '10000' }, { Type: 'groceries', 'How needed': 'necessary' });
  await addItem(page, 'Expenses', { 'Name (optional)': 'Bills', 'Amount (₹)': '4000' }, { Type: 'utilities', 'How needed': 'necessary' });
  await addItem(page, 'Expenses', { 'Name (optional)': 'Dining out', 'Amount (₹)': '6000' }, { Type: 'dining', 'How needed': 'discretionary' });
  await addItem(page, 'Expenses', { 'Name (optional)': 'Weekend trips', 'Amount (₹)': '8000' }, { Type: 'travel', 'How needed': 'lifestyle' });
  await addItem(page, 'Expenses', { 'Name (optional)': 'Unused gym', 'Amount (₹)': '2500' }, { Type: 'subscriptions', 'How needed': 'unnecessary' });
  await addItem(page, 'Expenses', { 'Name (optional)': 'Index fund SIP', 'Amount (₹)': '15000' }, { Type: 'investments' });
  await addItem(page, 'Savings and investments', { 'Current value (₹)': '120000' }, { Type: 'savings' });
  await addItem(page, 'Savings and investments', { 'Current value (₹)': '450000' }, { Type: 'mutual_fund' });
  await addItem(page, 'Goals, in priority order', { 'Name (optional)': 'Emergency fund', 'Target (₹)': '270000', 'Target month': '2027-08' }, { Type: 'emergency_fund' });
  await addItem(page, 'Goals, in priority order', { 'Name (optional)': 'Family car', 'Target (₹)': '800000', 'Target month': '2027-09' }, { Type: 'vehicle' });
  await shot(page, 'finances');

  // AI provider (mocked).
  await menu(page, 'AI Providers / API Keys');
  await page.getByRole('button', { name: 'Add an AI provider' }).click();
  await field(page, 'API key').fill('gsk_DEMO_screenshot_key_000000000000001');
  await field(page, 'Model').fill('openai/gpt-oss-120b');
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText('gsk_••••••••••••0001')).toBeVisible();
  await shot(page, 'ai-providers');

  // Three months of history from a statement, read on the device.
  await menu(page, 'Import a statement');
  await page.locator('input[type=file]').setInputFiles({ name: 'statement.csv', mimeType: 'text/csv', buffer: Buffer.from(statement()) });
  await expect(page.getByRole('heading', { name: /Review \d+ rows/ })).toBeVisible();
  await shot(page, 'import');
  await page.getByRole('button', { name: /Save \d+ entries/ }).click();
  await expect(page.getByRole('heading', { name: /Imported \d+ entries/ })).toBeVisible();

  // A typed update.
  await page.getByRole('link', { name: 'Updates', exact: true }).click();
  await page.getByRole('textbox', { name: 'What happened?' }).fill('Spent ₹1,200 on petrol and 850 at a cafe via UPI');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: /Save \d+ entr/ }).click();
  await expect(page.getByRole('region', { name: 'What this means' })).toBeVisible();
  await shot(page, 'updates');

  // Dashboard, light and dark.
  await page.getByRole('link', { name: 'ArthaPath dashboard' }).click();
  await expect(page.locator('app-chart svg').first()).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 2000 }); // whole dashboard in one image
  await shot(page, 'dashboard');
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, 'dashboard-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // Drill-down.
  await page.getByRole('list', { name: 'Monthly breakdown' }).getByRole('link', { name: /Discretionary/ }).click();
  await expect(page).toHaveURL(/\/app\/details\//);
  await shot(page, 'details');

  // Chat.
  await page.getByRole('link', { name: 'Chat' }).click();
  await page.getByRole('textbox', { name: 'Message' }).fill('What should I focus on next: the emergency fund or the car?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Your next step')).toBeVisible();
  await shot(page, 'chat');

  // Analysis.
  await menu(page, 'Analysis');
  await page.getByRole('button', { name: 'Analyze my finances' }).click();
  await expect(page.getByText('What to do this month')).toBeVisible();
  await shot(page, 'analysis');

  // Phone size.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'ArthaPath dashboard' }).click();
  await expect(page.locator('app-chart svg').first()).toBeVisible();
  await shot(page, 'mobile-dashboard');
});
