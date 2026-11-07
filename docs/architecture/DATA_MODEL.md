# Data Model (Cloud Firestore)

Design goals: ciphertext only for anything financial or personal beyond
basic identity; minimal reads (aggregates over raw scans); every document
scoped under the owning user's UID.

## Encrypted document envelope

Every sensitive document stores its payload as:

```ts
interface EncryptedDoc {
  v: 1;            // envelope format version
  iv: string;      // base64, 12 random bytes, unique per write
  ct: string;      // base64 AES-256-GCM ciphertext + tag of JSON payload
  updatedAt: Timestamp; // plaintext, server timestamp, needed for sync/ordering
}
```

Only fields required for querying stay plaintext, and they must not reveal
amounts, categories, merchants, or descriptions.

## Collections

```
users/{uid}                                   // identity + crypto params
users/{uid}/vault/main                        // encrypted financial profile snapshot
users/{uid}/goals/{goalId}                    // encrypted
users/{uid}/transactions/{txId}               // encrypted; plaintext: month ("2026-11"), occurredAt
users/{uid}/aggregates/{yyyy-mm}              // encrypted monthly totals per category/type
users/{uid}/conversations/{convId}            // encrypted summary + metadata
users/{uid}/conversations/{convId}/messages/{msgId}   // encrypted; plaintext: createdAt
users/{uid}/pendingQuestions/{qId}            // encrypted; plaintext: status (open|answered|dismissed)
users/{uid}/contextSnapshots/{version}        // encrypted compact AI context, versioned
users/{uid}/analyses/{analysisId}             // encrypted AI analysis history
users/{uid}/aiKeys/{keyId}                    // encrypted key + provider; plaintext: none beyond updatedAt
```

### `users/{uid}`

| Field | Plaintext | Notes |
|---|---|---|
| `displayName`, `photoURL`, `email` | yes | From Firebase Auth; needed before unlock |
| `createdAt` | yes | |
| `crypto.kdf` | yes | `{ alg: "argon2id", m, t, p, salt }` — non-secret |
| `crypto.wrappedDek` | yes | `{ iv, ct }` — DEK encrypted by PIN-derived KEK |
| `crypto.version` | yes | For future key rotation |
| `prefs` | encrypted | theme, currency, lock timeout live in the vault |

Profile fields are written by the client on every sign-in, only when they
changed (`src/app/core/profile-store.ts`): name, email, and photo URL from
the sign-in provider (Google basic profile and email scopes, or the
email/password account). Date of birth is not collected.

### Why plaintext `month` on transactions

Pagination and month-range queries need an indexable field. The month
bucket reveals activity volume per month, not amounts or content. This
trade-off is documented in [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md).

## Read/write budget per typical session

| Action | Reads | Writes |
|---|---|---|
| Unlock + load dashboard | 1 user + 1 vault + ~12 aggregates + goals (~10) ≈ 25 | 0 |
| Add transaction | 0 (cached aggregate) | 2 (tx + aggregate, batched) |
| Open transaction list (page of 25) | 25 | 0 |
| Chat turn | 0–1 | 2 (message + context snapshot when changed) |

At Spark limits (50K reads / 20K writes per day per project), this supports
roughly hundreds of active users per day per project. See
[FIREBASE_SETUP.md](../deployment/FIREBASE_SETUP.md#quota-and-usage).

## Indexes

Single-field indexes cover `month`, `occurredAt`, `createdAt`, `status`.
Composite index: `transactions (month asc, occurredAt desc)`. Defined in
`firestore.indexes.json` (Phase 2).
