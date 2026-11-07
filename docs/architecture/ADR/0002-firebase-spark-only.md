# ADR-0002: Firebase Spark plan only

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

The project must run at zero cost and be deployable by anyone without
billing. Since February 3, 2026, Cloud Storage for Firebase (including
default buckets) requires the Blaze plan. Cloud Functions also require Blaze.

## Decision

Use only Spark-compatible services: Firebase Authentication (Google,
email/password), Cloud Firestore, Firebase Hosting, and the Local Emulator
Suite. No Cloud Storage, no Cloud Functions, no paid extensions.

- File imports are parsed in memory on the client; raw files are never stored.
- Profile pictures are stored as a validated URL string.
- All logic runs on the client.

## Consequences

- No server-side jobs (scheduled reports, server-side validation beyond
  rules). Acceptable: with client-side encryption a server could not read
  the data anyway.
- Quotas are hard limits. When one is exhausted, the service stops until
  reset (no surprise bills), and the app degrades to cached, read-only mode.
