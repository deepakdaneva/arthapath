# User Flows

## First visit

Landing page → **Get Started** → sign in (Google or email) → PIN setup with
a clear no-recovery warning → empty-state screen with a central circular
call-to-action, "Let's start with your financial goals." → conversational
onboarding (starter templates; the AI extracts facts; the user
reviews, corrects amounts, and saves; open questions become pending questions)
→ dashboard generated from the saved profile. A manual form (Your finances)
is always available instead.

## Returning user

Open app → signed in automatically → PIN unlock → dashboard.

## Daily entry

Updates tab (or FAB), whenever the user chooses (daily, weekly, monthly) → type "Spent ₹500 on groceries via UPI" →
local parser (AI only if needed) extracts fields → review card → save →
aggregates and dashboard update → brief impact note.

## Statement import

FAB → Import → choose CSV/PDF (password prompt if needed) → parsed on
device → optional consented AI structuring → review with duplicates
flagged → confirm → encrypted save → dashboard updates.

## AI provider fallback

Chat message → provider A returns quota exhausted → key cooled down →
notice "Gemini free quota exhausted. Switching to Groq." → same context
sent to provider B → answer.

## Pending questions

Assistant needs data → pending question created → Chat tab badge → user
sees why it is needed, whether it is optional, and what depends on it →
answers or dismisses.

## Lock

Inactivity or app backgrounded → lock screen → PIN to resume.
