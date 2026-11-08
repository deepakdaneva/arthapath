/**
 * How to create an API key for each provider. Steps are written to survive
 * small dashboard changes; links go to each provider's own key page.
 */
export interface KeyGuide {
  name: string;
  url: string;
  steps: string[];
  note?: string;
}

export const KEY_GUIDES: Record<string, KeyGuide> = {
  gemini: {
    name: 'Google Gemini (Google AI Studio)',
    url: 'https://aistudio.google.com/app/apikey',
    steps: [
      'Open Google AI Studio and sign in with your Google account.',
      'Go to "Get API key" (API keys).',
      'Click "Create API key" and choose or create a Google Cloud project.',
      'Copy the key (it starts with "AIza") and paste it here.',
    ],
    note: 'The free tier has daily limits. Google may use free-tier requests to improve its products.',
  },
  groq: {
    name: 'Groq',
    url: 'https://console.groq.com/keys',
    steps: [
      'Open the Groq console and sign up or sign in.',
      'Open "API Keys" in the menu.',
      'Click "Create API Key" and give it a name, for example "ArthaPath".',
      'Copy the key right away (it starts with "gsk_"; Groq shows it only once) and paste it here.',
    ],
    note: 'Free use is limited per model (requests per minute and per day).',
  },
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/keys',
    steps: [
      'Open OpenRouter and sign in.',
      'Go to "Keys" and click "Create Key".',
      'Name it (for example "ArthaPath"); optionally set a credit limit.',
      'Copy the key (it starts with "sk-or-") and paste it here.',
      'Click "Check key & load models" and pick a model marked "(free)".',
    ],
    note: 'Free models have a low daily request limit unless you have bought credits.',
  },
  'https://api.mistral.ai/v1': {
    name: 'Mistral',
    url: 'https://console.mistral.ai/api-keys',
    steps: [
      'Open the Mistral console and sign in.',
      'If asked, choose a plan (a free tier is available for experimenting).',
      'Open "API Keys" and click "Create new key".',
      'Copy the key and paste it here.',
    ],
  },
  'https://api.cerebras.ai/v1': {
    name: 'Cerebras',
    url: 'https://cloud.cerebras.ai',
    steps: ['Open Cerebras Cloud and sign in.', 'Open "API Keys" and generate a new key.', 'Copy the key and paste it here.'],
  },
  'https://api.together.xyz/v1': {
    name: 'Together AI',
    url: 'https://api.together.ai/settings/api-keys',
    steps: ['Open Together AI and sign in.', 'Go to Settings, then "API Keys".', 'Create or copy a key and paste it here.'],
  },
  'https://api.deepinfra.com/v1/openai': {
    name: 'DeepInfra',
    url: 'https://deepinfra.com/dash/api_keys',
    steps: ['Open DeepInfra and sign in.', 'Go to the dashboard, then "API Keys".', 'Click "New API key", copy it, and paste it here.'],
  },
  'https://api.fireworks.ai/inference/v1': {
    name: 'Fireworks AI',
    url: 'https://fireworks.ai/account/api-keys',
    steps: ['Open Fireworks AI and sign in.', 'Go to your account, then "API Keys".', 'Click "Create API Key", copy it, and paste it here.'],
  },
  'http://localhost:11434/v1': {
    name: 'Ollama (on this computer)',
    url: 'https://ollama.com/download',
    steps: [
      'Install Ollama on this computer.',
      'Download a model in a terminal, for example: ollama pull llama3.2',
      'Allow ArthaPath to connect by setting the environment variable OLLAMA_ORIGINS to this site’s address, then restart Ollama.',
      'No API key is needed: leave the key empty, then click "Check key & load models".',
    ],
    note: 'Runs entirely on your computer. Works only on the device where Ollama runs.',
  },
  'http://localhost:1234/v1': {
    name: 'LM Studio (on this computer)',
    url: 'https://lmstudio.ai',
    steps: [
      'Install LM Studio and download a model.',
      'Open the Developer tab and start the local server (port 1234).',
      'Turn on CORS in the server settings so ArthaPath can connect.',
      'No API key is needed: leave the key empty, then click "Check key & load models".',
    ],
    note: 'Runs entirely on your computer. Works only on the device where LM Studio runs.',
  },
};

/** Guide for a provider, or for a custom base URL. */
export function keyGuideFor(provider: string, baseUrl: string): KeyGuide | null {
  return KEY_GUIDES[provider === 'custom' ? baseUrl : provider] ?? null;
}
