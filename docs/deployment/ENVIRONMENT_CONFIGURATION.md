# Environment Configuration

| Environment | Angular configuration | Firebase alias | Trigger |
|---|---|---|---|
| Local | `development` (emulators) | `demo-arthapath` | `npm start` |
| UAT | `uat` | `uat` | push to `development` |
| Production | `production` | `prod` | push to `main` |

## Firebase web config

Firebase web config values (API key, app ID, auth domain) are public
identifiers, not secrets. Security comes from Authentication and Firestore
rules. They are still kept out of git so each deployer uses their own
projects:

- `scripts/write-app-config.mjs` runs before `start`, `build`, and
  `test`. It writes `src/environments/app-config.ts` (gitignored) from
  `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_APP_ID`,
  `FIREBASE_MESSAGING_SENDER_ID`, and optional `FIREBASE_AUTH_DOMAIN`.
- With none of these set (the default locally and in PR CI), the app
  targets the emulators with project `demo-arthapath`.
- CI deploys read them from GitHub environment variables (`uat`,
  `production`).

## Branch-aware links and legal pages

The same script sets `repoRef`, the branch that in-app GitHub links point
to: `main` when `GITHUB_REF_NAME` is `main` (production deploys),
`development` otherwise (UAT deploys, PR builds, local). `APP_REPO_REF`
overrides it.

It also renders `docs/product/PRIVACY_POLICY.md` and
`TERMS_OF_SERVICE.md` to HTML (`src/generated/legal/`, gitignored) with
`marked`, at build time only. Relative links become GitHub URLs on
`repoRef`, raw HTML in the markdown is dropped, and Angular sanitizes the
result when it is shown. So UAT shows the `development` versions and
production shows the `main` versions, with matching links.

## What never goes in configuration

- AI API keys (users enter them in-app; encrypted on the device).
- Service-account keys (CI uses Workload Identity Federation).
- Any user data.

