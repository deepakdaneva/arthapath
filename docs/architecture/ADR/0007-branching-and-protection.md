# ADR-0007: Branching, protection, and deployment authentication

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

Public repository, a single maintainer today, automated deploys to two
environments.

## Decision

- Branches: `main` (production), `development` (UAT), `feature/*`,
  `bugfix/*`, `hotfix/*`.
- Rulesets on `main` and `development`: pull request required, 1 approving
  review, required status checks, no force push, no deletion. Repository
  admins can bypass, because GitHub does not let authors approve their own
  PRs and there is one maintainer. Revisit when a second maintainer joins.
- Deploys: GitHub Actions with Workload Identity Federation (OIDC, no
  long-lived keys). `development` deploys to UAT; `main` deploys to
  production through the `production` GitHub environment, restricted to `main`.
- Commits are authored by the human maintainer with their GitHub noreply
  address. No AI or bot identity is used as a commit author.

## Consequences

Admin bypass weakens the review requirement in practice. Each bypass stays
visible in the audit log.
