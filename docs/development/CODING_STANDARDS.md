# Coding Standards

- TypeScript `strict` mode. No `any` without a comment explaining why.
- Angular standalone components, `OnPush`/signals, `inject()` over
  constructor injection.
- Money as integer minor units (paise). Never floats for stored amounts.
- Domain and engine code: pure functions, no framework imports.
- No `console.log` of user data, keys, or PINs. Use the redacting logger.
- Prefer platform and standard-library features before adding a dependency.
  New dependencies need a justification in the PR.
- Import Ionic components from their own entry points
  (`@ionic/angular/ion-button`), never the `@ionic/angular` barrel. The
  barrel pulls every used component into the main bundle; lint enforces this.
- Crypto and Firestore code are imported only dynamically (`import()`), so
  the landing and sign-in pages stay small.
- Lint: ESLint (angular-eslint). Format: Prettier. Both enforced in CI
  (configured in Phase 3).
- Commits: Conventional Commits.
- Comments explain *why*, not *what*.
