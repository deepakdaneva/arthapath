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
- Data sent to an AI provider is visible to that provider under its terms,
  which depend on the provider and the plan of the user's key. Requests go
  directly from the device to the provider, never through ArthaPath servers.
- Identity numbers and secrets (PAN, Aadhaar, card and account numbers,
  passport, phone, email, UPI ID, OTP/PIN/CVV/password) are removed on the
  device before messages, labels, or AI replies are stored, shown, or sent
  (`src/app/ai/redact.ts`). Detection is pattern- and checksum-based and
  best effort; amounts are never altered.
- OpenRouter requests set `provider.data_collection: "deny"`, so OpenRouter
  only routes to providers that do not store or train on prompts.
- AI replies are rendered as Markdown with raw HTML escaped and then
  sanitized by Angular.
- Statement files are read in the browser (pdf.js for PDFs) and never
  uploaded or stored; PDF passwords stay on the device. Files over 10 MB
  are refused.
- PINs that are quick to guess offline (short single-class, repeats,
  sequences) are refused at setup and on change, because a stolen copy of
  the encrypted data could otherwise be attacked offline.
- Signing out or deleting the account clears the local Firestore cache
  (encrypted documents and PIN parameters) from the device.
- App Check (reCAPTCHA v3) can be enabled to stop scripted abuse of the
  shared free quota; see PRODUCTION_DEPLOYMENT.md.
- AI replies never load images (a link is shown instead), so model output
  cannot send data to another site without a click.
- The production deploy installs dependencies and builds before obtaining
  credentials, and requires maintainer approval.

Known remaining limits: Firestore metadata (document counts, month
buckets, timestamps) is visible to the operator by design; a compromised
device or browser extension can read decrypted data and keys while the
app is unlocked.
