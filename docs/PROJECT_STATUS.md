# Project Status

_Last updated: 2026-11-09_

## Phases

| Phase | Status |
|---|---|
| 0 Discovery and architecture | Done |
| 1 Repository foundation | Done |
| 2 Firebase infrastructure | Done |
| 3 Frontend foundation | Done |
| 4 Security and encryption | Done (pending UAT verification) |
| 5 AI integration | Done (pending UAT verification with real keys) |
| 6 Financial engine and onboarding | Done (pending UAT verification with real keys) |
| 7 Dashboard | Done (trend charts and transaction lists wait for Phase 8 data) |
| 8 Updates (activity logging) | Done |
| 9 Import and advanced features | Done |
| 10 Production readiness | Done (1.0 released 2026-11-08) |

## Phase 0 findings

- GitHub account `deepakdaneva`; no prior `arthapath` repository.
- Firebase CLI not installed on the maintainer machine yet; projects to be
  created in Phase 2.
- Cloud Storage requires Blaze since 2026-02-03, so no file storage
  ([ADR-0002](architecture/ADR/0002-firebase-spark-only.md)).
- Latest stable stack: Ionic 9, Angular 22, Capacitor 8. `@angular/fire`
  lags Angular, so the plain Firebase SDK is used
  ([ADR-0001](architecture/ADR/0001-technology-stack.md)).
- AI free tiers change frequently and are not published per model by all
  providers; no quota numbers are hardcoded
  ([ADR-0004](architecture/ADR/0004-byok-multi-provider-ai.md)).

## Decisions

See [ADR index](architecture/ADR/). Summary: two Firebase projects
(`arthapath-prod`, `arthapath-uat`) in `asia-south1`; public repo;
envelope encryption with Argon2id; PIN only in v1; BYOK with Gemini, Groq,
OpenRouter, custom OpenAI-compatible; Workload Identity Federation for
deploys; rulesets with 1 approval and admin bypass; navy + teal theme;
local PDF parsing with consented AI assist.

## Known limitations

- BYOK keys are present in client memory at request time.
- Lost PIN means unrecoverable data.
- Short numeric PINs are brute-forceable given a database copy.
- Spark quotas cap daily usage (estimate ~500 DAU per project).
- Admin bypass on branch rules (single maintainer).

## Phase 1 results

- Public repo `deepakdaneva/arthapath` created; `main` and `development` pushed.
- Enabled: secret scanning, push protection, Dependabot alerts and security
  updates, private vulnerability reporting, Discussions.
- Actions: default token read-only, cannot approve PRs; allowed actions
  limited to GitHub-owned plus `google-github-actions/*` and
  `FirebaseExtended/action-hosting-deploy`.
- Rulesets `protect-main`, `protect-development`: PR required, 1 approval,
  stale reviews dismissed, conversations resolved, required checks
  (`validate`, `analyze (javascript-typescript)`, `analyze (actions)`,
  `dependency-review`), no force push, no deletion. Admin bypass only
  through pull requests (direct pushes blocked; verified with GH013).
- Environments: `uat` (deploys from `development` only), `production`
  (deploys from `main` only).
- CodeQL JavaScript/TypeScript analysis is skipped until `package.json`
  exists (no source to scan before Phase 3).

## Phase 2 results

- Projects `arthapath-prod` (482215450398) and `arthapath-uat`
  (853250048130) created on Spark; no billing account linked.
- Firestore `(default)` databases in `asia-south1` (native mode) in both.
- Web apps registered; Hosting sites `arthapath-prod.web.app`,
  `arthapath-uat.web.app`.
- `firestore.rules`: default deny, owner-only, envelope schema validation,
  append-only messages, month-bucket validation. 17 emulator tests pass.
- `deploy.yml`: development to UAT, main to production, keyless WIF.
  GitHub environment variables set.
- Auth: Email/Password and Google enabled in both projects (verified via
  Identity Toolkit admin API; still plain Firebase Auth, not Identity
  Platform). Authorized domains: localhost, `<id>.web.app`,
  `<id>.firebaseapp.com`.
- Rules and indexes deployed manually to UAT; compiled on the server.
  Live probe: unauthenticated read and write return 403. Production keeps
  the default deny-all rules until the first `main` deploy.
- Browser API keys restricted in both projects to Firestore, Identity
  Toolkit, Secure Token, and Installations APIs, and to the app's
  referrers (UAT also allows `http://localhost`; both allow
  `https://localhost` for the Capacitor Android WebView).
- WIF configured in both projects (provider ACTIVE, repository and owner ID
  condition, environment-scoped impersonation, 5 deploy roles). GitHub
  issues immutable OIDC subjects for this repo
  (`repo:deepakdaneva@68489729/arthapath@1449162422:environment:<env>`);
  the first deploy failed with `iam.serviceAccounts.getAccessToken` denied
  until the binding used that format.
- CI deploy to UAT verified (run 42367571546): federated credentials OK,
  rules and indexes released. Public log scanned: no tokens or keys.
- `rules` added to required status checks on `main` and `development`.

## Phase 3 progress

