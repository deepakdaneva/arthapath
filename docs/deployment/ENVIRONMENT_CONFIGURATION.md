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

- Locally: copy `.env.example` to `.env.local`.
- CI: stored as GitHub environment variables (`uat`, `production`) and
  written into the build at deploy time.

## What never goes in configuration

- AI API keys (users enter them in-app; encrypted on the device).
- Service-account keys (CI uses Workload Identity Federation).
- Any user data.

Details of the build-time injection are finalized in Phase 3.
