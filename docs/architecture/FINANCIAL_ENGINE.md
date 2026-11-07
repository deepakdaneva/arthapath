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
