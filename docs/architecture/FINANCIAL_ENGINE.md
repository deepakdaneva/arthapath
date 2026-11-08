# Financial Engine

Pure, deterministic TypeScript in `src/app/domain/engine`. No Angular, no
Firebase, no AI imports. Every function is unit-tested. AI output never
feeds a displayed number without passing through this engine.

## Money representation

Amounts are integers in the smallest currency unit (paise for INR) to
avoid floating-point drift. Formatting uses `Intl.NumberFormat` with the
user's currency and locale (`en-IN` default for ₹ grouping like 1,50,000).

## Core metrics

| Metric | Formula | Notes |
|---|---|---|
| Monthly income | Σ recurring income (normalized to monthly) | Annual items ÷ 12 |
| Monthly expenses | Σ recurring expenses, excluding the "investments" category | Each expense is tagged necessary, discretionary, or unnecessary |
| Monthly investing | Σ expenses in the "investments" category (SIP, RD, PPF) | Saving, not spending |
| Monthly surplus (left to save) | income − expenses − EMIs − investing | |
| Savings rate | (income − expenses − EMIs) ÷ income | Includes investing; undefined if income = 0 |
| Debt-to-income | Σ EMIs and minimum card dues ÷ income | |
| Emergency fund coverage | liquid assets ÷ (necessary expenses + EMIs) | In months |
| Net worth | Σ assets − Σ liabilities | Shown only when assets and liabilities are reported |
| Goal required monthly | Future-value annuity solve for contribution | Uses user-confirmed assumed return; 0% default |
| Goal progress | current ÷ target | |
| FI progress | invested assets ÷ (annual expenses × FI multiple) | Multiple default 25 (4% rule), user-editable assumption |

## Health score (0–100)

Transparent weighted sum, shown with its breakdown:

| Component | Weight | Full marks at |
|---|---|---|
| Savings rate | 25 | ≥ 20% |
| Emergency fund | 25 | ≥ 6 months |
| Debt-to-income | 25 | ≤ 30% |
| Goals on track | 15 | all on track |
| Insurance basics | 10 | health + term cover reported |

Linear interpolation between zero and full marks. Missing inputs make a
component "unknown" (excluded and renormalized) rather than zero. Weights
are documented assumptions, not financial advice.

## Goal prioritization

Deterministic score per goal, then explained by AI in plain language:

- Urgency: months until target date.
- Category weight: emergency fund > high-interest debt > insurance >
  dated obligations (education) > discretionary.
- Feasibility: required monthly vs. available surplus.
- User priority override always wins.

## Information provenance

Every displayed value carries a provenance tag:
`user` (verified input), `calculated`, `ai_estimate`, `assumption`.
The UI marks assumptions and estimates and lets the user correct them.

## Aggregation

Monthly aggregate documents hold totals per type and category. A new
transaction updates one aggregate; dashboards never rescan full history.
A rebuild routine can regenerate aggregates from transactions if needed.

## Implementation (Phase 6)

| Piece | File |
|---|---|
| Domain types, money helpers (paise, `formatInr`) | `src/app/domain/models.ts` |
| Metrics, goal planning, health score, suggestions | `src/app/domain/engine.ts` (tests: `engine.spec.ts`) |
| Encrypted persistence, derived signals, AI context snapshot | `src/app/domain/profile.service.ts` |
| AI extraction prompt and validator | `src/app/ai/extraction.ts` |

### Scoring details

- Savings rate: 0 at 0% or less, full at 20% or more (linear).
- Emergency fund: liquid assets (savings, fixed deposits) ÷ (necessary
  expenses + loan payments); 0 at 0 months, full at 6.
- Debt payments: full at 30% of income or less, 0 at 60% or more.
- Goals: share of dated goals whose required monthly saving is fully
  covered by the surplus allocated in priority order.
- Insurance: half for health cover; half for term cover, or automatically
  when nobody depends on the user's income.

### Goal planning

- Required monthly saving solves the future-value annuity with monthly
  compounding at the user's assumed return (default 0%).
- Score = category weight (emergency fund 100, debt payoff 85, insurance
  80, education 60, retirement 55, home/wedding 45, vehicle 35, travel 25,
  wealth/other 20) + urgency (30 within a year, 20 within 3, 10 within 7) +
  10 if the surplus alone can fund it. User order (priority override)
  always comes first.
- The surplus is allocated down the ranked list; each goal is on track
  (fully funded), at risk (at least half), or behind.
- Reasons shown with each goal are generated deterministically.

### Suggestions

Emergency fund (when under 6 months), high-interest debt payoff (credit
cards, personal loans, or 12%+ interest), insurance (when the user said
they lack it), and retirement. Shown as optional; never added
automatically.

### AI extraction

The model returns JSON. `parseExtraction` validates every field: amounts
must be non-negative numbers up to ₹10,000 crore (converted to paise),
types must be known values (otherwise "other"), dates must be `YYYY-MM`,
at most 20 items per section and 4 questions. Rough figures are tagged
`ai_estimate`. The user reviews and can correct every amount before saving;
a corrected amount becomes `user`.

## Dashboard calculations (Phase 7)

All in `src/app/domain/engine.ts`, pure and unit-tested.

### Spending breakdown

