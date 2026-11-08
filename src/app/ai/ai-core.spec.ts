import { afterEach, describe, expect, it, vi } from 'vitest';
import { geminiAdapter, openAiAdapter, pickModel, type AIResponse, type Credentials } from './adapters';
import { buildMessages, estimateTokens, type StoredMessage } from './context';
import { AIError, classifyHttpError, classifyThrown, parseDuration } from './errors';
import { classifyIntent } from './guardrails';
import { customBaseUrlError, maskKey } from './providers';
import { AllProvidersExhaustedError, eligible, exhaustedMessage, route, type RouteCandidate, type RouteEvent } from './router';

describe('errors', () => {
  it('parses provider retry hints', () => {
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('1m26.4s')).toBe(86_400);
    expect(parseDuration('120ms')).toBe(120);
    expect(parseDuration('2h')).toBe(7_200_000);
    expect(parseDuration('soon')).toBeNull();
  });

  it('separates rate limits from exhausted quotas', () => {
    const rl = classifyHttpError(429, '{"error":{"message":"Rate limit reached for requests per minute. Please try again in 7.5s"}}', 'Groq');
    expect(rl.kind).toBe('rate_limited');
    expect(rl.retryAfterMs).toBe(7_500);
    const q = classifyHttpError(429, 'Rate limit reached on requests per day (RPD): Limit 1000. Please try again in 1m26.4s', 'Groq');
    expect(q.kind).toBe('quota_exhausted');
    expect(q.retryAfterMs).toBe(86_400);
    const gem = classifyHttpError(429, '{"error":{"status":"RESOURCE_EXHAUSTED","message":"You exceeded your current quota","details":[{"retryDelay":"17s"}]}}', 'Gemini');
    expect(gem.kind).toBe('quota_exhausted');
    expect(gem.retryAfterMs).toBe(17_000);
    expect(classifyHttpError(402, 'Insufficient credits', 'OpenRouter').kind).toBe('quota_exhausted');
  });

  it('detects invalid keys, including Gemini’s HTTP 400', () => {
    expect(classifyHttpError(401, 'Invalid API Key', 'Groq').kind).toBe('auth_invalid');
    expect(classifyHttpError(400, '{"error":{"message":"API key not valid. Please pass a valid API key.","details":[{"reason":"API_KEY_INVALID"}]}}', 'Gemini').kind).toBe('auth_invalid');
    expect(classifyHttpError(403, 'Forbidden', 'Gemini').kind).toBe('auth_invalid');
  });

  it('detects missing models, outages, and bad requests', () => {
    expect(classifyHttpError(404, 'models/x is not found', 'Gemini').kind).toBe('model_unavailable');
    expect(classifyHttpError(400, 'The model `old` has been decommissioned', 'Groq').kind).toBe('model_unavailable');
    expect(classifyHttpError(503, 'overloaded', 'Gemini').kind).toBe('provider_down');
    expect(classifyHttpError(400, 'Please reduce the length: maximum context length is 8192', 'Groq').kind).toBe('invalid_request');
    expect(classifyHttpError(400, 'messages: field required', 'Groq').kind).toBe('invalid_request');
  });

  it('classifies thrown errors', () => {
    expect(classifyThrown(new TypeError('Failed to fetch'), 'Groq').kind).toBe('network');
    expect(classifyThrown(new DOMException('x', 'AbortError'), 'Groq').kind).toBe('aborted');
    expect(classifyThrown(new DOMException('x', 'TimeoutError'), 'Groq').kind).toBe('provider_down');
  });
});

