# Security Architecture

## Threat model

| Adversary | Protected? | How |
|---|---|---|
| Other ArthaPath users | Yes | Firestore rules: owner-only access |
| Firebase project admins / DB readers | Yes, for financial data | Client-side encryption; Firestore holds ciphertext |
| Network attacker | Yes | HTTPS everywhere (Firebase, AI providers) |
| Someone with the user's Google/email login but not the PIN | Data stays encrypted | PIN-derived key required |
| Attacker with full DB copy, attacking offline | Partially | Argon2id slows PIN guessing; short PINs remain brute-forceable. Passphrases recommended. |
| Malware / malicious extension on the user's device | **No** | Can read decrypted data and API keys in memory |
| The AI provider the user chooses | **No** | Receives prompts and context by design |

## What is plaintext in Firestore

- Display name, email, photo URL (from Firebase Auth, needed before unlock).
- KDF parameters, salt, wrapped DEK (non-secret by design).
- Timestamps, transaction month bucket, pending-question status.

These reveal account existence and activity volume, not financial content.

## Firestore rules principles (implemented in Phase 2)

- Default deny for every path.
- `users/{uid}/**` readable and writable only when `request.auth.uid == uid`.
- Schema validation: encrypted docs must contain exactly the envelope
  fields with expected types and size limits.
- The `crypto` field on `users/{uid}` can only be replaced as a whole
  object (PIN setup or PIN change).
- Emulator-tested with `@firebase/rules-unit-testing`.

## Repository and CI security

- Secret scanning and push protection enabled.
- Dependabot alerts and security updates.
- CodeQL analysis on PRs and weekly.
- Dependency review blocks PRs that add vulnerable dependencies.
- Third-party actions pinned to full commit SHAs.
- Default `GITHUB_TOKEN` permission: read-only.
- Deployment via Workload Identity Federation (no stored service-account
  keys), restricted to `main` / `development` refs and GitHub environments.
- Rulesets on `main` and `development`: PR required, 1 approval, required
  status checks, no force push, no deletion. Repository admins may bypass
  (single-maintainer project); see [ADR-0007](ADR/0007-branching-and-protection.md).

## Application hardening

- Strict Content Security Policy on Firebase Hosting (allowlist Firebase
  and the built-in AI endpoints; custom endpoints need a documented
  `connect-src` change in a self-hosted deployment).
- No `innerHTML` with untrusted content; AI output rendered as sanitized
  Markdown.
- No logging of keys, PINs, or decrypted payloads. A logging wrapper
  redacts known key patterns.
- Profile photo: URL string only, `https:` scheme validated.
- App Check: evaluated in Phase 10.

## Known limitations

1. BYOK keys are exposed to the client runtime at request time.
2. A lost PIN means lost data.
3. Short numeric PINs are brute-forceable given a database copy.
4. Metadata (activity timing, volume) is visible to the Firebase project owner.
5. Data sent to AI providers leaves ArthaPath's control.
