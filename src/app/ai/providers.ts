/**
 * Supported AI providers. Users bring their own keys (BYOK). Free-tier limits
 * change often, so none are hardcoded: the router reacts to provider errors.
 * Model names are not stored here either: each provider's live model list is
 * fetched in the browser when a key is added or edited, and only the model the
 * user selects is saved.
 *
 * Every host here must also be allowed by connect-src in firebase.json
 * (Content Security Policy). All of them were checked to allow browser
 * (CORS) requests.
 */
export type ProviderId = 'gemini' | 'groq' | 'openrouter' | 'custom';
export type ApiKind = 'gemini' | 'openai';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  kind: ApiKind;
  /** Default API base URL (custom providers supply their own). */
  baseUrl: string;
  /** Where users create a key. */
  keyUrl: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyUrl: 'https://aistudio.google.com/app/apikey',
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
  },
  custom: {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    kind: 'openai',
    baseUrl: '',
    keyUrl: '',
  },
};

/** OpenAI-compatible endpoints allowed for custom providers (CSP allowlist). */
export const CUSTOM_PRESETS: { name: string; baseUrl: string }[] = [
  { name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1' },
  { name: 'Together AI', baseUrl: 'https://api.together.xyz/v1' },
  { name: 'DeepInfra', baseUrl: 'https://api.deepinfra.com/v1/openai' },
  { name: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1' },
  { name: 'Ollama (this computer)', baseUrl: 'http://localhost:11434/v1' },
  { name: 'LM Studio (this computer)', baseUrl: 'http://localhost:1234/v1' },
];

const ALLOWED_HOSTS = new Set([
  'api.mistral.ai',
  'api.cerebras.ai',
  'api.together.xyz',
  'api.deepinfra.com',
  'api.fireworks.ai',
]);

/** Validates a custom base URL against the allowlist. Returns an error message or null. */
export function customBaseUrlError(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'Enter a full URL, for example https://api.mistral.ai/v1';
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (local && (u.protocol === 'http:' || u.protocol === 'https:')) return null;
  if (u.protocol !== 'https:') return 'Use an https:// URL.';
  if (!ALLOWED_HOSTS.has(u.hostname)) {
    return 'This provider is not on the allowed list. Choose one of the listed providers (self-hosted copies of ArthaPath can extend the list).';
  }
  return null;
}

/** Shows only the first 4 and last 4 characters of a key. */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 10) return '•'.repeat(Math.max(k.length, 4));
  return `${k.slice(0, 4)}${'•'.repeat(12)}${k.slice(-4)}`;
}
