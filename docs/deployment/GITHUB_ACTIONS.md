# GitHub Actions

All third-party actions are pinned to full commit SHAs (version noted in a
comment). Dependabot proposes SHA updates weekly. Workflows default to
`permissions: contents: read` and request more only per job.

## Workflows

| File | Trigger | Purpose |
|---|---|---|
| `ci.yml` | PRs and pushes to `main` / `development` | `validate`: secret-pattern scan, lint, unit tests, build (app steps skipped until `package.json` exists). `rules`: Firestore rules tests in the emulator. |
| `codeql.yml` | PRs, pushes, weekly | CodeQL static analysis (JavaScript/TypeScript, Actions) |
| `dependency-review.yml` | PRs | Block newly added vulnerable dependencies |
| `deploy.yml` | push to `development` or `main`, manual | `development` deploys to the `uat` environment (`arthapath-uat`); `main` deploys to `production` (`arthapath-prod`). Deploys Firestore rules and indexes, plus Hosting once the app build output (`www/`) exists. |

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
| `WIF_PROVIDER` | `projects/<number>/locations/global/workloadIdentityPools/github/providers/github-oidc` | same pattern |
| `WIF_SERVICE_ACCOUNT` | `github-deployer@arthapath-uat.iam.gserviceaccount.com` | `github-deployer@arthapath-prod.iam.gserviceaccount.com` |

## Fork safety

Workflows triggered by `pull_request` from forks get a read-only token and
no secrets. Deploy workflows never run on `pull_request`.
