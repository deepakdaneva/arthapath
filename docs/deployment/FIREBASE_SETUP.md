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

## Step-by-step (filled in during Phase 2)

1. `npm i -g firebase-tools` and `firebase login`.
2. Create both projects: `firebase projects:create <id>`.
3. Create a Firestore database in `asia-south1` for each project.
4. Enable Google and Email/Password providers in Authentication.
5. Register a web app per project; copy the config into environment files.
6. Add hosting domains to Auth authorized domains.
7. Deploy rules and indexes: `firebase deploy --only firestore -P <alias>`.
8. Configure Workload Identity Federation for CI
   (see [GITHUB_ACTIONS.md](GITHUB_ACTIONS.md)).

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
