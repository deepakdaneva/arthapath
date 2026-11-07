# Contributing to ArthaPath

Thanks for helping. This guide covers the workflow and the project rules
that every change must respect.

## Ground rules

1. **Firebase Spark only.** No Blaze-only services (Cloud Functions,
   Cloud Storage, paid extensions).
2. **No plaintext financial data in Firestore.** Encrypt on the client
   before writing.
3. **No provider lock-in.** Business logic talks to the AI layer's
   interfaces, never to a specific provider SDK.
4. **No secrets in git.** Keys, service accounts, and `.env` files never get
   committed. GitHub push protection is enabled.
5. **Deterministic math.** Financial numbers come from tested TypeScript,
   not from AI output.

## Workflow

1. Fork the repo (external contributors) or branch from `development`:
   - `feature/<short-name>` for features
   - `bugfix/<short-name>` for bugs
   - `hotfix/<short-name>` (from `main`) for production fixes
2. Make focused commits using [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`).
3. Open a pull request into `development`. Fill in the template.
4. CI (lint, tests, build, CodeQL, dependency review) must pass and one
   maintainer approval is required.
5. Releases: `development` is merged into `main` through a release PR.
   Merging to `main` deploys production.

## Development setup

See [docs/development/LOCAL_SETUP.md](docs/development/LOCAL_SETUP.md).
Use the Firebase Local Emulator Suite; never test against production.

## Tests

Every change to financial calculations, encryption, AI routing, or Firestore
rules needs tests. See [docs/development/TESTING_GUIDE.md](docs/development/TESTING_GUIDE.md).

## Documentation

Update docs in the same PR as the code. Architectural decisions need an ADR
in `docs/architecture/ADR/` (copy `0000-template.md`).

## Licensing of contributions

By submitting a contribution you agree it is licensed under the
[Apache License 2.0](LICENSE), per section 5 of that license.
