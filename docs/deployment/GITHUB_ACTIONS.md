# GitHub Actions

All third-party actions are pinned to full commit SHAs (version noted in a
comment). Dependabot proposes SHA updates weekly. Workflows default to
`permissions: contents: read` and request more only per job.

## Workflows

| File | Trigger | Purpose |
|---|---|---|
| `ci.yml` | PRs and pushes to `main` / `development` | Lint, unit tests, build. Skips app steps until `package.json` exists. |
| `codeql.yml` | PRs, pushes, weekly | CodeQL static analysis (JavaScript/TypeScript, Actions) |
| `dependency-review.yml` | PRs | Block newly added vulnerable dependencies |
| `deploy-uat.yml` | push to `development` | Deploy to UAT (added in Phase 2) |
| `deploy-prod.yml` | push to `main` | Deploy to production via `production` environment (added in Phase 2) |

## Required status checks

`validate`, `analyze (javascript-typescript)`,
`analyze (actions)`, `dependency-review` (job names) on PRs into `main` and
`development`.

## Deployment authentication: Workload Identity Federation

No service-account JSON keys are stored in GitHub. Instead:

1. A Google Cloud Workload Identity Pool trusts GitHub's OIDC issuer.
2. A provider maps `assertion.repository` and `assertion.ref`, with an
   attribute condition limiting it to `deepakdaneva/arthapath`.
3. A deploy service account per project has only the roles needed for
   Hosting and Firestore rules deploys.
4. The workflow uses `google-github-actions/auth` with
   `permissions: id-token: write` to get a short-lived token.

The exact setup script and role list are added in Phase 2.

## Fork safety

Workflows triggered by `pull_request` from forks get a read-only token and
no secrets. Deploy workflows never run on `pull_request`.
