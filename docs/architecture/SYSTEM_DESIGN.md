# System Design

## Constraints driving the design

1. **Firebase Spark plan only.** No server code, no Cloud Storage
   (Blaze required for all buckets since February 2026). See
   [ADR-0002](ADR/0002-firebase-spark-only.md).
2. **Zero-knowledge storage.** Firestore must never hold readable financial
   data, so all logic that needs plaintext runs on the client.
3. **BYOK AI.** The client calls AI providers directly with the user's
   own keys. No proxy (a proxy would need a server).

## Environments

| Environment | Branch | Firebase project | Region |
|---|---|---|---|
| Production | `main` | `arthapath-prod` | `asia-south1` |
| UAT | `development` | `arthapath-uat` | `asia-south1` |
| Local | any | Emulator Suite (`demo-arthapath`) | n/a |

Each project has independent Auth users, Firestore data, rules, authorized
domains, and quotas. See [ADR-0003](ADR/0003-two-firebase-projects.md).

## Client runtime

- Single-page app, lazy-loaded routes: landing (public), auth, onboarding,
  dashboard, chat, today, settings, legal pages.
- State: Angular signals in small feature stores. No NgRx.
- Firestore offline persistence (IndexedDB) enabled for read caching.
  The cache holds ciphertext only.
- Decrypted data lives only in memory and is discarded on lock/logout.

## Session lifecycle

1. Firebase Auth sign-in (Google or email/password).
2. First run: create PIN → generate DEK → wrap → store crypto params.
3. Subsequent runs: enter PIN → derive KEK → unwrap DEK → unlocked.
4. Auto-lock after inactivity (default 5 minutes), on app background
   (Capacitor `App` pause event / `visibilitychange`), and on logout.
   Lock wipes the DEK reference and decrypted stores.

## Event-driven recalculation

Transaction saved → update the month aggregate (single doc) → recompute
dashboard metrics from aggregates in memory → AI analysis only when a
threshold rule fires (budget exceeded, goal at risk, user asks).

## Document import

Files are read in memory with `FileReader`; CSV parsed locally; PDF parsed
with pdf.js (supports statement passwords). Raw files are never uploaded or
persisted. Optional AI structuring sends extracted text only, after explicit
user consent per import.

## Failure handling

| Failure | Behavior |
|---|---|
| Offline | Reads served from cache; writes queued by Firestore SDK; AI disabled with notice |
| Firestore quota exhausted | Read-only banner; retry after daily reset |
| AI key rate-limited | Mark key cooling down, try next eligible key/provider |
| All AI keys exhausted | Clear notice; app remains fully usable without AI |
| Wrong PIN | Unwrap fails (GCM auth tag); progressive delay after repeated failures |
