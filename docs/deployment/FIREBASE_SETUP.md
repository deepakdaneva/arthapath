# Firebase Setup

ArthaPath runs entirely on the Firebase **Spark (no-cost)** plan. Never
upgrade to Blaze for this project; nothing in ArthaPath needs it.

## Projects

| Environment | Project ID | Firestore region |
|---|---|---|
| Production | `arthapath-prod` | `asia-south1` |
| UAT | `arthapath-uat` | `asia-south1` |
| Local | `demo-arthapath` (emulator only) | n/a |

Self-hosters: pick your own IDs and region, and update `.firebaserc`.
The Firestore region **cannot be changed** after creation.

## Services used

| Service | Spark-compatible | Used for |
|---|---|---|
| Authentication (Google, email/password) | Yes | Sign-in |
| Cloud Firestore | Yes (daily quotas) | Encrypted data |
| Hosting | Yes | Web app |
| Local Emulator Suite | Yes (local) | Development and rules tests |
| Cloud Storage | **No** (Blaze required since 2026-02-03) | Not used |
| Cloud Functions | **No** | Not used |
| App Check | To be evaluated (Phase 10) | Abuse protection |

## Step-by-step

Run for each project (`<id>` = your project ID). Never link a billing account.

```bash
npm i -g firebase-tools && firebase login
firebase projects:create <id> --display-name "ArthaPath"
gcloud services enable firestore.googleapis.com identitytoolkit.googleapis.com   firebasehosting.googleapis.com firebaserules.googleapis.com --project <id>
firebase firestore:databases:create "(default)" --location asia-south1 -P <id>
firebase apps:create web "ArthaPath Web" -P <id>
firebase apps:sdkconfig web -P <id>      # values for environment config
```

Authentication must be initialized in the console (doing it through the
API upgrades the project to Identity Platform, which is avoided here):

1. Firebase console → Authentication → **Get started**.
2. Sign-in method → enable **Email/Password** (email link off).
3. Add provider → **Google** → enable, choose a support email.
4. Settings → Authorized domains: `<id>.web.app` and `<id>.firebaseapp.com`
   are present by default; add custom domains if any.

Restrict the auto-created browser API key (Google Cloud console → APIs &
Services → Credentials, or `gcloud services api-keys update`):

- API restrictions: Cloud Firestore API, Identity Toolkit API, Token
  Service API (`securetoken`), Firebase Installations API.
- Website restrictions: `https://<id>.web.app/*`,
  `https://<id>.firebaseapp.com/*`, `https://localhost/*` (Capacitor
  Android), plus `http://localhost/*` and `http://localhost:*/*` for UAT only.

The key is a public identifier; restrictions limit abuse of your quota, but
security still rests on Auth and Firestore rules.

Then:

```bash
firebase deploy --only firestore -P <alias>     # rules + indexes
scripts/setup-wif.sh <id> <github-environment>  # keyless CI deploys
```

See [GITHUB_ACTIONS.md](GITHUB_ACTIONS.md) for the CI side.

## Local emulators and rules tests

`.firebaserc` defaults to `demo-arthapath`, a demo project ID that the
emulators accept and that cannot reach any real project.

```bash
cd firebase/rules-tests
npm ci
npm test        # starts the Firestore emulator and runs the rules tests
```

## Quota and usage

Spark limits as published at time of writing (verify on the
[Firebase pricing page](https://firebase.google.com/pricing); limits change):

| Resource | Spark limit |
|---|---|
| Firestore stored data | 1 GiB |
| Firestore document reads | 50,000 / day |
| Firestore document writes | 20,000 / day |
| Firestore document deletes | 20,000 / day |
| Firestore network egress | 10 GiB / month |
| Hosting storage | 10 GB |
| Hosting data transfer | ~10 GB / month |
| Auth (email/Google) | Generous monthly active user allowance; see pricing page |

When a quota is exhausted the service stops serving until it resets. There
are no charges on Spark.

### Expected usage per active user per day (estimate)

| Activity | Reads | Writes |
|---|---|---|
| 2 dashboard loads | ~50 | 0 |
| 5 transactions | 0 | 10 |
| 1 transaction list page | 25 | 0 |
| 10 chat turns | ~10 | ~20 |
| **Total** | **~85** | **~30** |

That suggests roughly 500 daily active users per project before hitting
the read limit, and far more before the write limit. This is an estimate,
not a guarantee. Usage beyond Spark limits means self-hosters must either
accept daily outages or move to their own paid plan.

### How the app minimizes usage

- Monthly aggregate documents instead of rescanning transactions.
- Firestore offline cache (ciphertext) for repeat reads.
- Paginated lists (25 per page).
- Batched writes for transaction + aggregate.
- No realtime listeners on large collections; listeners only on small,
  active documents.
