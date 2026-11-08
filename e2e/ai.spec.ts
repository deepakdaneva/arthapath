import { expect, test, type Page, type Route } from '@playwright/test';
import { PIN, currentUid, field, setupPin, signUp, uniqueEmail, unlock } from './helpers';

// Provider APIs are mocked: CI never calls a real provider or uses a real key.
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const FAKE_GEMINI_KEY = 'AIzaFAKE-e2e-gemini-key-0000000000001';
const FAKE_GROQ_KEY = 'gsk_FAKE_e2e_groq_key_00000000000000002';

type Handler = (body: Record<string, unknown> | null) => { status: number; json: unknown };

async function mockProvider(page: Page, pattern: string, handlers: { models?: unknown; chat?: Handler }) {
  const calls = { chat: 0 };
  await page.route(pattern, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = req.url();
    if (/\/models(\?|$)/.test(url) && req.method() === 'GET') {
      return route.fulfill({ status: 200, headers: CORS, json: handlers.models ?? { data: [] } });
    }
    calls.chat++;
    const r = handlers.chat!(req.postDataJSON());
    return route.fulfill({ status: r.status, headers: CORS, json: r.json });
  });
  return calls;
}

const groqOk = (text: string): Handler => () => ({ status: 200, json: { model: 'llama-test', choices: [{ message: { content: text } }] } });
const geminiQuota: Handler = () => ({
  status: 429,
  json: { error: { status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota', details: [{ retryDelay: '3600s' }] } },
});
const groqQuota: Handler = () => ({ status: 429, json: { error: { message: 'Rate limit reached on requests per day (RPD)' } } });

async function addKey(page: Page, provider: 'Google Gemini' | 'Groq', key: string, model: string) {
  await page.getByRole('button', { name: 'Add an AI provider' }).click();
  if (provider !== 'Google Gemini') {
    await page.locator('ion-select[label="Provider"]').click();
    await page.getByRole('radio', { name: provider }).click();
  }
  await field(page, 'API key').fill(key);
  await field(page, 'Model').fill(model);
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText(key.slice(0, 4) + '••••••••••••' + key.slice(-4))).toBeVisible();
}

async function ready(page: Page, tag: string) {
  await signUp(page, uniqueEmail(tag));
  await setupPin(page);
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByText('AI Providers / API Keys').click();
  await expect(page).toHaveURL(/\/app\/ai-providers$/);
}

test.describe('AI providers and chat', () => {
  test('keys are validated, stored encrypted, masked, reordered, and toggled', async ({ page }) => {
    await mockProvider(page, 'https://api.groq.com/**', { models: { data: [{ id: 'llama-test' }, { id: 'other-model' }] }, chat: groqOk('ok') });
    await ready(page, 'keys');

    await page.getByRole('button', { name: 'Add an AI provider' }).click();
    await page.locator('ion-select[label="Provider"]').click();
    await page.getByRole('radio', { name: 'Groq' }).click();
    await field(page, 'API key').fill(FAKE_GROQ_KEY);
    await page.getByRole('button', { name: /Check key/ }).click();
    await expect(page.getByText('Key works. 2 models available.')).toBeVisible();
    await page.getByRole('button', { name: 'Save key' }).click();
    await expect(page.getByText('gsk_••••••••••••0002')).toBeVisible();
    await expect(page.getByText(FAKE_GROQ_KEY)).toHaveCount(0);

    // Stored encrypted: the key never appears in Firestore.
    const uid = await currentUid(page);
    await expect.poll(async () => JSON.stringify(await readDocsIn(`users/${uid}/aiKeys`))).toContain('"ct"');
    expect(JSON.stringify(await readDocsIn(`users/${uid}/aiKeys`))).not.toContain('gsk_');

    await addKey(page, 'Google Gemini', FAKE_GEMINI_KEY, 'gemini-test');
    const order = page.locator('ol.keys strong');
    await expect(order).toHaveText(['Groq', 'Google Gemini']);
    await page.getByRole('button', { name: 'Move Google Gemini up' }).click();
    await expect(order).toHaveText(['Google Gemini', 'Groq']);

    await page.getByRole('switch', { name: 'Use Groq' }).click();
    await expect(page.locator('ol.keys li').nth(1)).toContainText('Disabled');
  });

  test('falls back from an exhausted provider, notifies, blinks, and keeps context', async ({ page }) => {
    const gemini = await mockProvider(page, 'https://generativelanguage.googleapis.com/**', { chat: geminiQuota });
    let lastGroqBody: Record<string, unknown> | null = null;
    let groqCalls = 0;
    const groq = await mockProvider(page, 'https://api.groq.com/**', {
      chat: (body) => {
        lastGroqBody = body;
        const replies = ['Build a 6-month emergency fund first.', 'Aim to invest 15% of income for retirement.'];
        return groqOk(replies[Math.min(groqCalls++, 1)]!)(body);
      },
    });
    await ready(page, 'fallback');
    await addKey(page, 'Google Gemini', FAKE_GEMINI_KEY, 'gemini-test');
    await addKey(page, 'Groq', FAKE_GROQ_KEY, 'llama-test');

    await page.getByRole('link', { name: 'Chat' }).click();
    await page.getByRole('textbox', { name: 'Message' }).fill('I earn ₹1,50,000 a month. What should I save for first?');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(page.getByText('Build a 6-month emergency fund first.')).toBeVisible();
    await expect(page.locator('ion-toast')).toContainText('Google Gemini free quota exhausted. Switching to Groq.');
    await expect(page.locator('app-ai-status .chip')).toHaveClass(/blink/);
    await expect(page.locator('app-ai-status .chip')).toContainText('Groq');
    await expect(page.locator('.msg.assistant .meta').last()).toContainText('Groq · llama-test');
    expect(gemini.chat).toBe(1);
    expect(groq.chat).toBe(1);

    // The provider received the app-owned context: system prompt, snapshot, and the message.
    const msgs = (lastGroqBody as unknown as { messages: { role: string; content: string }[] }).messages;
    expect(msgs[0]!.content).toContain('You are ArthaPath');
    expect(msgs[1]!.content).toContain('Financial context');
    expect(msgs.at(-1)!.content).toContain('₹1,50,000');

    // Gemini is cooling down: the next message goes straight to Groq.
    await page.getByRole('textbox', { name: 'Message' }).fill('And how much for retirement savings?');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Aim to invest 15% of income for retirement.')).toBeVisible();
    expect(gemini.chat).toBe(1);
    const second = (lastGroqBody as unknown as { messages: { content: string }[] }).messages.map((m) => m.content).join('\n');
    expect(second).toContain('₹1,50,000'); // earlier turn carried over

    // Messages are stored encrypted and reload after unlocking.
    const uid = await currentUid(page);
    const stored = JSON.stringify(await readDocsIn(`users/${uid}/conversations/main/messages`));
    expect(stored).toContain('"ct"');
    expect(stored).not.toContain('emergency fund');
    await page.reload();
    await unlock(page, PIN);
    await expect(page.getByText('Build a 6-month emergency fund first.')).toBeVisible();
  });

  test('reports when every provider is exhausted', async ({ page }) => {
    await mockProvider(page, 'https://generativelanguage.googleapis.com/**', { chat: geminiQuota });
    await mockProvider(page, 'https://api.groq.com/**', { chat: groqQuota });
    await ready(page, 'allout');
    await addKey(page, 'Google Gemini', FAKE_GEMINI_KEY, 'gemini-test');
    await addKey(page, 'Groq', FAKE_GROQ_KEY, 'llama-test');
    await page.getByRole('link', { name: 'Chat' }).click();
    await page.getByRole('textbox', { name: 'Message' }).fill('How do I budget my salary?');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('All configured AI providers have reached their available limits.')).toBeVisible();
    await expect(page.locator('app-ai-status .chip')).toContainText('limit reached');
  });

  test('off-topic questions are answered locally without calling a provider', async ({ page }) => {
    const groq = await mockProvider(page, 'https://api.groq.com/**', { chat: groqOk('should not be called') });
    await ready(page, 'guard');
    await addKey(page, 'Groq', FAKE_GROQ_KEY, 'llama-test');
    await page.getByRole('link', { name: 'Chat' }).click();
    await page.getByRole('textbox', { name: 'Message' }).fill('Tell me a joke');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText("I'm designed specifically to help you manage your finances")).toBeVisible();
    expect(groq.chat).toBe(0);
  });

  test('chat explains how to start when no provider is configured', async ({ page }) => {
    await signUp(page, uniqueEmail('nokey'));
    await setupPin(page);
    await page.getByRole('link', { name: 'Chat' }).click();
    await expect(page.getByRole('link', { name: 'Add an AI provider' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add an update' })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Message' }).fill('Help me plan my savings');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('No AI provider is set up yet.')).toBeVisible();
  });
});

/** Lists documents of a collection in the emulator (admin read). */
async function readDocsIn(path: string): Promise<unknown[]> {
  const res = await fetch(`http://127.0.0.1:8080/v1/projects/demo-arthapath/databases/(default)/documents/${path}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  return ((await res.json()) as { documents?: unknown[] }).documents ?? [];
}


