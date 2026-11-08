# ADR-0003: Separate Firebase projects for UAT and production

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

UAT testing must never touch production users or data.

## Decision

Two projects: `arthapath-prod` and `arthapath-uat`, both with Firestore in
`asia-south1` (Mumbai: lowest latency for the primary audience; the region
is permanent). Each has its own Auth configuration, authorized domains,
rules deployment, hosting site, and quotas. Local development uses the
Emulator Suite with a `demo-` project ID, so it can never reach real projects.

## Alternatives considered

One project with two hosting sites: Auth and Firestore would be shared, so a
UAT bug could corrupt production data. Rejected.

## Consequences

Two configurations to maintain. Each project gets its own Spark quota.
