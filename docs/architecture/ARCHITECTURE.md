# Architecture Overview

ArthaPath is a client-heavy application. All business logic, financial
calculation, encryption, and AI orchestration run on the user's device.
Firebase provides identity, encrypted-blob storage, and static hosting.
There is no application server (Firebase Spark plan has no Cloud Functions).

```
┌──────────────────────── Device (browser / Capacitor WebView) ───────────────────────┐
│                                                                                      │
│  UI (Ionic pages, components)                                                        │
│     │                                                                                │
│  Application services (signals stores: profile, goals, transactions, chat, session)  │
│     │                │                    │                     │                    │
│  Financial engine    AI layer             Crypto service        Import service       │
│  (pure TS, tested)   (router, adapters,   (Argon2id KEK,        (CSV, pdf.js,        │
│                       context manager)     AES-GCM DEK)          heuristics)         │
│     │                │                    │                                          │
│  Repository layer (Firestore read/write; encrypts on write, decrypts on read)        │
└──────┼───────────────┼────────────────────┼──────────────────────────────────────────┘
       │               │ HTTPS (user's key) │
       ▼               ▼                    ▼
 Firebase Auth   AI providers (Gemini,   Cloud Firestore (ciphertext + minimal
 (Google, email)  Groq, OpenRouter, any   query metadata), Firebase Hosting
                  OpenAI-compatible)
```

## Layers

| Layer | Folder (planned) | Responsibility | Depends on |
|---|---|---|---|
| UI | `src/app/pages`, `src/app/ui` | Rendering, user input | Application services |
| Application services | `src/app/core/state` | Signals-based stores, orchestration | Domain, engine, AI, repositories |
| Domain | `src/app/domain` | Types: Profile, Goal, Transaction, Loan, Asset | nothing |
| Financial engine | `src/app/domain/engine` | Pure deterministic calculations | Domain |
| AI | `src/app/ai` | Provider adapters, router, key manager, context, guardrails | Domain, crypto |
| Crypto | `src/app/core/crypto` | KDF, envelope encryption, session lock | WebCrypto, hash-wasm |
| Persistence | `src/app/core/data` | Firestore repositories, caching | Firebase SDK, crypto |
| Platform | `src/app/core/platform` | Capacitor abstractions (share, file pick, app state) | Capacitor |

Rule: domain and engine import nothing from Angular, Firebase, or AI code.
This keeps the math portable and trivially unit-testable.

## Key flows

- **Write path:** UI → store → engine recomputes affected aggregates →
  repository encrypts payload → Firestore batch write.
- **Read path:** Firestore (cached, paginated) → repository decrypts →
  store → UI. Dashboard reads monthly aggregate docs, not raw history.
- **AI path:** user message → local guardrail classifier → context manager
  builds compact snapshot → router picks provider/key → adapter call →
  structured response validated → store updates → persisted encrypted.

## Detailed documents

- [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md)
- [DATA_MODEL.md](DATA_MODEL.md)
- [ENCRYPTION_ARCHITECTURE.md](ENCRYPTION_ARCHITECTURE.md)
- [AI_PROVIDER_ARCHITECTURE.md](AI_PROVIDER_ARCHITECTURE.md)
- [FINANCIAL_ENGINE.md](FINANCIAL_ENGINE.md)
- [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md)
- [ADR/](ADR/)
