import { expect, test, type Page } from '@playwright/test';
import { field, setupPin, signUp, uniqueEmail } from './helpers';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

/** A small text PDF (Helvetica), enough for pdf.js to extract lines. */
function makePdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = `BT /F1 10 Tf 40 780 Td 14 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

async function addGroq(page: Page, reply: (body: string) => unknown) {
  await page.route('https://api.groq.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') return route.fulfill({ status: 200, headers: CORS, json: { data: [] } });
    const content = reply(req.postData() ?? '');
    return route.fulfill({ status: 200, headers: CORS, json: { model: 'llama-test', choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] } });
  });
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByText('AI Providers / API Keys').click();
  await page.getByRole('button', { name: 'Add an AI provider' }).click();
  await field(page, 'API key').fill('gsk_FAKE_e2e_groq_key_00000000000000002');
  await field(page, 'Model').fill('llama-test');
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText('gsk_••••••••••••0002')).toBeVisible();
}

async function openImport(page: Page) {
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByText('Import a statement').click();
  await expect(page).toHaveURL(/\/app\/import$/);
}

const CSV = [
  'HDFC BANK Ltd.,,,,,,',
  'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
  '05/11/26,UPI-SWIGGY-ORDER-ICIC0000001,0000431,05/11/26,"1,250.00",,"54,750.00"',
  '01/11/26,SALARY NOV 2026 ACME LTD,,01/11/26,,"1,50,000.00","56,000.00"',
  '06/11/26,XYZ ENTERPRISES 99812,,06/11/26,"3,000.00",,"51,750.00"',
].join('\n');

test.describe('statement import', () => {
  test('CSV: read on the device, duplicates flagged, reviewed, saved', async ({ page }) => {
    test.slow();
    const sent: string[] = [];
    page.on('request', (r) => {
      if (/groq|openrouter|generativelanguage/.test(r.url())) sent.push(r.url());
    });
    await signUp(page, uniqueEmail('imp'));
    await setupPin(page);
    // An entry typed earlier for the same day and amount.
    await page.getByRole('link', { name: 'Updates' }).click();
    await page.getByRole('textbox', { name: 'What happened?' }).fill('Swiggy 1250 on 5 Nov');
    await page.getByRole('button', { name: 'Review' }).click();
    await page.getByRole('button', { name: 'Save 1 entry' }).click();
    await expect(page.getByRole('list', { name: "This month's entries" }).locator('li')).toHaveCount(1);

    await page.getByRole('link', { name: 'Import a statement' }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'statement.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    await expect(page.getByRole('heading', { name: 'Review 3 rows' })).toBeVisible();
    const rows = page.locator('ul.rows > li');
    await expect(rows.nth(0)).toContainText('Possible duplicate');
    await expect(rows.nth(0).getByRole('checkbox')).not.toBeChecked();
    await expect(rows.nth(1)).toContainText('+₹1,50,000');
    await expect(page.getByText('Categories come from this device.')).toBeVisible();
    // Correct the unknown row before saving.
    await rows.nth(2).getByLabel(/Category for/).selectOption('household');
    await page.getByRole('button', { name: 'Save 2 entries' }).click();
    await expect(page.getByRole('heading', { name: 'Imported 2 entries' })).toBeVisible();
    expect(sent).toEqual([]);

    await page.getByRole('link', { name: '← Updates' }).click();
    await expect(page.getByRole('list', { name: "This month's entries" }).locator('li')).toHaveCount(3);
  });

  test('PDF and pasted text are read on the device', async ({ page }) => {
    await signUp(page, uniqueEmail('imppdf'));
    await setupPin(page);
    await openImport(page);
    const pdf = makePdf(['Date Description Amount Balance', '05/11/2026 POS DMART BANGALORE 2,310.50 Dr 50,239.50', '06/11/2026 NEFT ACME PAYROLL 90,000.00 Cr 1,40,239.50']);
    await page.locator('input[type=file]').setInputFiles({ name: 'statement.pdf', mimeType: 'application/pdf', buffer: pdf });
    await expect(page.getByRole('heading', { name: 'Review 2 rows' })).toBeVisible();
    await expect(page.locator('ul.rows > li').nth(0)).toContainText('₹2,311');
    await page.getByRole('button', { name: 'Discard' }).click();

    await page.getByRole('textbox', { name: 'Statement text' }).fill('07/11/2026 UPI/ZOMATO/Order 450.00 Dr 1,02,550.00');
    await page.getByRole('button', { name: 'Read' }).click();
    await expect(page.getByRole('heading', { name: 'Review 1 rows' })).toBeVisible();
    await expect(page.locator('ul.rows > li').nth(0).getByLabel(/Category for/)).toHaveValue('dining');
  });

  test('AI categorizes unknown rows only when allowed in Settings', async ({ page }) => {
    let body = '';
    await signUp(page, uniqueEmail('impai'));
    await setupPin(page);
    await addGroq(page, (b) => {
      body = b;
      return { rows: [{ i: 2, type: 'expense', category: 'household', need: 'necessary' }] };
    });
    await page.getByRole('button', { name: 'Open account menu' }).click();
    await page.getByText('Settings').click();
    await page.getByRole('switch', { name: 'Let AI categorize imported rows' }).click();
    await openImport(page);
    await page.locator('input[type=file]').setInputFiles({ name: 'statement.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    const third = page.locator('ul.rows > li').nth(2);
    await expect(third).toContainText('AI categorized');
    await expect(third.getByLabel(/Category for/)).toHaveValue('household');
    // Only the unknown row went out, without dates or balances.
    expect(body).toContain('XYZ ENTERPRISES');
    expect(body).not.toContain('SWIGGY');
    expect(body).not.toContain('51,750');
    expect(body).not.toContain('2026-11-06');
  });
});

test.describe('questions and analysis', () => {
  test('gaps become questions that disappear once answered or skipped', async ({ page }) => {
    await signUp(page, uniqueEmail('qs'));
    await setupPin(page);
    await page.getByRole('link', { name: 'Prefer a form? Enter details manually' }).click();
    const sec = page.locator('section', { has: page.getByRole('heading', { name: 'Expenses' }) });
    await sec.getByRole('button', { name: 'Add' }).click();
    await sec.locator('form.add').getByLabel('Type').selectOption('rent');
    await sec.locator('form.add').getByLabel('Amount (₹)', { exact: false }).fill('20000');
    await sec.locator('form.add').getByRole('button', { name: 'Save' }).click();

    await page.getByRole('link', { name: 'ArthaPath dashboard' }).click();
    await page.locator('a.questions').click();
    await expect(page).toHaveURL(/\/app\/questions$/);
    const qp = page.locator('app-questions');
    await expect(qp.getByText('What is your monthly take-home income?')).toBeVisible();
    await expect(qp.getByText('Used for: Savings rate, Health score, Goal plans, Loan burden')).toBeVisible();
    const health = qp.locator('li', { hasText: 'Do you have health insurance for your family?' });
    await health.getByRole('button', { name: 'Yes' }).click();
    await expect(qp.getByText('Do you have health insurance for your family?')).toHaveCount(0);
    await qp.getByRole('button', { name: 'Skip: Does anyone depend on your income (spouse, children, parents)?' }).click();
    await expect(qp.getByText('Does anyone depend on your income')).toHaveCount(0);
    const income = qp.locator('li', { hasText: 'What is your monthly take-home income?' });
    await income.getByRole('link', { name: 'Answer' }).click();
    await expect(page.getByRole('textbox', { name: 'Describe your finances' })).toHaveValue(/What is your monthly take-home income\?/);
  });

  test('analysis runs on request, shows recommendations, and is kept in history', async ({ page }) => {
    let sent = '';
    await signUp(page, uniqueEmail('ana'));
    await setupPin(page);
    await page.getByRole('link', { name: 'Prefer a form? Enter details manually' }).click();
    const add = async (section: string, type: string, amount: string, extra: Record<string, string> = {}) => {
      const s = page.locator('section', { has: page.getByRole('heading', { name: section }) });
      await s.getByRole('button', { name: 'Add' }).click();
      const f = s.locator('form.add');
      await f.getByLabel('Type').selectOption(type);
      await f.getByLabel(section === 'Loans and credit cards' ? 'Outstanding (₹)' : 'Amount (₹)', { exact: false }).fill(amount);
      for (const [l, v] of Object.entries(extra)) await f.getByLabel(l, { exact: false }).fill(v);
      await f.getByRole('button', { name: 'Save' }).click();
      await expect(f).toHaveCount(0);
    };
    await add('Income', 'salary', '100000');
    await add('Expenses', 'rent', '30000');
    await add('Loans and credit cards', 'credit_card', '80000', { 'Monthly payment / EMI (₹)': '5000' });
    await addGroq(page, (b) => {
      sent = b;
      return '## Where you stand\nYou save **65%** of income.';
    });
    await page.getByRole('button', { name: 'Open account menu' }).click();
    await page.getByText('Analysis', { exact: true }).click();
    await expect(page).toHaveURL(/\/app\/analysis$/);
    await expect(page.getByText('Clear high-interest debt first')).toBeVisible();
    await expect(page.getByText('You have not had an analysis yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Analyze my finances' }).click();
    await expect(page.locator('.body strong')).toHaveText('65%');
    await expect(page.locator('.history li')).toHaveCount(1);
    expect(sent).toContain('Clear high-interest debt first');
    expect(sent).toMatch(/monthlyIncome\\":100000/);
  });
});
