# AI Provider Architecture (BYOK)

Users supply their own API keys. ArthaPath calls providers directly from
the client. No provider is privileged; business logic depends only on the
interfaces below.

## Supported in v1

| Provider | API style | Notes (verify current terms before relying on them) |
|---|---|---|
| Google Gemini | Gemini REST (`generateContent`) | Free tier via AI Studio key; per-model limits shown only in AI Studio console. Free-tier prompts may be used by Google to improve products. |
| Groq | OpenAI-compatible | Free tier with per-model RPM/RPD/token limits. |
| OpenRouter | OpenAI-compatible | `:free` model variants; low daily cap unless credits purchased. |
| Custom | OpenAI-compatible | User-supplied base URL (Mistral, Cerebras, Together, local Ollama, etc.). |

Free-tier quotas change often. ArthaPath never hardcodes quota numbers; it
reacts to provider responses (HTTP 429, `Retry-After`, rate-limit headers).

## Components

```ts
interface AIProviderAdapter {
  readonly id: 'gemini' | 'openai-compatible';
  listModels(key: DecryptedKey): Promise<AIModel[]>;
  complete(req: AIRequest, key: DecryptedKey, signal: AbortSignal): Promise<AIResponse>;
  classifyError(err: unknown): AIErrorKind;
}
```

| Component | Responsibility |
|---|---|
| `AIKeyManager` | CRUD for encrypted keys, masking, enable/disable, priority |
| `AIProviderRouter` | Select next eligible key, apply fallback policy, emit switch events |
| `AIUsageTracker` | Per-key counters, cooldown-until timestamps, last error (persisted encrypted, written lazily) |
| `AIContextManager` | Build compact, versioned context snapshots; history summarization |
| `Guardrails` | Local intent classifier + output checks for finance-only scope |
| `PromptTemplates` | Versioned system prompts, structured-output schemas |

Only two adapters exist: Gemini and OpenAI-compatible (covers Groq,
OpenRouter, custom). Adding a provider with a new wire format means one new
adapter.

## Error classification and fallback

| Error kind | Detection | Action |
|---|---|---|
| `rate_limited` | 429 with short `Retry-After` / per-minute header | Cool key until reset; try next key |
| `quota_exhausted` | 429 with daily quota message / RPD header | Cool key until next reset (default 24 h); try next key |
| `auth_invalid` | 401/403 | Disable key, notify user; try next key |
| `model_unavailable` | 404 / model-not-found | Mark model unavailable for that key; try next model/key |
| `provider_down` | 5xx, timeout | Cool provider briefly; try next provider |
| `network` | fetch failure / offline | **No fallback**; show offline notice |
| `invalid_request` | 400 | **No fallback**; bug or prompt too large; surface error |

Each user request tries each eligible key at most once. No retry loops.
On switch, the UI shows e.g. "Gemini quota exhausted. Switching to Groq."
If nothing is eligible: "All configured AI providers have reached their
available limits. Please add another provider or try again later."

## Context portability

The app, not the provider, owns conversation state. Every request is
self-contained:

```
[system prompt (template v)] + [context snapshot vN] + [conversation summary]
+ [last K messages] + [user message]
```

- **Context snapshot:** compact JSON of profile, goals, monthly aggregates,
  liabilities, pending questions, recent recommendations. Version
  increments whenever any underlying data changes, so any provider picking
  up the conversation sees the same state.
- **Summary:** rolling summary of older turns, regenerated when history
  exceeds a token budget.
- **Token estimation:** a character-based heuristic (about 4 characters per
  token) to budget prompts. Exact counts are not needed.

## Structured outputs

Extraction tasks (onboarding facts, transaction parsing, statement
structuring) request JSON matching a schema and are validated before use.
Invalid output is rejected, never silently saved. The user reviews extracted
data before it is persisted.

## Token and call minimization

- Deterministic calculations are never sent to AI for computation.
- Local regex/heuristic parsing first ("Spent ₹500 on groceries via UPI"
  usually parses without AI).
- AI analysis triggered by thresholds or explicit request, not every save.
- Identical requests within a short window are deduplicated.

## Guardrails

1. Local keyword/intent classifier rejects clearly off-topic input without
   an AI call.
2. System prompt restricts scope.
3. Output check flags non-financial responses.