- Angular 22.2 (zoneless, standalone, signals, strict templates), Ionic
  9.0, Capacitor 8.6, Firebase JS SDK 13.2, Vitest, angular-eslint.
- Firebase web config generated at build time
  (`scripts/write-app-config.mjs`); defaults to emulators with
  `demo-arthapath`. Real values only in GitHub environment variables.
- Pages: landing, auth (Google popup, email sign-in/up, verification,
  reset with no account enumeration), shell (brand, avatar menu, bottom
  Chat / Updates nav, FAB), dashboard first-run CTA, chat and
  today empty states, profile (name and photo URL editing), settings
  (theme), about, privacy/terms (markdown rendered to HTML at build time).
- Links to GitHub (docs, source, license, legal sources) follow the build
  branch: `development` on UAT, `main` in production.
- Sign-in profile (name, email, photo URL) saved to `users/{uid}` on every
  sign-in when changed; Firestore loads lazily. Google requests only the
  basic profile and email scopes. Date of birth is not collected
  (decision 2026-11-07, revisit later).
- Android project added (`io.github.deepakdaneva.arthapath`,
  `https://localhost` scheme).
- Deploy merged into `ci.yml` behind `needs: [validate, rules]`.
- Checks: lint clean, 5 unit tests pass, production build 902 kB initial
  (202 kB gzip).
- Known gaps: Google sign-in on Android needs a native plugin; e2e tests
  (Playwright) not yet added.

## Phase 4 results

- Envelope encryption implemented as designed: Argon2id (64 MiB, t=3,
  p=1) KEK wraps a random AES-256-GCM DEK; data stored as `{v, iv, ct}`.
- PIN setup (no-recovery acknowledgement, strength hint), unlock with
  throttling, change PIN (rewrap only), forgotten-PIN reset.
- Auto-lock: inactivity (default 5 min), background over 30 s, sign-out.
- Transactional writes prevent a second device from overwriting PIN
  setup and prevent profile sync from overwriting `crypto`.
- First encrypted data: lock preferences in `vault/main`.
- Tests: 12 crypto unit tests, 2 emulator integration tests (setup,
  conflict, encryption, PIN change, stale-device rejection, reset), 4 new
  rules tests. Totals: 26 unit/integration, 25 rules.
- Initial bundle 674 kB (178 kB gzip) after switching to per-component
  Ionic imports.
- Browser-verified locally (Brave, emulators): sign-up, PIN setup with
  strength and mismatch hints, wrong PIN, unlock after reload with return
  to the same page, encrypted lock preference (Firestore shows only
  `v/iv/ct`), change PIN (old fails, new works, data still decrypts),
  forgotten-PIN reset (crypto and vault removed, profile kept), lock now,
  background lock, inactivity lock, sign-out. No console errors.
- Fixed from the browser run: cached app pages stayed in the DOM after
  lock (now root navigation), truncated checkbox label, missing PIN
  mismatch hint, overlapping profile saves at sign-up.
- Android: Gradle 9.9.0, AGP 9.5.1, JDK 25 daemon; all modules configure
  locally. Full APK build runs in CI (no Android SDK on the dev machine).
- Regression suite: 12 Playwright tests (`e2e/`) covering the flows
  above; pass locally twice in a row. CI job `e2e` gates deploys. Found and
  fixed an unlock race (PIN submitted before settings loaded).
- Android CI build skipped by default at the time; enabled in 1.0 (see
  docs/deployment/ANDROID_RELEASE.md).
- Not yet verified: unlock time on a real Android device; the flow on UAT.

## Shell and account updates (post Phase 4)

- Account menu redesigned: profile card opens the profile page (separate
  Profile item and Current AI item removed); footer with theme switcher
  and Log out; version shown.
- Current AI indicator next to the logo (`AiStatusService.switchedTo()`
  triggers a 5x blink; wired to the AI router in Phase 5).
- Notifications bell placeholder.
- Delete account (re-auth first; nothing deleted if it fails).
- Versioning `MAJOR.MINOR.BUILD` and reload toast via `/version.json`.
- Tests: 29 unit, 27 rules, 16 e2e (4 new shell/delete tests).

## Phase 5 results

- Providers: Gemini (native API), Groq, OpenRouter, and allowlisted
  OpenAI-compatible services; CORS verified by preflight for each.
- Keys encrypted per document in `aiKeys/`, decrypted only while unlocked,
  shown masked; CSP `connect-src` extended to the allowlist.
- Router: priority order, fallback on rate limit, quota, bad key, missing
  model, outage; no fallback on network or invalid requests; each key tried
  at most once; cooldowns from provider hints or defaults.
- Chat: encrypted messages, context snapshot (stub until Phase 6), 6,000
  token budget, rolling summaries, switch notices, indicator blink.
- Guardrails: local classifier; off-topic replies cost no AI call.
- Tests: 25 new unit tests (errors, router, guardrails, context, adapters,
  masking, allowlist), 5 new e2e tests with mocked providers. Totals: 54
  unit, 27 rules, 21 e2e.