`spendingBreakdown` splits monthly income into: necessary, discretionary,
and unnecessary spending; loan payments; investments; and what is left to
save (surplus, never below zero). Empty slices are left out. Profiles saved
before the three-level tag (`essential: true/false`) are upgraded on load:
essential becomes necessary, the rest discretionary.

### Warnings

`financialWarnings` returns deterministic warnings, most severe first. Each
states its threshold so the user can judge it:

| Warning | Rule | Severity |
|---|---|---|
| Spending more than you earn | surplus < 0 | critical |
| No updates for N days | last saved change more than 7 days ago | serious |
| Most of your income is spent | (expenses + EMIs) > 80% of income | serious |
| High loan payments | EMIs > 40% of income | serious |
| No / small emergency fund | coverage < 1 month (serious) or < 3 months | serious / warning |
| Goal behind / at risk | from goal planning | serious / warning |
| Low savings | savings rate < 10% | warning |
| Spending you marked unnecessary | > 10% of income | warning |
| Goal coming up | due within 12 months, not achieved | warning |

Rising liabilities and spending trends need history and arrive with
transactions (Phase 8).

### Update reminder

`profile.updatedAt` is set on every saved change. After 7 days without one,
the dashboard shows the "No updates" warning and the Updates tab shows a
badge. Nothing is blocked or forced.

### Period filters

`periodRange` turns Day, Week (Monday start), Month, Year, or a custom
from/to into a local-time range with an exclusive end, used by the
transaction list on each details page.

## Updates and transactions (Phase 8)

Code: `src/app/domain/transactions.ts` (pure, unit-tested) and
`transactions.service.ts`.

### Plan versus actual

Your finances holds the monthly **plan**. Logged entries are **actuals**.
The dashboard compares this month's actual spending with the plan per
category, and charts monthly income, spending, and saved-and-invested from
the monthly aggregates.

### Entry types

`expense`, `income`, `investment`, `saving`, `loan_payment`, `transfer`.
Expenses carry a category (built-in or the user's own) and a need:
necessary, lifestyle, discretionary, or unnecessary. Unnecessary is set only
when the user's own words say so ("wasted", "impulse") or they choose it.

### Understanding a note

1. Identity numbers and secrets are removed on the device.
2. The on-device parser reads amounts (₹, Rs, 1.2k, 1.5 lakh, 2 cr), dates
   (today, yesterday, N days ago, 5 Nov, 05/11; never in the future),
   payment method, category keywords, merchant ("at Truffles"), and a goal
   ("for the family car"). Several entries can be joined with "and" or
   commas when each has its own amount.
3. Only when no amount is found is the note sent to the AI provider, with
   today's date and goal names (no amounts). Its JSON is validated field by
   field.
4. The user reviews and can correct every field before saving.

### Saving

Each entry is an encrypted document (`transactions/{id}`, plaintext `month`
and `occurredAt` for queries). The month's encrypted aggregate
(`aggregates/{YYYY-MM}`: totals by type, category, and need) is updated in
step, so the dashboard reads one small document per month. A saving or
investment linked to a goal is added to that goal's saved amount; deleting
the entry reverses it.

### Impact after saving

Deterministic, no AI call: share of the category's monthly plan used (and
whether that is ahead of the month's pace), overspend against the plan,
the category compared with the average of the previous three months
(flagged above +25%), total spending against the plan, goal progress for a
linked saving, and income received this month.

### Reminder

The last activity is the later of the last saved profile change and the
last logged entry. After 7 days without either, the dashboard and the
Updates page show a reminder and the Updates tab shows a badge.

## Imports, questions, and recommendations (Phase 9)

### Statement import (`src/app/domain/import.ts`)

- CSV: RFC 4180 parsing (comma, semicolon, or tab); the header row is found
  in the first 30 rows by column names (date; narration/description/
  particulars; withdrawal/debit and deposit/credit, or one amount with a
  Dr/Cr column). Dates are read day first (Indian banks).
- PDF and pasted text: a line that starts with a date and contains an
  amount is a transaction; with two or more amounts the last is taken as the
  running balance. "Cr" marks money in. PDFs are read with pdf.js in the
  browser (text PDFs only; no OCR).
- Classification reuses the Updates rules; the statement's direction (in or
  out) always wins over words.
- Duplicates: same date, amount, and normalized description as a saved
  entry, the same date and amount as a typed entry, or a repeat within the
  import. Duplicates start unselected.
- Saving writes each entry and then each touched month's aggregate once.

### Questions from gaps (`src/app/domain/questions.ts`)

Asked only once some data exists: income, regular expenses, savings and
deposits, health insurance (yes/no), term insurance (yes/no; optional
without dependents), dependents (optional), loan interest rates (optional),
and goal dates. Each says why it is needed and what depends on it. A gap
closes when the data exists; skipping stores the dismissal.

### Recommendations (`src/app/domain/recommendations.ts`)

In order: clear high-interest debt (credit cards or 12% a year or more);
build the emergency fund to 6 months of necessary spending and loan
payments; consider term cover of 10 to 15 times yearly income when someone
depends on the user; get health insurance when the user said they have none;
redirect spending marked unnecessary (with the share of a lagging goal's
gap it would cover); close a lagging goal's gap (higher monthly amount, a
later date, or a lower target); put surplus not set aside for any goal into
a regular investment. AI analyses explain these; they do not compute them.

