# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| `main` (latest release) | Yes |
| `development` | Best effort |
| Older releases | No |

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately through GitHub:
[Security → Report a vulnerability](https://github.com/deepakdaneva/arthapath/security/advisories/new).

Include:
- Affected component and version or commit.
- Steps to reproduce or a proof of concept.
- Impact (data exposure, privilege escalation, key leakage, etc.).

What to expect:
- Acknowledgement within 7 days.
- An assessment and remediation plan within 30 days for confirmed issues.
- Credit in the advisory if you want it.

## Scope

In scope: the ArthaPath client, Firestore security rules, encryption
implementation, AI key handling, CI/CD workflows in this repository.

Out of scope: third-party AI providers, Firebase/Google infrastructure,
vulnerabilities requiring a fully compromised user device, and self-hosted
deployments that changed the security rules.

## Security model summary

- Financial data and AI API keys are encrypted on the client (AES-256-GCM)
  with a key derived from the user's PIN (Argon2id). Firestore stores
  ciphertext only. See [ENCRYPTION_ARCHITECTURE.md](docs/architecture/ENCRYPTION_ARCHITECTURE.md).
- **Known limitation:** BYOK API keys must be decrypted in the client at
  request time, so a compromised device or browser runtime can expose them.
- Data sent to an AI provider is visible to that provider under its terms.
