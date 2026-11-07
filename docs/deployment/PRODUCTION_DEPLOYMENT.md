# Production Deployment

Production deploys happen only from `main`, after a release PR from
`development` is merged.

## Release process

1. Confirm UAT is verified with the checklist below.
2. Update `CHANGELOG.md` (move Unreleased to a version) on `development`.
3. Open a release PR `development` → `main`. CI must pass.
4. Merge. `deploy.yml` runs in the `production` environment
   (restricted to `main`) and deploys to `arthapath-prod`.
5. Tag the release: `vX.Y.Z`, and publish GitHub release notes.
6. Smoke-test production.

## Rollback

Firebase Hosting keeps previous releases: roll back in the console
(Hosting → Release history) or with `firebase hosting:rollback`.
Firestore rules: redeploy the previous commit's `firestore.rules`.

## Release checklist

- [ ] All CI checks green on the release PR.
- [ ] Firestore rules tests pass.
- [ ] Sign-in (Google, email) works on UAT.
- [ ] PIN setup, unlock, wrong-PIN, and lock timeout work.
- [ ] Data written on UAT is ciphertext in the Firestore console.
- [ ] AI fallback works with one exhausted or invalid key.
- [ ] No secrets in the diff (`git diff main...development`).
- [ ] CHANGELOG updated.

Until the app exists (Phase 3), only Firestore rules and indexes deploy.
