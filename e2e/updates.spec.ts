import { expect, test, type Page } from '@playwright/test';
import { currentUid, field, setupPin, signUp, uniqueEmail } from './helpers';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

async function readDocsIn(path: string): Promise<{ fields: Record<string, unknown> }[]> {
  const res = await fetch(`http://127.0.0.1:8080/v1/projects/demo-arthapath/databases/(default)/documents/${path}`, { headers: { Authorization: 'Bearer owner' } });
  return ((await res.json()) as { documents?: { fields: Record<string, unknown> }[] }).documents ?? [];
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

async function seedPlan(page: Page) {
  await page.getByRole('link', { name: 'Prefer a form? Enter details manually' }).click();
  await addItem(page, 'Income', { 'Amount (₹)': '100000' }, { Type: 'salary' });
  await addItem(page, 'Expenses', { 'Name (optional)': 'Groceries', 'Amount (₹)': '10000' }, { Type: 'groceries', 'How needed': 'necessary' });
  await addItem(page, 'Goals, in priority order', { 'Name (optional)': 'Family car', 'Target (₹)': '500000', 'Target month': '2029-12' }, { Type: 'vehicle' });
}

async function openUpdates(page: Page) {
  await page.getByRole('link', { name: 'Updates' }).click();
  await expect(page).toHaveURL(/\/app\/updates$/);
}

test.describe('updates: logging activity', () => {
  test('one line becomes reviewed entries, shows impact, feeds trends and details, stored encrypted', async ({ page }) => {
    test.slow();
    await signUp(page, uniqueEmail('upd'));
    await setupPin(page);
    await seedPlan(page);
    await openUpdates(page);

    const note = page.getByRole('textbox', { name: 'What happened?' });
    await note.fill('Spent ₹12,000 on groceries via UPI and 300 on parking');
    await page.getByRole('button', { name: 'Review' }).click();

    // Review: two entries understood on the device, editable before saving.
    const entries = page.locator('li.entry');
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0).getByLabel('Amount (₹)')).toHaveValue('12000');
    await expect(entries.nth(0).getByLabel('Category')).toHaveValue('groceries');
    await expect(entries.nth(0).getByLabel('Paid by')).toHaveValue('upi');
    await expect(entries.nth(1).getByLabel('Category')).toHaveValue('transport');
    await entries.nth(1).getByLabel('Amount (₹)').fill('350');
    await page.getByRole('button', { name: 'Save 2 entries' }).click();

    // Deterministic impact against the plan.
    const impact = page.getByRole('region', { name: 'What this means' });
    await expect(impact).toContainText('₹12,000 spent on groceries this month: ₹2,000 over your ₹10,000 plan.');
    const list = page.getByRole('list', { name: "This month's entries" });
    await expect(list.locator('li')).toHaveCount(2);
    await expect(list).toContainText('₹350');

    // Stored encrypted: only the month and date are readable.
    const uid = await currentUid(page);
    const docs = await readDocsIn(`users/${uid}/transactions`);
    expect(docs).toHaveLength(2);
    expect(Object.keys(docs[0]!.fields).sort()).toEqual(['ct', 'iv', 'month', 'occurredAt', 'updatedAt', 'v']);
    expect(JSON.stringify(docs)).not.toContain('groceries');

    // Dashboard: month summary, trend chart, over-plan warning.
    await page.getByRole('link', { name: 'ArthaPath dashboard' }).click();
    await expect(page.getByText(/This month so far: spent ₹12,350 of ₹10,000 planned/)).toBeVisible();
    await expect(page.locator('.trend-chart app-chart svg')).toBeVisible();
    await expect(page.locator('.warnings')).toContainText('Groceries over plan this month');

    // Details list with the period filter.
    await page.getByRole('list', { name: 'Monthly breakdown' }).getByRole('link', { name: /Necessary/ }).click();
    const tx = page.locator('app-details').getByRole('list', { name: 'Transactions' });
    await expect(tx.locator('li')).toHaveCount(2);
    await page.locator('app-details').getByRole('button', { name: 'Year' }).click();
    await expect(tx.locator('li')).toHaveCount(2);

    // Deleting an entry updates the month.
    await openUpdates(page);
    await list.getByRole('button', { name: /Delete/ }).first().click();
    await expect(list.locator('li')).toHaveCount(1);
  });

  test('a saving for a goal adds to the goal, and deleting it reverses', async ({ page }) => {
    await signUp(page, uniqueEmail('updgoal'));
    await setupPin(page);
    await seedPlan(page);
    await openUpdates(page);
    await page.getByRole('textbox', { name: 'What happened?' }).fill('Put 5000 in FD for the family car');
    await page.getByRole('button', { name: 'Review' }).click();
    const entry = page.locator('li.entry');
    await expect(entry.getByLabel('Type')).toHaveValue('saving');
    await expect(entry.getByLabel('For goal')).not.toHaveValue('');
    await page.getByRole('button', { name: 'Save 1 entry' }).click();
    await expect(page.getByRole('region', { name: 'What this means' })).toContainText('Family car: ₹5,000 of ₹5,00,000 saved (1%).');

    await page.getByRole('link', { name: 'ArthaPath dashboard' }).click();
    await expect(page.locator('a.goal', { hasText: 'Family car' })).toContainText('₹5,000');

    await openUpdates(page);
    await page.getByRole('list', { name: "This month's entries" }).getByRole('button', { name: /Delete/ }).click();
    await page.getByRole('link', { name: 'ArthaPath dashboard' }).click();
    await expect(page.locator('a.goal', { hasText: 'Family car' })).toContainText('₹0');
  });

  test('notes without an amount go to the AI provider, flagged for review', async ({ page }) => {
    let sent = '';
    await page.route('https://api.groq.com/**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (req.method() === 'GET') return route.fulfill({ status: 200, headers: CORS, json: { data: [] } });
      sent = req.postData() ?? '';
      const reply = { entries: [{ type: 'expense', amount: 500, date: '2026-11-01', category: 'household', need: 'necessary', method: 'cash', description: 'electrician' }] };
      return route.fulfill({ status: 200, headers: CORS, json: { model: 'llama-test', choices: [{ message: { content: JSON.stringify(reply) } }] } });
    });
    await signUp(page, uniqueEmail('updai'));
    await setupPin(page);
    await openUpdates(page);

    // Without a provider: a clear hint, nothing sent.
    await page.getByRole('textbox', { name: 'What happened?' }).fill('Paid the electrician five hundred rupees in cash');
    await page.getByRole('button', { name: 'Review' }).click();
    await expect(page.getByText(/No amount found. Try "Spent ₹500 on groceries"/)).toBeVisible();

    await page.getByRole('button', { name: 'Open account menu' }).click();
    await page.getByText('AI Providers / API Keys').click();
    await page.getByRole('button', { name: 'Add an AI provider' }).click();
    await field(page, 'API key').fill('gsk_FAKE_e2e_groq_key_00000000000000002');
    await field(page, 'Model').fill('llama-test');
    await page.getByRole('button', { name: 'Save key' }).click();
    await expect(page.getByText('gsk_••••••••••••0002')).toBeVisible();

    await openUpdates(page);
    await page.getByRole('textbox', { name: 'What happened?' }).fill('Paid the electrician five hundred rupees in cash');
    await page.getByRole('button', { name: 'Review' }).click();
    const entry = page.locator('li.entry');
    await expect(entry.getByLabel('Amount (₹)')).toHaveValue('500');
    await expect(entry).toContainText('Read by your AI provider: please check');
    expect(sent).toContain('electrician');
    await page.getByRole('button', { name: 'Save 1 entry' }).click();
    await expect(page.getByRole('list', { name: "This month's entries" })).toContainText('₹500');
  });
});
