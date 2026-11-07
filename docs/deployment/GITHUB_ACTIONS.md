# GitHub Actions

All third-party actions are pinned to full commit SHAs (version noted in a
comment). Dependabot proposes SHA updates weekly. Workflows default to
`permissions: contents: read` and request more only per job.

## Workflows

| File | Trigger | Purpose |
|---|---|---|
| `ci.yml` | PRs and pushes to `main` / `development`, manual | `validate`: secret-pattern scan, lint, unit tests, build. `rules`: Firestore rules tests in the emulator. `deploy` (pushes only, after both pass): `development` to the `uat` environment (`arthapath-uat`), `main` to `production` (`arthapath-prod`); deploys Firestore rules, indexes, and Hosting. |
| `codeql.yml` | PRs, pushes, weekly | CodeQL static analysis (JavaScript/TypeScript, Actions) |
| `dependency-review.yml` | PRs | Block newly added vulnerable dependencies |

## Required status checks

`validate`, `rules`, `analyze (javascript-typescript)`, `analyze (actions)`,
`dependency-review` (job names) on PRs into `main` and `development`.

## Deployment authentication: Workload Identity Federation

No service-account JSON keys are stored in GitHub. Instead:

1. A Google Cloud Workload Identity Pool trusts GitHub's OIDC issuer.
2. A provider maps `assertion.repository` and `assertion.ref`, with an
   attribute condition limiting it to `deepakdaneva/arthapath`.
3. A deploy service account per project has only the roles needed for
   Hosting and Firestore rules deploys.
4. Only jobs running in the matching GitHub environment can impersonate
   the service account (principal
   `repo:<owner>@<owner_id>/<repo>@<repo_id>:environment:<env>`, GitHub's
   immutable subject format), and each environment accepts
   deployments only from its own branch.
5. The workflow uses `google-github-actions/auth` with
   `permissions: id-token: write` to get a short-lived token.

Setup (run once per project as a project owner):

```bash
scripts/setup-wif.sh arthapath-uat uat
scripts/setup-wif.sh arthapath-prod production
```

Service-account roles: `firebasehosting.admin`, `firebaserules.admin`,
`datastore.indexAdmin`, `serviceusage.serviceUsageConsumer`,
`firebase.viewer`.

GitHub environment variables (not secrets; none of these are sensitive):

| Variable | `uat` | `production` |
|---|---|---|
| `FIREBASE_PROJECT_ID` | `arthapath-uat` | `arthapath-prod` |
| `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID` | web app config | web app config |
| `WIF_PROVIDER` | `projects/<number>/locations/global/workloadIdentityPools/github/providers/github-oidc` | same pattern |
| `WIF_SERVICE_ACCOUNT` | `github-deployer@arthapath-uat.iam.gserviceaccount.com` | `github-deployer@arthapath-prod.iam.gserviceaccount.com` |

## Fork safety

Workflows triggered by `pull_request` from forks get a read-only token and
no secrets. The deploy job never runs on `pull_request`, and it runs only
after `validate` and `rules` pass.
