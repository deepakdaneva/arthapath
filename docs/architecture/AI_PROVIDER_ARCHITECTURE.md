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
