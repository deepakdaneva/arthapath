import { expect, test, type Page } from '@playwright/test';
import { PIN, currentUid, field, setupPin, signUp, uniqueEmail, unlock } from './helpers';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const FAKE_GROQ_KEY = 'gsk_FAKE_e2e_groq_key_00000000000000002';

async function readDocsIn(path: string): Promise<unknown[]> {
  const res = await fetch(`http://127.0.0.1:8080/v1/projects/demo-arthapath/databases/(default)/documents/${path}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  return ((await res.json()) as { documents?: unknown[] }).documents ?? [];
}

/** Full navigation reloads the app, which locks it: unlock and continue. */
async function gotoUnlocked(page: Page, path: string) {
  await page.goto(path);
  await unlock(page, PIN);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
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

async function setupGroq(page: Page, reply: string, onBody?: (b: { messages: { content: string }[] }) => void) {
  await page.route('https://api.groq.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    onBody?.(route.request().postDataJSON());
    return route.fulfill({ status: 200, headers: CORS, json: { model: 'llama-test', choices: [{ message: { content: reply } }] } });
  });
  await gotoUnlocked(page, '/app/ai-providers');
  await page.getByRole('button', { name: 'Add an AI provider' }).click();
  await page.locator('ion-select[label="Provider"]').click();
  await page.getByRole('radio', { name: 'Groq' }).click();
  await field(page, 'API key').fill(FAKE_GROQ_KEY);
  await field(page, 'Model').fill('llama-test');
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText('gsk_••••••••••••0002')).toBeVisible();
}

test.describe('financial profile and engine', () => {
  test('manual entry computes the plan; data is stored encrypted', async ({ page }) => {
    await signUp(page, uniqueEmail('manual'));
    await setupPin(page);
    await page.getByRole('link', { name: 'Prefer a form? Enter details manually' }).click();
    await expect(page).toHaveURL(/\/app\/finances$/);

    await addItem(page, 'Income', { 'Amount (₹)': '150000' }, { Type: 'salary' });
    await addItem(page, 'Expenses', { 'Name (optional)': 'Household', 'Amount (₹)': '40000' }, { Type: 'household' });
    await addItem(page, 'Loans and credit cards', { 'Outstanding (₹)': '3000000', 'Monthly payment / EMI (₹)': '25000', 'Interest rate': '8.5' }, { Type: 'home_loan' });
    await addItem(page, 'Savings and investments', { 'Current value (₹)': '200000' }, { Type: 'savings' });
    await addItem(page, 'Goals, in priority order', { 'Name (optional)': 'Family car', 'Target (₹)': '1000000', 'Target month': '2029-11' }, { Type: 'vehicle' });
    await addItem(page, 'Goals, in priority order', { 'Name (optional)': 'Emergency fund', 'Target (₹)': '400000', 'Saved so far (₹)': '200000', 'Target month': '2027-11' }, { Type: 'emergency_fund' });

    // Engine: surplus = 1,50,000 − 40,000 − 25,000 = 85,000; emergency fund ranks first.
    const summary = page.getByLabel('Monthly summary');
    await expect(summary).toContainText('₹85,000');
    const goals = page.locator('ol.goals > li strong');
    await expect(goals.first()).toHaveText('1. Emergency fund');
    await page.getByRole('button', { name: 'Move Family car up' }).click();
    await expect(goals.first()).toHaveText('1. Family car');
    await expect(page.getByText('You set this priority yourself.').first()).toBeVisible();

    // Dashboard reflects the same numbers.
    await page.getByRole('link', { name: 'ArthaPath dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Financial health' })).toBeVisible();
    await expect(page.locator('.score strong')).toHaveText(/\d+/);
    await expect(page.getByText('₹85,000').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Worth considering' })).toBeVisible();

    // Stored encrypted only.
    const uid = await currentUid(page);
    const vault = JSON.stringify(await readDocsIn(`users/${uid}/vault`));
    const goalDocs = JSON.stringify(await readDocsIn(`users/${uid}/goals`));
    expect(vault).toContain('"ct"');
    for (const plain of ['150000', 'Household', 'home_loan']) expect(vault).not.toContain(plain);
    expect(goalDocs).not.toContain('Family car');
  });

  test('conversational onboarding: extract, review and correct, save, then plan', async ({ page }) => {
    const extraction = {
      reply: 'Thanks! Do you have any loans or EMIs?',
      incomes: [{ label: 'Salary', kind: 'salary', amount: 150000, frequency: 'monthly', earner: 'self' }],
      expenses: [{ label: 'Household', category: 'household', amount: 45000, frequency: 'monthly', essential: true, estimated: true }],
      goals: [{ label: 'Car', category: 'vehicle', target: 800000, saved: 0, targetDate: '2029-11', estimated: true }],
      questions: [{ key: 'loans', question: 'Do you have any loans or EMIs?', why: 'Needed for debt-to-income and cash flow', optional: false }],
      done: true,
    };
    await signUp(page, uniqueEmail('onboard'));
    await setupPin(page);
    await setupGroq(page, JSON.stringify(extraction));

    // First-time chat offers templates that open onboarding prefilled.
    await page.getByRole('link', { name: 'Chat' }).click();
    await expect(page.getByRole('heading', { name: 'First, tell ArthaPath about your finances' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveAttribute('placeholder', /income, expenses/);
    await page.getByRole('link', { name: 'My income' }).click();
    await expect(page).toHaveURL(/\/app\/onboarding/);
    await expect(page.getByRole('button', { name: 'Add an update' })).toHaveCount(0);
    const box = page.getByRole('textbox', { name: 'Describe your finances' });
    await expect(box).toHaveValue(/I earn ₹____ per month/);

    await box.fill('I earn 1.5 lakh a month, we spend around 45k, and want a car in 3 years.');
    await page.locator('app-onboarding').getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Thanks! Do you have any loans or EMIs?')).toBeVisible();

    // Review: estimates flagged; correct one amount before saving.
    await expect(page.getByRole('heading', { name: 'Check what I understood' })).toBeVisible();
    await expect(page.getByText('Estimate: please confirm').first()).toBeVisible();
    await page.getByLabel('Amount in rupees for Household').fill('50000');
    await page.getByLabel('Amount in rupees for Household').blur();
    await page.getByRole('button', { name: 'Save these details' }).click();
    await expect(page.getByText('Still useful to know')).toBeVisible();
    // The AI's question plus gaps found in the data (savings, insurance, family).
    await expect(page.locator('.tabbar .badge').first()).toHaveText(/^[1-9]\d*$/);

    await page.getByRole('button', { name: 'See my plan' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText(/\d+ questions? to improve your plan/).first()).toBeVisible();
    await expect(page.getByText('₹1,00,000').first()).toBeVisible(); // surplus uses the corrected ₹50,000
  });

  test('a message sent right after unlocking waits for keys to load', async ({ page }) => {
    await signUp(page, uniqueEmail('race'));
    await setupPin(page);
    await setupGroq(page, JSON.stringify({ reply: 'Noted your income.', incomes: [{ label: 'Salary', kind: 'salary', amount: 90000 }] }));
    await page.goto('/app/onboarding');
    await unlock(page, PIN);
    await page.getByRole('textbox', { name: 'Describe your finances' }).fill('I earn 90k a month');
    await page.locator('app-onboarding').getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Noted your income.')).toBeVisible();
    await expect(page.getByText('Add an AI provider first')).toHaveCount(0);
  });

  test('chat uses the saved profile as context', async ({ page }) => {
    let body: { messages: { content: string }[] } | null = null;
    await signUp(page, uniqueEmail('ctx'));
    await setupPin(page);
    await gotoUnlocked(page, '/app/finances');
    await addItem(page, 'Income', { 'Amount (₹)': '123456' }, { Type: 'salary' });
    await setupGroq(page, 'Focus on your emergency fund first.', (b) => (body = b));
    await page.getByRole('link', { name: 'Chat' }).click();
    await expect(page.getByRole('button', { name: 'Prioritize my goals' })).toBeVisible();
    await page.getByRole('button', { name: 'Prioritize my goals' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Focus on your emergency fund first.')).toBeVisible();
    const context = body!.messages[1]!.content;
    expect(context).toContain('"monthlyIncome":123456');
  });
});

test.describe('navigation and guides', () => {
  test('Updates tab replaces Today’s Updates and the old link redirects', async ({ page }) => {
    await signUp(page, uniqueEmail('updates'));
    await setupPin(page);
    await page.getByRole('link', { name: 'Updates' }).click();
    await expect(page).toHaveURL(/\/app\/updates$/);
    await expect(page.getByRole('heading', { name: 'Updates' })).toBeVisible();
    await expect(page.getByText('daily, weekly, or once a month')).toBeVisible();
    await expect(page.getByText("Today's Updates")).toHaveCount(0);
    await page.goto('/app/today');
    await expect(page).toHaveURL(/\/app\/(updates|today)|\/unlock/);
  });

  test('each provider shows how to create a key', async ({ page }) => {
    await signUp(page, uniqueEmail('guide'));
    await setupPin(page);
    await page.goto('/app/ai-providers');
    await page.locator('ion-input[label="PIN or passphrase"] input').fill('river-mango-42');
    await page.getByRole('button', { name: 'Unlock', exact: true }).click();
    await page.getByRole('button', { name: 'Add an AI provider' }).click();
    await expect(page.getByText('How to get a Groq key')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Groq' })).toHaveAttribute('href', 'https://console.groq.com/keys');
    await page.locator('ion-select[label="Provider"]').click();
    await page.getByRole('radio', { name: 'Google Gemini' }).click();
    await expect(page.getByText('How to get a Google Gemini (Google AI Studio) key')).toBeVisible();
    await expect(page.getByText('Click "Create API key"')).toBeVisible();
    await expect(page.locator('ion-popover.select-popover')).toHaveCount(0);
    await page.locator('ion-select[label="Provider"]').click();
    await page.getByRole('radio', { name: 'Custom (OpenAI-compatible)' }).click();
    await expect(page.getByText('How to get a Mistral key')).toBeVisible();
  });
});
