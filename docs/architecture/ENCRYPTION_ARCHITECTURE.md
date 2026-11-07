# Encryption Architecture

Goal: nobody but the user (not Firebase admins, not project owners, not
anyone with database read access) can read financial data or AI keys.

## Primitives

| Purpose | Algorithm | Implementation |
|---|---|---|
| Data encryption | AES-256-GCM, 96-bit random IV per operation | WebCrypto `SubtleCrypto` |
| Key derivation from PIN | Argon2id | `hash-wasm` (WASM; browser + Capacitor WebView) |
| Randomness | CSPRNG | `crypto.getRandomValues` |

No custom cryptography. Argon2id chosen over PBKDF2 because it is
memory-hard, which matters a lot for low-entropy secrets like PINs. See
[ADR-0005](ADR/0005-envelope-encryption-argon2id.md).

## Key hierarchy (envelope encryption)

```
PIN ──Argon2id(salt, m, t, p)──▶ KEK (256-bit, never stored)
                                   │ AES-GCM wrap
DEK (random 256-bit) ◀─────────────┘  stored as users/{uid}.crypto.wrappedDek
 │
 └── AES-GCM encrypts every sensitive document and AI key
```

- **DEK** (data encryption key): random, generated once on the device at
  PIN setup. Encrypts all data.
- **KEK** (key encryption key): derived from the PIN. Only wraps the DEK.

## PIN setup

1. User authenticates with Firebase Auth.
2. App explains: the PIN cannot be recovered; forgetting it means
   permanent data loss. User confirms.
3. User enters a PIN (minimum 6 digits; alphanumeric passphrase allowed
   and encouraged).
4. Generate a 16-byte random salt; derive KEK with Argon2id.
5. Generate random DEK; wrap DEK with KEK (AES-GCM, random IV).
6. Store `{kdf params, salt, wrappedDek}` in `users/{uid}`.
7. Raw PIN and KEK are discarded. DEK held in memory as a non-extractable
   `CryptoKey` for the session.

## PIN verification

There is no separate PIN hash. Unwrapping the DEK with the derived KEK
either succeeds or fails the GCM authentication tag. A successful unwrap is
the verifier. This avoids storing a second, independently attackable
artifact.

## Unlock

Enter PIN → derive KEK with stored params → unwrap DEK → keep DEK in memory
as non-extractable `CryptoKey`.

## PIN change

Requires a successful unlock. Derive a new KEK from the new PIN with a new
salt, rewrap the same DEK, overwrite `crypto`. No data re-encryption
needed.

## Forgotten PIN

No recovery. The user can delete their data and start fresh. There is no
server-side decryption and no backdoor. This is shown during setup and in
the PIN screen.

Reset (Unlock → Forgot PIN → type `DELETE`) deletes every document in the
encrypted collections (`vault`, `goals`, `transactions`, `aggregates`,
`pendingQuestions`, `contextSnapshots`, `analyses`, `aiKeys`,
`conversations` and their messages) in batches, then removes `crypto`.
Profile fields (name, email, photo URL) stay.

## Argon2id parameters

`m = 64 MiB, t = 3, p = 1` (`DEFAULT_KDF`). Measured at about 130 ms on a
desktop CPU; expected around 0.5–1 s on a mid-range Android device (to be
measured on hardware when Android builds are tested). Params are stored
per user so they can be raised later (rewrap on next unlock).

## Implementation

| Piece | File |
|---|---|
| Primitives (derive, create, open, change PIN, encrypt/decrypt JSON) | `src/app/core/crypto/crypto.ts` |
| Firestore persistence (params, envelopes, reset), transactional | `src/app/core/crypto/vault-store.ts` |
| In-memory key, state, throttling, encrypted get/put | `src/app/core/crypto/vault.service.ts` |
| Auto-lock policy | `src/app/core/crypto/session-lock.service.ts` |
| Route guards (`/setup-pin`, `/unlock`, `/app`) | `src/app/core/crypto/vault.guards.ts` |

- The in-memory DEK is a non-extractable `CryptoKey`. A PIN change
  unwraps an extractable copy only long enough to rewrap it.
- First-time setup runs in a transaction and refuses to overwrite existing
  parameters (another device may have set a PIN; overwriting would orphan
  its data). PIN change succeeds only if the stored wrapped key is the one
  that was unwrapped.
- Profile sync also runs in a transaction, so it never overwrites `crypto`.
- Wrong-PIN throttling: 5 free attempts, then 30 s doubling up to 15 min,
  tracked per account in `localStorage`. This is a UI speed bump only;
  Argon2id and the rules are the real protection.
- Crypto and Firestore code load lazily; the initial bundle has neither.

## Offline brute-force considerations

An attacker with a copy of the Firestore data can try PINs offline. A
6-digit PIN has 10^6 combinations; Argon2id at about 1 s per guess on
commodity hardware makes exhaustive search slow but **not** infeasible for
a determined attacker with GPUs. Mitigations:

- Firestore rules ensure only the authenticated owner can read their
  documents, so offline attack requires a Firebase-side breach or the
  user's own account.
- The UI recommends a longer alphanumeric passphrase and shows strength.

This limitation is stated plainly in SECURITY.md and the privacy policy.

## Session lock

- Inactivity timeout: default 5 min; options 1, 5, 15, 30 min (Settings).
  Activity = pointer, key, wheel, or touch events; checked every 15 s.
- Background: locks if the tab is hidden or the app paused for more than
  30 s (`visibilitychange`, which also fires when Capacitor pauses).
- Sign-out and reload: the key exists only in memory, so it is gone.
- Lock = drop the DEK reference, bump `lockEpoch` so decrypted caches
  clear, and route to `/unlock` (returning to the same page afterwards).
- Lock preferences are stored encrypted in `users/{uid}/vault/main`.
- Biometric unlock: not in v1 (PIN only). Planned later via Android
  Keystore and WebAuthn PRF where supported.

## AI API keys

Encrypted with the DEK like any other document. Decrypted only in memory,
immediately before a request. Displayed masked (`AIza************ABCD`).
**Limitation:** while in use, the key exists in the client runtime and can
be extracted by malware or a malicious browser extension on that device.
