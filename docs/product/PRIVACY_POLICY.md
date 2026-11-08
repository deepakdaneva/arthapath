# Privacy Policy

Effective: version 1.0. This policy describes how the app actually works.
It has not been reviewed by a lawyer and makes no claim of compliance with
any specific regulation.

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

### You choose the provider, with your own key

ArthaPath does not include or resell an AI service. You add API keys from AI
providers you choose (for example Groq, Google Gemini, OpenRouter, or an
allowed OpenAI-compatible service such as Mistral, Cerebras, Together AI,
DeepInfra, Fireworks AI, or a model server on your own computer). Each key
belongs to **your** account with that provider, under the agreement between
you and that provider.

When you use AI features (Chat, onboarding, and later analyses), your device
sends your message and relevant financial context (the amounts, categories,
labels, and goals you saved, and figures calculated from them) **directly
from your device to the provider of the key in use**. It does not pass
through ArthaPath's servers. ArthaPath never sends your name, email address,
PIN, or encryption keys.

### What the provider does with it is up to the provider

Whether a provider stores your messages, for how long, whether people review
them, and whether they are used to train or improve models is decided by
**that provider and the plan of your key**, under the provider's own terms
and privacy policy. These terms differ between free and paid plans and can
change at any time. **ArthaPath does not control, receive, or have access to
data held by AI providers, and is not responsible for how they handle it.**
Review the provider's current terms before you use its key, and request
deletion of data held by a provider from that provider.

To help you choose, the app shows a short summary of each provider's stated
data practices when you add a key, with a link to its terms. As checked on
8 November 2026 (always confirm on the provider's site):

| Provider | What the provider states |
|---|---|
| Groq | Does not use prompts or responses for training and does not keep them by default; Zero Data Retention available. |
| Google Gemini, free tier | May use prompts and responses to improve Google products; human reviewers may read them; advises not to send sensitive or personal information. |
| Google Gemini, paid (billing enabled) | Prompts and responses are not used to improve Google products. |
| OpenRouter | Does not log prompts unless you opt in; each model runs at another company with its own policy. ArthaPath asks OpenRouter to use only providers that do not store or train on prompts. |
| Mistral, free Experiment plan | May use inputs and outputs for training unless you opt out; paid plan data is not used for training. |
| Cerebras, Together AI, DeepInfra, Fireworks AI | State that they do not keep or train on prompts by default (see each provider's terms for exceptions). |
| Ollama, LM Studio (your computer) | Runs on your device; messages do not leave it. |

### What ArthaPath does to limit what is shared

- **Identity numbers and secrets are removed on your device.** Before a
  message is saved, shown again, or sent to a provider, ArthaPath removes
  PAN, Aadhaar, card, and bank account numbers, passport numbers, phone
  numbers, email addresses, UPI IDs, and OTPs, PINs, CVVs, or passwords that
  it recognizes, and tells you when it does. The same applies to labels you
  type and to AI replies. Financial planning needs amounts, not ID numbers.
  Detection is best effort, so **do not type such details**.
- **Only what is needed is sent.** The financial context is a compact
  summary of your saved profile, not your account or sign-in details.
- **OpenRouter requests ask for providers that do not store or train on
  prompts.** If none is available for a model, the request is not sent and
  you are asked to choose another model.
- **Nothing extracted during onboarding is saved until you review and
  confirm it.**

Statement imports (CSV, PDF, or pasted text) are read on your device. The
file is never uploaded or stored, and a PDF password you type stays on your
device. Only the transactions you review and confirm are saved, encrypted.
Rows the device cannot categorize are sent to your AI provider only if you
turn on "Let AI categorize imported rows" in Settings (off by default); then
only the direction, amount, and a short description with account numbers
removed are sent, without dates or balances.

An AI analysis runs only when you ask for one. It sends your financial
context (amounts, categories, goals, and monthly totals; no name, ID
numbers, or account numbers) to your AI provider and is saved encrypted in
your analysis history, which you can delete.

## API keys

Keys are encrypted before storage and shown only in masked form. To make a
request, the key must be decrypted on your device, so malware on your
device could expose it.

## Where data is stored

Google Firebase (Cloud Firestore, region asia-south1, India).

## Retention and deletion

Data is kept until you delete it. You can permanently delete your account
on the Profile page: this removes your encrypted financial data, your
profile, and your sign-in. You confirm with your password (or Google) and
by typing DELETE. Deletion from AI providers must be requested from each
provider.

## Backups

The operator does not keep separate backups of your encrypted data. There
is no recovery of deleted data or lost PINs.

## Your rights

You can view, correct, export (planned), and delete your data in the app.

## Bot protection (reCAPTCHA)

To stop automated abuse of the shared free service quota, the app uses
Firebase App Check with Google reCAPTCHA v3, which runs invisibly in your
browser. reCAPTCHA collects hardware and software information (such as
device and application data) and sends it to Google for analysis. Its use
is subject to the [Google Privacy Policy](https://policies.google.com/privacy)
and [Terms of Service](https://policies.google.com/terms). It receives no
financial data from ArthaPath.

## Security limitations

No system is perfectly secure. See [SECURITY.md](../../SECURITY.md) for
known limitations.

## Contact

Privacy questions and data requests: open an issue in the project's
[GitHub repository](https://github.com/deepakdaneva/arthapath/issues) (do not include personal or financial details
in a public issue; say you would like to be contacted privately). Security
problems: report them privately through
[GitHub private vulnerability reporting](https://github.com/deepakdaneva/arthapath/security/advisories/new).

## Changes

Material changes to this policy are announced in the app and recorded in
the repository history.
