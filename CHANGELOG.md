# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Firebase infrastructure: `firebase.json` (Hosting security headers and
  CSP, emulators), `.firebaserc` aliases, Firestore rules enforcing owner-only
  access and encrypted envelopes, indexes, and emulator rules tests.
- Deployment workflow with keyless Workload Identity Federation and
  `scripts/setup-wif.sh`.
- Repository foundation: Apache-2.0 license, community health files,
  issue and pull request templates, CI validation, CodeQL, dependency review.
- Architecture documentation and ADRs for the stack, Firebase Spark
  strategy, client-side encryption, and the BYOK multi-provider AI layer.
