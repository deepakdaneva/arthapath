# Production Deployment

Production deploys happen only from `main`, after a release PR from
`development` is merged, and only after the maintainer approves the
deployment in GitHub.

## Release process

1. Confirm UAT is verified with the checklist below.
2. Update `CHANGELOG.md` (move Unreleased to the version) on `development`.
   The major and minor version come from `package.json`; the build number
   is the commit count.
3. Open a release PR `development` → `main`. All required checks must pass.
4. Merge. The `deploy` job in `ci.yml` builds and then **waits for approval**
   in the `production` environment (required reviewer; branch policy
   `main` only). Approve it in GitHub → Actions → the run → Review
   deployments.
5. The job deploys Firestore rules, indexes, and hosting to
   `arthapath-prod` using keyless Workload Identity Federation.
6. The `android-release` job then builds the signed production APK and
   publishes the GitHub release `vX.Y.Z` with it (tag and notes are
   created automatically; see [ANDROID_RELEASE.md](ANDROID_RELEASE.md)).
7. Smoke-test production (checklist below).

## Supply-chain safeguards in the deploy job

Dependencies and the Firebase CLI are installed and the app is built
**before** Google credentials are obtained, so no package install script
can read them. Actions are pinned to commit SHAs; the job has only
`contents: read` and `id-token: write`.

## Rollback

Firebase Hosting keeps previous releases: roll back in the console
(Hosting → Release history) or with `firebase hosting:rollback`.
Firestore rules: redeploy the previous commit's `firestore.rules`.

## Production configuration (arthapath-prod)

| Setting | Value |
|---|---|
| Firestore | Native mode, asia-south1 |
| Sign-in | Email/password and Google |
| Authorized domains | `arthapath-prod.web.app`, `arthapath-prod.firebaseapp.com` (no localhost) |
| Password policy | Enforced: at least 8 characters with a lowercase letter and a number |
| Email enumeration protection | On |
| App Check | reCAPTCHA v3 (site key in the `RECAPTCHA_SITE_KEY` environment variable); enforce for Firestore after metrics show verified traffic |
| GitHub environment | `production`: branch `main` only, maintainer approval required |

## Enabling App Check (reCAPTCHA v3)

1. In the reCAPTCHA admin console, create a **v3** key with the domains
   `arthapath-uat.web.app`, `arthapath-uat.firebaseapp.com`,
   `arthapath-prod.web.app`, and `arthapath-prod.firebaseapp.com` (or one
   key per environment).
2. In the Firebase console for each project: App Check → Apps → the web app
   → register **reCAPTCHA** with that key's **secret** key.
3. Add the public **site** key as the `RECAPTCHA_SITE_KEY` variable in the
   GitHub `uat` and `production` environments; the next deploy starts App
   Check in the app.
4. Watch App Check → APIs → Cloud Firestore metrics. When nearly all
   requests are verified, choose **Enforce** for Firestore (and Auth).
   Unverified requests are then rejected.

## Release checklist

- [ ] All CI checks green on the release PR.
- [ ] Firestore rules tests pass.
- [ ] Sign-in (Google, email) works on UAT.
- [ ] PIN setup, unlock, wrong-PIN, and lock timeout work.
- [ ] Data written on UAT is ciphertext in the Firestore console.
- [ ] AI chat works with a real key; fallback works with one invalid key.
- [ ] Updates, import (CSV and PDF), questions, and analysis work on UAT.
- [ ] No secrets in the diff (`git diff main...development`).
- [ ] CHANGELOG updated.

## Production smoke test

- [ ] `https://arthapath-prod.web.app/version.json` shows the released
      version and commit.
- [ ] Landing, terms, and privacy pages load (privacy and terms from `main`).
- [ ] Sign up with a new email, set a PIN, add one income in Your finances,
      see the dashboard, log one update, lock and unlock.
- [ ] Delete that test account from Profile.
