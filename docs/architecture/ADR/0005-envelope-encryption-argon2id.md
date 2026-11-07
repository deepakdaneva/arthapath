# ADR-0005: Client-side envelope encryption with Argon2id

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

Firebase admins and database readers must not be able to read financial
data. Users unlock with a PIN.

## Decision

A random 256-bit DEK encrypts all sensitive documents with AES-256-GCM
(WebCrypto). The DEK is wrapped by a KEK derived from the PIN with Argon2id
(`hash-wasm`). A successful GCM unwrap is the PIN verifier. A PIN change
rewraps the DEK only. There is no recovery mechanism and no backdoor.

## Alternatives considered

- PBKDF2 (native WebCrypto): no dependency, but not memory-hard, so much
  weaker for PINs against GPU attackers.
- A separate PIN hash as verifier: an extra offline-attackable artifact with
  no benefit over the GCM tag.
- Encrypting data directly with the KEK: a PIN change would require
  re-encrypting everything.

## Consequences

Adds the small `hash-wasm` dependency. Argon2 parameters are tuned for
mobile in Phase 4. A lost PIN means permanent data loss, disclosed at setup.
