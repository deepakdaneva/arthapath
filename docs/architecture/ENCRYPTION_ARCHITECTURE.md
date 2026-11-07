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

## Argon2id parameters

Default target: `m = 64 MiB, t = 3, p = 1`, tuned in Phase 4 so unlock
takes about 0.5–1 s on a mid-range Android device. Params are stored per
user so they can be raised later (rewrap on next unlock).

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

- Inactivity timeout (default 5 min, user-configurable 1–30 min).
- Lock when the app goes to background (configurable grace period).
- Lock on logout and tab close.
- Lock = drop DEK reference + clear decrypted stores.
- Biometric unlock: not in v1 (PIN only). Planned later via Android
  Keystore and WebAuthn PRF where supported.

## AI API keys

Encrypted with the DEK like any other document. Decrypted only in memory,
immediately before a request. Displayed masked (`AIza************ABCD`).
**Limitation:** while in use, the key exists in the client runtime and can
be extracted by malware or a malicious browser extension on that device.
