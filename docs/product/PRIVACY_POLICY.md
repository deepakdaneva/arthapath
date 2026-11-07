# Privacy Policy (DRAFT)

> **Draft, not in effect.** This describes the planned architecture. It
> will be revised to match the implementation and reviewed before the first
> production release (Phase 10). It makes no claim of compliance with any
> specific regulation.

## Who runs this service

ArthaPath is open-source software. This policy covers the instance operated
by the project maintainer. Anyone who deploys their own copy is responsible
for their own instance and policy.

## What we collect

| Data | Source | Stored where | Readable by operator? |
|---|---|---|---|
| Name, email, profile photo URL, account ID | Google sign-in or email registration | Firebase Auth, Firestore | Yes |
| Financial profile, goals, transactions, conversations, analyses | You | Firestore, encrypted on your device | **No** (ciphertext only) |
| AI provider API keys | You | Firestore, encrypted on your device | **No** |
| Encryption parameters (salt, wrapped key) | Generated on device | Firestore | Yes, but useless without your PIN |
| Timestamps and monthly activity buckets | Generated | Firestore | Yes |

Google sign-in shares only your name, email address, and profile picture
(Google's basic profile and email permissions). ArthaPath does not request
your date of birth or any other Google data. You can change your name and
profile picture link on the Profile page; changes are saved to your
ArthaPath profile.

## Encryption

Your financial data is encrypted on your device with a key derived from
your PIN before it is stored. Your PIN and keys never leave your device.
ArthaPath locks automatically after inactivity (5 minutes by default) or
when it stays in the background, and you need your PIN to unlock it.
Your app preferences, such as the auto-lock time, are stored encrypted too.
**If you forget your PIN, your data cannot be recovered by anyone.**

## AI providers (important)

ArthaPath uses AI providers you choose (for example Google Gemini, Groq,
OpenRouter) with your own API keys. When you use AI features, **your
message and relevant financial context are sent to that provider** for
processing. That provider may retain or use the data under its own terms;
some free tiers use submitted data to improve their products. Review each
provider's terms. ArthaPath never sends your PIN or encryption key.

Statement imports are parsed on your device. Extracted text is sent to an
AI provider only if you explicitly agree for that import. Raw files are
never uploaded or stored.

## API keys

Keys are encrypted before storage and shown only in masked form. To make a
request, the key must be decrypted on your device, so malware on your
device could expose it.

## Where data is stored

Google Firebase (Cloud Firestore, region asia-south1, India).

## Retention and deletion

Data is kept until you delete it. You can delete your account and all
associated data from Settings. Deletion from AI providers must be requested
from each provider.

## Backups

The operator does not keep separate backups of your encrypted data. There
is no recovery of deleted data or lost PINs.

## Your rights

You can view, correct, export (planned), and delete your data in the app.

## Security limitations

No system is perfectly secure. See [SECURITY.md](../../SECURITY.md) for
known limitations.

## Contact

Through the project's GitHub repository.
