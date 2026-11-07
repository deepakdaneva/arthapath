# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Ionic 9 + Angular 22 app shell: public landing page, Google and
  email/password sign-in with verification and password reset, dashboard
  with first-run call to action, Chat and Today's Updates navigation,
  profile menu, profile, settings (light/dark/system theme), about, and
  in-app privacy policy and terms.
- Capacitor 8 Android project.
- ESLint (angular-eslint) and Vitest unit tests.
- Deploy job moved into `ci.yml` and gated on validation and rules tests.
- Profile (name, email, photo URL) saved to Firestore on sign-in; profile
  page edits name and photo URL.

### Fixed
- Privacy policy and terms pages showed raw markdown; they are now rendered
  to HTML at build time.
- In-app GitHub links point to `development` on UAT and `main` in
  production.
- Firebase infrastructure: `firebase.json` (Hosting security headers and
  CSP, emulators), `.firebaserc` aliases, Firestore rules enforcing owner-only
  access and encrypted envelopes, indexes, and emulator rules tests.
- Deployment workflow with keyless Workload Identity Federation and
  `scripts/setup-wif.sh`.
- Repository foundation: Apache-2.0 license, community health files,
  issue and pull request templates, CI validation, CodeQL, dependency review.
- Architecture documentation and ADRs for the stack, Firebase Spark
  strategy, client-side encryption, and the BYOK multi-provider AI layer.
