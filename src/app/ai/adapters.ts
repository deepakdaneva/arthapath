import { AIError, classifyHttpError, classifyThrown } from './errors';
import { PROVIDERS, type ApiKind, type ProviderId } from './providers';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  messages: ChatMessage[];
  /** 0–1; lower is more deterministic. */
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask for a JSON object response (structured output). */
  json?: boolean;
}

export interface AIResponse {
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** What an adapter needs to call a provider; the key is decrypted only in memory. */
export interface Credentials {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AIModel {
  id: string;
  name: string;
  /** True when the provider marks the model as free. */
  free?: boolean;
}

export interface AIProviderAdapter {
  readonly kind: ApiKind;
  complete(req: AIRequest, c: Credentials, signal?: AbortSignal): Promise<AIResponse>;
  listModels(c: Omit<Credentials, 'model'>, signal?: AbortSignal): Promise<AIModel[]>;
}

const TIMEOUT_MS = 60_000;

function baseUrl(c: { provider: ProviderId; baseUrl?: string }): string {
  return (c.provider === 'custom' ? c.baseUrl! : PROVIDERS[c.provider].baseUrl).replace(/\/+$/, '');
}

function withTimeout(signal?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, t]) : t;
}

async function send(url: string, init: RequestInit, provider: string, signal?: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: withTimeout(signal), referrerPolicy: 'no-referrer' });
  } catch (e) {
    throw classifyThrown(e, provider);
  }
  const text = await res.text();
  if (!res.ok) throw classifyHttpError(res.status, text, provider);
  try {
    return JSON.parse(text);
  } catch {
    throw new AIError('invalid_request', `${provider}: unreadable response`);
  }
}

// --- Gemini ------------------------------------------------------------------
interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
}

export const geminiAdapter: AIProviderAdapter = {
  kind: 'gemini',
  async complete(req, c, signal) {
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const body = {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: req.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: {
        temperature: req.temperature ?? 0.4,
        ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
        ...(req.json ? { responseMimeType: 'application/json' } : {}),
      },
    };
    const data = (await send(
      `${baseUrl(c)}/models/${encodeURIComponent(c.model)}:generateContent`,
      { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': c.apiKey }, body: JSON.stringify(body) },
      'Gemini',
      signal,
    )) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) {
      throw new AIError('invalid_request', `Gemini: empty response${data.promptFeedback?.blockReason ? ` (${data.promptFeedback.blockReason})` : ''}`);
    }
    return {
      text,
      model: data.modelVersion ?? c.model,
      inputTokens: data.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? null,
    };
  },
  async listModels(c, signal) {
    const data = (await send(
      `${baseUrl(c)}/models?pageSize=200`,
      { headers: { 'x-goog-api-key': c.apiKey } },
      'Gemini',
      signal,
    )) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
    return (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName ?? m.name }));
  },
};

// --- OpenAI-compatible (Groq, OpenRouter, custom) ----------------------------
interface OpenAIResponse {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function providerName(c: { provider: ProviderId }): string {
  return c.provider === 'custom' ? 'Custom provider' : PROVIDERS[c.provider].name;
}

function headers(c: { provider: ProviderId; apiKey: string }): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (c.apiKey) h['authorization'] = `Bearer ${c.apiKey}`;
  if (c.provider === 'openrouter') h['x-title'] = 'ArthaPath';
  return h;
}

export const openAiAdapter: AIProviderAdapter = {
  kind: 'openai',
  async complete(req, c, signal) {
    const data = (await send(
      `${baseUrl(c)}/chat/completions`,
      {
        method: 'POST',
        headers: headers(c),
        body: JSON.stringify({
          model: c.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.4,
          ...(req.maxOutputTokens ? { max_tokens: req.maxOutputTokens } : {}),
          ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      },
      providerName(c),
      signal,
    )) as OpenAIResponse;
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new AIError('invalid_request', `${providerName(c)}: empty response`);
    return {
      text,
      model: data.model ?? c.model,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
    };
  },
  async listModels(c, signal) {
    const data = (await send(`${baseUrl(c)}/models`, { headers: headers(c) }, providerName(c), signal)) as {
      data?: { id: string; name?: string; pricing?: { prompt?: string; completion?: string } }[];
    };
    return (data.data ?? [])
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        free: m.id.endsWith(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0') || undefined,
      }))
      .sort((a, b) => Number(!!b.free) - Number(!!a.free) || a.id.localeCompare(b.id));
  },
};

export function adapterFor(provider: ProviderId): AIProviderAdapter {
  return PROVIDERS[provider].kind === 'gemini' ? geminiAdapter : openAiAdapter;
}
