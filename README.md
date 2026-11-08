# ArthaPath

**Your Money. Your Goals. Your Financial Future.**

ArthaPath is an open-source, AI-assisted personal financial planning and goal
management app. Describe your finances in plain language, and ArthaPath builds
a private, encrypted financial profile, a live dashboard, and a prioritized
goal plan. You bring your own AI keys, from any supported provider.

> **Status:** early development. Phases 0–2 are done; Phase 3 (app shell,
> landing page, sign-in) is in progress. Track progress in [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).
> Features below describe the target v1 scope, not shipped functionality.

## Why ArthaPath

- **Private by design.** Financial data is encrypted on your device
  (AES-256-GCM, key derived from your PIN with Argon2id). The database only
  ever stores ciphertext. Lose the PIN and the data is unrecoverable; there
  is no backdoor.
- **Bring your own AI key.** Google Gemini, Groq, OpenRouter, or any
  OpenAI-compatible endpoint. Add many keys, set priority, and ArthaPath
  falls back automatically when one hits its limit, without losing
  conversation context.
- **Real math, not guesses.** Every figure comes from deterministic,
  tested TypeScript calculations. The AI explains, categorizes, and
  recommends; it never acts as the calculator.
- **Free to run.** Built entirely on the Firebase Spark (no-cost) plan.
  Anyone can deploy their own copy.

## Planned v1 features

- Conversational onboarding: income, expenses, loans, family, assets, goals.
- Dynamic dashboard: health score, cash flow, net worth, goal progress,
  financial-independence estimate, interactive drill-down charts.
- *Updates*: log transactions whenever you like (daily, weekly, monthly) in natural language ("Spent ₹500 on
  groceries via UPI") and review before saving.
- Statement import: CSV and PDF parsed on your device; review before import.
- Pending questions: the assistant asks only for what it is missing.
- Finance-only guardrails.
- Web, Android; iOS later.

## Technology

| Layer | Choice |
|---|---|
| UI | Ionic 9, Angular 22 (standalone, signals), TypeScript |
| Native | Capacitor 8 (Android now, iOS later) |
| Charts | Apache ECharts (tree-shaken) |
| Backend | Firebase Auth, Cloud Firestore, Firebase Hosting (Spark plan) |
| Crypto | WebCrypto AES-256-GCM, Argon2id via `hash-wasm` |
| AI | Provider-agnostic adapter layer, BYOK |
| CI/CD | GitHub Actions, keyless Workload Identity Federation |

See [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md)
and the [ADRs](docs/architecture/ADR/).

## Getting started

```bash
npm ci
npm run emulators   # terminal 1
npm start           # terminal 2, http://localhost:4200
```

- Prerequisites and local setup: [docs/development/LOCAL_SETUP.md](docs/development/LOCAL_SETUP.md)
- Firebase setup (your own projects): [docs/deployment/FIREBASE_SETUP.md](docs/deployment/FIREBASE_SETUP.md)
- Environment configuration: [docs/deployment/ENVIRONMENT_CONFIGURATION.md](docs/deployment/ENVIRONMENT_CONFIGURATION.md)
- AI provider setup: [docs/architecture/AI_PROVIDER_ARCHITECTURE.md](docs/architecture/AI_PROVIDER_ARCHITECTURE.md)
- Testing: [docs/development/TESTING_GUIDE.md](docs/development/TESTING_GUIDE.md)
- Deployment: [docs/deployment/GITHUB_ACTIONS.md](docs/deployment/GITHUB_ACTIONS.md)

## Branches and environments

| Branch | Environment |
|---|---|
| `main` | Production |
| `development` | UAT |
| `feature/*`, `bugfix/*` | Local / PR checks only |
| `hotfix/*` | Production fix, merged to `main` and back to `development` |

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately per
[SECURITY.md](SECURITY.md).

## Disclaimer

ArthaPath provides informational financial assistance only. AI output can be
wrong, projections are estimates, and investment returns are never
guaranteed. It is not a substitute for a qualified financial, tax, or legal
professional.

## License

[Apache License 2.0](LICENSE). Keep the copyright notice and [NOTICE](NOTICE)
file when redistributing.