- Vitest uses a threads pool capped at 2 workers (stable on busy machines).
- Not yet verified: real provider calls with real keys (only mocks so far).

## Phase 6 results

- Domain model in paise; engine with 11 known-answer tests (metrics,
  annuity solve, prioritization, health score, suggestions).
- Encrypted `vault/profile`, `goals/`, `pendingQuestions/`; Firestore
  rules allow `vault/profile` (rules test added).
- Onboarding: starter templates, validated extraction (5 tests), review
  and correction, pending questions, Chat badge; manual editor; dashboard
  summary; chat context from the real profile.
- Also: key creation guides per provider; Updates tab rename.
- Fixed from browser runs: unlock/send race for keys and profile; FAB
  covering Send on onboarding.
- Tests: 70 unit, 27 rules, 27 e2e.
- Not yet verified: onboarding with a real AI provider (mocked so far).
- Not yet done: updating the profile from free-form Chat messages (Chat
  answers using the profile; changes go through onboarding or the editor).

## Phase 7 results

- Expenses tagged necessary, discretionary, or unnecessary (form, onboarding
  review, AI extraction); old profiles upgraded on load. Regular investments
  are a category counted as saving.
- Dashboard: warnings strip, health score, spending donut with legend,
  goal cards (target, saved, remaining, date, monthly need, progress,
  status), net worth bars, financial independence, trend placeholder.
- Every card and chart slice opens a details page with the items, the
  calculation, and (for money in and out) a transaction list with Day,
  Week, Month, Year, and Custom filters.
- Update reminder after 7 days without changes (dashboard and Updates tab).
- Charts: Apache ECharts 6.1 (tree-shaken, SVG renderer), colour-blind-safe
  palette validated for both themes; dashboard chunk is lazy-loaded
  (about 160 kB gzip).

## Phase 8 results

- Updates page: one-line notes understood on the device (amount, type,
  date, method, category, merchant, goal); AI provider only when no amount
  is found; every field reviewable; "Add without typing" form.
- Lifestyle added as a need level (necessary, lifestyle, discretionary,
  unnecessary); custom categories.
- Encrypted transactions plus encrypted monthly aggregates; savings and
  investments linked to a goal update it (reversed on delete).
- Deterministic impact after saving: plan used, overspend, trend vs recent
  months, goal progress.
- Dashboard: this month vs plan, monthly trend line, over-plan warnings;
  details pages list the period's entries.

## Phase 9 results

- Statement import: CSV (common Indian bank layouts), text PDFs (including
  password-protected; pdf.js in the browser, lazy-loaded), pasted text;
  duplicates flagged; every row reviewable; file never stored.
- Settings switch "Let AI categorize imported rows" (off by default).
- Pending questions: AI questions plus gaps found in the data, with why and
  what depends on each; quick yes/no for insurance; skip.
- Analysis page: calculated recommendations, AI analysis on request (nudged
  when due), encrypted history with the figures at the time.
- Fixed: the Updates list now refreshes when the page is shown again.

## Phase 10 results (release readiness)

- Independent security review: no XSS, cross-user access, or plaintext
  storage found. Fixed: weak PINs refused; local cache cleared on sign-out
  and account deletion; deploy credentials obtained only after installs and
  build; AI reply images shown as links; local AI server URLs limited to the
  CSP origins; redaction input capped.
- Production: localhost removed from authorized domains; password policy
  enforced (prod and UAT); production deployments need maintainer approval.
- App Check (reCAPTCHA) wired and off until a site key is configured.
- Privacy policy and terms published (no longer drafts); contact through
  GitHub; reCAPTCHA disclosure. Version 1.0.
- Dependency audit: no known vulnerabilities in runtime dependencies;
  moderate advisories remain in development-only tooling.

## Release 1.0

- Web: production `arthapath-prod.web.app`, UAT `arthapath-uat.web.app`.
- Android: signed APK (`io.github.deepakdaneva.arthapath`) attached to each
  GitHub release; UAT builds use the `.uat` suffix and are kept as workflow
  artifacts. See [ANDROID_RELEASE](deployment/ANDROID_RELEASE.md).
- Android experience: welcome slides on first launch, native Google sign-in
  (no Firebase Dynamic Links), fingerprint unlock tied to the PIN, content
  kept clear of the system bars, adaptive icon and animated launch screen.
- App Check: reCAPTCHA Enterprise provider in both projects, enforced for
  Firestore and Auth.
- Home tab added next to Chat and Updates; terms and privacy agreement
  required at sign-up; README screenshots.
- Releases: 1.0.31 (first release), 1.0.35 (pdf.js 6.5, jsdom 31,
  Dependabot TypeScript rule).

## Security issues

None open. Dependabot alerts remain for development-only tooling
(`minimatch` through eslint and firebase-tools, `uuid` through
firebase-tools); no fixed version is compatible with those tools yet, and
none of them ships in the app.

## Failed tests

None.

## Deployment status

Production and UAT deployed by CI from `main` and `development`. Release
pull requests from `development` to `main` use a merge commit; production
deploys after maintainer approval.

## Next tasks

1. Choose the 1.1 scope.
