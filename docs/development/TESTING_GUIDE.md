# Testing Guide

| Level | Tool | Scope |
|---|---|---|
| Unit | Angular default test runner | Engine, crypto, AI router, key rotation, context, parsers, validation |
| Rules | `@firebase/rules-unit-testing` + Firestore emulator | Ownership, schema, default deny |
| Integration | Emulators | Auth flows, repositories, imports |
| End-to-end | Playwright + emulators | Critical user journeys |

## Must-have tests before a feature counts as done

- Financial calculations: known-answer tests, including zero and missing inputs.
- Encryption: round trip, wrong PIN fails, tampered ciphertext fails,
  unique IVs, PIN change keeps data readable.
- AI router: each error kind triggers the right action; no infinite
  retries; all-exhausted path.
- Rules: user A cannot read or write user B's data; malformed docs rejected.

## Failure scenarios to cover

All AI providers exhausted, invalid key, offline, Firestore unavailable,
wrong PIN, incomplete profile.

## Running (Phase 3 onward)

```bash
npm test
npm run test:rules
npm run e2e
```

AI provider tests use recorded fake responses. CI never calls real
providers and never uses real keys.
