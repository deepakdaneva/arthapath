# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Ionic 9 + Angular 22 app shell: public landing page, Google and
  email/password sign-in with verification and password reset, dashboard
  with first-run call to action, Chat and Today's Updates navigation,
  profile menu, profile, settings (light/dark/system theme), about, and
  in-app privacy policy and terms.
- Capacitor 8 Android project.
- ESLint (angular-eslint) and Vitest unit tests.
- Deploy job moved into `ci.yml` and gated on validation and rules tests.
- Profile (name, email, photo URL) saved to Firestore on sign-in; profile
  page edits name and photo URL.

- Encryption PIN: setup with a no-recovery warning, unlock, change PIN,
  and forgotten-PIN reset that deletes encrypted data. Argon2id key
  derivation, AES-256-GCM envelope encryption, non-extractable in-memory
  key, wrong-PIN throttling.
- Auto-lock after inactivity (1, 5, 15, or 30 minutes) and in the
  background; lock preferences stored encrypted.
- Integration tests against the emulators, run in CI.
- Playwright regression suite (12 browser tests) for public pages, sign-up,
  PIN setup, unlock, encryption, lock, change PIN, reset, and sign-out; runs
  in CI on every PR and push to `development` and `main`, and gates deploys.
- Android CI build job, disabled by default (`ENABLE_ANDROID_BUILD`).
- Delete account on the Profile page (re-authentication and typed DELETE;
  removes encrypted data, profile, and sign-in).
- Build version `MAJOR.MINOR.BUILD` (BUILD = commit count) shown in the
  account menu and About page; `/version.json` drives a reload toast when a
  newer version is deployed.
- Top bar: current AI indicator next to the logo (blinks 5 times on a
  provider switch), notifications bell (placeholder).
- Financial engine (Phase 6): deterministic metrics (cash flow, savings
  rate, debt-to-income, emergency fund, net worth, financial independence),
  goal planning with required monthly savings, transparent health score,
  prioritization with reasons, and optional goal suggestions.
- Conversational onboarding: starter templates, AI extraction validated
  field by field, review and correct before saving, pending questions with
  a Chat badge. Manual "Your finances" editor for every section,
  insurance, assumptions, and goal order.
- Dashboard summary from saved data (charts follow in Phase 7).
- Chat context now uses the encrypted profile and calculated figures.
- Step-by-step key creation guides for every AI provider.
- AI providers (Phase 5): bring-your-own keys for Gemini, Groq, OpenRouter,
  and allowlisted OpenAI-compatible services (Mistral, Cerebras, Together AI,
  DeepInfra, Fireworks AI, local Ollama/LM Studio). Keys are encrypted,
  masked, checked by loading the model list, reorderable, and toggleable.
- Router with error classification, per-key cooldowns, at-most-once
  attempts per key, and automatic fallback with notices and indicator blink.
- Chat: encrypted, provider-independent conversation with context snapshot,
  token budget, rolling summaries, and local finance-only guardrails.
- Account menu: profile card (photo, name, email) opens the profile; footer
  with a System/Light/Dark theme switcher and Log out.

### Changed
- "Today's Updates" renamed to "Updates": activity can be logged at any
  cadence (daily, weekly, monthly); `/app/today` redirects.
- Android toolchain: Gradle 9.9.0, Android Gradle Plugin 9.5.1, JDK 25
  Gradle daemon; app module on the new AGP DSL; CI builds a debug APK.
- Locking and signing out reset the navigation stack, so no app page (and
  later, no decrypted data) stays in the hidden DOM.
- Ionic components imported from per-component entry points; initial
  bundle reduced from 909 kB to 674 kB.

### Fixed
- Models are fetched live from each provider when a key is entered or
  edited; no model names are stored in the app, and only the selected model
  is saved. Non-chat models are filtered out. The old built-in defaults had
  gone stale (Gemini's was retired for new keys; OpenRouter's no longer
  existed).
- A retired model or rejected key is now reported as such (with what to fix)
  instead of "limit reached", in chat, onboarding, and the top-bar indicator.
- Sending a message right after unlocking could wrongly report that no AI
  provider was configured (keys still loading).
- The quick-add button covered Send on the onboarding page.
- The quick-add button covered the Chat send button.
- Unlocking right after a reload could fail with a misleading connection
  error if the PIN was submitted before the encryption settings loaded.
- Privacy policy and terms pages showed raw markdown; they are now rendered
  to HTML at build time.
- In-app GitHub links point to `development` on UAT and `main` in
  production.
- Firebase infrastructure: `firebase.json` (Hosting security headers and
  CSP, emulators), `.firebaserc` aliases, Firestore rules enforcing owner-only
  access and encrypted envelopes, indexes, and emulator rules tests.
- Deployment workflow with keyless Workload Identity Federation and
  `scripts/setup-wif.sh`.
- Repository foundation: Apache-2.0 license, community health files,
  issue and pull request templates, CI validation, CodeQL, dependency review.
- Architecture documentation and ADRs for the stack, Firebase Spark
  strategy, client-side encryption, and the BYOK multi-provider AI layer.
