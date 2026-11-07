# ADR-0004: Bring-your-own-key, multi-provider AI from the client

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

No server is available (Spark plan), the project cannot pay for AI usage,
and users must not be locked into one provider.

## Decision

Users add their own keys for Gemini, Groq, OpenRouter, or any
OpenAI-compatible endpoint. The client calls providers directly. Two
adapters (Gemini and OpenAI-compatible) sit behind `AIProviderAdapter`. A
router handles priority and error-classified fallback. Conversation context
is owned by the app and is provider-agnostic. Keys are encrypted with the
user's DEK.

## Consequences

- Keys are present in client memory at request time (documented limitation).
- Providers must allow browser CORS requests. Any that do not cannot be
  called directly; this is documented per provider in Phase 5.
- Quota numbers are never hardcoded; fallback reacts to provider responses.
