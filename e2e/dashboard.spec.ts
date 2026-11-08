import { expect, test, type Page } from '@playwright/test';
import { PIN, setupPin, signUp, uniqueEmail, unlock } from './helpers';

async function addItem(page: Page, section: string, fill: Record<string, string>, selects: Record<string, string> = {}) {
  const sec = page.locator('section', { has: page.getByRole('heading', { name: section }) });
  await sec.getByRole('button', { name: 'Add' }).click();
  const form = sec.locator('form.add');
  for (const [label, value] of Object.entries(selects)) await form.getByLabel(label).selectOption(value);
  for (const [label, value] of Object.entries(fill)) await form.getByLabel(label, { exact: false }).fill(value);
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toHaveCount(0);
}

async function seed(page: Page) {
  await page.getByRole('link', { name: 'Prefer a form? Enter details manually' }).click();
  await addItem(page, 'Income', { 'Amount (₹)': '100000' }, { Type: 'salary' });
  await addItem(page, 'Expenses', { 'Name (optional)': 'Rent', 'Amount (₹)': '30000' }, { Type: 'rent', 'How needed': 'necessary' });
  await addItem(page, 'Expenses', { 'Name (optional)': 'Dining out', 'Amount (₹)': '8000' }, { Type: 'dining', 'How needed': 'discretionary' });
  await addItem(page, 'Expenses', { 'Name (optional)': 'Unused gym', 'Amount (₹)': '12000' }, { Type: 'subscriptions', 'How needed': 'unnecessary' });
  await addItem(page, 'Expenses', { 'Name (optional)': 'Index fund SIP', 'Amount (₹)': '15000' }, { Type: 'investments' });
  await addItem(page, 'Savings and investments', { 'Current value (₹)': '50000' }, { Type: 'savings' });
  await addItem(page, 'Goals, in priority order', { 'Name (optional)': 'Car', 'Target (₹)': '600000', 'Target month': '2027-09' }, { Type: 'vehicle' });
  await page.getByRole('link', { name: 'ArthaPath dashboard' }).click();
}

test.describe('dashboard charts and drill-down', () => {
  test('shows where income goes, warns, and drills into the items behind a figure', async ({ page }) => {
    await signUp(page, uniqueEmail('dash'));
    await setupPin(page);
    await seed(page);

    // Spending split: investments are saving, not spending; each slice keeps its amount and share.
    const legend = page.getByRole('list', { name: 'Monthly breakdown' });
    await expect(legend.getByRole('link')).toHaveText([
      /Necessary\s*₹30,000\s*30%/,
      /Discretionary\s*₹8,000\s*8%/,
      /Unnecessary\s*₹12,000\s*12%/,
      /Investments\s*₹15,000\s*15%/,
      /Left to save\s*₹35,000\s*35%/,
    ]);
    await expect(page.locator('app-chart svg').first()).toBeVisible();

    // Warnings: unnecessary spending, a thin emergency fund, and the car goal.
    const warnings = page.locator('.warnings');
    await expect(warnings).toContainText('Spending you marked unnecessary');
    await expect(warnings).toContainText('Small emergency fund');

    // Goal card carries every figure.
    const car = page.locator('a.goal', { hasText: 'Car' });
    await expect(car).toContainText('Remaining');
    await expect(car).toContainText('₹6,00,000');
    await expect(car).toContainText('2027-09');

    // A click on a chart slice drills down too.
    // Click just past 12 o'clock on the ring: the first slice (Necessary) starts there.
    const box = (await page.locator('app-chart').first().boundingBox())!;
    const r = (Math.min(box.width, box.height) / 2) * 0.73;
    const angle = (8 * Math.PI) / 180;
    const px = box.x + box.width / 2 + r * Math.sin(angle);
    const py = box.y + box.height / 2 - r * Math.cos(angle);
    // Wait for the page transition to finish (Ionic blocks pointer events during it).
    await expect.poll(() => page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName, [px, py])).toBe('path');
    await page.mouse.click(px, py);
    await expect(page).toHaveURL(/\/app\/details\/necessary$/);

    await page.getByRole('link', { name: '← Dashboard' }).click();

    // Drill into a slice: items, calculation, and the period filter.
    await legend.getByRole('link', { name: /Unnecessary/ }).click();
    await expect(page).toHaveURL(/\/app\/details\/unnecessary$/);
    await expect(page.getByRole('heading', { name: 'Unnecessary', level: 1 })).toBeVisible();
    await expect(page.getByText('Unused gym')).toBeVisible();
    await expect(page.locator('app-details').getByText('That is 12% of income.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Week' }).click();
    await expect(page).toHaveURL(/period=week/);
    await page.getByRole('button', { name: 'Custom' }).click();
    const details = page.locator('app-details');
    await details.getByLabel('From', { exact: true }).fill('2026-10-01');
    await details.getByLabel('From', { exact: true }).blur();
    await details.getByLabel('To', { exact: true }).fill('2026-10-31');
    await details.getByLabel('To', { exact: true }).blur();
    await expect(page.getByText('1 Oct 2026 – 31 Oct 2026')).toBeVisible();
    await expect(page.getByText('No transactions in this period yet.')).toBeVisible();

    // Health score explains its calculation.
    await page.getByRole('link', { name: '← Dashboard' }).click();
    await page.getByRole('link', { name: /Financial health/ }).click();
    await expect(page.getByRole('cell', { name: /Savings rate/ })).toBeVisible();
    await expect(page.getByText('missing details never count against you')).toBeVisible();
  });

  test('reminds the user to log updates after a week without changes', async ({ page }) => {
    await page.clock.install();
    await signUp(page, uniqueEmail('stale'));
    await setupPin(page);
    await seed(page);
    await expect(page.locator('.warnings')).not.toContainText('No updates for');

    // Nine days pass; the app locks itself in the meantime.
    await page.clock.fastForward(9 * 24 * 60 * 60 * 1000);
    await page.goto('/app');
    await unlock(page, PIN);
    await expect(page.locator('.warnings')).toContainText('No updates for 9 days');
    await expect(page.getByLabel('No updates for 9 days')).toBeVisible();
  });
});
