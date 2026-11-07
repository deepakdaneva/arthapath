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

- `scripts/write-firebase-config.mjs` runs before `start`, `build`, and
  `test`. It writes `src/environments/firebase-config.ts` (gitignored) from
  `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_APP_ID`,
  `FIREBASE_MESSAGING_SENDER_ID`, and optional `FIREBASE_AUTH_DOMAIN`.
- With none of these set (the default locally and in PR CI), the app
  targets the emulators with project `demo-arthapath`.
- CI deploys read them from GitHub environment variables (`uat`,
  `production`).

## What never goes in configuration

- AI API keys (users enter them in-app; encrypted on the device).
- Service-account keys (CI uses Workload Identity Federation).
- Any user data.