Off-topic reply: "I'm designed specifically to help you manage your
finances and achieve your financial goals. Let's get back to your financial
planning."

## Privacy

Whatever context is included in a prompt is sent to the selected provider
and handled under its terms (possibly retained, possibly used for training
on free tiers). The UI and privacy policy say this explicitly.

## Implementation (Phase 5)

| Piece | File |
|---|---|
| Provider catalog, custom-endpoint allowlist, key masking | `src/app/ai/providers.ts` |
| Error classification, retry-hint parsing | `src/app/ai/errors.ts` |
| Gemini and OpenAI-compatible adapters | `src/app/ai/adapters.ts` |
| Router (priority, fallback, cooldowns, events) | `src/app/ai/router.ts` |
| Encrypted key storage, health state, status indicator sync | `src/app/ai/ai-keys.service.ts` |
| Context building and token budget | `src/app/ai/context.ts` |
| Local guardrail classifier | `src/app/ai/guardrails.ts` |
| System and summary prompts (versioned) | `src/app/ai/prompts.ts` |
| Conversation, persistence, summarization, switch notices | `src/app/ai/chat.service.ts` |
| UI | `src/app/pages/ai-providers/`, `src/app/pages/chat/` |

### Browser access (CORS), verified 2026-11-07

Preflight checks from `https://arthapath-uat.web.app` succeed for Gemini,
Groq, OpenRouter, Mistral, Cerebras, Together AI, DeepInfra, and Fireworks
AI, so all of them can be called directly from the app. SambaNova and
GitHub Models did not allow browser requests and are not offered. Groq does
not expose its rate-limit headers to browsers, so retry hints are parsed
from the error body ("Please try again in 1m26.4s"); Gemini's come from
`RetryInfo.retryDelay`.

### Models (fetched live, never stored as lists)

ArthaPath keeps no model names in code. When a key is entered (or a key is
opened for editing), the browser fetches that provider's model list directly
(`GET /models`), filters out models that cannot chat (speech, image, music,
embedding, safety-filter models; Groq models marked inactive; OpenRouter
models with non-text output), and suggests one by name pattern:

| Provider | Suggestion |
|---|---|
| Gemini | Newest stable `gemini-<version>-flash-lite`. Gemini's list still includes some versions retired for new keys, so the newest is chosen. |
| OpenRouter | `openrouter/free` (OpenRouter's router across free models), else the first free model. The list endpoint is public. |
| Groq | `gpt-oss-120b`, else a `70b` model, else the first listed. |
| Custom | First listed. |

The user can pick any listed model. Only the selected model name is saved,
inside the encrypted key document. The list itself lives in memory while the
form is open. If a saved model disappears from the list, editing the key
shows a replacement; if a request fails because the model was retired, the
key is blocked as `model_unavailable` and the user is told to choose
another model (not that a limit was reached).

### Custom endpoints

Custom OpenAI-compatible providers are limited to an allowlist that matches
the Content Security Policy `connect-src` in `firebase.json`: Mistral,
Cerebras, Together AI, DeepInfra, Fireworks AI, and local model servers on
`http://localhost:11434` (Ollama) and `http://localhost:1234` (LM Studio).
Self-hosters can extend both lists together.

### Cooldowns

| Error | Key state | Default wait (if the provider gives no hint) |
|---|---|---|
| `rate_limited` | cooling down | 1 minute |
| `quota_exhausted` | cooling down | 60 minutes |
| `provider_down` | cooling down; other keys of the same provider are skipped for this request | 2 minutes |
| `auth_invalid` | blocked until the key is replaced | n/a |
| `model_unavailable` | blocked until the model is changed | n/a |

Key state is written to the encrypted key document only when it changes,
so a normal successful request costs no extra writes.

### Context and summaries

Each request carries: the system prompt, the financial context snapshot
(versioned; filled from the encrypted profile in Phase 6), the rolling
summary, the most recent messages that fit a 6,000-token input budget, and
the new message. When 10 or more older messages fall outside the window,
they are summarized (through the same router) into the encrypted
conversation document.

### Guardrails

Messages with clear finance terms always go to the model. Clearly unrelated
requests (jokes, poems, sports, politics, programming help without a
finance term) get the standard off-topic reply locally, with no AI call.
Ambiguous messages go to the model, whose system prompt restricts scope.
