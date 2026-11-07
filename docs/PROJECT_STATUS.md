# Project Status

_Last updated: 2026-11-07_

## Phases

| Phase | Status |
|---|---|
| 0 Discovery and architecture | Done |
| 1 Repository foundation | Done |
| 2 Firebase infrastructure | Not started |
| 3 Frontend foundation | Not started |
| 4 Security and encryption | Not started |
| 5 AI integration | Not started |
| 6 Financial engine and onboarding | Not started |
| 7 Dashboard | Not started |
| 8 Today's Updates | Not started |
| 9 Import and advanced features | Not started |
| 10 Production readiness | Not started |

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

## Security issues

None open.

## Failed tests

None (no tests yet).

## Deployment status

Not deployed.

## Next tasks

1. Install Firebase CLI; maintainer runs `firebase login` (Phase 2).
2. Create projects, Firestore, Auth providers, Hosting; write rules and
   rules tests; WIF setup; deploy workflows (Phase 2).
