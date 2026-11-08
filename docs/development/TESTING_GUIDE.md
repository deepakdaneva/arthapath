# Testing Guide

| Level | Tool | Scope |
|---|---|---|
| Unit | Angular default test runner | Engine, crypto, AI router, key rotation, context, parsers, validation |
| Rules | `@firebase/rules-unit-testing` + Firestore emulator | Ownership, schema, default deny |
| Integration | Emulators | Auth flows, repositories, imports |
| End-to-end (regression) | Playwright + emulators | Critical user journeys in a real browser (`e2e/`) |

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

## Running

```bash
npm test                 # unit tests (integration specs skip without emulators)
npm run test:rules       # Firestore rules tests (starts the emulator)
npm run test:integration # unit + integration tests against Auth and Firestore emulators
npm run test:e2e         # Playwright regression suite (emulators + dev server)
```

First run of `test:e2e` locally: either `npx playwright install chromium`,
or reuse an installed Chromium-based browser with
`E2E_BROWSER_PATH=/path/to/chrome-or-brave`. The tests use only standard
Playwright APIs and accessible roles and labels, so they are
browser-agnostic; CI runs them on Playwright's Chromium.

## Regression suite (`e2e/`)

| Area | What is covered |
|---|---|
| Public | Landing page and Get Started, privacy and terms rendered as HTML with branch links, sign-in required for `/app`, no account enumeration on sign-in errors |
| Account and PIN | Sign-up saves the profile, PIN strength and mismatch hints, no PIN stored |
| Unlock | Reload locks, wrong PIN rejected with attempts left, right PIN returns to the same page |
| Encryption | Lock preference stored as `{v, iv, ct}` only, survives lock and reload |
| Lock | Lock now removes all app pages from the DOM |
| Change PIN | Wrong current PIN rejected, old PIN stops working, new PIN unlocks the same data |
| Reset | Forgotten-PIN reset removes encryption data and keeps the profile |
| Sign-out | Returns to landing, app requires sign-in again |
| App shell | AI status indicator, notifications panel, account card opens profile, theme switcher cycles System/Light/Dark, version shown |
| AI indicator | Blinks 5 times when the provider switches |
| Updates | Toast offers a reload when `/version.json` reports a newer version |
| Delete account | Wrong password rejected with nothing deleted; then data, profile, and sign-in removed |
| AI providers | Key checked via live model list (fetched on key entry, non-chat models filtered, model suggested), stored encrypted and masked, reordered, disabled; retired model reported as such |
| AI fallback | Exhausted provider triggers a switch notice and indicator blink; context carried to the next provider; cooling-down key skipped; messages stored encrypted and reloaded |
| AI limits | All-providers-exhausted message; off-topic question answered locally with no provider call; no-provider guidance |

| Finances | Manual entry computes surplus and goal order; user reordering; dashboard figures; profile and goals stored encrypted |
| Onboarding | Chat starters open onboarding prefilled; extraction review with estimates; corrected amount saved; pending question badge; plan shown |
| Context | Chat request carries calculated profile figures |
| Markdown | Assistant replies render bold, lists, and tables; raw HTML from the model is not executed; user messages stay plain text |
| Unlock race | A message sent right after unlocking waits for keys and profile |
| Navigation | Updates tab (renamed from Today's Updates) and redirect; key-creation guides per provider |

Provider APIs are mocked in the browser tests (`page.route`), so CI never
calls a real provider or uses a real key.

Every test uses a fresh account, so tests are independent.

## CI

All jobs run on pull requests into `development` and `main` and on pushes
to both branches (`.github/workflows/ci.yml`):

| Job | Runs |
|---|---|
| `validate` | Secret scan, lint, unit tests, production build |
| `rules` | Firestore rules tests, then unit + integration tests on emulators |
| `e2e` | Playwright regression suite; HTML report uploaded on failure |
| `android` | Debug APK build. Skipped unless the repository variable `ENABLE_ANDROID_BUILD` is `true` (web first; Android later) |
| `deploy` | Pushes only, after `validate`, `rules`, and `e2e` pass |

AI provider tests use recorded fake responses. CI never calls real
providers and never uses real keys.