describe('router', () => {
  const ok = (model: string): AIResponse => ({ text: 'hi', model, inputTokens: 1, outputTokens: 1 });
  const cand = (id: string, provider: Credentials['provider'], priority: number, extra: Partial<RouteCandidate> = {}): RouteCandidate => ({
    id,
    label: id,
    priority,
    enabled: true,
    credentials: { provider, apiKey: `k-${id}`, model: `m-${id}` },
    ...extra,
  });

  it('uses the highest-priority eligible key', async () => {
    const call = vi.fn(async (_r, c: Credentials) => ok(c.model));
    const r = await route({ messages: [] }, [cand('b', 'groq', 2), cand('a', 'gemini', 1)], { call, now: () => 0 });
    expect(r.used.id).toBe('a');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('falls back on quota exhaustion, records cooldown, and emits a switch', async () => {
    const events: RouteEvent[] = [];
    const health: unknown[] = [];
    const call = vi.fn(async (_r, c: Credentials) => {
      if (c.provider === 'gemini') throw new AIError('quota_exhausted', 'q', 30_000);
      return ok(c.model);
    });
    const r = await route({ messages: [] }, [cand('g', 'gemini', 1), cand('q', 'groq', 2)], {
      call,
      now: () => 1000,
      onEvent: (e) => events.push(e),
      onHealth: (h) => health.push(h),
    });
    expect(r.used.id).toBe('q');
    expect(events.find((e) => e.type === 'switch')).toMatchObject({ from: { id: 'g' }, to: { id: 'q' }, reason: 'quota_exhausted' });
    expect(health[0]).toMatchObject({ id: 'g', cooldownUntil: 31_000, blocked: null, lastError: 'quota_exhausted' });
  });

  it('blocks invalid keys and moves on', async () => {
    const health: { id: string; blocked: unknown }[] = [];
    const call = vi.fn(async (_r, c: Credentials) => {
      if (c.apiKey === 'k-bad') throw new AIError('auth_invalid', 'bad');
      return ok(c.model);
    });
    const r = await route({ messages: [] }, [cand('bad', 'groq', 1), cand('good', 'groq', 2)], { call, now: () => 0, onHealth: (h) => health.push(h) });
    expect(r.used.id).toBe('good');
    expect(health[0]).toMatchObject({ id: 'bad', blocked: 'auth_invalid' });
  });

  it('does not fall back on network errors or invalid requests', async () => {
    for (const kind of ['network', 'invalid_request'] as const) {
      const call = vi.fn(async () => {
        throw new AIError(kind, kind);
      });
      await expect(route({ messages: [] }, [cand('a', 'groq', 1), cand('b', 'gemini', 2)], { call, now: () => 0 })).rejects.toMatchObject({ kind });
      expect(call).toHaveBeenCalledTimes(1);
    }
  });

  it('tries each key at most once and reports when all are exhausted', async () => {
    const call = vi.fn(async () => {
      throw new AIError('rate_limited', 'rl');
    });
    const p = route({ messages: [] }, [cand('a', 'groq', 1), cand('b', 'groq', 2), cand('c', 'gemini', 3)], { call, now: () => 0 });
    await expect(p).rejects.toBeInstanceOf(AllProvidersExhaustedError);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('skips other keys of a provider that is down', async () => {
    const call = vi.fn(async (_r, c: Credentials) => {
      if (c.provider === 'groq') throw new AIError('provider_down', 'down');
      return ok(c.model);
    });
    const r = await route({ messages: [] }, [cand('g1', 'groq', 1), cand('g2', 'groq', 2), cand('gem', 'gemini', 3)], { call, now: () => 0 });
    expect(r.used.id).toBe('gem');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('ignores disabled, blocked, and cooling-down keys', async () => {
    const list = [
      cand('off', 'groq', 1, { enabled: false }),
      cand('blocked', 'groq', 2, { blocked: 'auth_invalid' }),
      cand('cool', 'groq', 3, { cooldownUntil: 5000 }),
      cand('ready', 'gemini', 4),
    ];
    expect(eligible(list, 1000).map((c) => c.id)).toEqual(['ready']);
    expect(eligible(list, 6000).map((c) => c.id)).toEqual(['cool', 'ready']);
  });

  it('distinguishes "none configured" from "all exhausted"', async () => {
    const call = vi.fn();
    await expect(route({ messages: [] }, [], { call, now: () => 0 })).rejects.toMatchObject({ noneConfigured: true });
    await expect(route({ messages: [] }, [cand('a', 'groq', 1, { cooldownUntil: 99 })], { call, now: () => 0 })).rejects.toMatchObject({ noneConfigured: false });
  });

  it('says a retired model needs fixing instead of reporting a limit', async () => {
    const name = (c: RouteCandidate) => c.label;
    const retired = classifyHttpError(404, '{"error":{"code":404,"message":"This model models/m-a is no longer available to new users.","status":"NOT_FOUND"}}', 'Google Gemini');
    expect(retired.kind).toBe('model_unavailable');
    const call = vi.fn(async () => {
      throw retired;
    });
    const first = await route({ messages: [] }, [cand('a', 'gemini', 1)], { call, now: () => 0 }).catch((e) => e);
    expect(exhaustedMessage(first, name)).toContain('can no longer use the model "m-a"');

    // Later messages: the key is already blocked, and the same reason is reported.
    const again = await route({ messages: [] }, [cand('a', 'gemini', 1, { blocked: 'model_unavailable' })], { call, now: () => 0 }).catch((e) => e);
    expect(again.noneConfigured).toBe(false);
    expect(exhaustedMessage(again, name)).toContain('Choose another model');
    expect(exhaustedMessage(new AllProvidersExhaustedError([{ candidate: cand('b', 'groq', 1), error: new AIError('auth_invalid', 'x') }], false), name)).toContain('rejected your API key');

    // Mixed with a limit: waiting may help, so the limit message stays.
    const limited = await route({ messages: [] }, [cand('a', 'gemini', 1, { blocked: 'model_unavailable' }), cand('b', 'groq', 2, { cooldownUntil: 99 })], { call, now: () => 0 }).catch((e) => e);
    expect(exhaustedMessage(limited, name)).toContain('reached their available limits');
  });
});

describe('pickModel', () => {
  const ids = (...xs: string[]) => xs.map((id) => ({ id, name: id }));
  it('prefers the newest stable Gemini Flash-Lite from the live list', () => {
    const live = ids('gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite-preview', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest');
    expect(pickModel('gemini', live)).toBe('gemini-3.5-flash-lite');
    expect(pickModel('gemini', ids('gemini-flash-lite-latest', 'gemini-2.5-flash'))).toBe('gemini-flash-lite-latest');
  });
  it('suggests by name pattern for Groq and OpenRouter, else the first listed', () => {
    expect(pickModel('groq', ids('llama-3.1-8b-instant', 'llama-3.3-70b-versatile'))).toBe('llama-3.3-70b-versatile');
    expect(pickModel('groq', ids('llama-3.3-70b-versatile', 'openai/gpt-oss-120b'))).toBe('openai/gpt-oss-120b');
    expect(pickModel('openrouter', [{ id: 'paid', name: 'p' }, { id: 'x:free', name: 'f', free: true }])).toBe('x:free');
    expect(pickModel('openrouter', [{ id: 'x:free', name: 'f', free: true }, { id: 'openrouter/free', name: 'r', free: true }])).toBe('openrouter/free');
    expect(pickModel('groq', ids('a', 'b'))).toBe('a');
    expect(pickModel('custom', ids('m1'))).toBe('m1');
    expect(pickModel('groq', [])).toBeNull();
  });

  it('lists only models that can chat', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 'llama-3.3-70b-versatile' },
              { id: 'whisper-large-v3' },
              { id: 'meta-llama/llama-guard-4-12b' },
              { id: 'old-model', active: false },
              { id: 'google/lyria-3-pro-preview', architecture: { output_modalities: ['text', 'audio'] } },
              { id: 'openrouter/free', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const models = await openAiAdapter.listModels({ provider: 'groq', apiKey: 'k' });
    expect(models.map((m) => m.id)).toEqual(['openrouter/free', 'llama-3.3-70b-versatile']);
    vi.unstubAllGlobals();
  });
});

describe('guardrails', () => {
  it('lets financial questions through', () => {
    for (const q of ['I earn ₹1,50,000 per month', 'Should I prepay my home loan?', 'How much SIP for retirement?', 'Spent 500 on groceries via UPI', 'Is term insurance worth it?']) {
      expect(classifyIntent(q)).toBe('finance');
    }
  });

  it('blocks clearly unrelated requests', () => {
    for (const q of ['Tell me a joke', 'Write a poem about the sea', 'Who won the election?', 'Debug my Python script']) {
      expect(classifyIntent(q)).toBe('offtopic');
    }
  });

  it('leaves ambiguous messages to the model', () => {
    expect(classifyIntent('hi')).toBe('unclear');
    expect(classifyIntent('what should I do next?')).toBe('unclear');
  });

  it('finance signals win over off-topic words', () => {
    expect(classifyIntent('Write a Python script to compute my EMI')).toBe('finance');
  });
});

describe('context', () => {
  const hist = (n: number): StoredMessage[] =>
    Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `message ${i} `.repeat(40), createdAt: i }));

  it('includes system prompt, snapshot, summary, recent history, and the new message', () => {
    const b = buildMessages({ snapshot: { version: 3, data: { income: 150000 } }, summary: 'User has 2 kids.', history: hist(4), userMessage: 'Plan my goals' });
    expect(b.messages[0]!.role).toBe('system');
    expect(b.messages[1]!.content).toContain('version 3');
    expect(b.messages[1]!.content).toContain('"income":150000');
    expect(b.messages[1]!.content).toContain('User has 2 kids.');
    expect(b.messages.at(-1)).toEqual({ role: 'user', content: 'Plan my goals' });
    expect(b.droppedCount).toBe(0);
  });

  it('drops the oldest messages beyond the token budget', () => {
    const b = buildMessages({ snapshot: { version: 1, data: {} }, summary: null, history: hist(60), userMessage: 'x', budget: 2000 });
    expect(b.droppedCount).toBeGreaterThan(0);
    expect(b.estimatedTokens).toBeLessThanOrEqual(2000);
    expect(b.messages.at(-2)!.content).toContain('message 59');
  });

  it('estimates tokens at about 4 characters each', () => {
    expect(estimateTokens('abcd'.repeat(10))).toBe(10);
  });
});

describe('providers', () => {
  it('masks keys', () => {
    expect(maskKey('AIzaFAKE-mask-test-key-WXYZ')).toBe('AIza••••••••••••WXYZ');
    expect(maskKey('short')).toBe('•••••');
  });

  it('allows only listed custom endpoints', () => {
    expect(customBaseUrlError('https://api.mistral.ai/v1')).toBeNull();
    expect(customBaseUrlError('http://localhost:11434/v1')).toBeNull();
    expect(customBaseUrlError('http://localhost:1234/v1')).toBeNull();
    // Only the local origins the Content Security Policy allows.
    expect(customBaseUrlError('http://localhost:8080/v1')).toMatch(/11434/);
    expect(customBaseUrlError('http://127.0.0.1:11434/v1')).toMatch(/11434/);
    expect(customBaseUrlError('https://evil.example.com/v1')).toMatch(/not on the allowed list/);
    expect(customBaseUrlError('http://api.mistral.ai/v1')).toMatch(/https/);
    expect(customBaseUrlError('not a url')).toMatch(/full URL/);
  });
});

describe('adapters', () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (status: number, body: unknown) =>
    vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

  it('Gemini: maps roles, system instruction, and response text', async () => {
    const f = respond(200, { candidates: [{ content: { parts: [{ text: 'Namaste' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } });
    vi.stubGlobal('fetch', f);
    const r = await geminiAdapter.complete(
      { messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }, { role: 'assistant', content: 'A' }] },
      { provider: 'gemini', apiKey: 'key-1', model: 'gemini-x' },
    );
    expect(r.text).toBe('Namaste');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/models/gemini-x:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('key-1');
    expect(url).not.toContain('key-1');
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe('S');
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model']);
  });

  it('OpenAI-compatible: bearer auth, response text, and error classification', async () => {
    vi.stubGlobal('fetch', respond(200, { model: 'llama', choices: [{ message: { content: 'Hello' } }] }));
    const c: Credentials = { provider: 'groq', apiKey: 'gsk_test', model: 'llama' };
    expect((await openAiAdapter.complete({ messages: [{ role: 'user', content: 'hi' }] }, c)).text).toBe('Hello');
    const init = (vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer gsk_test');

    vi.stubGlobal('fetch', respond(429, { error: { message: 'Rate limit reached on tokens per day (TPD)' } }));
    await expect(openAiAdapter.complete({ messages: [] }, c)).rejects.toMatchObject({ kind: 'quota_exhausted' });
  });

  it('lists OpenRouter models with free ones first', async () => {
    vi.stubGlobal('fetch', respond(200, { data: [{ id: 'paid/model', pricing: { prompt: '0.1', completion: '0.1' } }, { id: 'meta/llama:free' }] }));
    const models = await openAiAdapter.listModels({ provider: 'openrouter', apiKey: 'k' });
    expect(models[0]).toMatchObject({ id: 'meta/llama:free', free: true });
  });
});
