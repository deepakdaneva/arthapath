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
| Monthly expenses | Σ recurring expenses + EMIs | |
| Monthly surplus | income − expenses | |
| Savings rate | surplus ÷ income | Undefined if income = 0 |
| Debt-to-income | Σ EMIs and minimum card dues ÷ income | |
| Emergency fund coverage | liquid assets ÷ essential monthly expenses | In months |
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
- Emergency fund: liquid assets (savings, fixed deposits) ÷ (essential
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
